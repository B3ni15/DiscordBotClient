"use client";

import { useMemo, useState } from "react";
import { PermissionFlagsBits } from "discord-api-types/v10";
import { Field, Modal, ModalActions, Switch, inputClass } from "@/components/ui/Modal";
import { ROLE_COLORS, colorToHex, guildApi, hexToColor } from "@/lib/discord/guildApi";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  has,
  parsePermissions,
} from "@/lib/discord/permissions";
import { useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

export interface RoleEditorProps {
  guildId: string;
  /** Left out to create a new role. */
  roleId?: string;
  onClose: () => void;
}

/**
 * Create or edit a role: identity, colour, the two display flags and the full
 * permission set.
 *
 * Discord refuses to grant a permission the acting account does not hold
 * itself, so anything the bot lacks is shown but cannot be ticked — with the
 * reason on the row rather than as a failed request afterwards.
 */
export function RoleEditor({ guildId, roleId, onClose }: RoleEditorProps) {
  const guild = useClient((state) => state.guilds[guildId]);
  const getRest = useClient((state) => state.getRest);
  const upsertRole = useClient((state) => state.upsertRole);
  const removeRole = useClient((state) => state.removeRole);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(guildId);

  const role = roleId ? guild?.roles.find((entry) => entry.id === roleId) : undefined;
  const editing = role !== undefined;

  const [name, setName] = useState(role?.name ?? "new role");
  const [color, setColor] = useState(role?.color ?? 0);
  const [hexDraft, setHexDraft] = useState(colorToHex(role?.color ?? 0));
  const [hoist, setHoist] = useState(role?.hoist ?? false);
  const [mentionable, setMentionable] = useState(role?.mentionable ?? false);
  const [permissions, setPermissions] = useState(() => parsePermissions(role?.permissions));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Granting more than the bot holds is refused by Discord, so the editor only
  // offers what it can actually pass on.
  const grantable = powers.permissions;
  const isAdmin = has(grantable, PermissionFlagsBits.Administrator);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PERMISSION_GROUPS.map((group) => ({
      group,
      items: PERMISSIONS.filter(
        (permission) =>
          permission.group === group &&
          (!needle ||
            permission.label.toLowerCase().includes(needle) ||
            permission.description.toLowerCase().includes(needle)),
      ),
    })).filter((entry) => entry.items.length > 0);
  }, [query]);

  function toggle(bit: bigint) {
    setPermissions((current) => (has(current, bit) ? current & ~bit : current | bit));
  }

  function applyHex(value: string) {
    setHexDraft(value);
    const parsed = hexToColor(value);
    if (parsed !== null) setColor(parsed);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A role needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      name: trimmed,
      color,
      hoist,
      mentionable,
      permissions: permissions.toString(),
    };
    try {
      const saved = editing
        ? await guildApi.editRole(getRest(), guildId, role.id, body, "Edited from DiscordBotClient")
        : await guildApi.createRole(getRest(), guildId, body, "Created from DiscordBotClient");
      upsertRole(guildId, saved);
      toast(editing ? `Saved @${saved.name}.` : `Created @${saved.name}.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused the change.");
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      await guildApi.deleteRole(getRest(), guildId, role.id, "Deleted from DiscordBotClient");
      removeRole(guildId, role.id);
      toast(`Deleted @${role.name}.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused to delete the role.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? `Edit @${role.name}` : "Create role"}
      subtitle={guild?.name}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button
              type="button"
              onClick={() => (confirmDelete ? void handleDelete() : setConfirmDelete(true))}
              disabled={busy || !powers.canManage(role)}
              className="mr-auto rounded px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/15 disabled:opacity-50"
            >
              {confirmDelete ? "Click again to delete" : "Delete role"}
            </button>
          )}
          <ModalActions
            onCancel={onClose}
            onConfirm={() => void submit()}
            confirmLabel={editing ? "Save changes" : "Create role"}
            busy={busy}
          />
        </>
      }
    >
      <Field label="Role name" htmlFor="role-name">
        <input
          id="role-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
          placeholder="new role"
        />
      </Field>

      <Field
        label="Role colour"
        hint="Members take the colour of their highest coloured role. Default keeps them uncoloured."
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setColor(0);
              setHexDraft("#000000");
            }}
            aria-label="No colour"
            title="Default (no colour)"
            className={`grid h-7 w-7 place-items-center rounded bg-raised text-xs text-muted ${
              color === 0 ? "ring-2 ring-bright" : ""
            }`}
          >
            <span aria-hidden>✕</span>
          </button>
          {ROLE_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => {
                setColor(swatch);
                setHexDraft(colorToHex(swatch));
              }}
              aria-label={colorToHex(swatch)}
              title={colorToHex(swatch)}
              className={`h-7 w-7 rounded ${color === swatch ? "ring-2 ring-bright" : ""}`}
              style={{ backgroundColor: colorToHex(swatch) }}
            />
          ))}
          <span className="ml-2 flex items-center gap-2">
            <span
              aria-hidden
              className="h-7 w-7 rounded border border-line"
              style={{ backgroundColor: color === 0 ? "var(--raised)" : colorToHex(color) }}
            />
            <input
              value={hexDraft}
              onChange={(event) => applyHex(event.target.value)}
              aria-label="Custom colour"
              placeholder="#5865f2"
              className="w-24 rounded bg-ink px-2 py-1 font-mono text-xs text-text outline-none focus:shadow-[0_0_0_1px_var(--accent)]"
            />
          </span>
        </div>
      </Field>

      <Switch
        checked={hoist}
        onChange={setHoist}
        label="Display separately"
        description="Members with this role get their own section in the member list."
      />
      <Switch
        checked={mentionable}
        onChange={setMentionable}
        label="Allow anyone to @mention this role"
      />

      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-bold tracking-wide text-muted uppercase">Permissions</h3>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            placeholder="Search permissions"
            aria-label="Search permissions"
            className="w-44 rounded bg-ink px-2 py-1 text-xs text-text outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]"
          />
        </div>

        {!powers.ready && (
          <p className="mb-3 text-xs text-amber">
            Working out what this bot may grant; permissions stay locked until then.
          </p>
        )}

        {groups.map(({ group, items }) => (
          <section key={group} className="mb-4">
            <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">
              {group}
            </h4>
            <ul className="flex flex-col gap-0.5">
              {items.map((permission) => {
                const checked = has(permissions, permission.bit);
                // Administrator is never handed out by a bot that lacks it.
                const allowed = isAdmin || has(grantable, permission.bit);
                return (
                  <li key={permission.key}>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-hover ${
                        allowed ? "" : "cursor-not-allowed opacity-50"
                      }`}
                      title={
                        allowed
                          ? permission.description
                          : "The bot does not hold this permission, so it cannot grant it."
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!allowed}
                        onChange={() => toggle(permission.bit)}
                        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-sm ${
                            permission.key === "Administrator" ? "text-amber" : "text-text"
                          }`}
                        >
                          {permission.label}
                        </span>
                        <span className="block text-[11px] leading-snug text-muted">
                          {permission.description}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm leading-relaxed text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
