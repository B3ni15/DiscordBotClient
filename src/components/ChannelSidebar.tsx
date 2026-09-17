"use client";

import { useState } from "react";
import type { APIChannel } from "discord-api-types/v10";
import { MuteButton } from "@/components/notifications/MuteButton";
import { UnreadBadge } from "@/components/notifications/UnreadBadge";
import { ThreadList } from "@/components/nav/ThreadList";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useUnread } from "@/lib/notifications/unread";
import { isTextChannel, useClient } from "@/lib/store/client";
import { UserPanel } from "./UserPanel";

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
      <header className="flex h-12 shrink-0 items-center px-4 shadow-[0_1px_0_rgba(0,0,0,0.2),0_2px_0_rgba(0,0,0,0.05)]">
        <h2 className="truncate text-[15px] font-semibold text-bright">
          {guild?.name ?? "Pick a server"}
        </h2>
      </header>

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
            const visible = group.channels.filter(isTextChannel);
            if (visible.length === 0) return null;

            return (
              <section key={key} className="mb-4">
                {group.name && (
                  <button
                    type="button"
                    onClick={() => setCollapsed((state) => ({ ...state, [key]: !isCollapsed }))}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-0.5 px-0.5 pb-1 text-[11px] font-bold tracking-wide text-muted uppercase transition-colors hover:text-bright"
                  >
                    <span
                      aria-hidden
                      className="inline-block text-[9px] transition-transform duration-200"
                      style={{ transform: isCollapsed ? "rotate(-90deg)" : "none" }}
                    >
                      ▼
                    </span>
                    <span className="truncate">{group.name}</span>
                  </button>
                )}
                {!isCollapsed && (
                  <ul className="animate-fade-in">
                    {visible.map((channel) => (
                      <ChannelRow key={channel.id} channel={channel} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>

      <UserPanel />
    </div>
  );
}

/** One row per channel; a component so the unread hook stays out of a loop. */
function ChannelRow({ channel }: { channel: APIChannel }) {
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectChannel = useClient((state) => state.selectChannel);
  const unread = useUnread(channel.id);

  const active = channel.id === selectedChannelId;
  const name = "name" in channel ? channel.name : null;
  // Announcement channels and threads get their own glyph, as in Discord.
  const glyph = channel.type === ANNOUNCEMENT ? "📢" : channel.type >= THREAD ? "🧵" : "#";

  return (
    <li className="group/channel relative flex items-center gap-1">
      {active && (
        <span
          aria-hidden
          className="absolute top-1/2 -left-1.5 h-5 w-1 -translate-y-1/2 rounded-r-full bg-bright"
        />
      )}
      <button
        type="button"
        onClick={() => void selectChannel(channel.id)}
        aria-current={active ? "true" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-[15px] transition-colors duration-100 ${
          active
            ? "bg-raised font-medium text-bright"
            : "text-muted hover:bg-hover hover:text-text"
        }`}
      >
        <span aria-hidden className="shrink-0 text-lg leading-none text-faint">
          {glyph}
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
