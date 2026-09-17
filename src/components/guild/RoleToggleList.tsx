"use client";

import { useMemo, useState } from "react";
import { PermissionFlagsBits } from "discord-api-types/v10";
import type { APIRole } from "discord-api-types/v10";
import { guildApi } from "@/lib/discord/guildApi";
import { roleColorHex, sortRolesByPosition } from "@/lib/discord/roles";
import { REASONS, useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

export interface RoleToggleListProps {
  guildId: string;
  userId: string;
  /** Submenu sizing; the dialog uses the roomier layout. */
  compact?: boolean;
}

/**
 * The role checklist Discord shows under "Roles" in a member's context menu.
 *
 * Every toggle is one request, applied optimistically and rolled back when
 * Discord refuses. Roles above the bot's highest one, and roles an integration
 * owns, are listed but locked — that is Discord's rule, not a client limit.
 */
export function RoleToggleList({ guildId, userId, compact = false }: RoleToggleListProps) {
  const guild = useClient((state) => state.guilds[guildId]);
  const member = useClient((state) => state.membersByGuild[guildId]?.[userId]);
  const getRest = useClient((state) => state.getRest);
  const setMemberRoles = useClient((state) => state.setMemberRoles);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(guildId);

  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const roles = useMemo(
    () => sortRolesByPosition((guild?.roles ?? []).filter((role) => role.id !== guildId)),
    [guild, guildId],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return roles;
    return roles.filter((role) => role.name.toLowerCase().includes(needle));
  }, [roles, query]);

  const canManageRoles = powers.can(PermissionFlagsBits.ManageRoles);
  const outranksMember = powers.outranks(member);

  async function toggle(role: APIRole) {
    if (!member) return;
    const held = member.roles.includes(role.id);
    const next = held
      ? member.roles.filter((id) => id !== role.id)
      : [...member.roles, role.id];

    setPending(role.id);
    setMemberRoles(guildId, userId, next);
    try {
      if (held) {
        await guildApi.removeMemberRole(
          getRest(),
          guildId,
          userId,
          role.id,
          "Role removed from DiscordBotClient",
        );
      } else {
        await guildApi.addMemberRole(
          getRest(),
          guildId,
          userId,
          role.id,
          "Role added from DiscordBotClient",
        );
      }
    } catch (cause) {
      // Put the role back the way it was; Discord did not take the change.
      setMemberRoles(guildId, userId, member.roles);
      toast(cause instanceof Error ? cause.message : "Discord refused the role change.", "error");
    } finally {
      setPending(null);
    }
  }

  if (!member) {
    return (
      <p className={`px-2 py-1.5 text-xs text-muted ${compact ? "" : "py-3"}`}>
        This member is not loaded. Enable the SERVER MEMBERS intent to manage their roles.
      </p>
    );
  }

  return (
    <div className={compact ? "w-56" : ""}>
      {roles.length > 8 && (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search roles"
          aria-label="Search roles"
          className={`mb-1 w-full rounded bg-ink px-2 py-1.5 text-xs text-text outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)] ${
            compact ? "" : "text-sm"
          }`}
        />
      )}

      {!canManageRoles && (
        <p className="px-2 py-1.5 text-[11px] leading-snug text-amber">{REASONS.manageRoles}</p>
      )}
      {canManageRoles && !outranksMember && (
        <p className="px-2 py-1.5 text-[11px] leading-snug text-amber">{REASONS.hierarchy}</p>
      )}

      <ul className={`overflow-y-auto ${compact ? "max-h-64" : "max-h-80"}`}>
        {visible.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-faint">No role matches.</li>
        )}
        {visible.map((role) => {
          const checked = member.roles.includes(role.id);
          const manageable = powers.canManage(role) && outranksMember;
          const color = roleColorHex(role.color);
          const reason = role.managed
            ? "An integration owns this role, so nobody can hand it out."
            : !canManageRoles
              ? REASONS.manageRoles
              : !outranksMember
                ? REASONS.hierarchy
                : REASONS.roleHierarchy;

          return (
            <li key={role.id}>
              <button
                type="button"
                disabled={!manageable || pending === role.id}
                title={manageable ? undefined : reason}
                onClick={() => void toggle(role)}
                className={`group/role flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm transition-colors ${
                  manageable
                    ? "text-text hover:bg-accent hover:text-white"
                    : "cursor-not-allowed text-faint opacity-60"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border text-[10px] ${
                    checked
                      ? "border-transparent bg-accent text-white group-hover/role:bg-white group-hover/role:text-accent"
                      : "border-muted"
                  }`}
                >
                  {pending === role.id ? "…" : checked ? "✓" : ""}
                </span>
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted"
                  style={color ? { backgroundColor: color } : undefined}
                />
                <span className="min-w-0 flex-1 truncate">{role.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
