"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuditLogEvent, ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type {
  APIAuditLog,
  APIBan,
  APIEmoji,
  APIExtendedInvite,
  APIGuildMember,
} from "discord-api-types/v10";
import { memberMenuItems } from "@/components/context/menus";
import { MemberRolePills } from "@/components/guild/MemberRoles";
import {
  CloseIcon,
  DoorStrokeIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/ui/icons";
import {
  FullscreenSettings,
  SettingsDangerRow,
  SettingsPageTitle,
} from "@/components/ui/FullscreenSettings";
import { inputClass } from "@/components/ui/Modal";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { BotTag } from "@/components/ui/BotTag";
import { copyText } from "@/lib/discord/messageActions";
import { emojiUrl, guildAcronym, guildIconUrl, userAvatarUrl } from "@/lib/discord/cdn";
import { guildApi } from "@/lib/discord/guildApi";
import {
  compareByDisplayName,
  displayName,
  roleColorHex,
  snowflakeTimestamp,
  sortRolesByPosition,
} from "@/lib/discord/roles";
import { missingPermission, useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useClient } from "@/lib/store/client";
import { openMenuFor } from "@/lib/store/contextMenu";
import { useUI, type ServerSettingsSection } from "@/lib/store/ui";

const NAV: Array<{ heading?: string; items: Array<{ id: ServerSettingsSection; label: string }> }> = [
  {
    items: [
      { id: "overview", label: "Overview" },
      { id: "roles", label: "Roles" },
      { id: "emoji", label: "Emoji" },
    ],
  },
  {
    heading: "User Management",
    items: [
      { id: "members", label: "Members" },
      { id: "invites", label: "Invites" },
      { id: "bans", label: "Bans" },
    ],
  },
  { heading: "Moderation", items: [{ id: "audit", label: "Audit Log" }] },
];

/**
 * Discord's full-screen server settings: a sidebar of pages on the left, the
 * page on the right, and an ESC button to leave. Dialogs it opens (a role, a
 * ban) stack on top of it rather than replacing it.
 */
export function ServerSettings() {
  const settings = useUI((state) => state.serverSettings);
  const guildExists = useClient((state) =>
    settings ? state.guilds[settings.guildId] !== undefined : false,
  );
  if (!settings || !guildExists) return null;
  return <SettingsView key={settings.guildId} guildId={settings.guildId} section={settings.section} />;
}

function SettingsView({ guildId, section }: { guildId: string; section: ServerSettingsSection }) {
  const guild = useClient((state) => state.guilds[guildId]);
  const close = useUI((state) => state.closeServerSettings);
  const open = useUI((state) => state.openServerSettings);
  const openDialog = useUI((state) => state.openDialog);

  return (
    <FullscreenSettings
      label={`${guild.name} settings`}
      groups={NAV.map((group) => ({ heading: group.heading ?? guild.name, items: group.items }))}
      active={section}
      onSelect={(id) => open(guildId, id)}
      onClose={close}
      footer={
        <SettingsDangerRow
          label="Leave Server"
          icon={<DoorStrokeIcon size={16} />}
          onClick={() => openDialog({ kind: "leaveGuild", guildId })}
        />
      }
    >
      {section === "overview" && <OverviewPage guildId={guildId} />}
      {section === "roles" && <RolesPage guildId={guildId} />}
      {section === "emoji" && <EmojiPage guildId={guildId} />}
      {section === "members" && <MembersPage guildId={guildId} />}
      {section === "invites" && <InvitesPage guildId={guildId} />}
      {section === "bans" && <BansPage guildId={guildId} />}
      {section === "audit" && <AuditLogPage guildId={guildId} />}
    </FullscreenSettings>
  );
}

// Shared bits ---------------------------------------------------------------

const PageTitle = SettingsPageTitle;

function Locked({ text }: { text: string }) {
  return (
    <p className="mb-5 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber">
      {text}
    </p>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${inputClass} pr-9`}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
        <SearchIcon size={16} />
      </span>
    </div>
  );
}

const primaryButton =
  "inline-flex shrink-0 items-center gap-1.5 rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(value: string | number | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Loads one REST resource for a page, with the error kept beside it. */
function useResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load this.");
      },
    );
    return () => {
      cancelled = true;
    };
    // The caller lists what the load depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision]);

  return { data, setData, error, reload: () => setRevision((value) => value + 1) };
}

// Overview ------------------------------------------------------------------

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function OverviewPage({ guildId }: { guildId: string }) {
  const guild = useClient((state) => state.guilds[guildId]);
  const channelIds = useClient((state) => state.channelsByGuild[guildId]);
  const channelsById = useClient((state) => state.channelsById);
  const getRest = useClient((state) => state.getRest);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(guildId);
  const canEdit = powers.can(PermissionFlagsBits.ManageGuild);

  const [name, setName] = useState(guild.name);
  /** undefined: unchanged; null: removed; string: a new data URI. */
  const [icon, setIcon] = useState<string | null | undefined>(undefined);
  const [systemChannel, setSystemChannel] = useState(guild.system_channel_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const textChannels = (channelIds ?? [])
    .map((id) => channelsById[id])
    .filter((channel) => channel?.type === ChannelType.GuildText);

  const dirty =
    name.trim() !== guild.name ||
    icon !== undefined ||
    systemChannel !== (guild.system_channel_id ?? "");

  function reset() {
    setName(guild.name);
    setIcon(undefined);
    setSystemChannel(guild.system_channel_id ?? "");
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await guildApi.editGuild(
        getRest(),
        guildId,
        {
          name: name.trim() !== guild.name ? name.trim() : undefined,
          icon,
          system_channel_id:
            systemChannel !== (guild.system_channel_id ?? "") ? systemChannel || null : undefined,
        },
        "Edited from DiscordBotClient",
      );
      useClient.setState((state) => ({
        guilds: { ...state.guilds, [guildId]: { ...state.guilds[guildId], ...updated } },
      }));
      setIcon(undefined);
      toast("Server settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused the change.");
    } finally {
      setSaving(false);
    }
  }

  const currentIcon = icon === undefined ? guildIconUrl(guild, 256) : icon;

  return (
    <>
      <PageTitle title="Server Overview" />
      {!canEdit && powers.ready && <Locked text={missingPermission("Manage Server")} />}

      <div className="flex gap-6 border-b border-line/60 pb-8">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => fileInput.current?.click()}
            className="group/icon relative grid h-[100px] w-[100px] place-items-center overflow-hidden rounded-full bg-accent text-3xl font-semibold text-white disabled:cursor-default"
            aria-label="Change server icon"
          >
            {currentIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentIcon} alt="" className="h-full w-full object-cover" />
            ) : (
              guildAcronym(name || guild.name)
            )}
            {canEdit && (
              <span className="absolute inset-0 hidden place-items-center bg-black/60 text-[11px] font-bold tracking-wide uppercase group-hover/icon:grid">
                Change Icon
              </span>
            )}
          </button>
          {canEdit && currentIcon && (
            <button
              type="button"
              onClick={() => setIcon(null)}
              className="text-xs font-medium text-muted hover:text-text hover:underline"
            >
              Remove
            </button>
          )}
        </div>
        <div className="flex-1">
          <p className="mb-3 text-sm text-muted">
            We recommend an image of at least 512×512 for the server.
          </p>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => fileInput.current?.click()}
            className="rounded border border-line px-4 py-2 text-sm font-medium text-bright transition-colors hover:border-muted disabled:opacity-50"
          >
            Upload Image
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) setIcon(await readAsDataUrl(file));
            }}
          />
        </div>
        <div className="flex-1">
          <label
            htmlFor="server-name"
            className="mb-2 block text-xs font-bold tracking-wide text-muted uppercase"
          >
            Server Name
          </label>
          <input
            id="server-name"
            value={name}
            disabled={!canEdit}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <section className="border-b border-line/60 py-8">
        <label
          htmlFor="system-channel"
          className="mb-2 block text-xs font-bold tracking-wide text-muted uppercase"
        >
          System Messages Channel
        </label>
        <select
          id="system-channel"
          value={systemChannel}
          disabled={!canEdit}
          onChange={(event) => setSystemChannel(event.target.value)}
          className={inputClass}
        >
          <option value="">No System Messages</option>
          {textChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{(channel as { name?: string | null }).name ?? channel.id}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm text-muted">
          This is the channel Discord sends system event messages to, such as member joins.
        </p>
      </section>

      <section className="py-8">
        <h2 className="mb-3 text-xs font-bold tracking-wide text-muted uppercase">Server Info</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted">Server ID</dt>
            <dd>
              <button
                type="button"
                onClick={() => void copyText(guildId).then(() => toast("Server ID copied."))}
                className="font-mono text-text hover:underline"
              >
                {guildId}
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Boost level</dt>
            <dd className="text-text">
              Level {guild.premium_tier} · {guild.premium_subscription_count ?? 0} boosts
            </dd>
          </div>
          <div>
            <dt className="text-muted">Roles</dt>
            <dd className="text-text">{guild.roles.length}</dd>
          </div>
          <div>
            <dt className="text-muted">Emoji</dt>
            <dd className="text-text">{guild.emojis?.length ?? 0}</dd>
          </div>
        </dl>
      </section>

      {(dirty || error) && (
        <div className="sticky bottom-5 mt-4 flex animate-pop-in items-center gap-3 rounded-lg bg-floating px-4 py-2.5 shadow-2xl">
          <p className={`flex-1 text-sm font-medium ${error ? "text-danger" : "text-text"}`}>
            {error ?? "Careful — you have unsaved changes!"}
          </p>
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 text-sm font-medium text-text hover:underline"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={saving || !dirty || !name.trim()}
            onClick={() => void save()}
            className="rounded bg-online px-4 py-1.5 text-sm font-medium text-white transition-colors hover:brightness-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </>
  );
}

// Roles ---------------------------------------------------------------------

function RolesPage({ guildId }: { guildId: string }) {
  const guild = useClient((state) => state.guilds[guildId]);
  const members = useClient((state) => state.membersByGuild[guildId]);
  const openDialog = useUI((state) => state.openDialog);
  const powers = useGuildPowers(guildId);
  const canManage = powers.can(PermissionFlagsBits.ManageRoles);
  const [query, setQuery] = useState("");

  const roles = useMemo(
    () => sortRolesByPosition(guild.roles.filter((role) => role.id !== guildId)),
    [guild, guildId],
  );
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const member of Object.values(members ?? {})) {
      for (const id of member.roles) result.set(id, (result.get(id) ?? 0) + 1);
    }
    return result;
  }, [members]);

  const needle = query.trim().toLowerCase();
  const visible = needle ? roles.filter((role) => role.name.toLowerCase().includes(needle)) : roles;

  return (
    <>
      <PageTitle title="Roles">
        Use roles to group your server members and assign permissions.
      </PageTitle>
      {!canManage && powers.ready && <Locked text={missingPermission("Manage Roles")} />}

      <button
        type="button"
        onClick={() => openDialog({ kind: "editRole", guildId, roleId: guildId })}
        className="mb-8 flex w-full items-center gap-4 rounded-lg bg-panel px-4 py-3 text-left transition-colors hover:bg-hover"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-raised text-muted">
          <UserIcon size={22} />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-bright">Default Permissions</span>
          <span className="block text-sm text-muted">@everyone · applies to all server members</span>
        </span>
        <span className="text-muted">›</span>
      </button>

      <div className="mb-4 flex items-center gap-3">
        <SearchBox value={query} onChange={setQuery} placeholder="Search Roles" />
        <button
          type="button"
          disabled={!canManage}
          onClick={() => openDialog({ kind: "createRole", guildId })}
          className={primaryButton}
        >
          Create Role
        </button>
      </div>

      <p className="mb-2 text-sm text-muted">
        Members use the colour of the highest role they have on this list, and higher roles can manage the ones below them.
      </p>

      <div className="grid grid-cols-[1fr_96px_72px] border-b border-line/60 px-2 pb-2 text-xs font-bold tracking-wide text-muted uppercase">
        <span>Roles — {roles.length}</span>
        <span>Members</span>
        <span />
      </div>
      <ul>
        {visible.map((role) => {
          const color = roleColorHex(role.color);
          return (
            <li
              key={role.id}
              onClick={() => openDialog({ kind: "editRole", guildId, roleId: role.id })}
              className="group/role grid cursor-pointer grid-cols-[1fr_96px_72px] items-center border-b border-line/40 px-2 py-3 transition-colors hover:bg-hover"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span style={{ color: color ?? "var(--muted)" }}>
                  <ShieldIcon size={20} />
                </span>
                <span className="truncate font-medium text-bright">{role.name}</span>
                {role.managed && (
                  <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-muted uppercase">
                    Integration
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted">
                {counts.get(role.id) ?? 0}
                <UserIcon size={16} />
              </span>
              <span className="flex justify-end">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-panel text-muted transition-colors group-hover/role:text-bright">
                  <PencilIcon size={16} />
                </span>
              </span>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="py-10 text-center text-sm text-muted">No roles match that search.</li>
        )}
      </ul>
    </>
  );
}

// Emoji ---------------------------------------------------------------------

function EmojiPage({ guildId }: { guildId: string }) {
  const getRest = useClient((state) => state.getRest);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(guildId);
  const canManage = powers.can(PermissionFlagsBits.ManageGuildExpressions);
  const { data, setData, error } = useResource<APIEmoji[]>(
    () => guildApi.emojis(getRest(), guildId),
    [guildId],
  );
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    setUploading(true);
    for (const file of files) {
      const name =
        file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .slice(0, 32)
          .padEnd(2, "_") || "emoji";
      try {
        const emoji = await guildApi.createEmoji(
          getRest(),
          guildId,
          name,
          await readAsDataUrl(file),
          "Uploaded from DiscordBotClient",
        );
        setData((current) => [...(current ?? []), emoji]);
      } catch (cause) {
        toast(cause instanceof Error ? cause.message : `Could not upload ${file.name}.`, "error");
      }
    }
    setUploading(false);
  }

  async function remove(emoji: APIEmoji) {
    if (!emoji.id) return;
    try {
      await guildApi.deleteEmoji(getRest(), guildId, emoji.id, "Deleted from DiscordBotClient");
      setData((current) => (current ?? []).filter((entry) => entry.id !== emoji.id));
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not delete the emoji.", "error");
    }
  }

  return (
    <>
      <PageTitle title="Emoji">
        Add custom emoji that anyone can use in this server. Names must be at least 2 characters
        long and may only contain letters, numbers and underscores. Files up to 256 KB.
      </PageTitle>
      {!canManage && powers.ready && <Locked text={missingPermission("Manage Expressions")} />}
      <button
        type="button"
        disabled={!canManage || uploading}
        onClick={() => fileInput.current?.click()}
        className={`${primaryButton} mb-8`}
      >
        {uploading ? "Uploading…" : "Upload Emoji"}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void upload(files);
        }}
      />

      {error ? (
        <Locked text={error} />
      ) : data === null ? (
        <SkeletonRows rows={5} avatar />
      ) : (
        <>
          <div className="grid grid-cols-[56px_1fr_1fr_40px] border-b border-line/60 pb-2 text-xs font-bold tracking-wide text-muted uppercase">
            <span>Image</span>
            <span>Name</span>
            <span>Uploaded by</span>
            <span />
          </div>
          <ul>
            {data.map((emoji) => (
              <li
                key={emoji.id}
                className="group/emoji grid grid-cols-[56px_1fr_1fr_40px] items-center border-b border-line/40 py-2.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={emojiUrl(emoji.id!, emoji.animated ?? false, 64)}
                  alt=""
                  className="h-8 w-8 object-contain"
                />
                <span className="truncate text-sm text-text">:{emoji.name}:</span>
                <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
                  {emoji.user && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={userAvatarUrl(emoji.user, 32)} alt="" className="h-5 w-5 rounded-full" />
                      <span className="truncate">{emoji.user.global_name ?? emoji.user.username}</span>
                    </>
                  )}
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void remove(emoji)}
                    aria-label={`Delete :${emoji.name}:`}
                    className="grid h-8 w-8 place-items-center rounded text-danger opacity-0 transition-opacity group-hover/emoji:opacity-100 focus-visible:opacity-100 hover:bg-danger/15"
                  >
                    <CloseIcon size={16} />
                  </button>
                )}
              </li>
            ))}
            {data.length === 0 && (
              <li className="py-10 text-center text-sm text-muted">No custom emoji yet.</li>
            )}
          </ul>
        </>
      )}
    </>
  );
}

// Members -------------------------------------------------------------------

const MEMBER_PAGE = 100;

function MembersPage({ guildId }: { guildId: string }) {
  const members = useClient((state) => state.membersByGuild[guildId]);
  const getRest = useClient((state) => state.getRest);
  const upsertMembers = useClient((state) => state.upsertMembers);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(MEMBER_PAGE);

  // The gateway only ever sends a slice of a big server; fetch the rest once.
  useEffect(() => {
    let cancelled = false;
    guildApi
      .members(getRest(), guildId)
      .then((list) => {
        if (cancelled) return;
        upsertMembers(guildId, list);
      })
      .catch(() => {
        // Without the members intent this fails; the gateway's slice stays.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getRest, guildId, upsertMembers]);

  const sorted = useMemo(
    () => Object.values(members ?? {}).sort(compareByDisplayName),
    [members],
  );
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? sorted.filter(
        (member) =>
          displayName(member).toLowerCase().includes(needle) ||
          member.user?.username.toLowerCase().includes(needle),
      )
    : sorted;

  return (
    <>
      <PageTitle title="Server Members" />
      <div className="mb-4 flex items-center gap-3">
        <SearchBox value={query} onChange={setQuery} placeholder="Search by username" />
        <span className="shrink-0 text-sm text-muted">
          {visible.length} member{visible.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_110px_40px] border-b border-line/60 px-2 pb-2 text-xs font-bold tracking-wide text-muted uppercase">
        <span>Name</span>
        <span>Member since</span>
        <span />
      </div>
      {loading && sorted.length === 0 ? (
        <SkeletonRows rows={8} avatar className="pt-3" />
      ) : (
        <ul>
          {visible.slice(0, limit).map((member) => (
            <MemberRow key={member.user!.id} guildId={guildId} member={member} />
          ))}
          {visible.length === 0 && (
            <li className="py-10 text-center text-sm text-muted">
              No members found. Enable the SERVER MEMBERS intent to see the full list.
            </li>
          )}
        </ul>
      )}
      {visible.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((value) => value + MEMBER_PAGE)}
          className="mt-4 w-full rounded bg-panel py-2 text-sm font-medium text-text transition-colors hover:bg-hover"
        >
          Show more ({visible.length - limit} left)
        </button>
      )}
    </>
  );
}

function MemberRow({ guildId, member }: { guildId: string; member: APIGuildMember }) {
  const user = member.user!;
  return (
    <li className="grid grid-cols-[1fr_110px_40px] items-start gap-y-1 border-b border-line/40 px-2 py-3">
      <div className="flex min-w-0 gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={userAvatarUrl(user, 64)} alt="" className="h-8 w-8 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-bright">
            <span className="truncate">{displayName(member)}</span>
            <BotTag user={user} />
          </p>
          <p className="truncate text-xs text-muted">{user.username}</p>
          <MemberRolePills guildId={guildId} userId={user.id} className="mt-2" />
        </div>
      </div>
      <span className="pt-1.5 text-sm text-muted">{formatDate(member.joined_at)}</span>
      <button
        type="button"
        aria-label={`More actions for ${displayName(member)}`}
        onClick={(event) =>
          openMenuFor(event, displayName(member), memberMenuItems(guildId, user.id))
        }
        className="grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-muted transition-colors hover:bg-hover hover:text-bright"
      >
        ⋯
      </button>
    </li>
  );
}

// Invites -------------------------------------------------------------------

function InvitesPage({ guildId }: { guildId: string }) {
  const getRest = useClient((state) => state.getRest);
  const channelIds = useClient((state) => state.channelsByGuild[guildId]);
  const channelsById = useClient((state) => state.channelsById);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(guildId);
  const canManage = powers.can(PermissionFlagsBits.ManageGuild);
  const { data, setData, error } = useResource<APIExtendedInvite[]>(
    () => guildApi.invites(getRest(), guildId),
    [guildId],
  );

  const textChannels = (channelIds ?? [])
    .map((id) => channelsById[id])
    .filter(
      (channel) =>
        channel?.type === ChannelType.GuildText &&
        powers.canIn(channel, PermissionFlagsBits.CreateInstantInvite),
    );
  const [channelId, setChannelId] = useState("");
  const target = channelId || textChannels[0]?.id || "";
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!target) return;
    setCreating(true);
    try {
      const invite = await guildApi.createInvite(
        getRest(),
        target,
        { max_age: 7 * 24 * 3600, unique: true },
        "Created from DiscordBotClient",
      );
      const link = `https://discord.gg/${invite.code}`;
      await copyText(link).catch(() => {});
      toast(`Invite created and copied: ${link}`);
      setData((current) => [invite as APIExtendedInvite, ...(current ?? [])]);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not create the invite.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(code: string) {
    try {
      await guildApi.deleteInvite(getRest(), code, "Revoked from DiscordBotClient");
      setData((current) => (current ?? []).filter((invite) => invite.code !== code));
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not revoke the invite.", "error");
    }
  }

  return (
    <>
      <PageTitle title="Invites">
        Here is a list of all active invite links. You can revoke any one, or create a new one.
      </PageTitle>
      <div className="mb-6 flex items-center gap-3">
        <select
          value={target}
          onChange={(event) => setChannelId(event.target.value)}
          aria-label="Channel to invite to"
          className={inputClass}
        >
          {textChannels.length === 0 && <option value="">No channel allows invites</option>}
          {textChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{(channel as { name?: string | null }).name ?? channel.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!target || creating}
          onClick={() => void create()}
          className={primaryButton}
        >
          <PlusIcon size={16} />
          {creating ? "Creating…" : "Create Invite"}
        </button>
      </div>

      {!canManage && powers.ready ? (
        <Locked text={missingPermission("Manage Server")} />
      ) : error ? (
        <Locked text={error} />
      ) : data === null ? (
        <SkeletonRows rows={4} avatar />
      ) : (
        <>
          <div className="grid grid-cols-[1fr_110px_70px_110px_40px] border-b border-line/60 pb-2 text-xs font-bold tracking-wide text-muted uppercase">
            <span>Inviter</span>
            <span>Invite code</span>
            <span>Uses</span>
            <span>Expires</span>
            <span />
          </div>
          <ul>
            {data.map((invite) => (
              <li
                key={invite.code}
                className="group/invite grid grid-cols-[1fr_110px_70px_110px_40px] items-center border-b border-line/40 py-2.5 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {invite.inviter && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={userAvatarUrl(invite.inviter, 32)} alt="" className="h-6 w-6 rounded-full" />
                  )}
                  <span className="truncate text-text">
                    {invite.inviter?.global_name ?? invite.inviter?.username ?? "Unknown"}
                  </span>
                  {invite.channel?.name && (
                    <span className="truncate text-xs text-muted">#{invite.channel.name}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(`https://discord.gg/${invite.code}`).then(() =>
                      toast("Invite link copied."),
                    )
                  }
                  className="truncate text-left font-mono text-text hover:underline"
                >
                  {invite.code}
                </button>
                <span className="text-muted">
                  {invite.uses ?? 0}
                  {invite.max_uses ? `/${invite.max_uses}` : ""}
                </span>
                <span className="text-muted">
                  {invite.expires_at ? formatDate(invite.expires_at) : "Never"}
                </span>
                <button
                  type="button"
                  onClick={() => void revoke(invite.code)}
                  aria-label={`Revoke invite ${invite.code}`}
                  className="grid h-8 w-8 place-items-center rounded text-danger opacity-0 transition-opacity group-hover/invite:opacity-100 focus-visible:opacity-100 hover:bg-danger/15"
                >
                  <CloseIcon size={16} />
                </button>
              </li>
            ))}
            {data.length === 0 && (
              <li className="py-10 text-center text-sm text-muted">No active invites.</li>
            )}
          </ul>
        </>
      )}
    </>
  );
}

// Bans ----------------------------------------------------------------------

function BansPage({ guildId }: { guildId: string }) {
  const getRest = useClient((state) => state.getRest);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(guildId);
  const canBan = powers.can(PermissionFlagsBits.BanMembers);
  const { data, setData, error } = useResource<APIBan[]>(
    () => guildApi.bans(getRest(), guildId),
    [guildId],
  );
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  async function revoke(ban: APIBan) {
    try {
      await guildApi.unbanMember(getRest(), guildId, ban.user.id, "Unbanned from DiscordBotClient");
      setData((current) => (current ?? []).filter((entry) => entry.user.id !== ban.user.id));
      setOpenId(null);
      toast(`Revoked the ban on ${ban.user.username}.`);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not revoke the ban.", "error");
    }
  }

  const needle = query.trim().toLowerCase();
  const visible = (data ?? []).filter(
    (ban) =>
      !needle ||
      ban.user.username.toLowerCase().includes(needle) ||
      ban.user.id.includes(needle),
  );

  return (
    <>
      <PageTitle title={`Server Ban List${data ? ` — ${data.length}` : ""}`}>
        Bans by default are by account and IP. A user can circumvent an IP ban by using a proxy.
      </PageTitle>
      {!canBan && powers.ready ? (
        <Locked text={missingPermission("Ban Members")} />
      ) : error ? (
        <Locked text={error} />
      ) : (
        <>
          <div className="mb-4 flex">
            <SearchBox value={query} onChange={setQuery} placeholder="Search Bans by User Id or Username" />
          </div>
          {data === null ? (
            <SkeletonRows rows={5} avatar />
          ) : (
            <ul className="flex flex-col gap-1">
              {visible.map((ban) => (
                <li key={ban.user.id} className="rounded-md bg-panel">
                  <button
                    type="button"
                    onClick={() => setOpenId((current) => (current === ban.user.id ? null : ban.user.id))}
                    aria-expanded={openId === ban.user.id}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-hover"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={userAvatarUrl(ban.user, 64)} alt="" className="h-8 w-8 rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-bright">
                        {ban.user.global_name ?? ban.user.username}
                      </span>
                      <span className="block truncate text-xs text-muted">{ban.user.username}</span>
                    </span>
                  </button>
                  {openId === ban.user.id && (
                    <div className="flex animate-fade-in items-end gap-4 border-t border-line/60 px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold tracking-wide text-muted uppercase">Reason</p>
                        <p className="mt-1 text-sm text-text">{ban.reason ?? "No reason given."}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void revoke(ban)}
                        className="shrink-0 rounded bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-90"
                      >
                        Revoke Ban
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {visible.length === 0 && (
                <li className="py-10 text-center text-sm text-muted">
                  {data.length === 0 ? "No bans. Peaceful." : "No bans match that search."}
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </>
  );
}

// Audit log -----------------------------------------------------------------

const AUDIT_ACTIONS: Partial<Record<AuditLogEvent, string>> = {
  [AuditLogEvent.GuildUpdate]: "updated the server",
  [AuditLogEvent.ChannelCreate]: "created a channel",
  [AuditLogEvent.ChannelUpdate]: "updated a channel",
  [AuditLogEvent.ChannelDelete]: "deleted a channel",
  [AuditLogEvent.ChannelOverwriteCreate]: "added channel permissions",
  [AuditLogEvent.ChannelOverwriteUpdate]: "updated channel permissions",
  [AuditLogEvent.ChannelOverwriteDelete]: "removed channel permissions",
  [AuditLogEvent.MemberKick]: "kicked",
  [AuditLogEvent.MemberPrune]: "pruned members",
  [AuditLogEvent.MemberBanAdd]: "banned",
  [AuditLogEvent.MemberBanRemove]: "unbanned",
  [AuditLogEvent.MemberUpdate]: "updated",
  [AuditLogEvent.MemberRoleUpdate]: "updated roles of",
  [AuditLogEvent.MemberMove]: "moved members in voice",
  [AuditLogEvent.MemberDisconnect]: "disconnected a member from voice",
  [AuditLogEvent.BotAdd]: "added the bot",
  [AuditLogEvent.RoleCreate]: "created a role",
  [AuditLogEvent.RoleUpdate]: "updated a role",
  [AuditLogEvent.RoleDelete]: "deleted a role",
  [AuditLogEvent.InviteCreate]: "created an invite",
  [AuditLogEvent.InviteUpdate]: "updated an invite",
  [AuditLogEvent.InviteDelete]: "deleted an invite",
  [AuditLogEvent.WebhookCreate]: "created a webhook",
  [AuditLogEvent.WebhookUpdate]: "updated a webhook",
  [AuditLogEvent.WebhookDelete]: "deleted a webhook",
  [AuditLogEvent.EmojiCreate]: "created an emoji",
  [AuditLogEvent.EmojiUpdate]: "updated an emoji",
  [AuditLogEvent.EmojiDelete]: "deleted an emoji",
  [AuditLogEvent.MessageDelete]: "deleted a message by",
  [AuditLogEvent.MessageBulkDelete]: "bulk deleted messages",
  [AuditLogEvent.MessagePin]: "pinned a message by",
  [AuditLogEvent.MessageUnpin]: "unpinned a message by",
  [AuditLogEvent.ThreadCreate]: "created a thread",
  [AuditLogEvent.ThreadUpdate]: "updated a thread",
  [AuditLogEvent.ThreadDelete]: "deleted a thread",
  [AuditLogEvent.ApplicationCommandPermissionUpdate]: "updated command permissions",
  [AuditLogEvent.AutoModerationRuleCreate]: "created an AutoMod rule",
  [AuditLogEvent.AutoModerationRuleUpdate]: "updated an AutoMod rule",
  [AuditLogEvent.AutoModerationRuleDelete]: "deleted an AutoMod rule",
  [AuditLogEvent.AutoModerationBlockMessage]: "AutoMod blocked a message by",
};

function AuditLogPage({ guildId }: { guildId: string }) {
  const getRest = useClient((state) => state.getRest);
  const guild = useClient((state) => state.guilds[guildId]);
  const channelsById = useClient((state) => state.channelsById);
  const powers = useGuildPowers(guildId);
  const canView = powers.can(PermissionFlagsBits.ViewAuditLog);
  const { data, error } = useResource<APIAuditLog>(
    () => guildApi.auditLog(getRest(), guildId, 100),
    [guildId],
  );

  const users = useMemo(
    () => new Map((data?.users ?? []).map((user) => [user.id, user])),
    [data],
  );

  function targetName(type: AuditLogEvent, targetId: string | null) {
    if (!targetId) return null;
    const user = users.get(targetId);
    if (user) return user.global_name ?? user.username;
    const role = guild.roles.find((entry) => entry.id === targetId);
    if (role) return `@${role.name}`;
    const channel = channelsById[targetId];
    if (channel && "name" in channel && channel.name) return `#${channel.name}`;
    return type === AuditLogEvent.GuildUpdate ? null : targetId;
  }

  return (
    <>
      <PageTitle title="Audit Log">
        The latest 100 changes and moderation actions in this server.
      </PageTitle>
      {!canView && powers.ready ? (
        <Locked text={missingPermission("View Audit Log")} />
      ) : error ? (
        <Locked text={error} />
      ) : data === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-md bg-panel px-3 py-3">
              <Skeleton width={32} height={32} rounded="full" />
              <Skeleton height={10} width={`${40 + ((index * 13) % 40)}%`} rounded="sm" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.audit_log_entries.map((entry) => {
            const actor = entry.user_id ? users.get(entry.user_id) : undefined;
            const target = targetName(entry.action_type, entry.target_id);
            return (
              <li key={entry.id} className="flex items-start gap-3 rounded-md bg-panel px-3 py-2.5">
                {actor ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userAvatarUrl(actor, 64)} alt="" className="mt-0.5 h-8 w-8 rounded-full" />
                ) : (
                  <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-full bg-raised text-muted">
                    <UserIcon size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-muted">
                    <span className="font-semibold text-bright">
                      {actor?.global_name ?? actor?.username ?? "Someone"}
                    </span>{" "}
                    {AUDIT_ACTIONS[entry.action_type] ?? `did action #${entry.action_type}`}
                    {target && (
                      <>
                        {" "}
                        <span className="font-semibold text-text">{target}</span>
                      </>
                    )}
                  </p>
                  {entry.reason && (
                    <p className="mt-0.5 truncate text-xs text-muted">Reason: {entry.reason}</p>
                  )}
                </div>
                <time className="shrink-0 text-xs text-faint">
                  {new Date(snowflakeTimestamp(entry.id)).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            );
          })}
          {data.audit_log_entries.length === 0 && (
            <li className="py-10 text-center text-sm text-muted">Nothing has happened here yet.</li>
          )}
        </ul>
      )}
    </>
  );
}

