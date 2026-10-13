"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PermissionFlagsBits } from "discord-api-types/v10";
import type { APIRole } from "discord-api-types/v10";
import { CloseIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { guildApi } from "@/lib/discord/guildApi";
import { roleColorHex, sortRolesByPosition } from "@/lib/discord/roles";
import { REASONS, useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

/**
 * Adding and removing one role at a time, optimistically, rolled back when
 * Discord says no. Shared by the pills and their "+" popup.
 */
function useRoleEditing(guildId: string, userId: string) {
  const guild = useClient((state) => state.guilds[guildId]);
  const member = useClient((state) => state.membersByGuild[guildId]?.[userId]);
  const getRest = useClient((state) => state.getRest);
  const setMemberRoles = useClient((state) => state.setMemberRoles);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(guildId);
  const [pending, setPending] = useState<string | null>(null);

  const canManageRoles = powers.can(PermissionFlagsBits.ManageRoles);
  const outranks = powers.outranks(member);

  function editable(role: APIRole) {
    return canManageRoles && outranks && !role.managed && powers.canManage(role);
  }

  function reasonFor(role: APIRole) {
    if (role.managed) return "An integration owns this role, so nobody can hand it out.";
    if (!canManageRoles) return REASONS.manageRoles;
    if (!outranks) return REASONS.hierarchy;
    return REASONS.roleHierarchy;
  }

  async function setHeld(role: APIRole, hold: boolean) {
    if (!member || pending) return;
    const before = member.roles;
    const next = hold ? [...before, role.id] : before.filter((id) => id !== role.id);
    setPending(role.id);
    setMemberRoles(guildId, userId, next);
    try {
      if (hold) {
        await guildApi.addMemberRole(getRest(), guildId, userId, role.id, "Role added from DiscordBotClient");
      } else {
        await guildApi.removeMemberRole(getRest(), guildId, userId, role.id, "Role removed from DiscordBotClient");
      }
    } catch (cause) {
      setMemberRoles(guildId, userId, before);
      toast(cause instanceof Error ? cause.message : "Discord refused the role change.", "error");
    } finally {
      setPending(null);
    }
  }

  const all = useMemo(
    () => sortRolesByPosition((guild?.roles ?? []).filter((role) => role.id !== guildId)),
    [guild, guildId],
  );

  return { member, all, pending, canManageRoles, editable, reasonFor, setHeld };
}

/**
 * A member's roles the way Discord's profile shows them: one pill per role
 * with its colour dot, which turns into an × to take the role away, and a "+"
 * at the end that opens the role picker.
 */
export function MemberRolePills({
  guildId,
  userId,
  className = "",
}: {
  guildId: string;
  userId: string;
  className?: string;
}) {
  const { member, all, pending, canManageRoles, editable, reasonFor, setHeld } = useRoleEditing(
    guildId,
    userId,
  );
  const [pickerFor, setPickerFor] = useState<HTMLElement | null>(null);

  if (!member) return null;
  const held = all.filter((role) => member.roles.includes(role.id));

  return (
    <ul className={`flex flex-wrap gap-1 ${className}`}>
      {held.map((role) => {
        const color = roleColorHex(role.color);
        const removable = editable(role);
        return (
          <li
            key={role.id}
            className={`group/pill flex h-6 max-w-full items-center gap-1 rounded-md bg-panel-alt px-1.5 text-xs font-medium text-text ${
              pending === role.id ? "opacity-50" : ""
            }`}
          >
            {removable ? (
              <button
                type="button"
                onClick={() => void setHeld(role, false)}
                aria-label={`Remove role ${role.name}`}
                title="Remove role"
                className="relative grid h-3 w-3 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: color ?? "var(--muted)" }}
              >
                <span className="absolute inset-[-2px] hidden place-items-center rounded-full bg-panel-alt text-text group-hover/pill:grid">
                  <CloseIcon size={12} />
                </span>
              </button>
            ) : (
              <span
                aria-hidden
                title={reasonFor(role)}
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: color ?? "var(--muted)" }}
              />
            )}
            <span className="truncate">{role.name}</span>
          </li>
        );
      })}
      {canManageRoles && (
        <li>
          <button
            type="button"
            onClick={(event) =>
              setPickerFor((current) => (current ? null : event.currentTarget))
            }
            aria-label="Add role"
            aria-expanded={pickerFor !== null}
            title="Add Role"
            className="grid h-6 w-6 place-items-center rounded-md bg-panel-alt text-muted transition-colors hover:text-bright"
          >
            <PlusIcon size={14} />
          </button>
          {pickerFor && (
            <RolePicker
              anchor={pickerFor}
              roles={all}
              held={member.roles}
              pending={pending}
              editable={editable}
              reasonFor={reasonFor}
              onPick={(role) => void setHeld(role, !member.roles.includes(role.id))}
              onClose={() => setPickerFor(null)}
            />
          )}
        </li>
      )}
    </ul>
  );
}

/** The small searchable role list that the "+" opens, placed next to it. */
function RolePicker({
  anchor,
  roles,
  held,
  pending,
  editable,
  reasonFor,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  roles: APIRole[];
  held: string[];
  pending: string | null;
  editable: (role: APIRole) => boolean;
  reasonFor: (role: APIRole) => string;
  onPick: (role: APIRole) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  // Below the "+" when there is room, above it otherwise; never off-screen.
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const rect = anchor.getBoundingClientRect();
    const height = element.offsetHeight;
    const width = element.offsetWidth;
    const below = rect.bottom + 8 + height < window.innerHeight;
    element.style.top = `${below ? rect.bottom + 8 : Math.max(8, rect.top - height - 8)}px`;
    element.style.left = `${Math.min(rect.left, window.innerWidth - width - 8)}px`;
    element.style.visibility = "visible";
  }, [anchor]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.contains(target)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchor, onClose]);

  const needle = query.trim().toLowerCase();
  // Discord's picker offers the roles the member does not have yet.
  const visible = roles.filter(
    (role) => !held.includes(role.id) && (!needle || role.name.toLowerCase().includes(needle)),
  );

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Add role"
      className="fixed z-[120] w-64 animate-pop-in overflow-hidden rounded-lg border border-white/5 bg-floating shadow-2xl"
      style={{ visibility: "hidden", top: 0, left: 0 }}
    >
      <div className="relative p-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Role"
          aria-label="Search roles"
          className="w-full rounded bg-ink py-1.5 pr-8 pl-2 text-sm text-text outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]"
        />
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted">
          <SearchIcon size={14} />
        </span>
      </div>
      <ul className="max-h-60 overflow-y-auto px-1.5 pb-1.5">
        {visible.length === 0 && (
          <li className="px-2 py-3 text-center text-xs text-muted">
            {needle ? "No roles match." : "They already have every role."}
          </li>
        )}
        {visible.map((role) => {
          const allowed = editable(role);
          const color = roleColorHex(role.color);
          return (
            <li key={role.id}>
              <button
                type="button"
                disabled={!allowed || pending !== null}
                title={allowed ? undefined : reasonFor(role)}
                onClick={() => onPick(role)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-text transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: color ?? "var(--muted)" }}
                />
                <span className="min-w-0 flex-1 truncate" style={color ? { color } : undefined}>
                  {role.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}
