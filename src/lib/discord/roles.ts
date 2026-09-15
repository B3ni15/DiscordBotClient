import { PermissionFlagsBits } from "discord-api-types/v10";
import type { APIGuild, APIGuildMember, APIRole } from "discord-api-types/v10";

/** Fallback bucket for members whose roles are all non-hoisted. */
export const DEFAULT_GROUP_ID = "__members__";

export interface MemberGroup {
  /** Role id, or `DEFAULT_GROUP_ID` for the catch-all bucket. */
  id: string;
  name: string;
  /** Hex colour of the group's role, or null when it has none. */
  color: string | null;
  members: APIGuildMember[];
}

/** Highest role first, matching how Discord renders a role list. */
export function sortRolesByPosition(roles: APIRole[]): APIRole[] {
  return [...roles].sort((a, b) => {
    if (b.position !== a.position) return b.position - a.position;
    // Equal positions are broken by id: the older role wins.
    return Number(BigInt(a.id) - BigInt(b.id));
  });
}

/** Roles of the guild indexed by id, so member lookups stay O(1). */
export function roleMap(guild: Pick<APIGuild, "roles"> | undefined): Map<string, APIRole> {
  return new Map((guild?.roles ?? []).map((role) => [role.id, role]));
}

/** The member's roles resolved against the guild, highest first. */
export function memberRoles(
  member: Pick<APIGuildMember, "roles">,
  roles: Map<string, APIRole> | APIRole[],
): APIRole[] {
  const lookup = Array.isArray(roles) ? new Map(roles.map((role) => [role.id, role])) : roles;
  const resolved = member.roles
    .map((id) => lookup.get(id))
    .filter((role): role is APIRole => role !== undefined);
  return sortRolesByPosition(resolved);
}

/**
 * The role that decides the member's name colour: the highest one that actually
 * has a colour set. `color === 0` means "no colour" in Discord's model.
 */
export function highestColoredRole(
  member: Pick<APIGuildMember, "roles">,
  roles: Map<string, APIRole> | APIRole[],
): APIRole | null {
  return memberRoles(member, roles).find((role) => role.color !== 0) ?? null;
}

/** `#rrggbb` for a Discord colour integer, or null when the role has no colour. */
export function roleColorHex(color: number): string | null {
  if (!color) return null;
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Display colour of a member's name, or null when no role gives one. */
export function memberColorHex(
  member: Pick<APIGuildMember, "roles">,
  roles: Map<string, APIRole> | APIRole[],
): string | null {
  const role = highestColoredRole(member, roles);
  return role ? roleColorHex(role.color) : null;
}

/** The highest role of the member that is displayed separately in the sidebar. */
export function highestHoistedRole(
  member: Pick<APIGuildMember, "roles">,
  roles: Map<string, APIRole> | APIRole[],
): APIRole | null {
  return memberRoles(member, roles).find((role) => role.hoist) ?? null;
}

export interface GroupOptions {
  /** Label of the catch-all bucket. */
  defaultLabel?: string;
  /** Ordering inside a group; defaults to an English name collation. */
  compare?: (a: APIGuildMember, b: APIGuildMember) => number;
}

/**
 * Groups members the way Discord does: every member shows up under its highest
 * hoisted role, and everyone left over lands in a single catch-all bucket.
 * Empty groups are dropped.
 */
export function groupMembersByHoistedRole(
  members: APIGuildMember[],
  guildRoles: APIRole[],
  options: GroupOptions = {},
): MemberGroup[] {
  const lookup = new Map(guildRoles.map((role) => [role.id, role]));
  const hoisted = sortRolesByPosition(guildRoles.filter((role) => role.hoist));
  const buckets = new Map<string, APIGuildMember[]>();
  for (const role of hoisted) buckets.set(role.id, []);
  const rest: APIGuildMember[] = [];

  for (const member of members) {
    const role = highestHoistedRole(member, lookup);
    if (role) buckets.get(role.id)?.push(member);
    else rest.push(member);
  }

  const compare = options.compare ?? compareByDisplayName;
  const groups: MemberGroup[] = [];
  for (const role of hoisted) {
    const bucket = buckets.get(role.id) ?? [];
    if (bucket.length === 0) continue;
    groups.push({
      id: role.id,
      name: role.name,
      color: roleColorHex(role.color),
      members: [...bucket].sort(compare),
    });
  }
  if (rest.length > 0) {
    groups.push({
      id: DEFAULT_GROUP_ID,
      name: options.defaultLabel ?? "Members",
      color: null,
      members: [...rest].sort(compare),
    });
  }
  return groups;
}

/** Nickname, then display name, then username - the order Discord shows. */
export function displayName(member: Pick<APIGuildMember, "nick" | "user">): string {
  return member.nick ?? member.user?.global_name ?? member.user?.username ?? "Unknown";
}

export function compareByDisplayName(a: APIGuildMember, b: APIGuildMember): number {
  return displayName(a).toLowerCase().localeCompare(displayName(b).toLowerCase(), "en");
}

/**
 * Effective permissions of a member: the `@everyone` role plus every role it
 * holds. Channel overwrites are not taken into account. The guild owner and
 * anyone with Administrator implicitly get everything.
 */
export function memberPermissions(
  guild: Pick<APIGuild, "id" | "owner_id" | "roles">,
  member: Pick<APIGuildMember, "roles" | "user">,
): bigint {
  const ALL = (1n << 64n) - 1n;
  if (member.user && guild.owner_id === member.user.id) return ALL;

  const lookup = new Map(guild.roles.map((role) => [role.id, role]));
  let permissions = BigInt(lookup.get(guild.id)?.permissions ?? "0");
  for (const id of member.roles) {
    const role = lookup.get(id);
    if (role) permissions |= BigInt(role.permissions);
  }
  if ((permissions & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator) {
    return ALL;
  }
  return permissions;
}

/** True when every requested bit is present. */
export function hasPermission(permissions: bigint, ...bits: bigint[]): boolean {
  const wanted = bits.reduce((all, bit) => all | bit, 0n);
  return (permissions & wanted) === wanted;
}

/** Convenience wrapper around `memberPermissions` + `hasPermission`. */
export function memberHasPermission(
  guild: Pick<APIGuild, "id" | "owner_id" | "roles">,
  member: Pick<APIGuildMember, "roles" | "user">,
  ...bits: bigint[]
): boolean {
  return hasPermission(memberPermissions(guild, member), ...bits);
}

/** Discord's epoch; snowflakes count milliseconds from here. */
export const DISCORD_EPOCH = 1420070400000;

/** Creation time encoded in a snowflake id. */
export function snowflakeTimestamp(id: string): number {
  return Number(BigInt(id) >> 22n) + DISCORD_EPOCH;
}
