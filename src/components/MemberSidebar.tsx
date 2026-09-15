"use client";

import { useEffect, useMemo, useState } from "react";
import type { APIGuildMember, APIRole } from "discord-api-types/v10";
import { UserCard } from "@/components/members/UserCard";
import { userAvatarUrl } from "@/lib/discord/cdn";
import {
  compareByDisplayName,
  displayName,
  groupMembersByHoistedRole,
  memberColorHex,
  type MemberGroup,
} from "@/lib/discord/roles";
import { useClient } from "@/lib/store/client";

/** Presence payloads ride along with GUILD_CREATE, but only with the intent on. */
interface GuildPresence {
  user?: { id?: string };
  status?: string;
}

const OFFLINE_GROUP_ID = "__offline__";
const STATUS_COLORS: Record<string, string> = {
  online: "bg-accent",
  idle: "bg-amber",
  dnd: "bg-danger",
  offline: "bg-muted",
};

/** Search matches nickname, display name and username alike. */
function matches(member: APIGuildMember, needle: string): boolean {
  if (!needle) return true;
  const haystack = [
    member.nick ?? "",
    member.user?.global_name ?? "",
    member.user?.username ?? "",
    member.user?.id ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * Member list of the selected guild, grouped by hoisted roles the way Discord
 * renders it. Online/offline is only shown when the gateway actually sends
 * presences; without the intent the list stays purely role-based.
 */
export function MemberSidebar() {
  const guildId = useClient((state) => state.selectedGuildId);
  const guild = useClient((state) => (guildId ? state.guilds[guildId] : undefined));
  const members = useClient((state) => (guildId ? state.membersByGuild[guildId] : undefined));
  const getGateway = useClient((state) => state.getGateway);
  const status = useClient((state) => state.status);

  const [query, setQuery] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!guildId || status !== "ready") return;
    getGateway()?.requestGuildMembers(guildId);
  }, [guildId, status, getGateway]);

  const roles: APIRole[] = useMemo(() => guild?.roles ?? [], [guild]);

  /** userId -> presence status, empty when the PRESENCE INTENT is off. */
  const presenceByUser = useMemo(() => {
    const raw = (guild as { presences?: GuildPresence[] } | undefined)?.presences ?? [];
    const map = new Map<string, string>();
    for (const presence of raw) {
      if (presence.user?.id) map.set(presence.user.id, presence.status ?? "offline");
    }
    return map;
  }, [guild]);

  const hasPresence = presenceByUser.size > 0;

  const all = useMemo(() => Object.values(members ?? {}).filter((m) => m.user), [members]);

  const groups: MemberGroup[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = all.filter((member) => matches(member, needle));
    if (!hasPresence) return groupMembersByHoistedRole(visible, roles);

    // With presences, offline members are pulled out into their own group.
    const online: APIGuildMember[] = [];
    const offline: APIGuildMember[] = [];
    for (const member of visible) {
      const state = presenceByUser.get(member.user!.id) ?? "offline";
      (state === "offline" ? offline : online).push(member);
    }
    const result = groupMembersByHoistedRole(online, roles, { defaultLabel: "Online" });
    if (offline.length > 0) {
      result.push({
        id: OFFLINE_GROUP_ID,
        name: "Offline",
        color: null,
        members: [...offline].sort(compareByDisplayName),
      });
    }
    return result;
  }, [all, query, roles, hasPresence, presenceByUser]);

  const shown = groups.reduce((total, group) => total + group.members.length, 0);
  // Derived, so switching guilds drops the card without an effect.
  const openUser = openUserId && members?.[openUserId] ? openUserId : null;

  if (!guildId) return null;

  return (
    <aside
      aria-label="Members"
      className="relative hidden w-60 shrink-0 flex-col border-l border-line bg-panel lg:flex"
    >
      <header className="flex h-12 shrink-0 items-center px-4">
        <h2 className="text-xs font-semibold text-muted">
          Members — <span className="font-mono">{all.length}</span>
        </h2>
      </header>

      {all.length > 0 && (
        <div className="shrink-0 px-3 pb-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members"
            aria-label="Search members"
            className="w-full rounded border border-line bg-raised px-2 py-1.5 text-sm text-text placeholder:text-muted"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {all.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-muted">
            No member list. Enable the <span className="font-mono text-amber">SERVER MEMBERS</span>{" "}
            intent in the Developer Portal.
          </p>
        ) : shown === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-muted">No member matches the search.</p>
        ) : (
          groups.map((group) => (
            <section key={group.id} className="pb-3">
              <h3
                className="px-2 pb-1 text-[11px] font-semibold tracking-wide uppercase"
                style={group.color ? { color: group.color } : undefined}
              >
                <span className={group.color ? undefined : "text-muted"}>
                  {group.name} — <span className="font-mono">{group.members.length}</span>
                </span>
              </h3>
              <ul>
                {group.members.map((member) => {
                  const user = member.user!;
                  const color = memberColorHex(member, roles);
                  const presence = presenceByUser.get(user.id) ?? "offline";
                  const dimmed = hasPresence && presence === "offline";
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => setOpenUserId(user.id)}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-raised/60 ${
                          dimmed ? "opacity-50" : ""
                        }`}
                      >
                        <span className="relative shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={userAvatarUrl(user, 32)}
                            alt=""
                            className="h-6 w-6 rounded-full"
                          />
                          {hasPresence && (
                            <span
                              aria-hidden
                              className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel ${
                                STATUS_COLORS[presence] ?? STATUS_COLORS.offline
                              }`}
                            />
                          )}
                        </span>
                        <span
                          className="truncate text-sm"
                          style={color ? { color } : undefined}
                        >
                          <span className={color ? undefined : "text-muted"}>
                            {displayName(member)}
                          </span>
                        </span>
                        {user.bot && (
                          <span className="shrink-0 rounded bg-accent/15 px-1 font-mono text-[10px] text-accent">
                            BOT
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {!hasPresence && all.length > 0 && (
        <p className="shrink-0 border-t border-line px-3 py-2 text-[11px] leading-relaxed text-muted">
          Grouped by role. Online/offline status needs the{" "}
          <span className="font-mono text-amber">PRESENCE INTENT</span> enabled in the Developer
          Portal.
        </p>
      )}

      {openUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close card"
            onClick={() => setOpenUserId(null)}
            className="absolute inset-0 bg-ink/70"
          />
          <UserCard
            guildId={guildId}
            userId={openUser}
            onClose={() => setOpenUserId(null)}
            className="relative z-10 max-h-[80vh]"
          />
        </div>
      )}
    </aside>
  );
}
