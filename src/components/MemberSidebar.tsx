"use client";

import { useEffect, useMemo } from "react";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";

/** Member list of the selected guild, filled from GUILD_MEMBERS_CHUNK. */
export function MemberSidebar() {
  const guildId = useClient((state) => state.selectedGuildId);
  const members = useClient((state) => (guildId ? state.membersByGuild[guildId] : undefined));
  const getGateway = useClient((state) => state.getGateway);
  const status = useClient((state) => state.status);

  useEffect(() => {
    if (!guildId || status !== "ready") return;
    getGateway()?.requestGuildMembers(guildId);
  }, [guildId, status, getGateway]);

  const sorted = useMemo(() => {
    return Object.values(members ?? {}).sort((a, b) => {
      const nameA = (a.nick ?? a.user?.global_name ?? a.user?.username ?? "").toLowerCase();
      const nameB = (b.nick ?? b.user?.global_name ?? b.user?.username ?? "").toLowerCase();
      return nameA.localeCompare(nameB, "hu");
    });
  }, [members]);

  if (!guildId) return null;

  return (
    <aside
      aria-label="Tagok"
      className="hidden w-60 shrink-0 flex-col border-l border-line bg-panel lg:flex"
    >
      <header className="flex h-12 shrink-0 items-center px-4">
        <h2 className="text-xs font-semibold text-muted">
          Tagok — <span className="font-mono">{sorted.length}</span>
        </h2>
      </header>
      <ul className="flex-1 overflow-y-auto px-2 pb-3">
        {sorted.length === 0 && (
          <li className="px-2 text-xs leading-relaxed text-muted">
            Nincs taglista. Kapcsold be a <span className="font-mono text-amber">SERVER MEMBERS</span>{" "}
            intentet a Developer Portalon.
          </li>
        )}
        {sorted.map((member) => {
          if (!member.user) return null;
          const name = member.nick ?? member.user.global_name ?? member.user.username;
          return (
            <li key={member.user.id}>
              <div className="flex items-center gap-2 rounded px-2 py-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={userAvatarUrl(member.user, 32)} alt="" className="h-6 w-6 rounded-full" />
                <span className="truncate text-sm text-muted">{name}</span>
                {member.user.bot && (
                  <span className="rounded bg-accent/15 px-1 font-mono text-[10px] text-accent">
                    BOT
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
