"use client";

import { create } from "zustand";
import type {
  APIChannel,
  APIGuild,
  APIGuildMember,
  APIMessage,
  APIUser,
  GatewayGuildCreateDispatchData,
  GatewayMessageReactionAddDispatchData,
  GatewayMessageReactionRemoveDispatchData,
  GatewayTypingStartDispatchData,
} from "discord-api-types/v10";
import { api } from "@/lib/discord/api";
import { GatewayClient, type GatewayStatus } from "@/lib/discord/gateway";
import { RestClient } from "@/lib/discord/rest";

const TOKEN_KEY = "disbotclient:token";

export interface TypingUser {
  userId: string;
  name: string;
  /** Epoch ms; entries older than 9s are treated as stale. */
  startedAt: number;
}

interface ClientState {
  token: string | null;
  status: GatewayStatus;
  error: string | null;
  user: APIUser | null;

  guilds: Record<string, APIGuild>;
  guildOrder: string[];
  channelsByGuild: Record<string, string[]>;
  channelsById: Record<string, APIChannel>;
  messagesByChannel: Record<string, APIMessage[]>;
  /** False once the channel's history is fully loaded. */
  hasMoreByChannel: Record<string, boolean>;
  membersByGuild: Record<string, Record<string, APIGuildMember>>;
  typingByChannel: Record<string, TypingUser[]>;

  selectedGuildId: string | null;
  selectedChannelId: string | null;

  login: (token: string) => Promise<void>;
  logout: () => void;
  restore: () => void;
  selectGuild: (guildId: string) => void;
  selectChannel: (channelId: string) => Promise<void>;
  loadOlderMessages: (channelId: string) => Promise<void>;
  sendMessage: (channelId: string, content: string, files?: File[]) => Promise<void>;
  getRest: () => RestClient;
  getGateway: () => GatewayClient | null;
}

let rest: RestClient | null = null;
let gateway: GatewayClient | null = null;

export const useClient = create<ClientState>((set, get) => ({
  token: null,
  status: "idle",
  error: null,
  user: null,
  guilds: {},
  guildOrder: [],
  channelsByGuild: {},
  channelsById: {},
  messagesByChannel: {},
  hasMoreByChannel: {},
  membersByGuild: {},
  typingByChannel: {},
  selectedGuildId: null,
  selectedChannelId: null,

  getRest: () => {
    if (!rest) throw new Error("Not signed in.");
    return rest;
  },
  getGateway: () => gateway,

  restore: () => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) void get().login(stored);
  },

  login: async (token) => {
    const normalizedToken = normalizeToken(token);
    set({ status: "connecting", error: null });
    rest = new RestClient(normalizedToken);

    let user: APIUser;
    try {
      user = await api.currentUser(rest);
    } catch (cause) {
      rest = null;
      set({ status: "idle", error: formatLoginError(cause) });
      return;
    }

    localStorage.setItem(TOKEN_KEY, normalizedToken);
    set({ token: normalizedToken, user });

    gateway?.disconnect();
    gateway = new GatewayClient(normalizedToken);
    gateway.on("status", (status) => set({ status }));
    gateway.on("error", (error) => set({ error: error.message }));
    gateway.on("dispatch", (event, data) => handleDispatch(set, get, event, data));
    gateway.connect();
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    gateway?.disconnect();
    gateway = null;
    rest = null;
    set({
      token: null,
      user: null,
      status: "idle",
      error: null,
      guilds: {},
      guildOrder: [],
      channelsByGuild: {},
      channelsById: {},
      messagesByChannel: {},
      hasMoreByChannel: {},
      membersByGuild: {},
      typingByChannel: {},
      selectedGuildId: null,
      selectedChannelId: null,
    });
  },

  selectGuild: (guildId) => {
    const channels = get().channelsByGuild[guildId] ?? [];
    const firstText = channels.find((id) => isTextChannel(get().channelsById[id]));
    set({ selectedGuildId: guildId, selectedChannelId: null });
    if (firstText) void get().selectChannel(firstText);
  },

  selectChannel: async (channelId) => {
    set({ selectedChannelId: channelId });
    if (get().messagesByChannel[channelId]) return;
    try {
      const messages = await api.messages(get().getRest(), channelId, { limit: 50 });
      set((state) => ({
        // Discord returns newest first; the UI renders oldest to newest.
        messagesByChannel: { ...state.messagesByChannel, [channelId]: messages.reverse() },
        hasMoreByChannel: { ...state.hasMoreByChannel, [channelId]: messages.length === 50 },
        error: null,
      }));
    } catch (cause) {
      set({ error: formatClientError(cause, "Could not load messages.") });
    }
  },

  loadOlderMessages: async (channelId) => {
    const existing = get().messagesByChannel[channelId];
    if (!existing?.length || get().hasMoreByChannel[channelId] === false) return;
    try {
      const older = await api.messages(get().getRest(), channelId, {
        limit: 50,
        before: existing[0].id,
      });
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...older.reverse(), ...(state.messagesByChannel[channelId] ?? [])],
        },
        hasMoreByChannel: { ...state.hasMoreByChannel, [channelId]: older.length === 50 },
      }));
    } catch (cause) {
      set({ error: formatClientError(cause, "Could not load older messages.") });
    }
  },

  sendMessage: async (channelId, content, files) => {
    const rest = get().getRest();
    if (files?.length) {
      await api.sendMessageWithFiles(rest, channelId, { content }, files);
    } else {
      await api.sendMessage(rest, channelId, { content });
    }
    // The echo arrives over the gateway as MESSAGE_CREATE.
  },
}));

type Setter = (
  partial: Partial<ClientState> | ((state: ClientState) => Partial<ClientState>),
) => void;

function handleDispatch(
  set: Setter,
  get: () => ClientState,
  event: string,
  raw: unknown,
) {
  switch (event) {
    case "READY": {
      const data = raw as { user: APIUser };
      set({ user: data.user });
      break;
    }
    case "GUILD_CREATE": {
      const guild = raw as GatewayGuildCreateDispatchData;
      const channels = guild.channels ?? [];
      set((state) => ({
        guilds: { ...state.guilds, [guild.id]: guild as unknown as APIGuild },
        guildOrder: state.guildOrder.includes(guild.id)
          ? state.guildOrder
          : [...state.guildOrder, guild.id],
        channelsByGuild: {
          ...state.channelsByGuild,
          [guild.id]: sortChannels(channels as APIChannel[]).map((channel) => channel.id),
        },
        channelsById: {
          ...state.channelsById,
          ...Object.fromEntries(channels.map((channel) => [channel.id, channel as APIChannel])),
        },
        membersByGuild: {
          ...state.membersByGuild,
          [guild.id]: Object.fromEntries(
            (guild.members ?? [])
              .filter((member) => member.user)
              .map((member) => [member.user!.id, member as APIGuildMember]),
          ),
        },
      }));
      break;
    }
    case "GUILD_UPDATE": {
      const guild = raw as APIGuild;
      set((state) => ({ guilds: { ...state.guilds, [guild.id]: { ...state.guilds[guild.id], ...guild } } }));
      break;
    }
    case "GUILD_DELETE": {
      const { id } = raw as { id: string };
      set((state) => {
        const guilds = { ...state.guilds };
        delete guilds[id];
        return {
          guilds,
          guildOrder: state.guildOrder.filter((guildId) => guildId !== id),
          selectedGuildId: state.selectedGuildId === id ? null : state.selectedGuildId,
        };
      });
      break;
    }
    case "CHANNEL_CREATE":
    case "CHANNEL_UPDATE": {
      const channel = raw as APIChannel & { guild_id?: string };
      set((state) => {
        const guildId = channel.guild_id;
        const existing = guildId ? (state.channelsByGuild[guildId] ?? []) : [];
        const channelsById = { ...state.channelsById, [channel.id]: channel };
        const ids = existing.includes(channel.id) ? existing : [...existing, channel.id];
        return {
          channelsById,
          channelsByGuild: guildId
            ? {
                ...state.channelsByGuild,
                [guildId]: sortChannels(ids.map((id) => channelsById[id]).filter(Boolean)).map(
                  (c) => c.id,
                ),
              }
            : state.channelsByGuild,
        };
      });
      break;
    }
    case "CHANNEL_DELETE": {
      const channel = raw as APIChannel & { guild_id?: string };
      set((state) => {
        const channelsById = { ...state.channelsById };
        delete channelsById[channel.id];
        return {
          channelsById,
          channelsByGuild: channel.guild_id
            ? {
                ...state.channelsByGuild,
                [channel.guild_id]: (state.channelsByGuild[channel.guild_id] ?? []).filter(
                  (id) => id !== channel.id,
                ),
              }
            : state.channelsByGuild,
          selectedChannelId:
            state.selectedChannelId === channel.id ? null : state.selectedChannelId,
        };
      });
      break;
    }
    case "MESSAGE_CREATE": {
      const message = raw as APIMessage;
      set((state) => {
        const existing = state.messagesByChannel[message.channel_id];
        // Only append to channels already opened, so history stays contiguous.
        if (!existing) return {};
        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [message.channel_id]: [...existing, message],
          },
          typingByChannel: {
            ...state.typingByChannel,
            [message.channel_id]: (state.typingByChannel[message.channel_id] ?? []).filter(
              (entry) => entry.userId !== message.author.id,
            ),
          },
        };
      });
      break;
    }
    case "MESSAGE_UPDATE": {
      const message = raw as APIMessage;
      set((state) => ({
        messagesByChannel: mapMessage(state, message.channel_id, message.id, (existing) => ({
          ...existing,
          ...message,
        })),
      }));
      break;
    }
    case "MESSAGE_DELETE": {
      const { id, channel_id } = raw as { id: string; channel_id: string };
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channel_id]: (state.messagesByChannel[channel_id] ?? []).filter(
            (message) => message.id !== id,
          ),
        },
      }));
      break;
    }
    case "MESSAGE_REACTION_ADD": {
      const data = raw as GatewayMessageReactionAddDispatchData;
      set((state) => ({
        messagesByChannel: mapMessage(state, data.channel_id, data.message_id, (message) => {
          const reactions = [...(message.reactions ?? [])];
          const index = reactions.findIndex((r) => reactionKey(r.emoji) === reactionKey(data.emoji));
          const isSelf = data.user_id === get().user?.id;
          if (index === -1) {
            reactions.push({ count: 1, me: isSelf, emoji: data.emoji, count_details: { burst: 0, normal: 1 }, burst_colors: [], me_burst: false });
          } else {
            reactions[index] = {
              ...reactions[index],
              count: reactions[index].count + 1,
              me: reactions[index].me || isSelf,
            };
          }
          return { ...message, reactions };
        }),
      }));
      break;
    }
    case "MESSAGE_REACTION_REMOVE": {
      const data = raw as GatewayMessageReactionRemoveDispatchData;
      set((state) => ({
        messagesByChannel: mapMessage(state, data.channel_id, data.message_id, (message) => {
          const reactions = (message.reactions ?? [])
            .map((reaction) =>
              reactionKey(reaction.emoji) === reactionKey(data.emoji)
                ? {
                    ...reaction,
                    count: reaction.count - 1,
                    me: reaction.me && data.user_id !== get().user?.id,
                  }
                : reaction,
            )
            .filter((reaction) => reaction.count > 0);
          return { ...message, reactions };
        }),
      }));
      break;
    }
    case "TYPING_START": {
      const data = raw as GatewayTypingStartDispatchData;
      if (data.user_id === get().user?.id) break;
      const name =
        data.member?.nick ?? data.member?.user?.global_name ?? data.member?.user?.username ?? "Someone";
      set((state) => {
        const current = (state.typingByChannel[data.channel_id] ?? []).filter(
          (entry) => entry.userId !== data.user_id,
        );
        return {
          typingByChannel: {
            ...state.typingByChannel,
            [data.channel_id]: [...current, { userId: data.user_id, name, startedAt: Date.now() }],
          },
        };
      });
      break;
    }
    case "GUILD_MEMBER_ADD":
    case "GUILD_MEMBER_UPDATE": {
      const member = raw as APIGuildMember & { guild_id: string };
      if (!member.user) break;
      set((state) => ({
        membersByGuild: {
          ...state.membersByGuild,
          [member.guild_id]: {
            ...(state.membersByGuild[member.guild_id] ?? {}),
            [member.user!.id]: member,
          },
        },
      }));
      break;
    }
    case "GUILD_MEMBER_REMOVE": {
      const data = raw as { guild_id: string; user: APIUser };
      set((state) => {
        const members = { ...(state.membersByGuild[data.guild_id] ?? {}) };
        delete members[data.user.id];
        return { membersByGuild: { ...state.membersByGuild, [data.guild_id]: members } };
      });
      break;
    }
    case "GUILD_MEMBERS_CHUNK": {
      const data = raw as { guild_id: string; members: APIGuildMember[] };
      set((state) => ({
        membersByGuild: {
          ...state.membersByGuild,
          [data.guild_id]: {
            ...(state.membersByGuild[data.guild_id] ?? {}),
            ...Object.fromEntries(
              data.members.filter((m) => m.user).map((m) => [m.user!.id, m]),
            ),
          },
        },
      }));
      break;
    }
  }
}

function mapMessage(
  state: ClientState,
  channelId: string,
  messageId: string,
  update: (message: APIMessage) => APIMessage,
) {
  const messages = state.messagesByChannel[channelId];
  if (!messages) return state.messagesByChannel;
  return {
    ...state.messagesByChannel,
    [channelId]: messages.map((message) => (message.id === messageId ? update(message) : message)),
  };
}

function reactionKey(emoji: { id?: string | null; name?: string | null }) {
  return emoji.id ?? emoji.name ?? "";
}

function formatClientError(cause: unknown, fallback: string) {
  if (cause instanceof TypeError && cause.message.includes("fetch")) {
    return "Network error while contacting Discord. Check your connection or browser access to discord.com.";
  }
  return cause instanceof Error ? cause.message : fallback;
}

function normalizeToken(token: string) {
  return token.trim().replace(/^Bot\s+/i, "").replace(/^['"]|['"]$/g, "");
}

function formatLoginError(cause: unknown) {
  if (cause instanceof Error && cause.message.includes("fetch")) {
    return "Could not reach Discord. Check the local server and your network connection.";
  }
  if (cause instanceof Error) return `Discord rejected the token: ${cause.message}`;
  return "Discord rejected the token. Check that you copied the bot token.";
}

/** 0 = text, 5 = announcement, 10/11/12 = threads. */
const TEXT_CHANNEL_TYPES = new Set([0, 5, 10, 11, 12]);

export function isTextChannel(channel: APIChannel | undefined): channel is APIChannel {
  return channel !== undefined && TEXT_CHANNEL_TYPES.has(channel.type);
}

/** Category-aware ordering that matches how Discord renders a channel list. */
function sortChannels(channels: APIChannel[]): APIChannel[] {
  return [...channels].sort((a, b) => {
    const positionA = "position" in a ? (a.position ?? 0) : 0;
    const positionB = "position" in b ? (b.position ?? 0) : 0;
    if (positionA !== positionB) return positionA - positionB;
    return Number(BigInt(a.id) - BigInt(b.id));
  });
}
