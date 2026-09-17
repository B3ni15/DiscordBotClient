"use client";

import { useMemo, useState } from "react";
import { OverwriteType, PermissionFlagsBits } from "discord-api-types/v10";
import type { APIChannel, APIOverwrite } from "discord-api-types/v10";
import { Modal } from "@/components/ui/Modal";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { guildApi } from "@/lib/discord/guildApi";
import { has, parsePermissions, permissionsForChannel } from "@/lib/discord/permissions";
import { displayName, roleColorHex, sortRolesByPosition } from "@/lib/discord/roles";
import { useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

type Tri = "allow" | "neutral" | "deny";

export interface ChannelPermissionsProps {
  guildId: string;
  channelId: string;
  /** Overwrite to open on, when the dialog was opened for a specific role. */
  focusId?: string;
  onClose: () => void;
}

/**
 * Channel permission overwrites, laid out the way Discord's own channel
 * settings are: the roles and members with an overwrite on the left, the
 * allow / neutral / deny switches for the selected one on the right.
 */
export function ChannelPermissions({
  guildId,
  channelId,
  focusId,
  onClose,
}: ChannelPermissionsProps) {
  const channel = useClient((state) => state.channelsById[channelId]);
  const guild = useClient((state) => state.guilds[guildId]);
  const members = useClient((state) => state.membersByGuild[guildId]);
  const getRest = useClient((state) => state.getRest);
  const upsertChannel = useClient((state) => state.upsertChannel);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(guildId);

  const overwrites = useMemo<APIOverwrite[]>(
    () =>
      channel && "permission_overwrites" in channel ? (channel.permission_overwrites ?? []) : [],
    [channel],
  );

  const [target, setTarget] = useState<string>(focusId ?? guildId);
  const [allow, setAllow] = useState(0n);
  const [deny, setDeny] = useState(0n);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const existing = overwrites.find((entry) => entry.id === target);
  const storedAllow = parsePermissions(existing?.allow);
  const storedDeny = parsePermissions(existing?.deny);

  /*
   * Whenever the selected target changes — or Discord's answer to a save lands —
   * the switches start again from what is stored. Adjusting during render is
   * React's own pattern for state derived from props, and beats an effect that
   * would paint the previous target's values first.
   */
  const [loaded, setLoaded] = useState("");
  const stored = `${target}:${storedAllow}:${storedDeny}`;
  if (loaded !== stored) {
    setLoaded(stored);
    setAllow(storedAllow);
    setDeny(storedDeny);
    setError(null);
  }

  const roles = useMemo(() => sortRolesByPosition(guild?.roles ?? []), [guild]);
  const available = useMemo(
    () => permissionsForChannel(channel?.type ?? 0),
    [channel?.type],
  );

  const listed = useMemo(() => {
    // @everyone is always present, even without an overwrite of its own.
    const ids = new Set<string>([guildId, ...overwrites.map((entry) => entry.id)]);
    return [...ids];
  }, [guildId, overwrites]);

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const taken = new Set(listed);
    const roleEntries = roles
      .filter((role) => !taken.has(role.id) && role.name.toLowerCase().includes(needle))
      .map((role) => ({
        id: role.id,
        kind: OverwriteType.Role,
        label: role.name,
        color: roleColorHex(role.color),
      }));
    const memberEntries = Object.values(members ?? {})
      .filter(
        (member) =>
          member.user &&
          !taken.has(member.user.id) &&
          displayName(member).toLowerCase().includes(needle),
      )
      .slice(0, 25)
      .map((member) => ({
        id: member.user!.id,
        kind: OverwriteType.Member,
        label: displayName(member),
        color: null,
      }));
    return [...roleEntries, ...memberEntries].slice(0, 50);
  }, [roles, members, listed, query]);

  const canEdit = powers.canIn(channel, PermissionFlagsBits.ManageRoles);
  const isAdmin = has(powers.permissions, PermissionFlagsBits.Administrator);
  const dirty = allow !== storedAllow || deny !== storedDeny;

  function stateOf(bit: bigint): Tri {
    if (has(allow, bit)) return "allow";
    if (has(deny, bit)) return "deny";
    return "neutral";
  }

  function set(bit: bigint, next: Tri) {
    setAllow((current) => (next === "allow" ? current | bit : current & ~bit));
    setDeny((current) => (next === "deny" ? current | bit : current & ~bit));
  }

  function typeOf(id: string): OverwriteType {
    const known = overwrites.find((entry) => entry.id === id);
    if (known) return known.type;
    return roles.some((role) => role.id === id) ? OverwriteType.Role : OverwriteType.Member;
  }

  /** Writes the channel's overwrite list back into the store after a change. */
  function applyLocally(next: APIOverwrite[]) {
    if (!channel) return;
    upsertChannel({ ...channel, permission_overwrites: next } as APIChannel);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await guildApi.setChannelOverwrite(
        getRest(),
        channelId,
        target,
        { type: typeOf(target), allow: allow.toString(), deny: deny.toString() },
        "Permissions edited from DiscordBotClient",
      );
      const next = overwrites.some((entry) => entry.id === target)
        ? overwrites.map((entry) =>
            entry.id === target
              ? { ...entry, allow: allow.toString(), deny: deny.toString() }
              : entry,
          )
        : [
            ...overwrites,
            {
              id: target,
              type: typeOf(target),
              allow: allow.toString(),
              deny: deny.toString(),
            } as APIOverwrite,
          ];
      applyLocally(next);
      toast("Permissions saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused the change.");
    } finally {
      setBusy(false);
    }
  }

  async function removeOverwrite() {
    setBusy(true);
    setError(null);
    try {
      await guildApi.deleteChannelOverwrite(
        getRest(),
        channelId,
        target,
        "Permissions reset from DiscordBotClient",
      );
      applyLocally(overwrites.filter((entry) => entry.id !== target));
      toast("Overwrite removed.");
      setTarget(guildId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused the change.");
    } finally {
      setBusy(false);
    }
  }

  function labelFor(id: string): { label: string; color: string | null; avatar?: string } {
    if (id === guildId) return { label: "@everyone", color: null };
    const role = roles.find((entry) => entry.id === id);
    if (role) return { label: `@${role.name}`, color: roleColorHex(role.color) };
    const member = members?.[id];
    if (member?.user) {
      return {
        label: displayName(member),
        color: null,
        avatar: userAvatarUrl(member.user, 32),
      };
    }
    return { label: id, color: null };
  }

  const channelName = channel && "name" in channel ? (channel.name ?? channelId) : channelId;

  return (
    <Modal
      title={`Permissions — ${channelName}`}
      subtitle="Allow beats deny across roles; a member overwrite beats both."
      size="lg"
      onClose={onClose}
      footer={
        <>
          {existing && target !== guildId && (
            <button
              type="button"
              onClick={() => void removeOverwrite()}
              disabled={busy || !canEdit}
              className="mr-auto rounded px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/15 disabled:opacity-50"
            >
              Remove overwrite
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-text transition-colors hover:underline"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !dirty || !canEdit}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      {!canEdit && (
        <p className="mb-3 rounded bg-amber/15 px-3 py-2 text-xs text-amber">
          The bot cannot change permissions here: it is missing Manage Permissions in this channel.
          The current overwrites are still shown.
        </p>
      )}

      <div className="flex min-h-0 gap-4">
        <div className="w-48 shrink-0">
          <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
            Roles &amp; members
          </h3>
          <ul className="flex flex-col gap-0.5">
            {listed.map((id) => {
              const entry = labelFor(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setTarget(id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                      target === id ? "bg-raised text-bright" : "text-muted hover:bg-hover"
                    }`}
                  >
                    {entry.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.avatar} alt="" className="h-5 w-5 shrink-0 rounded-full" />
                    ) : (
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted"
                        style={entry.color ? { backgroundColor: entry.color } : undefined}
                      />
                    )}
                    <span className="truncate" style={entry.color ? { color: entry.color } : undefined}>
                      {entry.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            disabled={!canEdit}
            className="mt-2 w-full rounded bg-ink px-2 py-1.5 text-xs text-muted transition-colors hover:bg-hover hover:text-bright disabled:opacity-50"
          >
            + Add role or member
          </button>

          {adding && (
            <div className="mt-2 rounded bg-ink p-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search roles and members"
                className="mb-1 w-full rounded bg-panel px-2 py-1 text-xs text-text outline-none focus:shadow-[0_0_0_1px_var(--accent)]"
              />
              <ul className="max-h-40 overflow-y-auto">
                {candidates.length === 0 ? (
                  <li className="px-1 py-1 text-[11px] text-faint">Nothing left to add.</li>
                ) : (
                  candidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => {
                          // The overwrite itself is created on save; until then
                          // it is an empty allow/deny pair on screen.
                          applyLocally([
                            ...overwrites,
                            {
                              id: candidate.id,
                              type: candidate.kind,
                              allow: "0",
                              deny: "0",
                            } as APIOverwrite,
                          ]);
                          setTarget(candidate.id);
                          setAdding(false);
                          setQuery("");
                        }}
                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-text transition-colors hover:bg-hover"
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full bg-muted"
                          style={candidate.color ? { backgroundColor: candidate.color } : undefined}
                        />
                        <span className="truncate">
                          {candidate.kind === OverwriteType.Role
                            ? `@${candidate.label}`
                            : candidate.label}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {available.length === 0 ? (
            <p className="text-sm text-muted">This channel kind has no overwritable permissions.</p>
          ) : (
            <ul className="flex flex-col">
              {available.map((permission) => {
                const state = stateOf(permission.bit);
                const locked = !canEdit || (!isAdmin && !has(powers.permissions, permission.bit));
                return (
                  <li
                    key={permission.key}
                    className="flex items-start gap-3 border-b border-line py-2 last:border-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-text">
                        {permission.channelLabel ?? permission.label}
                      </span>
                      <span className="block text-[11px] leading-snug text-muted">
                        {permission.description}
                      </span>
                    </span>
                    <span
                      className="flex shrink-0 overflow-hidden rounded border border-line"
                      role="radiogroup"
                      aria-label={permission.channelLabel ?? permission.label}
                      title={
                        locked
                          ? "The bot cannot change a permission it does not hold itself."
                          : undefined
                      }
                    >
                      <TriButton
                        current={state}
                        value="deny"
                        label="Deny"
                        glyph="✕"
                        disabled={locked}
                        onSelect={() => set(permission.bit, "deny")}
                      />
                      <TriButton
                        current={state}
                        value="neutral"
                        label="Inherit"
                        glyph="／"
                        disabled={locked}
                        onSelect={() => set(permission.bit, "neutral")}
                      />
                      <TriButton
                        current={state}
                        value="allow"
                        label="Allow"
                        glyph="✓"
                        disabled={locked}
                        onSelect={() => set(permission.bit, "allow")}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TriButton({
  current,
  value,
  label,
  glyph,
  disabled,
  onSelect,
}: {
  current: Tri;
  value: Tri;
  label: string;
  glyph: string;
  disabled: boolean;
  onSelect: () => void;
}) {
  const active = current === value;
  const tone =
    value === "deny"
      ? "text-danger data-[on=true]:bg-danger data-[on=true]:text-white"
      : value === "allow"
        ? "text-online data-[on=true]:bg-online data-[on=true]:text-white"
        : "text-muted data-[on=true]:bg-raised data-[on=true]:text-bright";

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      disabled={disabled}
      data-on={active}
      onClick={onSelect}
      className={`grid h-7 w-9 place-items-center text-xs transition-colors disabled:opacity-40 ${tone}`}
    >
      <span aria-hidden>{glyph}</span>
    </button>
  );
}
