"use client";

import type { APIChannel } from "discord-api-types/v10";
import { isTextChannel, useClient } from "@/lib/store/client";

const CATEGORY = 4;

/** Channel list for the selected guild, grouped by category. */
export function ChannelSidebar() {
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const guild = useClient((state) => (selectedGuildId ? state.guilds[selectedGuildId] : null));
  const channelIds = useClient((state) =>
    selectedGuildId ? (state.channelsByGuild[selectedGuildId] ?? []) : [],
  );
  const channelsById = useClient((state) => state.channelsById);
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectChannel = useClient((state) => state.selectChannel);

  const channels = channelIds.map((id) => channelsById[id]).filter(Boolean);
  const groups = groupByCategory(channels);

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      <header className="flex h-12 shrink-0 items-center border-b border-line px-4">
        <h2 className="truncate text-sm font-semibold">{guild?.name ?? "Válassz szervert"}</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <section key={group.id ?? "root"} className="mb-4">
            {group.name && (
              <h3 className="px-2 pb-1 text-xs font-semibold text-muted">{group.name}</h3>
            )}
            <ul>
              {group.channels.filter(isTextChannel).map((channel) => {
                const active = channel.id === selectedChannelId;
                const name = "name" in channel ? channel.name : null;
                return (
                  <li key={channel.id}>
                    <button
                      type="button"
                      onClick={() => void selectChannel(channel.id)}
                      className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                        active ? "bg-raised text-text" : "text-muted hover:bg-raised/60 hover:text-text"
                      }`}
                    >
                      <span aria-hidden className="text-muted">
                        #
                      </span>
                      <span className="truncate">{name ?? channel.id}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
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
