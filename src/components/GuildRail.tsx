"use client";

import { guildAcronym, guildIconUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";

/** Server icons down the left edge. */
export function GuildRail() {
  const guildOrder = useClient((state) => state.guildOrder);
  const guilds = useClient((state) => state.guilds);
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const selectGuild = useClient((state) => state.selectGuild);

  return (
    <nav
      aria-label="Szerverek"
      className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-line bg-ink py-3"
    >
      {guildOrder.map((guildId) => {
        const guild = guilds[guildId];
        if (!guild) return null;
        const icon = guildIconUrl(guild);
        const active = guildId === selectedGuildId;
        return (
          <button
            key={guildId}
            type="button"
            onClick={() => selectGuild(guildId)}
            title={guild.name}
            aria-current={active ? "true" : undefined}
            className={`relative grid h-12 w-12 place-items-center overflow-hidden text-sm font-semibold transition-[border-radius,background-color] ${
              active ? "rounded-xl bg-accent/20 text-accent" : "rounded-3xl bg-panel text-muted hover:rounded-xl hover:bg-raised"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {icon ? (
              <img src={icon} alt="" className="h-full w-full object-cover" />
            ) : (
              guildAcronym(guild.name)
            )}
            {active && (
              <span className="absolute -left-3 h-6 w-1 rounded-r bg-accent" aria-hidden />
            )}
          </button>
        );
      })}
    </nav>
  );
}
