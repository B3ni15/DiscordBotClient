"use client";

import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type { APIChannel, APIGuildMember, APIMessage } from "discord-api-types/v10";
import { RoleToggleList } from "@/components/guild/RoleToggleList";
import { copyText, messageLink, togglePin } from "@/lib/discord/messageActions";
import {
  channelPermissions,
  has,
  isThreadChannel,
} from "@/lib/discord/permissions";
import { displayName, memberPermissions } from "@/lib/discord/roles";
import { voiceApi } from "@/lib/discord/voiceApi";
import { missingPermission, REASONS } from "@/lib/discord/useGuildPowers";
import {
  isChannelMuted,
  isGuildMuted,
  setChannelMuted,
  setGuildMuted,
} from "@/lib/notifications/settings";
import { clearUnread } from "@/lib/notifications/unread";
import { isVoiceChannel, useClient, type ClientState } from "@/lib/store/client";
import { openMenuFor, separator, type MenuItem } from "@/lib/store/contextMenu";
import { useUI } from "@/lib/store/ui";

/**
 * What the bot may do right now, read straight from the store.
 *
 * Menus are built at the moment of the click, so they never show a stale
 * permission: a role handed to the bot a second ago is already reflected here.
 */
interface Powers {
  state: ClientState;
  guildId: string | null;
  can: (...bits: bigint[]) => boolean;
  canIn: (channel: APIChannel | undefined, ...bits: bigint[]) => boolean;
  outranks: (member: APIGuildMember | undefined) => boolean;
  /** False while the bot's own member object has not arrived yet. */
  ready: boolean;
}

function powersFor(guildId: string | null): Powers {
  const state = useClient.getState();
  const selfId = state.user?.id;
  const guild = guildId ? state.guilds[guildId] : undefined;
  const self = guildId && selfId ? state.membersByGuild[guildId]?.[selfId] : undefined;
  // Fetch it for next time; this menu falls back to "not allowed" meanwhile.
  if (guildId && selfId && !self) void state.ensureSelfMember(guildId);

  const permissions = guild && self ? memberPermissions(guild, self) : 0n;

  return {
    state,
    guildId,
    ready: guild !== undefined && self !== undefined,
    can: (...bits) => has(permissions, ...bits),
    canIn: (channel, ...bits) => {
      if (!guild || !self) return false;
      const target =
        isThreadChannel(channel) && channel && "parent_id" in channel && channel.parent_id
          ? (state.channelsById[channel.parent_id] ?? channel)
          : channel;
      return has(channelPermissions(guild, self, target), ...bits);
    },
    outranks: (member) => {
      if (!guild || !self || !member) return false;
      if (member.user && guild.owner_id === member.user.id) return false;
      if (self.user && guild.owner_id === self.user.id) return true;
      const highest = (target: APIGuildMember) => {
        const lookup = new Map(guild.roles.map((role) => [role.id, role]));
        return target.roles.reduce(
          (top, id) => Math.max(top, lookup.get(id)?.position ?? 0),
          0,
        );
      };
      return highest(self) > highest(member);
    },
  };
}

/** Reports whatever Discord said about a voice action that did not go through. */
function runVoiceAction(request: Promise<unknown>, fallback: string) {
  void request.catch((cause: unknown) =>
    useUI.getState().toast(cause instanceof Error ? cause.message : fallback, "error"),
  );
}

/** A reason string for a locked entry, or undefined when it is allowed. */
function lock(allowed: boolean, ready: boolean, reason: string): string | undefined {
  if (allowed) return undefined;
  return ready ? reason : REASONS.notReady;
}

function copyId(id: string, what: string) {
  void copyText(id).then(
    () => useUI.getState().toast(`${what} ID copied.`),
    () => useUI.getState().toast("Could not copy to the clipboard.", "error"),
  );
}

/** Menu of a server: the rail icon, the channel list header, its empty space. */
export function guildMenuItems(guildId: string): MenuItem[] {
  const powers = powersFor(guildId);
  const { openDialog, toast } = useUI.getState();
  const guild = powers.state.guilds[guildId];
  const manageChannels = powers.can(PermissionFlagsBits.ManageChannels);
  const manageRoles = powers.can(PermissionFlagsBits.ManageRoles);
  const muted = isGuildMuted(guildId);

  return [
    {
      type: "item",
      id: "mark-read",
      label: "Mark server as read",
      icon: "✓",
      onSelect: () => {
        for (const channelId of powers.state.channelsByGuild[guildId] ?? []) clearUnread(channelId);
      },
    },
    {
      type: "toggle",
      id: "mute",
      label: muted ? "Unmute server" : "Mute server",
      checked: muted,
      onSelect: () => setGuildMuted(guildId, !muted),
    },
    separator("s1"),
    {
      type: "item",
      id: "create-channel",
      label: "Create channel",
      icon: "＋",
      disabled: !manageChannels,
      reason: lock(manageChannels, powers.ready, REASONS.manageChannels),
      onSelect: () => openDialog({ kind: "createChannel", guildId }),
    },
    {
      type: "item",
      id: "create-category",
      label: "Create category",
      icon: "📁",
      disabled: !manageChannels,
      reason: lock(manageChannels, powers.ready, REASONS.manageChannels),
      onSelect: () =>
        openDialog({ kind: "createChannel", guildId, type: ChannelType.GuildCategory }),
    },
    separator("s2"),
    {
      type: "item",
      id: "create-role",
      label: "Create role",
      icon: "🏷",
      disabled: !manageRoles,
      reason: lock(manageRoles, powers.ready, REASONS.manageRoles),
      onSelect: () => openDialog({ kind: "createRole", guildId }),
    },
    {
      type: "item",
      id: "roles",
      label: "Server roles",
      icon: "☰",
      onSelect: () => openDialog({ kind: "roles", guildId }),
    },
    separator("s3"),
    {
      type: "item",
      id: "copy-name",
      label: "Copy server name",
      icon: "⧉",
      onSelect: () => {
        if (guild) void copyText(guild.name).then(() => toast("Server name copied."));
      },
    },
    { type: "item", id: "copy-id", label: "Copy server ID", icon: "🆔", onSelect: () => copyId(guildId, "Server") },
  ];
}

/** Menu of one channel row in the sidebar. */
export function channelMenuItems(channel: APIChannel, guildId: string | null): MenuItem[] {
  const powers = powersFor(guildId);
  const { openDialog } = useUI.getState();
  const { selectChannel } = powers.state;
  const manage = powers.canIn(channel, PermissionFlagsBits.ManageChannels);
  const managePermissions = powers.canIn(channel, PermissionFlagsBits.ManageRoles);
  const muted = isChannelMuted(channel.id);
  const name = ("name" in channel ? channel.name : null) ?? channel.id;
  const parentId = "parent_id" in channel ? (channel.parent_id ?? null) : null;
  const voice = isVoiceChannel(channel);
  const inThisChannel = powers.state.selfVoice?.channelId === channel.id;
  const canConnect = powers.canIn(channel, PermissionFlagsBits.Connect);

  const items: MenuItem[] = [
    {
      type: "item",
      id: "open",
      label: "Open channel",
      icon: "→",
      onSelect: () => void selectChannel(channel.id),
    },
    {
      type: "item",
      id: "mark-read",
      label: "Mark as read",
      icon: "✓",
      onSelect: () => clearUnread(channel.id),
    },
    {
      type: "toggle",
      id: "mute",
      label: muted ? "Unmute channel" : "Mute channel",
      checked: muted,
      onSelect: () => setChannelMuted(channel.id, !muted),
    },
  ];

  if (voice && guildId) {
    items.push(
      inThisChannel
        ? {
            type: "item",
            id: "leave-voice",
            label: "Leave voice channel",
            icon: "📴",
            onSelect: () => powers.state.leaveVoice(),
          }
        : {
            type: "item",
            id: "join-voice",
            label: "Join voice channel",
            icon: "🎙",
            disabled: !canConnect,
            reason: lock(canConnect, powers.ready, missingPermission("Connect")),
            onSelect: () => powers.state.joinVoice(guildId, channel.id),
          },
      {
        type: "item",
        id: "soundboard",
        label: "Soundboard…",
        icon: "🔈",
        onSelect: () => useUI.getState().togglePanel("soundboard"),
      },
    );
  }

  items.push(separator("s1"));

  if (guildId) {
    items.push(
      {
        type: "item",
        id: "edit",
        label: "Edit channel",
        icon: "✎",
        disabled: !manage,
        reason: lock(manage, powers.ready, REASONS.manageChannels),
        onSelect: () => openDialog({ kind: "editChannel", guildId, channelId: channel.id }),
      },
      {
        type: "item",
        id: "permissions",
        label: "Edit permissions",
        icon: "🔒",
        disabled: !managePermissions,
        reason: lock(managePermissions, powers.ready, REASONS.managePermissions),
        onSelect: () => openDialog({ kind: "channelPermissions", guildId, channelId: channel.id }),
      },
      {
        type: "item",
        id: "create",
        label: "Create channel",
        icon: "＋",
        disabled: !powers.can(PermissionFlagsBits.ManageChannels),
        reason: lock(
          powers.can(PermissionFlagsBits.ManageChannels),
          powers.ready,
          REASONS.manageChannels,
        ),
        onSelect: () => openDialog({ kind: "createChannel", guildId, parentId }),
      },
      separator("s2"),
    );
  }

  items.push(
    {
      type: "item",
      id: "copy-link",
      label: "Copy channel link",
      icon: "🔗",
      onSelect: () => {
        void copyText(`https://discord.com/channels/${guildId ?? "@me"}/${channel.id}`).then(
          () => useUI.getState().toast("Channel link copied."),
        );
      },
    },
    {
      type: "item",
      id: "copy-name",
      label: "Copy channel name",
      icon: "⧉",
      onSelect: () => void copyText(name).then(() => useUI.getState().toast("Channel name copied.")),
    },
    {
      type: "item",
      id: "copy-id",
      label: "Copy channel ID",
      icon: "🆔",
      onSelect: () => copyId(channel.id, "Channel"),
    },
  );

  if (guildId) {
    items.push(separator("s3"), {
      type: "item",
      id: "delete",
      label: "Delete channel",
      icon: "🗑",
      danger: true,
      disabled: !manage,
      reason: lock(manage, powers.ready, REASONS.manageChannels),
      onSelect: () => openDialog({ kind: "deleteChannel", guildId, channelId: channel.id }),
    });
  }

  return items;
}

/** Menu of a category header. */
export function categoryMenuItems(
  category: APIChannel,
  guildId: string,
  extras: { collapsed: boolean; onToggleCollapse: () => void },
): MenuItem[] {
  const powers = powersFor(guildId);
  const { openDialog } = useUI.getState();
  const manage = powers.canIn(category, PermissionFlagsBits.ManageChannels);
  const managePermissions = powers.canIn(category, PermissionFlagsBits.ManageRoles);

  return [
    {
      type: "item",
      id: "collapse",
      label: extras.collapsed ? "Expand category" : "Collapse category",
      icon: extras.collapsed ? "▸" : "▾",
      onSelect: extras.onToggleCollapse,
    },
    {
      type: "item",
      id: "mark-read",
      label: "Mark category as read",
      icon: "✓",
      onSelect: () => {
        for (const id of powers.state.channelsByGuild[guildId] ?? []) {
          const channel = powers.state.channelsById[id];
          if (channel && "parent_id" in channel && channel.parent_id === category.id) {
            clearUnread(id);
          }
        }
      },
    },
    separator("s1"),
    {
      type: "item",
      id: "create-inside",
      label: "Create channel",
      icon: "＋",
      disabled: !powers.can(PermissionFlagsBits.ManageChannels),
      reason: lock(
        powers.can(PermissionFlagsBits.ManageChannels),
        powers.ready,
        REASONS.manageChannels,
      ),
      onSelect: () => openDialog({ kind: "createChannel", guildId, parentId: category.id }),
    },
    {
      type: "item",
      id: "edit",
      label: "Edit category",
      icon: "✎",
      disabled: !manage,
      reason: lock(manage, powers.ready, REASONS.manageChannels),
      onSelect: () => openDialog({ kind: "editChannel", guildId, channelId: category.id }),
    },
    {
      type: "item",
      id: "permissions",
      label: "Edit permissions",
      icon: "🔒",
      disabled: !managePermissions,
      reason: lock(managePermissions, powers.ready, REASONS.managePermissions),
      onSelect: () => openDialog({ kind: "channelPermissions", guildId, channelId: category.id }),
    },
    separator("s2"),
    {
      type: "item",
      id: "copy-id",
      label: "Copy category ID",
      icon: "🆔",
      onSelect: () => copyId(category.id, "Category"),
    },
    separator("s3"),
    {
      type: "item",
      id: "delete",
      label: "Delete category",
      icon: "🗑",
      danger: true,
      disabled: !manage,
      reason: lock(manage, powers.ready, REASONS.manageChannels),
      onSelect: () => openDialog({ kind: "deleteChannel", guildId, channelId: category.id }),
    },
  ];
}

/** Menu of a member: the member list, a voice occupant, a message author. */
export function memberMenuItems(
  guildId: string,
  userId: string,
  options: { onProfile?: () => void } = {},
): MenuItem[] {
  const powers = powersFor(guildId);
  const { openDialog } = useUI.getState();
  const { openDM } = powers.state;
  const member = powers.state.membersByGuild[guildId]?.[userId];
  const outranked = powers.outranks(member);
  const isSelf = powers.state.user?.id === userId;

  const canRoles = powers.can(PermissionFlagsBits.ManageRoles) && outranked;
  const canNick =
    powers.can(PermissionFlagsBits.ManageNicknames) && (outranked || isSelf);
  const canKick = powers.can(PermissionFlagsBits.KickMembers) && outranked && !isSelf;
  const canBan = powers.can(PermissionFlagsBits.BanMembers) && outranked && !isSelf;
  const canTimeout = powers.can(PermissionFlagsBits.ModerateMembers) && outranked && !isSelf;

  // Voice moderation only means anything while the member is actually in a
  // voice channel; Discord rejects it outright otherwise.
  const voiceState = powers.state.voiceStatesByGuild[guildId]?.[userId];
  const canMuteVoice = powers.can(PermissionFlagsBits.MuteMembers) && outranked && !!voiceState;
  const canDeafenVoice = powers.can(PermissionFlagsBits.DeafenMembers) && outranked && !!voiceState;
  const canMoveVoice = powers.can(PermissionFlagsBits.MoveMembers) && outranked && !!voiceState;

  const timedOut =
    member?.communication_disabled_until != null &&
    Date.parse(member.communication_disabled_until) > Date.now();

  const items: MenuItem[] = [];

  if (options.onProfile) {
    items.push({
      type: "item",
      id: "profile",
      label: "Profile",
      icon: "👤",
      onSelect: options.onProfile,
    });
  }

  items.push(
    {
      type: "item",
      id: "mention",
      label: "Mention",
      icon: "@",
      onSelect: () => useUI.getState().insertIntoComposer(`<@${userId}>`),
    },
    {
      type: "item",
      id: "message",
      label: "Message",
      icon: "✉",
      disabled: isSelf,
      reason: isSelf ? "The bot cannot open a direct message with itself." : undefined,
      onSelect: () => {
        void openDM(userId, {
          username: member?.user?.username,
          globalName: member?.user?.global_name ?? null,
          discriminator: member?.user?.discriminator ?? null,
          avatar: member?.user?.avatar ?? null,
          bot: member?.user?.bot,
          nick: member?.nick ?? null,
          guildId,
          guildName: powers.state.guilds[guildId]?.name ?? null,
        }).catch((cause: unknown) =>
          useUI
            .getState()
            .toast(cause instanceof Error ? cause.message : "Could not open a DM.", "error"),
        );
      },
    },
    separator("s1"),
    {
      type: "submenu",
      id: "roles",
      label: "Roles",
      icon: "🏷",
      disabled: !canRoles,
      reason: lock(
        canRoles,
        powers.ready,
        powers.can(PermissionFlagsBits.ManageRoles) ? REASONS.hierarchy : REASONS.manageRoles,
      ),
      content: function RolesSubmenu() {
        return <RoleToggleList guildId={guildId} userId={userId} compact />;
      },
    },
    {
      type: "item",
      id: "manage-roles",
      label: "Manage roles…",
      icon: "☰",
      disabled: !canRoles,
      reason: lock(
        canRoles,
        powers.ready,
        powers.can(PermissionFlagsBits.ManageRoles) ? REASONS.hierarchy : REASONS.manageRoles,
      ),
      onSelect: () => openDialog({ kind: "memberRoles", guildId, userId }),
    },
    {
      type: "item",
      id: "nickname",
      label: "Change nickname",
      icon: "✎",
      disabled: !canNick,
      reason: lock(
        canNick,
        powers.ready,
        powers.can(PermissionFlagsBits.ManageNicknames) ? REASONS.hierarchy : REASONS.manageNicknames,
      ),
      onSelect: () => openDialog({ kind: "nickname", guildId, userId }),
    },
    separator("s2"),
    {
      type: "toggle",
      id: "server-mute",
      label: voiceState?.serverMute ? "Unmute in voice" : "Mute in voice",
      checked: voiceState?.serverMute ?? false,
      disabled: !canMuteVoice,
      reason: lock(
        canMuteVoice,
        powers.ready,
        !voiceState
          ? REASONS.notInVoice
          : powers.can(PermissionFlagsBits.MuteMembers)
            ? REASONS.hierarchy
            : REASONS.muteMembers,
      ),
      onSelect: () =>
        runVoiceAction(
          voiceApi.setServerMute(
            powers.state.getRest(),
            guildId,
            userId,
            !voiceState?.serverMute,
            "Voice moderation from DisBotClient",
          ),
          "Could not change the member's voice mute.",
        ),
    },
    {
      type: "toggle",
      id: "server-deafen",
      label: voiceState?.serverDeaf ? "Undeafen in voice" : "Deafen in voice",
      checked: voiceState?.serverDeaf ?? false,
      disabled: !canDeafenVoice,
      reason: lock(
        canDeafenVoice,
        powers.ready,
        !voiceState
          ? REASONS.notInVoice
          : powers.can(PermissionFlagsBits.DeafenMembers)
            ? REASONS.hierarchy
            : REASONS.deafenMembers,
      ),
      onSelect: () =>
        runVoiceAction(
          voiceApi.setServerDeaf(
            powers.state.getRest(),
            guildId,
            userId,
            !voiceState?.serverDeaf,
            "Voice moderation from DisBotClient",
          ),
          "Could not change the member's voice deafen.",
        ),
    },
    {
      type: "item",
      id: "voice-disconnect",
      label: "Disconnect from voice",
      icon: "📴",
      disabled: !canMoveVoice,
      reason: lock(
        canMoveVoice,
        powers.ready,
        !voiceState
          ? REASONS.notInVoice
          : powers.can(PermissionFlagsBits.MoveMembers)
            ? REASONS.hierarchy
            : REASONS.moveMembers,
      ),
      onSelect: () =>
        runVoiceAction(
          voiceApi.moveMember(
            powers.state.getRest(),
            guildId,
            userId,
            null,
            "Disconnected from DisBotClient",
          ),
          "Could not disconnect the member.",
        ),
    },
    separator("s2b"),
    {
      type: "item",
      id: "timeout",
      label: timedOut ? "Edit timeout" : "Time out member",
      icon: "⏳",
      disabled: !canTimeout,
      reason: lock(
        canTimeout,
        powers.ready,
        powers.can(PermissionFlagsBits.ModerateMembers) ? REASONS.hierarchy : REASONS.timeout,
      ),
      onSelect: () => openDialog({ kind: "moderate", guildId, userId, action: "timeout" }),
    },
    {
      type: "item",
      id: "kick",
      label: "Kick member",
      icon: "👢",
      danger: true,
      disabled: !canKick,
      reason: lock(
        canKick,
        powers.ready,
        powers.can(PermissionFlagsBits.KickMembers) ? REASONS.hierarchy : REASONS.kick,
      ),
      onSelect: () => openDialog({ kind: "moderate", guildId, userId, action: "kick" }),
    },
    {
      type: "item",
      id: "ban",
      label: "Ban member",
      icon: "🔨",
      danger: true,
      disabled: !canBan,
      reason: lock(
        canBan,
        powers.ready,
        powers.can(PermissionFlagsBits.BanMembers) ? REASONS.hierarchy : REASONS.ban,
      ),
      onSelect: () => openDialog({ kind: "moderate", guildId, userId, action: "ban" }),
    },
    separator("s3"),
    {
      type: "item",
      id: "copy-name",
      label: "Copy username",
      icon: "⧉",
      onSelect: () => {
        const name = member ? displayName(member) : userId;
        void copyText(name).then(() => useUI.getState().toast("Username copied."));
      },
    },
    { type: "item", id: "copy-id", label: "Copy user ID", icon: "🆔", onSelect: () => copyId(userId, "User") },
  );

  return items;
}

export interface MessageMenuHandlers {
  onReply: (message: APIMessage) => void;
  onEdit: (message: APIMessage) => void;
  onDelete: (message: APIMessage) => void;
  onProfile?: (userId: string) => void;
}

/** Menu of a message in the chat. */
export function messageMenuItems(
  message: APIMessage,
  guildId: string | null,
  handlers: MessageMenuHandlers,
): MenuItem[] {
  const powers = powersFor(guildId);
  const state = powers.state;
  const channel = state.channelsById[message.channel_id];
  const isOwn = message.author.id === state.user?.id;
  const canManage = powers.canIn(channel, PermissionFlagsBits.ManageMessages);
  const canPin =
    isOwn ||
    canManage ||
    powers.canIn(channel, PermissionFlagsBits.PinMessages);
  const pinned = message.pinned === true;

  const items: MenuItem[] = [
    { type: "item", id: "reply", label: "Reply", icon: "↩", onSelect: () => handlers.onReply(message) },
  ];

  if (isOwn) {
    items.push({
      type: "item",
      id: "edit",
      label: "Edit message",
      icon: "✎",
      onSelect: () => handlers.onEdit(message),
    });
  }

  items.push({
    type: "item",
    id: "pin",
    label: pinned ? "Unpin message" : "Pin message",
    icon: "📌",
    disabled: !canPin,
    reason: lock(canPin, powers.ready, REASONS.manageMessages),
    onSelect: () => {
      void togglePin(state.getRest(), message.channel_id, message.id, pinned).then(
        () => useUI.getState().toast(pinned ? "Unpinned." : "Pinned."),
        (cause: unknown) =>
          useUI
            .getState()
            .toast(cause instanceof Error ? cause.message : "Could not change the pin.", "error"),
      );
    },
  });

  items.push(
    separator("s1"),
    {
      type: "item",
      id: "copy-text",
      label: "Copy text",
      icon: "⧉",
      disabled: message.content.length === 0,
      reason: message.content.length === 0 ? "This message has no text." : undefined,
      onSelect: () =>
        void copyText(message.content).then(() => useUI.getState().toast("Message copied.")),
    },
    {
      type: "item",
      id: "copy-link",
      label: "Copy message link",
      icon: "🔗",
      onSelect: () =>
        void copyText(messageLink({ ...message, guild_id: guildId ?? undefined })).then(() =>
          useUI.getState().toast("Message link copied."),
        ),
    },
    {
      type: "item",
      id: "copy-id",
      label: "Copy message ID",
      icon: "🆔",
      onSelect: () => copyId(message.id, "Message"),
    },
  );

  if (guildId && !message.author.bot) {
    items.push(separator("s2"), {
      type: "submenu",
      id: "author",
      label: `Manage ${message.author.username}`,
      icon: "👤",
      items: memberMenuItems(guildId, message.author.id, {
        onProfile: handlers.onProfile ? () => handlers.onProfile!(message.author.id) : undefined,
      }),
    });
  }

  if (isOwn || canManage) {
    items.push(separator("s3"), {
      type: "item",
      id: "delete",
      label: "Delete message",
      icon: "🗑",
      danger: true,
      onSelect: () => handlers.onDelete(message),
    });
  }

  return items;
}

/** Shorthand used by every component that owns a right-clickable surface. */
export function useMenu() {
  return openMenuFor;
}
