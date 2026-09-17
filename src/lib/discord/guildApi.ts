import { OverwriteType } from "discord-api-types/v10";
import type {
  APIChannel,
  APIGuildMember,
  APIRole,
  ChannelType,
} from "discord-api-types/v10";
import type { RestClient } from "./rest";

export interface RoleBody {
  name?: string;
  /** Discord colour integer; 0 means "no colour". */
  color?: number;
  /** Show the role's members in their own section of the member list. */
  hoist?: boolean;
  mentionable?: boolean;
  /** Decimal string, the way Discord serialises a permission set. */
  permissions?: string;
  /** Unicode emoji shown next to the role name; needs a boosted server. */
  unicode_emoji?: string | null;
}

export interface ChannelBody {
  name?: string;
  type?: ChannelType;
  topic?: string | null;
  nsfw?: boolean;
  /** Seconds a member must wait between messages, 0 - 21600. */
  rate_limit_per_user?: number;
  bitrate?: number;
  user_limit?: number;
  /** Category the channel belongs to, or null to pull it out of one. */
  parent_id?: string | null;
  position?: number;
  permission_overwrites?: Array<{
    id: string;
    type: OverwriteType;
    allow?: string;
    deny?: string;
  }>;
}

/**
 * Server management endpoints: roles, channels, overwrites and the member
 * actions that hang off them. Kept apart from `api.ts` (chat) and `navApi.ts`
 * (navigation) so each surface owns its own routes.
 *
 * Every call takes an optional audit-log reason, which is what a moderator
 * reads later in the server's audit log.
 */
export const guildApi = {
  // Roles ------------------------------------------------------------------

  roles: (rest: RestClient, guildId: string) => rest.get<APIRole[]>(`/guilds/${guildId}/roles`),

  createRole: (rest: RestClient, guildId: string, body: RoleBody, reason?: string) =>
    rest.post<APIRole>(`/guilds/${guildId}/roles`, { body, reason }),

  editRole: (
    rest: RestClient,
    guildId: string,
    roleId: string,
    body: RoleBody,
    reason?: string,
  ) => rest.patch<APIRole>(`/guilds/${guildId}/roles/${roleId}`, { body, reason }),

  deleteRole: (rest: RestClient, guildId: string, roleId: string, reason?: string) =>
    rest.delete<void>(`/guilds/${guildId}/roles/${roleId}`, { reason }),

  /** Reorder roles; positions are recalculated by Discord for everything else. */
  moveRoles: (
    rest: RestClient,
    guildId: string,
    positions: Array<{ id: string; position: number }>,
    reason?: string,
  ) => rest.patch<APIRole[]>(`/guilds/${guildId}/roles`, { body: positions, reason }),

  // Members ----------------------------------------------------------------

  member: (rest: RestClient, guildId: string, userId: string) =>
    rest.get<APIGuildMember>(`/guilds/${guildId}/members/${userId}`),

  addMemberRole: (
    rest: RestClient,
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string,
  ) => rest.put<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { reason }),

  removeMemberRole: (
    rest: RestClient,
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string,
  ) => rest.delete<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { reason }),

  /** Replaces the member's whole role set in one request. */
  setMemberRoles: (
    rest: RestClient,
    guildId: string,
    userId: string,
    roles: string[],
    reason?: string,
  ) =>
    rest.patch<APIGuildMember>(`/guilds/${guildId}/members/${userId}`, {
      body: { roles },
      reason,
    }),

  setNickname: (
    rest: RestClient,
    guildId: string,
    userId: string,
    nick: string | null,
    reason?: string,
  ) => rest.patch<APIGuildMember>(`/guilds/${guildId}/members/${userId}`, { body: { nick }, reason }),

  /**
   * Times a member out until an ISO timestamp, or lifts the timeout with null.
   * Discord caps a timeout at 28 days.
   */
  timeoutMember: (
    rest: RestClient,
    guildId: string,
    userId: string,
    until: string | null,
    reason?: string,
  ) =>
    rest.patch<APIGuildMember>(`/guilds/${guildId}/members/${userId}`, {
      body: { communication_disabled_until: until },
      reason,
    }),

  kickMember: (rest: RestClient, guildId: string, userId: string, reason?: string) =>
    rest.delete<void>(`/guilds/${guildId}/members/${userId}`, { reason }),

  /** `deleteMessageSeconds` wipes that much of the member's recent history. */
  banMember: (
    rest: RestClient,
    guildId: string,
    userId: string,
    options: { deleteMessageSeconds?: number } = {},
    reason?: string,
  ) =>
    rest.put<void>(`/guilds/${guildId}/bans/${userId}`, {
      body: { delete_message_seconds: options.deleteMessageSeconds ?? 0 },
      reason,
    }),

  unbanMember: (rest: RestClient, guildId: string, userId: string, reason?: string) =>
    rest.delete<void>(`/guilds/${guildId}/bans/${userId}`, { reason }),

  // Channels ---------------------------------------------------------------

  createChannel: (rest: RestClient, guildId: string, body: ChannelBody, reason?: string) =>
    rest.post<APIChannel>(`/guilds/${guildId}/channels`, { body, reason }),

  editChannel: (rest: RestClient, channelId: string, body: ChannelBody, reason?: string) =>
    rest.patch<APIChannel>(`/channels/${channelId}`, { body, reason }),

  deleteChannel: (rest: RestClient, channelId: string, reason?: string) =>
    rest.delete<APIChannel>(`/channels/${channelId}`, { reason }),

  /**
   * Creates or replaces one permission overwrite. Discord has no "patch" here:
   * whatever is sent becomes the whole overwrite, so callers send the full
   * allow/deny pair.
   */
  setChannelOverwrite: (
    rest: RestClient,
    channelId: string,
    overwriteId: string,
    body: { type: OverwriteType; allow: string; deny: string },
    reason?: string,
  ) => rest.put<void>(`/channels/${channelId}/permissions/${overwriteId}`, { body, reason }),

  deleteChannelOverwrite: (
    rest: RestClient,
    channelId: string,
    overwriteId: string,
    reason?: string,
  ) => rest.delete<void>(`/channels/${channelId}/permissions/${overwriteId}`, { reason }),

  /** Reorders channels inside the guild; also used to move one into a category. */
  moveChannels: (
    rest: RestClient,
    guildId: string,
    positions: Array<{ id: string; position?: number; parent_id?: string | null; lock_permissions?: boolean }>,
    reason?: string,
  ) => rest.patch<void>(`/guilds/${guildId}/channels`, { body: positions, reason }),
};

/** Discord's default role colour swatches, as shown in its role editor. */
export const ROLE_COLORS = [
  0x1abc9c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe91e63, 0xf1c40f, 0xe67e22, 0xe74c3c, 0x95a5a6,
  0x607d8b, 0x11806a, 0x1f8b4c, 0x206694, 0x71368a, 0xad1457, 0xc27c0e, 0xa84300, 0x992d22,
  0x979c9f, 0x546e7a,
];

/** `#rrggbb` for an integer colour; `null` (no colour) renders as Discord's grey. */
export function colorToHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Parses `#rrggbb` (or `rrggbb`) back to the integer Discord stores. */
export function hexToColor(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  return Number.parseInt(match[1], 16);
}
