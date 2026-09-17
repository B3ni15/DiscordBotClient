"use client";

import { useCallback, useEffect, useMemo } from "react";
import { PermissionFlagsBits } from "discord-api-types/v10";
import type { APIChannel, APIGuild, APIGuildMember, APIRole } from "discord-api-types/v10";
import { useClient } from "@/lib/store/client";
import { memberPermissions } from "./roles";
import {
  canManageRole,
  channelPermissions,
  has,
  isThreadChannel,
  outranks,
} from "./permissions";

export interface GuildPowers {
  guild: APIGuild | undefined;
  /** The bot's own member object in this guild, once it is known. */
  self: APIGuildMember | undefined;
  /** Guild-wide permissions of the bot; 0 until its member object arrives. */
  permissions: bigint;
  /** False while the bot's own member object is still being fetched. */
  ready: boolean;
  /** Guild-wide check. */
  can: (...bits: bigint[]) => boolean;
  /** Check inside one channel, with its overwrites applied. */
  canIn: (channel: APIChannel | undefined, ...bits: bigint[]) => boolean;
  /** Whether the bot may hand out, edit or delete this role. */
  canManage: (role: APIRole) => boolean;
  /** Whether the bot's highest role sits above the member's. */
  outranks: (member: APIGuildMember | undefined) => boolean;
  /** The roles the bot may toggle on a member, highest first. */
  assignableRoles: APIRole[];
}

const NO_PERMISSIONS = 0n;

/**
 * What the bot is actually allowed to do in a guild.
 *
 * Every management affordance in the UI asks this hook first, so the client
 * never offers an action Discord would refuse — and says why when it cannot.
 */
export function useGuildPowers(guildId: string | null | undefined): GuildPowers {
  const guild = useClient((state) => (guildId ? state.guilds[guildId] : undefined));
  const selfId = useClient((state) => state.user?.id);
  const self = useClient((state) =>
    guildId && selfId ? state.membersByGuild[guildId]?.[selfId] : undefined,
  );
  const channelsById = useClient((state) => state.channelsById);
  const ensureSelfMember = useClient((state) => state.ensureSelfMember);

  // Without the members intent the bot's own member never arrives over the
  // gateway, so it is fetched once per guild instead.
  useEffect(() => {
    if (guildId && selfId && !self) void ensureSelfMember(guildId);
  }, [guildId, selfId, self, ensureSelfMember]);

  const permissions = useMemo(
    () => (guild && self ? memberPermissions(guild, self) : NO_PERMISSIONS),
    [guild, self],
  );

  const can = useCallback(
    (...bits: bigint[]) => has(permissions, ...bits),
    [permissions],
  );

  const canIn = useCallback(
    (channel: APIChannel | undefined, ...bits: bigint[]) => {
      if (!guild || !self) return false;
      // A thread has no overwrites of its own; its parent's decide.
      const target =
        isThreadChannel(channel) && channel && "parent_id" in channel && channel.parent_id
          ? (channelsById[channel.parent_id] ?? channel)
          : channel;
      return has(channelPermissions(guild, self, target), ...bits);
    },
    [guild, self, channelsById],
  );

  const canManage = useCallback(
    (role: APIRole) => (guild && self ? canManageRole(guild, self, role) : false),
    [guild, self],
  );

  const outranksMember = useCallback(
    (member: APIGuildMember | undefined) =>
      guild && self && member ? outranks(guild, self, member) : false,
    [guild, self],
  );

  const assignableRoles = useMemo(() => {
    if (!guild || !self) return [];
    return [...guild.roles]
      .filter((role) => canManageRole(guild, self, role))
      .sort((a, b) => b.position - a.position);
  }, [guild, self]);

  return {
    guild,
    self,
    permissions,
    ready: guild !== undefined && self !== undefined,
    can,
    canIn,
    canManage,
    outranks: outranksMember,
    assignableRoles,
  };
}

/** Wording for a disabled menu entry, so the UI always says what is missing. */
export function missingPermission(label: string): string {
  return `The bot is missing the ${label} permission.`;
}

/** The permission a member-management action needs, as a readable sentence. */
export const REASONS = {
  manageChannels: missingPermission("Manage Channels"),
  managePermissions: missingPermission("Manage Permissions"),
  manageRoles: missingPermission("Manage Roles"),
  manageMessages: missingPermission("Manage Messages"),
  manageNicknames: missingPermission("Manage Nicknames"),
  kick: missingPermission("Kick Members"),
  ban: missingPermission("Ban Members"),
  timeout: missingPermission("Timeout Members"),
  hierarchy: "The bot's highest role is not above this member's.",
  roleHierarchy: "This role is above the bot's highest role, or managed by an integration.",
  notReady: "Still working out what the bot may do here.",
} as const;

export const PERMISSION_BITS = PermissionFlagsBits;
