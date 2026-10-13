"use client";

import { useEffect, useState } from "react";
import type { APIChannel } from "discord-api-types/v10";
import { categoryMenuItems, channelMenuItems, guildMenuItems } from "@/components/context/menus";
import { MuteButton } from "@/components/notifications/MuteButton";
import { UnreadBadge } from "@/components/notifications/UnreadBadge";
import { ThreadList } from "@/components/nav/ThreadList";
import {
  AnnouncementIcon,
  ChevronDownIcon,
  CloseIcon,
  HashIcon,
  ThreadIcon,
} from "@/components/ui/icons";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { useUnread } from "@/lib/notifications/unread";
import { isTextChannel, isVoiceChannel, useClient } from "@/lib/store/client";
import { openMenuBelow, openMenuFor, useContextMenu } from "@/lib/store/contextMenu";
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
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const status = useClient((state) => state.status);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const channels = channelIds.map((id) => channelsById[id]).filter(Boolean);
  const groups = groupByCategory(channels);
  const loading = channels.length === 0 && status !== "ready";

  return (
    <div className="flex w-60 shrink-0 flex-col bg-panel">
      <GuildHeader guildId={selectedGuildId} name={guild?.name ?? null} />

      <div className="min-h-0 flex-1 animate-sidebar-in overflow-y-auto px-2 py-3">
        {selectedChannelId && (
          <ThreadList
            channelId={selectedChannelId}
            guildId={selectedGuildId ?? undefined}
            variant="inline"
            className="mb-4"
          />
        )}

        {loading ? (
          <SkeletonRows rows={8} className="pt-2" />
        ) : (
          groups.map((group) => {
            const key = group.id ?? "__root__";
            const isCollapsed = collapsed[key] === true;
            // Discord lists a category's text channels first, then its voice ones.
            const textChannels = group.channels.filter(isTextChannel);
            const voiceChannels = group.channels.filter(isVoiceChannel);
            if (textChannels.length === 0 && voiceChannels.length === 0) return null;

            return (
              <section key={key} className="mb-3">
                {group.name && (
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
                    className="flex w-full items-center gap-0.5 pt-1 pr-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase transition-colors hover:text-bright"
                  >
                    <span
                      className="inline-flex transition-transform duration-200"
                      style={{ transform: isCollapsed ? "rotate(-90deg)" : "none" }}
                    >
                      <ChevronDownIcon size={12} />
                    </span>
                    <span className="truncate">{group.name}</span>
                  </button>
                )}
                {!isCollapsed && (
                  <ul className="animate-fade-in">
                    {textChannels.map((channel) => (
                      <ChannelRow key={channel.id} channel={channel} />
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
