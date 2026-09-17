"use client";

import { useState } from "react";
import type { APIGuild } from "discord-api-types/v10";

import { UnreadBadge } from "@/components/notifications/UnreadBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import { guildAcronym, guildIconUrl } from "@/lib/discord/cdn";
import { useGuildUnread } from "@/lib/notifications/unread";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

/** Server icons down the left edge, with Discord's sliding selection pill. */
export function GuildRail() {
  const guildOrder = useClient((state) => state.guildOrder);
  const guilds = useClient((state) => state.guilds);
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const selectGuild = useClient((state) => state.selectGuild);
  const status = useClient((state) => state.status);
  const dmMode = useUI((state) => state.dmMode);
  const setDmMode = useUI((state) => state.setDmMode);
  const togglePanel = useUI((state) => state.togglePanel);
  const settingsOpen = useUI((state) => state.panel === "settings");
  const commandsOpen = useUI((state) => state.panel === "commands");

  const connecting = status !== "ready" && guildOrder.length === 0;

  return (
    <nav
      aria-label="Servers"
      className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto bg-ink py-3"
    >
      <RailItem
        label="Direct messages"
        active={dmMode}
        onSelect={() => setDmMode(true)}
        className="text-2xl leading-none"
      >
        <span aria-hidden>@</span>
      </RailItem>

      <span className="my-1 h-0.5 w-8 shrink-0 rounded-full bg-line" aria-hidden />

      {connecting
        ? Array.from({ length: 3 }, (_, index) => (
            <span
              key={index}
              aria-hidden
              className="skeleton h-12 w-12 shrink-0"
              style={{ borderRadius: "24px", animationDelay: `${index * 120}ms` }}
            />
          ))
        : guildOrder.map((guildId) => {
            const guild = guilds[guildId];
            if (!guild) return null;
            return (
              <GuildButton
                key={guildId}
                guild={guild}
                active={!dmMode && guildId === selectedGuildId}
                onSelect={() => {
                  setDmMode(false);
                  selectGuild(guildId);
                }}
              />
            );
          })}

      <div className="mt-auto flex shrink-0 flex-col items-center gap-2 pt-2">
        <span className="h-0.5 w-8 rounded-full bg-line" aria-hidden />
        <RailItem
          label="Slash commands"
          active={commandsOpen}
          pressed={commandsOpen}
          onSelect={() => togglePanel("commands")}
          className="font-mono text-lg leading-none"
        >
          <span aria-hidden>/</span>
        </RailItem>
        <RailItem
          label="Settings"
          active={settingsOpen}
          pressed={settingsOpen}
          onSelect={() => togglePanel("settings")}
          className="text-lg leading-none"
        >
          <span aria-hidden>⚙</span>
        </RailItem>
      </div>
    </nav>
  );
}

interface RailItemProps {
  label: string;
  active: boolean;
  pressed?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
  badge?: number;
}

/**
 * One rail button. The squircle rounds off and the pill on the left grows as the
 * item is hovered or selected, which is the movement that makes Discord's rail
 * feel alive.
 */
function RailItem({
  label,
  active,
  pressed,
  onSelect,
  children,
  className,
  badge = 0,
}: RailItemProps) {
  const [hovered, setHovered] = useState(false);
  const pillHeight = active ? 40 : hovered ? 20 : 0;

  return (
    <div className="relative shrink-0">
      <span
        aria-hidden
        className="rail-pill absolute top-1/2 -left-3 w-1 -translate-y-1/2 rounded-r-full bg-bright"
        style={{ height: pillHeight, opacity: pillHeight === 0 ? 0 : 1 }}
      />
      <Tooltip label={label} side="right">
        <button
          type="button"
          onClick={onSelect}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          aria-label={label}
          aria-current={active && pressed === undefined ? "true" : undefined}
          aria-pressed={pressed}
          className={`grid h-12 w-12 place-items-center overflow-hidden transition-[border-radius,background-color,color] duration-200 ${
            active
              ? "rounded-2xl bg-accent text-white"
              : "rounded-3xl bg-panel text-text hover:rounded-2xl hover:bg-accent hover:text-white"
          } ${className ?? ""}`}
        >
          {children}
        </button>
      </Tooltip>
      <UnreadBadge count={badge} className="pointer-events-none absolute -top-0.5 -right-0.5" />
    </div>
  );
}

/** One server icon; a component so the unread hook stays out of a loop. */
function GuildButton({
  guild,
  active,
  onSelect,
}: {
  guild: APIGuild;
  active: boolean;
  onSelect: () => void;
}) {
  const unread = useGuildUnread(guild.id);
  const icon = guildIconUrl(guild);

  return (
    <RailItem label={guild.name} active={active} onSelect={onSelect} badge={unread}>
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden className="text-sm font-semibold">
          {guildAcronym(guild.name)}
        </span>
      )}
    </RailItem>
  );
}
