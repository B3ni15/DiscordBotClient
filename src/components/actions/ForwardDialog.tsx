"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type { APIChannel, APIMessage } from "discord-api-types/v10";
import { getDMs, subscribeDMs, type StoredDM } from "@/components/nav/dmStore";
import { AnnouncementIcon, CheckIcon, HashIcon, SearchIcon, ThreadIcon } from "@/components/ui/icons";
import { inputClass, Modal } from "@/components/ui/Modal";
import { api } from "@/lib/discord/api";
import { guildAcronym, guildIconUrl, userAvatarUrl } from "@/lib/discord/cdn";
import { forwardMessage } from "@/lib/discord/messageActions";
import { channelPermissions, has } from "@/lib/discord/permissions";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

/** Discord lets one message go to at most five places at once. */
const MAX_TARGETS = 5;
const FORWARDABLE = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);
const NO_DMS: StoredDM[] = [];

interface Target {
  channelId: string;
  name: string;
  /** Server name for a channel, "Direct Message" for a DM. */
  context: string;
  kind: "dm" | "text" | "announcement" | "thread";
  /** Avatar for a DM, server icon for a channel. */
  image: string | null;
  /** What stands in for a server without an icon. */
  acronym: string;
}

/**
 * Discord's "Forward To" picker: search the bot's DMs and every channel it may
 * write in, tick up to five, optionally add a note, send.
 */
export function ForwardDialog({
  message,
  guildId,
  onClose,
}: {
  message: APIMessage;
  guildId: string | null;
  onClose: () => void;
}) {
  const getRest = useClient((state) => state.getRest);
  const guilds = useClient((state) => state.guilds);
  const guildOrder = useClient((state) => state.guildOrder);
  const channelsByGuild = useClient((state) => state.channelsByGuild);
  const channelsById = useClient((state) => state.channelsById);
  const membersByGuild = useClient((state) => state.membersByGuild);
  const selfId = useClient((state) => state.user?.id);
  const toast = useUI((state) => state.toast);
  const dms = useSyncExternalStore(subscribeDMs, getDMs, () => NO_DMS);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = useMemo(() => {
    const list: Target[] = dms.map((dm) => ({
      channelId: dm.channelId,
      name: dm.globalName ?? dm.name,
      context: "Direct Message",
      kind: "dm",
      image: userAvatarUrl({ id: dm.recipientId, avatar: dm.avatar }, 64),
      acronym: "",
    }));

    for (const id of guildOrder) {
      const guild = guilds[id];
      if (!guild) continue;
      const self = selfId ? membersByGuild[id]?.[selfId] : undefined;
      for (const channelId of channelsByGuild[id] ?? []) {
        const channel = channelsById[channelId];
        if (!channel || !FORWARDABLE.has(channel.type)) continue;
        // Without the bot's own member yet, offer it and let Discord decide.
        if (self && !canWrite(guild, self, channel, channelsById)) continue;
        list.push({
          channelId,
          name: ("name" in channel ? channel.name : null) ?? channelId,
          context: guild.name,
          kind:
            channel.type === ChannelType.GuildAnnouncement
              ? "announcement"
              : channel.type === ChannelType.GuildText
                ? "text"
                : "thread",
          image: guildIconUrl(guild, 64),
          acronym: guildAcronym(guild.name),
        });
      }
    }
    return list;
  }, [dms, guildOrder, guilds, channelsByGuild, channelsById, membersByGuild, selfId]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? targets.filter(
        (target) =>
          target.name.toLowerCase().includes(needle) ||
          target.context.toLowerCase().includes(needle),
      )
    : targets;

  function toggle(channelId: string) {
    setSelected((current) => {
      if (current.includes(channelId)) return current.filter((id) => id !== channelId);
      if (current.length >= MAX_TARGETS) return current;
      return [...current, channelId];
    });
  }

  async function send() {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const rest = getRest();
    const failed: string[] = [];
    for (const channelId of selected) {
      try {
        await forwardMessage(rest, { ...message, guild_id: guildId }, channelId);
        // The note goes after the forward, as its own message, as in Discord.
        if (note.trim()) await api.sendMessage(rest, channelId, { content: note.trim() });
      } catch (cause) {
        const name = targets.find((target) => target.channelId === channelId)?.name ?? channelId;
        failed.push(`${name}: ${cause instanceof Error ? cause.message : "failed"}`);
      }
    }
    setBusy(false);
    if (failed.length === 0) {
      toast(selected.length === 1 ? "Message forwarded." : `Forwarded to ${selected.length} places.`);
      onClose();
      return;
    }
    setError(`Could not forward to ${failed.join("; ")}`);
  }

  const preview = message.content.replace(/\s+/g, " ").trim();
  const attachmentCount = message.attachments?.length ?? 0;

  return (
    <Modal
      title="Forward To"
      subtitle={`Pick up to ${MAX_TARGETS} places to send this message to.`}
      onClose={onClose}
      footer={
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-start gap-2 rounded-md border-l-4 border-line bg-panel-alt px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-muted">
                {message.author.global_name ?? message.author.username}
              </span>
              <span className="line-clamp-2 text-text">
                {preview ||
                  (attachmentCount > 0
                    ? `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
                    : "Embed")}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void send();
                }
              }}
              maxLength={2000}
              placeholder="Add an optional message…"
              aria-label="Optional message"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={selected.length === 0 || busy}
              className="shrink-0 rounded bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Sending…" : selected.length > 1 ? `Send (${selected.length})` : "Send"}
            </button>
          </div>
        </div>
      }
    >
      <div className="relative mb-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search channels and direct messages"
          className={`${inputClass} pr-9`}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
          <SearchIcon size={16} />
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {targets.length === 0 ? "There is nowhere the bot can write to yet." : "No matches."}
        </p>
      ) : (
        <ul className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
          {visible.map((target) => {
            const checked = selected.includes(target.channelId);
            const full = !checked && selected.length >= MAX_TARGETS;
            return (
              <li key={target.channelId}>
                <button
                  type="button"
                  onClick={() => toggle(target.channelId)}
                  disabled={full}
                  aria-pressed={checked}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <TargetImage target={target} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex items-center gap-1 truncate text-[15px] font-medium text-bright">
                      {target.kind !== "dm" && (
                        <span className="text-muted">
                          {target.kind === "announcement" ? (
                            <AnnouncementIcon size={16} />
                          ) : target.kind === "thread" ? (
                            <ThreadIcon size={16} />
                          ) : (
                            <HashIcon size={16} />
                          )}
                        </span>
                      )}
                      <span className="truncate">{target.name}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">{target.context}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                      checked ? "border-accent bg-accent text-white" : "border-muted"
                    }`}
                  >
                    {checked && <CheckIcon size={14} />}
                  </span>
                </button>
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
    </Modal>
  );
}

function TargetImage({ target }: { target: Target }) {
  if (target.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={target.image} alt="" className="h-8 w-8 shrink-0 rounded-full" />;
  }
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-semibold text-text">
      {target.acronym}
    </span>
  );
}

/** Whether the bot may post in a channel; a thread answers for its parent's rules. */
function canWrite(
  guild: Parameters<typeof channelPermissions>[0],
  self: Parameters<typeof channelPermissions>[1],
  channel: APIChannel,
  channelsById: Record<string, APIChannel>,
): boolean {
  const isThread = channel.type >= ChannelType.AnnouncementThread && channel.type <= ChannelType.PrivateThread;
  const parentId = "parent_id" in channel ? channel.parent_id : null;
  const scope = isThread && parentId ? (channelsById[parentId] ?? channel) : channel;
  const permissions = channelPermissions(guild, self, scope);
  return has(
    permissions,
    PermissionFlagsBits.ViewChannel,
    isThread ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
  );
}
