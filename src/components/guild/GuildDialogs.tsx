"use client";

import { useMemo, useState } from "react";
import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type { APIChannel } from "discord-api-types/v10";
import { ChannelEditor } from "@/components/guild/ChannelEditor";
import { ChannelPermissions } from "@/components/guild/ChannelPermissions";
import {
  MemberRolesDialog,
  ModerationDialog,
  NicknameDialog,
} from "@/components/guild/MemberDialogs";
import { RoleEditor } from "@/components/guild/RoleEditor";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { guildApi } from "@/lib/discord/guildApi";
import { roleColorHex, sortRolesByPosition } from "@/lib/discord/roles";
import { useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

/**
 * Renders whichever management dialog the app has open.
 *
 * Dialogs are driven from the UI store rather than mounted next to the thing
 * that opens them: a context menu is gone the moment it is clicked, and the
 * dialog it started has to outlive it.
 */
export function GuildDialogs() {
  const dialog = useUI((state) => state.dialog);
  const close = useUI((state) => state.closeDialog);

  if (!dialog) return null;

  switch (dialog.kind) {
    case "createChannel":
      return (
        <ChannelEditor
          guildId={dialog.guildId}
          parentId={dialog.parentId ?? null}
          initialType={dialog.type}
          onClose={close}
        />
      );
    case "editChannel":
      return (
        <ChannelEditor guildId={dialog.guildId} channelId={dialog.channelId} onClose={close} />
      );
    case "channelPermissions":
      return (
        <ChannelPermissions
          guildId={dialog.guildId}
          channelId={dialog.channelId}
          focusId={dialog.focusId}
          onClose={close}
        />
      );
    case "deleteChannel":
      return (
        <DeleteChannelDialog
          guildId={dialog.guildId}
          channelId={dialog.channelId}
          onClose={close}
        />
      );
    case "createRole":
      return <RoleEditor guildId={dialog.guildId} onClose={close} />;
    case "editRole":
      return <RoleEditor guildId={dialog.guildId} roleId={dialog.roleId} onClose={close} />;
    case "roles":
      return <RolesDialog guildId={dialog.guildId} onClose={close} />;
    case "memberRoles":
      return <MemberRolesDialog guildId={dialog.guildId} userId={dialog.userId} onClose={close} />;
    case "nickname":
      return <NicknameDialog guildId={dialog.guildId} userId={dialog.userId} onClose={close} />;
    case "moderate":
      return (
        <ModerationDialog
          guildId={dialog.guildId}
          userId={dialog.userId}
          action={dialog.action}
          onClose={close}
        />
      );
  }
}

function DeleteChannelDialog({
  guildId,
  channelId,
  onClose,
}: {
  guildId: string;
  channelId: string;
  onClose: () => void;
}) {
  const channel = useClient((state) => state.channelsById[channelId]);
  const channelIds = useClient((state) => state.channelsByGuild[guildId]);
  const channelsById = useClient((state) => state.channelsById);
  const getRest = useClient((state) => state.getRest);
  const dropChannel = useClient((state) => state.dropChannel);
  const toast = useUI((state) => state.toast);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = channel && "name" in channel ? (channel.name ?? channelId) : channelId;
  const isCategory = channel?.type === ChannelType.GuildCategory;
  const children = isCategory
    ? (channelIds ?? [])
        .map((id) => channelsById[id])
        .filter(
          (entry): entry is APIChannel =>
            entry !== undefined && "parent_id" in entry && entry.parent_id === channelId,
        )
    : [];

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await guildApi.deleteChannel(getRest(), channelId, "Deleted from DiscordBotClient");
      dropChannel(channelId);
      toast(`Deleted ${isCategory ? "" : "#"}${name}.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused to delete the channel.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isCategory ? `Delete ${name}` : `Delete #${name}`}
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void confirm()}
          confirmLabel="Delete"
          busy={busy}
          danger
        />
      }
    >
      <p className="text-sm leading-relaxed text-text">
        Are you sure you want to delete {isCategory ? "" : "#"}
        <span className="font-semibold text-bright">{name}</span>? This cannot be undone.
      </p>
      {isCategory && children.length > 0 && (
        <p className="mt-3 text-sm leading-relaxed text-amber">
          The {children.length} channel{children.length === 1 ? "" : "s"} inside stay, and move to
          the top level of the server.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}

/** The server's roles, highest first, with a way into each one's editor. */
function RolesDialog({ guildId, onClose }: { guildId: string; onClose: () => void }) {
  const guild = useClient((state) => state.guilds[guildId]);
  const members = useClient((state) => state.membersByGuild[guildId]);
  const openDialog = useUI((state) => state.openDialog);
  const powers = useGuildPowers(guildId);

  const roles = useMemo(() => sortRolesByPosition(guild?.roles ?? []), [guild]);

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const member of Object.values(members ?? {})) {
      for (const roleId of member.roles) result.set(roleId, (result.get(roleId) ?? 0) + 1);
    }
    return result;
  }, [members]);

  return (
    <Modal
      title="Roles"
      subtitle={guild?.name}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-text transition-colors hover:underline"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => openDialog({ kind: "createRole", guildId })}
            disabled={!powers.can(PermissionFlagsBits.ManageRoles)}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            Create role
          </button>
        </>
      }
    >
      <ul className="flex flex-col">
        {roles.map((role) => {
          const color = roleColorHex(role.color);
          const manageable = powers.canManage(role);
          return (
            <li
              key={role.id}
              className="flex items-center gap-3 border-b border-line py-2 last:border-0"
            >
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-full bg-muted"
                style={color ? { backgroundColor: color } : undefined}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text" style={color ? { color } : undefined}>
                  {role.name}
                </span>
                <span className="block text-[11px] text-muted">
                  {counts.get(role.id) ?? 0} member{(counts.get(role.id) ?? 0) === 1 ? "" : "s"}
                  {role.managed && " · managed by an integration"}
                  {role.hoist && " · shown separately"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => openDialog({ kind: "editRole", guildId, roleId: role.id })}
                disabled={!manageable}
                title={manageable ? undefined : "The bot cannot edit this role."}
                className="shrink-0 rounded bg-panel-alt px-3 py-1 text-xs text-muted transition-colors hover:bg-raised hover:text-bright disabled:opacity-40"
              >
                Edit
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
