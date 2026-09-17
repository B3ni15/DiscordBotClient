import { ChannelType, OverwriteType, PermissionFlagsBits } from "discord-api-types/v10";
import type {
  APIChannel,
  APIGuild,
  APIGuildMember,
  APIOverwrite,
  APIRole,
} from "discord-api-types/v10";
import { memberPermissions, sortRolesByPosition } from "./roles";

/** Every bit set; what Administrator and the guild owner effectively hold. */
export const ALL_PERMISSIONS = (1n << 64n) - 1n;

/** Which overwrite editors a permission shows up in. */
export type PermissionScope = "text" | "voice" | "stage" | "forum";

export interface PermissionDef {
  bit: bigint;
  /** Stable key for React lists and form state. */
  key: string;
  /** Wording in the role editor. */
  label: string;
  /** Wording in a channel's overwrite editor, when Discord renames it there. */
  channelLabel?: string;
  description: string;
  group: string;
  /** Channel kinds whose overwrite editor offers this permission. */
  scopes: PermissionScope[];
  /** Left out of the role editor; only meaningful on a channel. */
  channelOnly?: boolean;
}

const TEXT_LIKE: PermissionScope[] = ["text", "forum"];
const ALL_SCOPES: PermissionScope[] = ["text", "voice", "stage", "forum"];

/**
 * The permissions this client exposes, in the order and grouping Discord's own
 * role settings use. Anything Discord itself hides behind monetisation or a
 * deprecated alias is left out on purpose.
 */
export const PERMISSIONS: PermissionDef[] = [
  // General
  {
    bit: PermissionFlagsBits.ViewChannel,
    key: "ViewChannel",
    label: "View Channels",
    channelLabel: "View Channel",
    description: "Lets members see the channel in their list and read it.",
    group: "General",
    scopes: ALL_SCOPES,
  },
  {
    bit: PermissionFlagsBits.ManageChannels,
    key: "ManageChannels",
    label: "Manage Channels",
    channelLabel: "Manage Channel",
    description: "Create, rename, delete and reorder channels.",
    group: "General",
    scopes: ALL_SCOPES,
  },
  {
    bit: PermissionFlagsBits.ManageRoles,
    key: "ManageRoles",
    label: "Manage Roles",
    channelLabel: "Manage Permissions",
    description: "Create and edit roles below their own, and change permissions.",
    group: "General",
    scopes: ALL_SCOPES,
  },
  {
    bit: PermissionFlagsBits.CreateGuildExpressions,
    key: "CreateGuildExpressions",
    label: "Create Expressions",
    description: "Add emoji, stickers and sounds to the server.",
    group: "General",
    scopes: [],
  },
  {
    bit: PermissionFlagsBits.ManageGuildExpressions,
    key: "ManageGuildExpressions",
    label: "Manage Expressions",
    description: "Edit and remove the server's emoji, stickers and sounds.",
    group: "General",
    scopes: [],
  },
  {
    bit: PermissionFlagsBits.ViewAuditLog,
    key: "ViewAuditLog",
    label: "View Audit Log",
    description: "Read the record of moderation and configuration changes.",
    group: "General",
    scopes: [],
  },
  {
    bit: PermissionFlagsBits.ViewGuildInsights,
    key: "ViewGuildInsights",
    label: "View Server Insights",
    description: "Read the server's growth and engagement statistics.",
    group: "General",
    scopes: [],
  },
  {
    bit: PermissionFlagsBits.ManageWebhooks,
    key: "ManageWebhooks",
    label: "Manage Webhooks",
    description: "Create, edit and delete webhooks.",
    group: "General",
    scopes: ALL_SCOPES,
  },
  {
    bit: PermissionFlagsBits.ManageGuild,
    key: "ManageGuild",
    label: "Manage Server",
    description: "Change the server's name, region, icon and other settings.",
    group: "General",
    scopes: [],
  },

  // Membership
  {
    bit: PermissionFlagsBits.CreateInstantInvite,
    key: "CreateInstantInvite",
    label: "Create Invite",
    description: "Invite new people to the server.",
    group: "Membership",
    scopes: ALL_SCOPES,
  },
  {
    bit: PermissionFlagsBits.ChangeNickname,
    key: "ChangeNickname",
    label: "Change Nickname",
    description: "Set their own nickname in this server.",
    group: "Membership",
    scopes: [],
  },
  {
    bit: PermissionFlagsBits.ManageNicknames,
    key: "ManageNicknames",
    label: "Manage Nicknames",
    description: "Change the nicknames of other members.",
    group: "Membership",
    scopes: [],
  },
  {
    bit: PermissionFlagsBits.KickMembers,
    key: "KickMembers",
    label: "Kick Members",
    description: "Remove members from the server; they can rejoin with an invite.",
    group: "Membership",
    scopes: [],
  },
  {
    bit: PermissionFlagsBits.BanMembers,
    key: "BanMembers",
    label: "Ban Members",
    description: "Permanently remove members and block their account.",
    group: "Membership",
    scopes: [],
  },
  {
    bit: PermissionFlagsBits.ModerateMembers,
    key: "ModerateMembers",
    label: "Timeout Members",
    description: "Temporarily stop members from talking and reacting.",
    group: "Membership",
    scopes: [],
  },

  // Text channels
  {
    bit: PermissionFlagsBits.SendMessages,
    key: "SendMessages",
    label: "Send Messages",
    channelLabel: "Send Messages",
    description: "Post messages in text channels.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.SendMessagesInThreads,
    key: "SendMessagesInThreads",
    label: "Send Messages in Threads",
    description: "Post inside threads and forum posts.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.CreatePublicThreads,
    key: "CreatePublicThreads",
    label: "Create Public Threads",
    description: "Start threads everyone in the channel can see.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.CreatePrivateThreads,
    key: "CreatePrivateThreads",
    label: "Create Private Threads",
    description: "Start threads that are invite-only.",
    group: "Text",
    scopes: ["text"],
  },
  {
    bit: PermissionFlagsBits.EmbedLinks,
    key: "EmbedLinks",
    label: "Embed Links",
    description: "Links they post show a preview.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.AttachFiles,
    key: "AttachFiles",
    label: "Attach Files",
    description: "Upload files and images.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.AddReactions,
    key: "AddReactions",
    label: "Add Reactions",
    description: "React with emoji that are not on the message yet.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.UseExternalEmojis,
    key: "UseExternalEmojis",
    label: "Use External Emoji",
    description: "Use emoji from other servers.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.UseExternalStickers,
    key: "UseExternalStickers",
    label: "Use External Stickers",
    description: "Use stickers from other servers.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.MentionEveryone,
    key: "MentionEveryone",
    label: "Mention @everyone, @here and All Roles",
    description: "Ping everyone in the channel, including unmentionable roles.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.ManageMessages,
    key: "ManageMessages",
    label: "Manage Messages",
    description: "Delete and pin anyone's messages.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.PinMessages,
    key: "PinMessages",
    label: "Pin Messages",
    description: "Pin and unpin messages without managing them.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.ManageThreads,
    key: "ManageThreads",
    label: "Manage Threads",
    description: "Rename, archive, unarchive and delete threads.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.ReadMessageHistory,
    key: "ReadMessageHistory",
    label: "Read Message History",
    description: "Read messages posted before they opened the channel.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.SendTTSMessages,
    key: "SendTTSMessages",
    label: "Send Text-to-Speech Messages",
    description: "Send /tts messages that are read aloud to the channel.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.SendVoiceMessages,
    key: "SendVoiceMessages",
    label: "Send Voice Messages",
    description: "Record and send voice messages.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.SendPolls,
    key: "SendPolls",
    label: "Create Polls",
    description: "Start polls in the channel.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.UseApplicationCommands,
    key: "UseApplicationCommands",
    label: "Use Application Commands",
    description: "Run slash commands and other app commands.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.UseExternalApps,
    key: "UseExternalApps",
    label: "Use External Apps",
    description: "Use apps that are not added to this server.",
    group: "Text",
    scopes: TEXT_LIKE,
  },
  {
    bit: PermissionFlagsBits.BypassSlowmode,
    key: "BypassSlowmode",
    label: "Bypass Slowmode",
    description: "Post without waiting out the channel's slowmode.",
    group: "Text",
    scopes: TEXT_LIKE,
  },

  // Voice channels
  {
    bit: PermissionFlagsBits.Connect,
    key: "Connect",
    label: "Connect",
    description: "Join voice and stage channels.",
    group: "Voice",
    scopes: ["voice", "stage"],
  },
  {
    bit: PermissionFlagsBits.Speak,
    key: "Speak",
    label: "Speak",
    description: "Talk in voice channels.",
    group: "Voice",
    scopes: ["voice"],
  },
  {
    bit: PermissionFlagsBits.Stream,
    key: "Stream",
    label: "Video",
    description: "Share their camera or screen.",
    group: "Voice",
    scopes: ["voice", "stage"],
  },
  {
    bit: PermissionFlagsBits.UseSoundboard,
    key: "UseSoundboard",
    label: "Use Soundboard",
    description: "Play sounds from this server's soundboard.",
    group: "Voice",
    scopes: ["voice"],
  },
  {
    bit: PermissionFlagsBits.UseExternalSounds,
    key: "UseExternalSounds",
    label: "Use External Sounds",
    description: "Play soundboard sounds from other servers.",
    group: "Voice",
    scopes: ["voice"],
  },
  {
    bit: PermissionFlagsBits.UseVAD,
    key: "UseVAD",
    label: "Use Voice Activity",
    description: "Talk without holding push-to-talk.",
    group: "Voice",
    scopes: ["voice"],
  },
  {
    bit: PermissionFlagsBits.PrioritySpeaker,
    key: "PrioritySpeaker",
    label: "Priority Speaker",
    description: "Lower everyone else's volume while they speak.",
    group: "Voice",
    scopes: ["voice"],
  },
  {
    bit: PermissionFlagsBits.MuteMembers,
    key: "MuteMembers",
    label: "Mute Members",
    description: "Silence other members in voice channels.",
    group: "Voice",
    scopes: ["voice", "stage"],
  },
  {
    bit: PermissionFlagsBits.DeafenMembers,
    key: "DeafenMembers",
    label: "Deafen Members",
    description: "Stop other members from hearing voice channels.",
    group: "Voice",
    scopes: ["voice", "stage"],
  },
  {
    bit: PermissionFlagsBits.MoveMembers,
    key: "MoveMembers",
    label: "Move Members",
    description: "Drag members between voice channels or disconnect them.",
    group: "Voice",
    scopes: ["voice", "stage"],
  },
  {
    bit: PermissionFlagsBits.SetVoiceChannelStatus,
    key: "SetVoiceChannelStatus",
    label: "Set Voice Channel Status",
    description: "Write the status line shown on a voice channel.",
    group: "Voice",
    scopes: ["voice"],
  },
  {
    bit: PermissionFlagsBits.UseEmbeddedActivities,
    key: "UseEmbeddedActivities",
    label: "Use Activities",
    description: "Start games and other activities in voice channels.",
    group: "Voice",
    scopes: ["voice"],
  },
  {
    bit: PermissionFlagsBits.RequestToSpeak,
    key: "RequestToSpeak",
    label: "Request to Speak",
    description: "Raise a hand to speak in stage channels.",
    group: "Voice",
    scopes: ["stage"],
  },

  // Events
  {
    bit: PermissionFlagsBits.CreateEvents,
    key: "CreateEvents",
    label: "Create Events",
    description: "Schedule server events.",
    group: "Events",
    scopes: ["voice", "stage"],
  },
  {
    bit: PermissionFlagsBits.ManageEvents,
    key: "ManageEvents",
    label: "Manage Events",
    description: "Edit, start and cancel server events.",
    group: "Events",
    scopes: ["voice", "stage"],
  },

  // Advanced
  {
    bit: PermissionFlagsBits.Administrator,
    key: "Administrator",
    label: "Administrator",
    description:
      "Grants every permission and bypasses channel overwrites. Hand it out sparingly.",
    group: "Advanced",
    scopes: [],
  },
];

export const PERMISSION_GROUPS = ["General", "Membership", "Text", "Voice", "Events", "Advanced"];

/** The permission set a channel of this type can actually overwrite. */
export function permissionsForChannel(type: ChannelType): PermissionDef[] {
  const scope = channelScope(type);
  if (!scope) return [];
  return PERMISSIONS.filter((permission) => permission.scopes.includes(scope));
}

/** Which overwrite editor applies; categories inherit the text set. */
export function channelScope(type: ChannelType): PermissionScope | null {
  switch (type) {
    case ChannelType.GuildText:
    case ChannelType.GuildAnnouncement:
    case ChannelType.GuildCategory:
    case ChannelType.AnnouncementThread:
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
      return "text";
    case ChannelType.GuildVoice:
      return "voice";
    case ChannelType.GuildStageVoice:
      return "stage";
    case ChannelType.GuildForum:
    case ChannelType.GuildMedia:
      return "forum";
    default:
      return null;
  }
}

/** Human-readable name of a permission bit, for error messages. */
export function permissionLabel(bit: bigint): string {
  return PERMISSIONS.find((permission) => permission.bit === bit)?.label ?? "that permission";
}

/** Thread types take their permissions from the channel they live in. */
const THREAD_TYPES = new Set<ChannelType>([
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
]);

export function isThreadChannel(channel: APIChannel | undefined): boolean {
  return channel !== undefined && THREAD_TYPES.has(channel.type);
}

function overwritesOf(channel: APIChannel | undefined): APIOverwrite[] {
  if (!channel) return [];
  return "permission_overwrites" in channel ? (channel.permission_overwrites ?? []) : [];
}

/**
 * Effective permissions of a member inside one channel: the guild-wide
 * permissions with the channel's overwrites applied in Discord's order —
 * `@everyone`, then every role the member holds, then the member itself.
 */
export function channelPermissions(
  guild: Pick<APIGuild, "id" | "owner_id" | "roles">,
  member: Pick<APIGuildMember, "roles" | "user">,
  channel: APIChannel | undefined,
): bigint {
  const base = memberPermissions(guild, member);
  if ((base & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator) {
    return ALL_PERMISSIONS;
  }
  const overwrites = overwritesOf(channel);
  if (overwrites.length === 0) return base;

  let permissions = base;

  const everyone = overwrites.find((overwrite) => overwrite.id === guild.id);
  if (everyone) {
    permissions &= ~BigInt(everyone.deny);
    permissions |= BigInt(everyone.allow);
  }

  // Role overwrites are accumulated first and applied together, so a single
  // allow anywhere beats a deny on another role.
  let allow = 0n;
  let deny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type !== OverwriteType.Role) continue;
    if (overwrite.id === guild.id || !member.roles.includes(overwrite.id)) continue;
    allow |= BigInt(overwrite.allow);
    deny |= BigInt(overwrite.deny);
  }
  permissions &= ~deny;
  permissions |= allow;

  const mine = overwrites.find(
    (overwrite) => overwrite.type === OverwriteType.Member && overwrite.id === member.user?.id,
  );
  if (mine) {
    permissions &= ~BigInt(mine.deny);
    permissions |= BigInt(mine.allow);
  }

  return permissions;
}

/**
 * Position of the member's highest role. The guild owner outranks everyone, so
 * it gets a position no role can reach.
 */
export function highestRolePosition(
  guild: Pick<APIGuild, "id" | "owner_id" | "roles">,
  member: Pick<APIGuildMember, "roles" | "user">,
): number {
  if (member.user && guild.owner_id === member.user.id) return Number.POSITIVE_INFINITY;
  const lookup = new Map(guild.roles.map((role) => [role.id, role]));
  let highest = 0;
  for (const id of member.roles) {
    const role = lookup.get(id);
    if (role && role.position > highest) highest = role.position;
  }
  return highest;
}

/** The member's highest role, which is the one Discord compares hierarchies by. */
export function highestRole(
  guild: Pick<APIGuild, "id" | "owner_id" | "roles">,
  member: Pick<APIGuildMember, "roles">,
): APIRole | null {
  const lookup = new Map(guild.roles.map((role) => [role.id, role]));
  const owned = member.roles
    .map((id) => lookup.get(id))
    .filter((role): role is APIRole => role !== undefined);
  return sortRolesByPosition(owned)[0] ?? null;
}

/**
 * Whether the acting member may hand out, take away or edit `role`.
 *
 * Discord requires Manage Roles plus a strictly higher position, and refuses
 * outright for `@everyone` and for roles an integration owns.
 */
export function canManageRole(
  guild: Pick<APIGuild, "id" | "owner_id" | "roles">,
  member: Pick<APIGuildMember, "roles" | "user">,
  role: APIRole,
): boolean {
  if (role.id === guild.id) return false;
  if (role.managed) return false;
  if (!has(memberPermissions(guild, member), PermissionFlagsBits.ManageRoles)) return false;
  return highestRolePosition(guild, member) > role.position;
}

/**
 * Whether the acting member outranks the target member. Nobody outranks the
 * owner, and equal highest roles mean neither may touch the other.
 */
export function outranks(
  guild: Pick<APIGuild, "id" | "owner_id" | "roles">,
  member: Pick<APIGuildMember, "roles" | "user">,
  target: Pick<APIGuildMember, "roles" | "user">,
): boolean {
  if (target.user && guild.owner_id === target.user.id) return false;
  if (member.user && guild.owner_id === member.user.id) return true;
  return highestRolePosition(guild, member) > highestRolePosition(guild, target);
}

/** True when every requested bit is present. */
export function has(permissions: bigint, ...bits: bigint[]): boolean {
  const wanted = bits.reduce((all, bit) => all | bit, 0n);
  return (permissions & wanted) === wanted;
}

/** Discord serialises permission sets as decimal strings. */
export function serializePermissions(permissions: bigint): string {
  return permissions.toString();
}

export function parsePermissions(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
