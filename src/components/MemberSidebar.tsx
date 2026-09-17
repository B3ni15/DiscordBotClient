"use client";

import { useEffect, useMemo, useState } from "react";
import type { APIGuildMember, APIRole } from "discord-api-types/v10";
import { UserCard } from "@/components/members/UserCard";
import { BotTag } from "@/components/ui/BotTag";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { StatusDot } from "@/components/ui/StatusDot";
import { userAvatarUrl } from "@/lib/discord/cdn";
import {
  compareByDisplayName,
  displayName,
  groupMembersByHoistedRole,
  memberColorHex,
  type MemberGroup,
} from "@/lib/discord/roles";
import { activityLine } from "@/lib/discord/presence";
import { OFFLINE_PRESENCE, useClient, type Presence } from "@/lib/store/client";

const OFFLINE_GROUP_ID = "__offline__";
const EMPTY_PRESENCES: Record<string, Presence> = {};

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
 * renders it. Online/offline is shown whenever the connection carries the
 * presence intent; without it the list stays purely role-based and says so.
 */
export function MemberSidebar() {
  const guildId = useClient((state) => state.selectedGuildId);
  const guild = useClient((state) => (guildId ? state.guilds[guildId] : undefined));
  const members = useClient((state) => (guildId ? state.membersByGuild[guildId] : undefined));
  const rawPresences = useClient((state) =>
    guildId ? (state.presenceByGuild[guildId] ?? EMPTY_PRESENCES) : EMPTY_PRESENCES,
  );
  const selfId = useClient((state) => state.user?.id);
  const selfPresence = useClient((state) => state.selfPresence);

  /*
   * Discord sends no PRESENCE_UPDATE for your own account, so the bot's own row
   * would keep whatever it had when the guild arrived. Overlay what this client
   * actually published for it.
   */
  const presences = useMemo(() => {
    if (!selfId) return rawPresences;
    const status = selfPresence.status === "invisible" ? "offline" : selfPresence.status;
    const name = selfPresence.activityName.trim();
    return {
      ...rawPresences,
      [selfId]: {
        status,
        activities:
          selfPresence.activityType !== null && name
            ? [{ name, type: selfPresence.activityType }]
            : [],
        clientStatus: selfPresence.mobile ? { mobile: status } : { desktop: status },
      },
    };
  }, [rawPresences, selfId, selfPresence]);
  const hasPresence = useClient((state) => state.presenceEnabled);
  const getGateway = useClient((state) => state.getGateway);
  const status = useClient((state) => state.status);

  const [query, setQuery] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!guildId || status !== "ready") return;
    // Presences only come back when the connection actually carries the intent.
    getGateway()?.requestGuildMembers(guildId, { presences: hasPresence });
  }, [guildId, status, hasPresence, getGateway]);

  const roles: APIRole[] = useMemo(() => guild?.roles ?? [], [guild]);

  const all = useMemo(() => Object.values(members ?? {}).filter((m) => m.user), [members]);

  const groups: MemberGroup[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = all.filter((member) => matches(member, needle));
    if (!hasPresence) return groupMembersByHoistedRole(visible, roles);

    // With presences, offline members are pulled out into their own group.
    const online: APIGuildMember[] = [];
    const offline: APIGuildMember[] = [];
    for (const member of visible) {
      const presence = presences[member.user!.id];
      (!presence || presence.status === "offline" ? offline : online).push(member);
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
  }, [all, query, roles, hasPresence, presences]);

  const shown = groups.reduce((total, group) => total + group.members.length, 0);
  const onlineCount = hasPresence
    ? all.filter((member) => {
        const presence = presences[member.user!.id];
        return presence !== undefined && presence.status !== "offline";
      }).length
    : 0;
  // Derived, so switching guilds drops the card without an effect.
  const openUser = openUserId && members?.[openUserId] ? openUserId : null;
  const loading = all.length === 0 && status === "ready";

  if (!guildId) return null;

  return (
    <aside
      aria-label="Members"
      className="relative hidden w-60 shrink-0 animate-panel-in flex-col bg-panel lg:flex"
    >
      <header className="flex h-12 shrink-0 items-center px-4 shadow-[0_1px_0_rgba(0,0,0,0.2)]">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
          {hasPresence ? (
            <>
              Members — <span className="font-mono">{all.length}</span>
              <span className="ml-2 text-online">{onlineCount} online</span>
            </>
          ) : (
            <>
              Members — <span className="font-mono">{all.length}</span>
            </>
          )}
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
            className="w-full rounded bg-ink px-2 py-1.5 text-sm text-text transition-shadow outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <SkeletonRows rows={8} avatar />
        ) : all.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-muted">
            No member list. Enable the <span className="font-mono text-amber">SERVER MEMBERS</span>{" "}
            intent in the Developer Portal.
          </p>
        ) : shown === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-muted">No member matches the search.</p>
        ) : (
          groups.map((group) => (
            <section key={group.id} className="pb-4">
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
                  const presence = presences[user.id] ?? OFFLINE_PRESENCE;
                  const offline = presence.status === "offline";
                  const activity = activityLine(presence);
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => setOpenUserId(user.id)}
                        className={`flex w-full items-center gap-3 rounded px-2 py-1 text-left transition-colors hover:bg-hover ${
                          hasPresence && offline ? "opacity-40 hover:opacity-100" : ""
                        }`}
                      >
                        <span className="relative shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={userAvatarUrl(user, 32)}
                            alt=""
                            className="h-8 w-8 rounded-full"
                          />
                          {hasPresence && (
                            <StatusDot
                              status={presence.status}
                              size={10}
                              className="absolute -right-1 -bottom-1"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="truncate text-[15px] font-medium"
                              style={color ? { color } : undefined}
                            >
                              <span className={color ? undefined : "text-muted"}>
                                {displayName(member)}
                              </span>
                            </span>
                            <BotTag user={user} />
                          </span>
                          {activity && (
                            <span className="block truncate text-xs text-muted">{activity}</span>
                          )}
                        </span>
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
        <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close card"
            onClick={() => setOpenUserId(null)}
            className="absolute inset-0 bg-black/70"
          />
          <UserCard
            guildId={guildId}
            userId={openUser}
            onClose={() => setOpenUserId(null)}
            className="relative z-10 max-h-[80vh] animate-pop-in"
          />
        </div>
      )}
    </aside>
  );
}
