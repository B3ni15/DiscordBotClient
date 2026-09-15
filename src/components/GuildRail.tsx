"use client";

import { guildAcronym, guildIconUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

/** Server icons down the left edge. */
export function GuildRail() {
  const guildOrder = useClient((state) => state.guildOrder);
  const guilds = useClient((state) => state.guilds);
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const selectGuild = useClient((state) => state.selectGuild);
  const dmMode = useUI((state) => state.dmMode);
  const setDmMode = useUI((state) => state.setDmMode);
  const togglePanel = useUI((state) => state.togglePanel);
  const settingsOpen = useUI((state) => state.panel === "settings");

  return (
    <nav
      aria-label="Servers"
      className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-line bg-ink py-3"
    >
      <button
        type="button"
        onClick={() => setDmMode(true)}
        title="Direct messages"
        aria-current={dmMode ? "true" : undefined}
        className={`grid h-12 w-12 place-items-center rounded-2xl text-lg transition-colors ${
          dmMode ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:bg-raised"
        }`}
      >
        @
      </button>
      <span className="my-1 h-px w-8 bg-line" aria-hidden />

      {guildOrder.map((guildId) => {
        const guild = guilds[guildId];
        if (!guild) return null;
        const icon = guildIconUrl(guild);
        const active = !dmMode && guildId === selectedGuildId;
        return (
          <button
            key={guildId}
            type="button"
            onClick={() => {
              setDmMode(false);
              selectGuild(guildId);
            }}
            title={guild.name}
            aria-current={active ? "true" : undefined}
            className={`relative grid h-12 w-12 place-items-center overflow-hidden text-sm font-semibold transition-[border-radius,background-color] ${
              active ? "rounded-xl bg-accent/20 text-accent" : "rounded-3xl bg-panel text-muted hover:rounded-xl hover:bg-raised"
            }`}
          >
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
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
      <button
        type="button"
        onClick={() => togglePanel("settings")}
        title="Settings"
        aria-pressed={settingsOpen}
        className={`mt-auto grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm transition-colors ${
          settingsOpen ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:bg-raised"
        }`}
      >
        ⚙
      </button>
    </nav>
  );
}
