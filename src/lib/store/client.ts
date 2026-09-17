"use client";

import { create } from "zustand";
import type {
  APIChannel,
  APIDMChannel,
  APIGuild,
  APIGuildMember,
  APIMessage,
  APIRole,
  APIUser,
  GatewayGuildCreateDispatchData,
  GatewayMessageReactionAddDispatchData,
  GatewayMessageReactionRemoveDispatchData,
  GatewayTypingStartDispatchData,
} from "discord-api-types/v10";
import { api } from "@/lib/discord/api";
import { guildApi } from "@/lib/discord/guildApi";
import { GatewayIntent, hasIntent } from "@/lib/discord/constants";
import { GatewayClient, type GatewayStatus } from "@/lib/discord/gateway";
import {
  DEFAULT_SELF_PRESENCE,
  loadSelfPresence,
  saveSelfPresence,
  toGatewayPresence,
  type SelfPresence,
} from "@/lib/discord/selfPresence";
import { RestClient } from "@/lib/discord/rest";
import { rememberDM, type DMUserInfo } from "@/components/nav/dmStore";
import { useAccount } from "@/lib/store/account";
import { useUI } from "@/lib/store/ui";

const TOKEN_KEY = "disbotclient:token";

/** How long a join waits for Discord to echo the voice state back. */
const VOICE_JOIN_TIMEOUT_MS = 10_000;

/** One activity line of a presence, e.g. "Playing Minecraft". */
/** The artwork an activity publishes, as raw asset keys. */
export interface ActivityAssets {
  largeImage?: string | null;
  largeText?: string | null;
  smallImage?: string | null;
  smallText?: string | null;
}

export interface PresenceActivity {
  name: string;
  /** Discord activity type: 0 playing, 1 streaming, 2 listening, 3 watching, 4 custom, 5 competing. */
  type: number;
  state?: string | null;
  details?: string | null;
  /** Needed to resolve `assets` keys that are application asset ids. */
  applicationId?: string | null;
  url?: string | null;
  assets?: ActivityAssets;
  /** Epoch ms; drives the "elapsed" or "left" counter Discord shows. */
  startedAt?: number | null;
  endsAt?: number | null;
  /** Stable key for React lists: an activity has no id of its own. */
  id?: string | null;
}

/** Everything the gateway tells us about where a user is and what they are doing. */
export interface Presence {
  status: string;
  activities: PresenceActivity[];
  /** Per-device status; the keys present say which clients are connected. */
  clientStatus: { desktop?: string; mobile?: string; web?: string };
}

export const OFFLINE_PRESENCE: Presence = { status: "offline", activities: [], clientStatus: {} };

/** Someone sitting in a voice channel, and what their mic and camera are doing. */
export interface VoiceState {
  userId: string;
  channelId: string;
  /** Silenced by a moderator, as opposed to having muted themselves. */
  serverMute: boolean;
  serverDeaf: boolean;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  /** Go Live screenshare. */
  selfStream: boolean;
  /** Stage channels: on stage rather than in the audience. */
  suppress: boolean;
  /** The member as the voice state carried it; voice works without the members intent. */
  member?: APIGuildMember;
}

/**
 * Where this bot is sitting in voice, as this client asked for it.
 *
 * The browser cannot open Discord's voice UDP socket, so there is no audio
 * stream behind this: the bot shows up in the channel, can be muted, deafened
 * and moved like any member, and makes sound through the soundboard.
 */
export interface SelfVoice {
  guildId: string;
  channelId: string;
  selfMute: boolean;
  selfDeaf: boolean;
  /** True until Discord echoes the voice state back over the gateway. */
  connecting: boolean;
}

export interface TypingUser {
  userId: string;
  name: string;
  /** Epoch ms; entries older than 9s are treated as stale. */
  startedAt: number;
}

export interface ClientState {
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
  presenceByGuild: Record<string, Record<string, Presence>>;
  /**
   * Whether the live connection carries the privileged presence intent. Without
   * it Discord sends no presence data at all, and the member list must not
   * pretend that everyone is offline.
   */
  presenceEnabled: boolean;
  /** Who is sitting in which voice channel, per guild, keyed by user id. */
  voiceStatesByGuild: Record<string, Record<string, VoiceState>>;
  /** The voice channel this bot is in, or null when it is not in one. */
  selfVoice: SelfVoice | null;
  /** The presence this bot publishes for itself. */
  selfPresence: SelfPresence;
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
  /** Publishes a new presence for this bot and remembers it for next time. */
  setSelfPresence: (presence: SelfPresence) => void;
  /** Puts the bot into a voice channel, or moves it between two of them. */
  joinVoice: (guildId: string, channelId: string) => void;
  /** Leaves the voice channel the bot is in; a no-op when it is in none. */
  leaveVoice: () => void;
  /** Mutes or unmutes the bot itself. */
  setSelfMute: (mute: boolean) => void;
  /** Deafens or undeafens the bot itself; deafening mutes it too, as Discord does. */
  setSelfDeaf: (deaf: boolean) => void;
  /** Opens (or re-opens) the DM with a user, files it under Direct Messages and selects it. */
  openDM: (userId: string, about?: DMUserInfo) => Promise<string>;
  /** Fetches a channel the gateway never announced (a DM, an archived thread). */
  hydrateChannel: (channelId: string) => Promise<void>;
  /**
   * Makes sure the bot's own member object is known for a guild. Without the
   * members intent it is missing from GUILD_CREATE, and every permission check
   * in the UI depends on it.
   */
  ensureSelfMember: (guildId: string) => Promise<APIGuildMember | null>;
  /** Writes a role into the guild, replacing the one with the same id. */
  upsertRole: (guildId: string, role: APIRole) => void;
  removeRole: (guildId: string, roleId: string) => void;
  upsertMember: (guildId: string, member: APIGuildMember) => void;
  /** Applies a member's new role set locally; the gateway echo may never come. */
  setMemberRoles: (guildId: string, userId: string, roles: string[]) => void;
  /** Writes a channel into the store, keeping the guild's channel list sorted. */
  upsertChannel: (channel: APIChannel) => void;
  dropChannel: (channelId: string) => void;
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
  presenceByGuild: {},
  presenceEnabled: false,
  voiceStatesByGuild: {},
  selfVoice: null,
  selfPresence: DEFAULT_SELF_PRESENCE,
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

    // An unlocked vault remembers the bot, so it can be switched back to from
    // any of this account's browsers.
    const account = useAccount.getState();
    if (account.status === "unlocked") {
      void account.saveBot({
        id: user.id,
        name: user.global_name ?? user.username,
        avatar: user.avatar ?? null,
        discriminator: user.discriminator ?? null,
        token: normalizedToken,
      });
    }

    const presence = loadSelfPresence();
    set({ selfPresence: presence });

    gateway?.disconnect();
    gateway = new GatewayClient(normalizedToken);
    gateway.setMobile(presence.mobile);
    gateway.setPresence(toGatewayPresence(presence));
    // A closed socket takes the voice state with it: Discord drops the bot out
    // of the channel the moment the session that put it there is gone.
    gateway.on("status", (status) =>
      set(status === "closed" ? { status, selfVoice: null } : { status }),
    );
    gateway.on("intents", (intents) =>
      set({ presenceEnabled: hasIntent(intents, GatewayIntent.GuildPresences) }),
    );
    gateway.on("error", (error) => set({ error: error.message }));
    gateway.on("dispatch", (event, data) => {
      if (event === "READY") gateway?.setPresence(toGatewayPresence(get().selfPresence));
      handleDispatch(set, get, event, data);
    });
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
      presenceByGuild: {},
      presenceEnabled: false,
      voiceStatesByGuild: {},
      selfVoice: null,
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
    // DMs and threads are not part of any GUILD_CREATE payload, so the header
    // would otherwise only have an id to show.
    if (!get().channelsById[channelId]) void get().hydrateChannel(channelId);
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

  setSelfPresence: (presence) => {
    saveSelfPresence(presence);
    set({ selfPresence: presence });
    // Toggling mobile re-identifies, which replays the presence from IDENTIFY.
    gateway?.setMobile(presence.mobile);
    gateway?.setPresence(toGatewayPresence(presence));
  },

  joinVoice: (guildId, channelId) => {
    if (!gateway || gateway.status !== "ready") {
      set({ error: "Not connected to Discord yet." });
      return;
    }
    const current = get().selfVoice;
    // Moving between channels keeps the mute and deafen the user already chose.
    const selfMute = current?.selfMute ?? false;
    const selfDeaf = current?.selfDeaf ?? false;
    gateway.setVoiceState({ guildId, channelId, selfMute, selfDeaf });
    set({ selfVoice: { guildId, channelId, selfMute, selfDeaf, connecting: true } });

    // Discord answers a refused join with silence rather than an error, so a
    // voice state that never arrives is reported instead of spinning forever.
    setTimeout(() => {
      const pending = get().selfVoice;
      if (!pending?.connecting || pending.channelId !== channelId) return;
      set({
        selfVoice: null,
        error: "Discord did not put the bot in that channel — check its Connect permission.",
      });
    }, VOICE_JOIN_TIMEOUT_MS);
  },

  leaveVoice: () => {
    const current = get().selfVoice;
    if (!current) return;
    gateway?.setVoiceState({
      guildId: current.guildId,
      channelId: null,
      selfMute: current.selfMute,
      selfDeaf: current.selfDeaf,
    });
    set({ selfVoice: null });
  },

  setSelfMute: (mute) => {
    const current = get().selfVoice;
    if (!current) return;
    // Discord's own client lifts the deafen as soon as you unmute.
    const selfDeaf = mute ? current.selfDeaf : false;
    gateway?.setVoiceState({
      guildId: current.guildId,
      channelId: current.channelId,
      selfMute: mute,
      selfDeaf,
    });
    set({ selfVoice: { ...current, selfMute: mute, selfDeaf } });
  },

  setSelfDeaf: (deaf) => {
    const current = get().selfVoice;
    if (!current) return;
    // Deafening mutes as well: there is no "I hear nothing but keep talking".
    const selfMute = deaf ? true : current.selfMute;
    gateway?.setVoiceState({
      guildId: current.guildId,
      channelId: current.channelId,
      selfMute,
      selfDeaf: deaf,
    });
    set({ selfVoice: { ...current, selfMute, selfDeaf: deaf } });
  },

  hydrateChannel: async (channelId) => {
    try {
      const channel = await api.channel(get().getRest(), channelId);
      set((state) => ({ channelsById: { ...state.channelsById, [channel.id]: channel } }));
      if (channel.type === 1 || channel.type === 3) rememberDM(channel as APIDMChannel);
    } catch {
      // Not fatal: the header falls back to the channel id.
    }
  },

  ensureSelfMember: async (guildId) => {
    const selfId = get().user?.id;
    if (!selfId) return null;
    const known = get().membersByGuild[guildId]?.[selfId];
    if (known) return known;
    try {
      const member = await guildApi.member(get().getRest(), guildId, selfId);
      get().upsertMember(guildId, member);
      return member;
    } catch {
      // Permission checks fall back to "nothing is allowed" until this lands.
      return null;
    }
  },

  upsertRole: (guildId, role) => {
    set((state) => {
      const guild = state.guilds[guildId];
      if (!guild) return {};
      const roles = guild.roles.some((existing) => existing.id === role.id)
        ? guild.roles.map((existing) => (existing.id === role.id ? role : existing))
        : [...guild.roles, role];
      return { guilds: { ...state.guilds, [guildId]: { ...guild, roles } } };
    });
  },

  removeRole: (guildId, roleId) => {
    set((state) => {
      const guild = state.guilds[guildId];
      if (!guild) return {};
      const members = state.membersByGuild[guildId];
      return {
        guilds: {
          ...state.guilds,
          [guildId]: { ...guild, roles: guild.roles.filter((role) => role.id !== roleId) },
        },
        // A deleted role is gone from everyone who held it.
        membersByGuild: members
          ? {
              ...state.membersByGuild,
              [guildId]: Object.fromEntries(
                Object.entries(members).map(([id, member]) => [
                  id,
                  member.roles.includes(roleId)
                    ? { ...member, roles: member.roles.filter((role) => role !== roleId) }
                    : member,
                ]),
              ),
            }
          : state.membersByGuild,
      };
    });
  },

  upsertMember: (guildId, member) => {
    if (!member.user) return;
    set((state) => ({
      membersByGuild: {
        ...state.membersByGuild,
        [guildId]: { ...(state.membersByGuild[guildId] ?? {}), [member.user!.id]: member },
      },
    }));
  },

  setMemberRoles: (guildId, userId, roles) => {
    set((state) => {
      const member = state.membersByGuild[guildId]?.[userId];
      if (!member) return {};
      return {
        membersByGuild: {
          ...state.membersByGuild,
          [guildId]: { ...state.membersByGuild[guildId], [userId]: { ...member, roles } },
        },
      };
    });
  },

  upsertChannel: (channel) => {
    set((state) => insertChannel(state, channel));
  },

  dropChannel: (channelId) => {
    set((state) => removeChannel(state, channelId));
  },

  openDM: async (userId, about) => {
    const channel = (await api.createDM(get().getRest(), userId)) as APIDMChannel;
    rememberDM(channel, about);
    set((state) => ({ channelsById: { ...state.channelsById, [channel.id]: channel } }));
    // A DM lives under the Direct Messages list, not under the server it was opened from.
    useUI.getState().setDmMode(true);
    await get().selectChannel(channel.id);
    return channel.id;
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
      const presences = (guild as GatewayGuildCreateDispatchData & { presences?: unknown[] }).presences;
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
        // Without the presence intent Discord omits the array entirely; keeping
        // whatever is already known beats replacing it with an empty map.
        presenceByGuild: presences
          ? { ...state.presenceByGuild, [guild.id]: presenceMap(presences) }
          : state.presenceByGuild,
        voiceStatesByGuild: {
          ...state.voiceStatesByGuild,
          [guild.id]: voiceStateMap(guild.voice_states),
        },
      }));
      // Discord always opens on a server; landing on an empty pane would make
      // the client look like it failed to connect.
      if (get().selectedGuildId === null) get().selectGuild(guild.id);
      break;
    }
    case "GUILD_UPDATE": {
      const guild = raw as APIGuild;
      set((state) => ({ guilds: { ...state.guilds, [guild.id]: { ...state.guilds[guild.id], ...guild } } }));
      break;
    }
    case "PRESENCE_UPDATE": {
      const data = raw as RawPresence & { guild_id?: string };
      if (!data.guild_id || !data.user?.id) break;
      const guildId = data.guild_id;
      const userId = data.user.id;
      set((state) => ({
        presenceEnabled: true,
        presenceByGuild: {
          ...state.presenceByGuild,
          [guildId]: {
            ...(state.presenceByGuild[guildId] ?? {}),
            [userId]: toPresence(data),
          },
        },
      }));
      break;
    }
    case "VOICE_STATE_UPDATE": {
      const data = raw as RawVoiceState & { guild_id?: string };
      if (!data.guild_id || !data.user_id) break;
      const guildId = data.guild_id;
      set((state) => {
        const current = { ...(state.voiceStatesByGuild[guildId] ?? {}) };
        // A null channel_id means the user left voice altogether.
        if (data.channel_id) current[data.user_id!] = toVoiceState(data);
        else delete current[data.user_id!];

        const next: Partial<ClientState> = {
          voiceStatesByGuild: { ...state.voiceStatesByGuild, [guildId]: current },
        };

        // This is also how a moderator moving or disconnecting the bot reaches
        // the UI, so Discord's word wins over what this client last asked for.
        if (data.user_id === state.user?.id) {
          next.selfVoice = data.channel_id
            ? {
                guildId,
                channelId: data.channel_id,
                selfMute: Boolean(data.self_mute),
                selfDeaf: Boolean(data.self_deaf),
                connecting: false,
              }
            : null;
        }
        return next;
      });
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
          presenceByGuild: Object.fromEntries(
            Object.entries(state.presenceByGuild).filter(([guildId]) => guildId !== id),
          ),
          voiceStatesByGuild: Object.fromEntries(
            Object.entries(state.voiceStatesByGuild).filter(([guildId]) => guildId !== id),
          ),
          // Leaving the server takes the bot out of its voice channel too.
          selfVoice: state.selfVoice?.guildId === id ? null : state.selfVoice,
          selectedGuildId: state.selectedGuildId === id ? null : state.selectedGuildId,
        };
      });
      break;
    }
    case "GUILD_ROLE_CREATE":
    case "GUILD_ROLE_UPDATE": {
      const data = raw as { guild_id: string; role: APIRole };
      if (!data.guild_id || !data.role) break;
      get().upsertRole(data.guild_id, data.role);
      break;
    }
    case "GUILD_ROLE_DELETE": {
      const data = raw as { guild_id: string; role_id: string };
      if (!data.guild_id || !data.role_id) break;
      get().removeRole(data.guild_id, data.role_id);
      break;
    }
    case "CHANNEL_CREATE":
    case "CHANNEL_UPDATE": {
      const channel = raw as APIChannel & { guild_id?: string };
      if (channel.type === 1 || channel.type === 3) {
        rememberDM(channel as APIDMChannel);
        break;
      }
      set((state) => insertChannel(state, channel));
      break;
    }
    case "CHANNEL_DELETE": {
      const channel = raw as APIChannel & { guild_id?: string };
      set((state) => removeChannel(state, channel.id));
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
      const data = raw as {
        guild_id: string;
        members: APIGuildMember[];
        presences?: unknown[];
      };
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
        presenceByGuild: {
          ...state.presenceByGuild,
          [data.guild_id]: {
            ...(state.presenceByGuild[data.guild_id] ?? {}),
            ...presenceMap(data.presences),
          },
        },
      }));
      break;
    }
  }
}

/**
 * Adds or replaces a channel and re-sorts the guild's list around it, so a
 * channel created from the UI lands where Discord would put it.
 */
function insertChannel(state: ClientState, channel: APIChannel): Partial<ClientState> {
  const guildId = "guild_id" in channel ? (channel.guild_id as string | undefined) : undefined;
  const channelsById = { ...state.channelsById, [channel.id]: channel };
  if (!guildId) return { channelsById };
  const existing = state.channelsByGuild[guildId] ?? [];
  const ids = existing.includes(channel.id) ? existing : [...existing, channel.id];
  return {
    channelsById,
    channelsByGuild: {
      ...state.channelsByGuild,
      [guildId]: sortChannels(ids.map((id) => channelsById[id]).filter(Boolean)).map((c) => c.id),
    },
  };
}

function removeChannel(state: ClientState, channelId: string): Partial<ClientState> {
  const channel = state.channelsById[channelId];
  const guildId =
    channel && "guild_id" in channel ? (channel.guild_id as string | undefined) : undefined;
  const channelsById = { ...state.channelsById };
  delete channelsById[channelId];
  return {
    channelsById,
    channelsByGuild: guildId
      ? {
          ...state.channelsByGuild,
          [guildId]: (state.channelsByGuild[guildId] ?? []).filter((id) => id !== channelId),
        }
      : state.channelsByGuild,
    selectedChannelId:
      state.selectedChannelId === channelId ? null : state.selectedChannelId,
  };
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

interface RawVoiceState {
  user_id?: string;
  channel_id?: string | null;
  mute?: boolean;
  deaf?: boolean;
  self_mute?: boolean;
  self_deaf?: boolean;
  self_video?: boolean;
  self_stream?: boolean;
  suppress?: boolean;
  member?: APIGuildMember;
}

function toVoiceState(raw: RawVoiceState): VoiceState {
  return {
    userId: raw.user_id!,
    channelId: raw.channel_id!,
    serverMute: raw.mute ?? false,
    serverDeaf: raw.deaf ?? false,
    selfMute: raw.self_mute ?? false,
    selfDeaf: raw.self_deaf ?? false,
    selfVideo: raw.self_video ?? false,
    selfStream: raw.self_stream ?? false,
    suppress: raw.suppress ?? false,
    member: raw.member,
  };
}

function voiceStateMap(states: unknown[] | undefined): Record<string, VoiceState> {
  const result: Record<string, VoiceState> = {};
  for (const raw of states ?? []) {
    const state = raw as RawVoiceState;
    if (state.user_id && state.channel_id) result[state.user_id] = toVoiceState(state);
  }
  return result;
}

interface RawPresence {
  user?: { id?: string };
  status?: string;
  activities?: Array<{
    id?: string;
    name?: string;
    type?: number;
    state?: string | null;
    details?: string | null;
    application_id?: string | null;
    url?: string | null;
    assets?: {
      large_image?: string | null;
      large_text?: string | null;
      small_image?: string | null;
      small_text?: string | null;
    };
    timestamps?: { start?: number | null; end?: number | null };
  }>;
  client_status?: { desktop?: string; mobile?: string; web?: string };
}

function toPresence(raw: RawPresence): Presence {
  return {
    status: raw.status ?? "offline",
    activities: (raw.activities ?? [])
      .filter((activity) => typeof activity?.name === "string")
      .map((activity) => ({
        name: activity.name as string,
        type: activity.type ?? 0,
        state: activity.state ?? null,
        details: activity.details ?? null,
        applicationId: activity.application_id ?? null,
        url: activity.url ?? null,
        assets: activity.assets
          ? {
              largeImage: activity.assets.large_image ?? null,
              largeText: activity.assets.large_text ?? null,
              smallImage: activity.assets.small_image ?? null,
              smallText: activity.assets.small_text ?? null,
            }
          : undefined,
        startedAt: activity.timestamps?.start ?? null,
        endsAt: activity.timestamps?.end ?? null,
        id: activity.id ?? null,
      })),
    clientStatus: raw.client_status ?? {},
  };
}

function presenceMap(presences: unknown[] | undefined): Record<string, Presence> {
  const result: Record<string, Presence> = {};
  for (const raw of presences ?? []) {
    const presence = raw as RawPresence;
    if (presence.user?.id) result[presence.user.id] = toPresence(presence);
  }
  return result;
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

/** 2 = voice, 13 = stage. */
const VOICE_CHANNEL_TYPES = new Set([2, 13]);

export function isTextChannel(channel: APIChannel | undefined): channel is APIChannel {
  return channel !== undefined && TEXT_CHANNEL_TYPES.has(channel.type);
}

export function isVoiceChannel(channel: APIChannel | undefined): channel is APIChannel {
  return channel !== undefined && VOICE_CHANNEL_TYPES.has(channel.type);
}

/**
 * Channels whose messages this client can show. Voice channels carry Discord's
 * built-in voice text chat, which a bot reads and posts to like any other
 * channel — the voice stream itself is what it cannot join.
 */
export function hasMessages(channel: APIChannel | undefined): channel is APIChannel {
  return isTextChannel(channel) || isVoiceChannel(channel);
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
