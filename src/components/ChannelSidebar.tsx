"use client";

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { PermissionFlagsBits } from "discord-api-types/v10";
import type { APIChannel } from "discord-api-types/v10";
import {
  categoryMenuItems,
  channelListMenuItems,
  channelMenuItems,
  guildMenuItems,
} from "@/components/context/menus";
import { MuteButton } from "@/components/notifications/MuteButton";
import { UnreadBadge } from "@/components/notifications/UnreadBadge";
import {
  AnnouncementIcon,
  ChevronDownIcon,
  CloseIcon,
  HashIcon,
  PlusIcon,
  ThreadIcon,
} from "@/components/ui/icons";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { navApi } from "@/lib/discord/navApi";
import {
  closeThread,
  getOpenThreadsState,
  subscribeOpenThreads,
  type OpenThread,
} from "@/lib/nav/openThreads";
import { useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useUnread } from "@/lib/notifications/unread";
import { isTextChannel, isVoiceChannel, useClient } from "@/lib/store/client";
import { openMenuBelow, openMenuFor, useContextMenu } from "@/lib/store/contextMenu";
import { useUI } from "@/lib/store/ui";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { UserPanel } from "./UserPanel";
import { VoiceChannelRow } from "./VoiceChannelRow";

const CATEGORY = 4;
const ANNOUNCEMENT = 5;
/** Channel types from 10 up are threads. */
const THREAD = 10;
const EMPTY_CHANNEL_IDS: string[] = [];

/** Channel list for the selected guild, grouped by collapsible categories. */
export function ChannelSidebar() {
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const guild = useClient((state) => (selectedGuildId ? state.guilds[selectedGuildId] : null));
  const channelIds = useClient((state) =>
    selectedGuildId ? (state.channelsByGuild[selectedGuildId] ?? EMPTY_CHANNEL_IDS) : EMPTY_CHANNEL_IDS,
  );
  const channelsById = useClient((state) => state.channelsById);
  const status = useClient((state) => state.status);
  const openDialog = useUI((state) => state.openDialog);
  const powers = useGuildPowers(selectedGuildId);
  const canCreate = powers.can(PermissionFlagsBits.ManageChannels);

  const activeThreads = useActiveThreads(selectedGuildId);
  const botId = useClient((state) => state.user?.id ?? null);
  const openState = useSyncExternalStore(subscribeOpenThreads, getOpenThreadsState, getOpenThreadsState);
  const threadsByParent = collectThreads(
    selectedGuildId,
    activeThreads,
    botId ? (openState[botId]?.threads ?? []) : [],
    botId,
  );

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const channels = channelIds.map((id) => channelsById[id]).filter(Boolean);
  const groups = groupByCategory(channels);
  const loading = channels.length === 0 && status !== "ready";

  return (
    <div className="flex w-60 shrink-0 flex-col bg-panel">
      <GuildHeader guildId={selectedGuildId} name={guild?.name ?? null} />

      {/* Rows open their own menus; what reaches this one is the empty space. */}
      <div
        onContextMenu={(event) => {
          if (selectedGuildId) {
            openMenuFor(event, "Channels", channelListMenuItems(selectedGuildId));
          }
        }}
        className="min-h-0 flex-1 animate-sidebar-in overflow-y-auto px-2 py-3"
      >
        {loading ? (
          <SkeletonRows rows={8} className="pt-2" />
        ) : (
          groups.map((group) => {
            const key = group.id ?? "__root__";
            const isCollapsed = collapsed[key] === true;
            // Discord lists a category's text channels first, then its voice ones.
            const textChannels = group.channels.filter(isTextChannel);
            const voiceChannels = group.channels.filter(isVoiceChannel);
            // An empty category stays visible to whoever can fill it through its +.
            const empty = textChannels.length === 0 && voiceChannels.length === 0;
            if (empty && !(group.id && canCreate)) return null;

            return (
              <section key={key} className="mb-3">
                {group.name && (
                  <div className="flex items-center">
                    <button
                      type="button"
                      onContextMenu={(event) => {
                        const category = group.id ? channelsById[group.id] : undefined;
                        if (category && selectedGuildId) {
                          openMenuFor(
                            event,
                            "Category",
                            categoryMenuItems(category, selectedGuildId, {
                              collapsed: isCollapsed,
                              onToggleCollapse: () =>
                                setCollapsed((state) => ({ ...state, [key]: !isCollapsed })),
                            }),
                          );
                        }
                      }}
                      onClick={() => setCollapsed((state) => ({ ...state, [key]: !isCollapsed }))}
                      aria-expanded={!isCollapsed}
                      className="flex min-w-0 flex-1 items-center gap-0.5 pt-1 pr-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase transition-colors hover:text-bright"
                    >
                      <span
                        className="inline-flex transition-transform duration-200"
                        style={{ transform: isCollapsed ? "rotate(-90deg)" : "none" }}
                      >
                        <ChevronDownIcon size={12} />
                      </span>
                      <span className="truncate">{group.name}</span>
                    </button>
                    {canCreate && selectedGuildId && group.id && (
                      <Tooltip label="Create Channel">
                        <button
                          type="button"
                          onClick={() =>
                            openDialog({
                              kind: "createChannel",
                              guildId: selectedGuildId,
                              parentId: group.id,
                            })
                          }
                          aria-label={`Create channel in ${group.name}`}
                          className="mr-1 grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:text-bright"
                        >
                          <PlusIcon size={16} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                )}
                {!isCollapsed && (
                  <ul className="animate-fade-in">
                    {textChannels.map((channel) => (
                      <Fragment key={channel.id}>
                        <ChannelRow channel={channel} />
                        {(threadsByParent[channel.id] ?? []).map((thread) => (
                          <ThreadRow key={thread.id} thread={thread} botId={botId} />
                        ))}
                      </Fragment>
                    ))}
                    {voiceChannels.map((channel) => (
                      <VoiceChannelRow
                        key={channel.id}
                        channel={channel}
                        guildId={selectedGuildId}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>

      <VoicePanel />
      <UserPanel />
    </div>
  );
}

/** One row per channel; a component so the unread hook stays out of a loop. */
function ChannelRow({ channel }: { channel: APIChannel }) {
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectChannel = useClient((state) => state.selectChannel);
  const guildId = useClient((state) => state.selectedGuildId);
  const unread = useUnread(channel.id);

  const active = channel.id === selectedChannelId;
  const name = "name" in channel ? channel.name : null;
  const Glyph =
    channel.type === ANNOUNCEMENT ? AnnouncementIcon : channel.type >= THREAD ? ThreadIcon : HashIcon;
  const highlighted = unread > 0 && !active;

  return (
    <li
      onContextMenu={(event) => openMenuFor(event, "Channel", channelMenuItems(channel, guildId))}
      className="group/channel relative flex items-center gap-1 py-px"
    >
      {/* Discord's white nub marks the open channel, a smaller one an unread one. */}
      {(active || highlighted) && (
        <span
          aria-hidden
          className={`absolute top-1/2 -left-2 w-1 -translate-y-1/2 animate-fade-in rounded-r-full bg-bright ${
            active ? "h-5" : "h-2"
          }`}
        />
      )}
      <button
        type="button"
        onClick={() => void selectChannel(channel.id)}
        aria-current={active ? "true" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[15px] leading-5 transition-colors duration-100 ${
          active
            ? "bg-raised font-medium text-bright"
            : highlighted
              ? "font-semibold text-bright hover:bg-hover"
              : "text-muted hover:bg-hover hover:text-text"
        }`}
      >
        <span className={active || highlighted ? "text-muted" : "text-faint"}>
          <Glyph size={20} />
        </span>
        <span className="truncate">{name ?? channel.id}</span>
        <UnreadBadge count={unread} className="ml-auto" />
      </button>
      <MuteButton
        channelId={channel.id}
        className="opacity-0 transition-opacity group-hover/channel:opacity-100 focus-visible:opacity-100"
      />
    </li>
  );
}

interface ThreadEntry extends OpenThread {
  /** Opened by the user, so it can be closed again; active-only threads cannot. */
  pinned: boolean;
}

/** Active threads of the guild, refetched when the guild changes or a new thread shows up. */
function useActiveThreads(guildId: string | null): APIChannel[] {
  const getRest = useClient((state) => state.getRest);
  const token = useClient((state) => state.token);
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const [loaded, setLoaded] = useState<{ guildId: string; threads: APIChannel[] } | null>(null);
  const known = loaded?.guildId === guildId && loaded.threads.some((t) => t.id === selectedChannelId);
  // Selecting a thread the list lacks (a fresh one) triggers one more fetch.
  const refetchKey = selectedChannelId && !known ? selectedChannelId : "";

  useEffect(() => {
    if (!guildId || !token) return;
    let cancelled = false;
    void navApi
      .activeThreads(getRest(), guildId)
      .then((result) => {
        if (!cancelled) setLoaded({ guildId, threads: result.threads ?? [] });
      })
      .catch(() => {
        // Open threads still show from the saved list.
      });
    return () => {
      cancelled = true;
    };
  }, [guildId, token, getRest, refetchKey]);

  return loaded?.guildId === guildId ? loaded.threads : EMPTY_THREADS;
}

const EMPTY_THREADS: APIChannel[] = [];

/** Active threads plus the ones the user left open, grouped under their parent channel. */
function collectThreads(
  guildId: string | null,
  active: APIChannel[],
  open: OpenThread[],
  botId: string | null,
): Record<string, ThreadEntry[]> {
  const byParent: Record<string, ThreadEntry[]> = {};
  const seen = new Set<string>();
  const add = (thread: OpenThread, pinned: boolean) => {
    if (seen.has(thread.id)) return;
    seen.add(thread.id);
    (byParent[thread.parentId] ??= []).push({ ...thread, pinned });
  };
  if (!guildId) return byParent;
  for (const thread of open) if (thread.guildId === guildId && botId) add(thread, true);
  for (const channel of active) {
    const thread = channel as APIChannel & { parent_id?: string | null };
    if (thread.parent_id && "name" in thread && thread.name) {
      add({ id: thread.id, guildId, parentId: thread.parent_id, name: thread.name }, false);
    }
  }
  return byParent;
}

/** A thread nested under its channel; the saved ones carry a close button. */
function ThreadRow({ thread, botId }: { thread: ThreadEntry; botId: string | null }) {
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectChannel = useClient((state) => state.selectChannel);
  const active = thread.id === selectedChannelId;

  return (
    <li className="group/thread flex items-center gap-1 py-px pl-4">
      <button
        type="button"
        onClick={() => void selectChannel(thread.id)}
        aria-current={active ? "true" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm leading-5 transition-colors duration-100 ${
          active ? "bg-raised font-medium text-bright" : "text-muted hover:bg-hover hover:text-text"
        }`}
      >
        <span className="text-faint">
          <ThreadIcon size={16} />
        </span>
        <span className="truncate">{thread.name}</span>
      </button>
      {thread.pinned && botId && (
        <button
          type="button"
          onClick={() => closeThread(botId, thread.id)}
          aria-label={`Close thread ${thread.name}`}
          title="Close thread"
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted opacity-0 transition-opacity hover:text-bright focus-visible:opacity-100 group-hover/thread:opacity-100"
        >
          <CloseIcon size={12} />
        </button>
      )}
    </li>
  );
}

/**
 * The server name at the top of the list. Clicking it drops the server's menu
 * down underneath, the way Discord's does, and a second click folds it away.
 */
function GuildHeader({ guildId, name }: { guildId: string | null; name: string | null }) {
  const [menuKey, setMenuKey] = useState<number | null>(null);
  const [closedAt, setClosedAt] = useState(0);
  const open = useContextMenu((state) => state.menu !== null && state.menu.key === menuKey);

  // The menu closes on the pointerdown of the very click that would toggle it,
  // so that click has to know the menu was just ours rather than reopen it.
  useEffect(
    () =>
      useContextMenu.subscribe((state, previous) => {
        if (menuKey !== null && previous.menu?.key === menuKey && state.menu?.key !== menuKey) {
          setClosedAt(Date.now());
          setMenuKey(null);
        }
      }),
    [menuKey],
  );

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    if (!guildId || open || Date.now() - closedAt < 300) return;
    setMenuKey(openMenuBelow(event.currentTarget, "Server", guildMenuItems(guildId)));
  }

  return (
    <header className="relative z-10 h-12 shrink-0 shadow-[0_1px_0_rgba(0,0,0,0.2),0_2px_0_rgba(0,0,0,0.05)]">
      <button
        type="button"
        onClick={toggle}
        onContextMenu={(event) => {
          if (guildId) openMenuFor(event, "Server", guildMenuItems(guildId));
        }}
        disabled={!guildId}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-full w-full items-center gap-2 px-4 text-left transition-colors disabled:cursor-default ${
          open ? "bg-hover" : "hover:bg-hover"
        }`}
      >
        {name || !guildId ? (
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-bright">
            {name ?? "No server yet"}
          </h2>
        ) : (
          <span className="flex-1">
            <Skeleton height={12} width="60%" rounded="sm" />
          </span>
        )}
        {guildId && (
          <span className="text-text">
            {open ? <CloseIcon size={16} /> : <ChevronDownIcon size={18} />}
          </span>
        )}
      </button>
    </header>
  );
}

interface ChannelGroup {
  id: string | null;
  name: string | null;
  channels: APIChannel[];
}

function groupByCategory(channels: APIChannel[]): ChannelGroup[] {
  const categories = channels.filter((channel) => channel.type === CATEGORY);
  const uncategorised = channels.filter(
    (channel) => channel.type !== CATEGORY && !("parent_id" in channel && channel.parent_id),
  );

  const groups: ChannelGroup[] = [];
  if (uncategorised.length) groups.push({ id: null, name: null, channels: uncategorised });

  for (const category of categories) {
    groups.push({
      id: category.id,
      name: "name" in category ? (category.name ?? null) : null,
      channels: channels.filter(
        (channel) => "parent_id" in channel && channel.parent_id === category.id,
      ),
    });
  }
  return groups;
}
