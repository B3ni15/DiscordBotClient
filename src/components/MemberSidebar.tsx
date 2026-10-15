"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { APIGuildMember, APIRole } from "discord-api-types/v10";
import { memberMenuItems } from "@/components/context/menus";
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
import type { GatewayClient } from "@/lib/discord/gateway";
import type { SelfPresence } from "@/lib/discord/selfPresence";
import { OFFLINE_PRESENCE, useClient, type Presence } from "@/lib/store/client";
import { measureMemberSidebarMetric } from "@/lib/performance/memberSidebarPerf";
import { openMenuFor } from "@/lib/store/contextMenu";

const OFFLINE_GROUP_ID = "__offline__";
const EMPTY_ONLINE_MEMBERS: Record<string, true> = {};
const MEMBER_ROW_HEIGHT = 42;
const GROUP_HEADING_HEIGHT = 21;
const GROUP_GAP_HEIGHT = 16;
const LIST_OVERSCAN = 400;
const requestedMemberPresences = new WeakMap<
  GatewayClient,
  Map<string, { version: number; presences: boolean }>
>();

interface MemberRowProps {
  guildId: string;
  userId: string;
  roles: APIRole[];
  hasPresence: boolean;
  isOffline: boolean;
  top: number;
  setSize: number;
  selfPresence?: SelfPresence;
  onOpen: (userId: string) => void;
}

function layoutGroups(groups: MemberGroup[]) {
  let height = 0;
  const layouts = groups.map((group) => {
    const layout = { group, top: height };
    height +=
      GROUP_HEADING_HEIGHT +
      group.members.length * MEMBER_ROW_HEIGHT +
      GROUP_GAP_HEIGHT;
    return layout;
  });
  return { layouts, height };
}

function presenceFromSelfPresence(selfPresence: SelfPresence): Presence {
  const status = selfPresence.status === "invisible" ? "offline" : selfPresence.status;
  const name = selfPresence.activityName.trim();
  return {
    status,
    activities:
      selfPresence.activityType !== null && name
        ? [{ name, type: selfPresence.activityType }]
        : [],
    clientStatus: selfPresence.mobile ? { mobile: status } : { desktop: status },
  };
}

const MemberRow = memo(function MemberRow({
  guildId,
  userId,
  roles,
  hasPresence,
  isOffline,
  top,
  setSize,
  selfPresence,
  onOpen,
}: MemberRowProps) {
  const member = useClient(
    (state) => state.membersByGuild[guildId]?.[userId],
  );
  const storedPresence = useClient(
    (state) => state.presenceByGuild[guildId]?.[userId] ?? OFFLINE_PRESENCE,
  );
  if (!member?.user) return null;
  const user = member.user;
  const presence = selfPresence ? presenceFromSelfPresence(selfPresence) : storedPresence;
  const color = memberColorHex(member, roles);
  const activity = activityLine(presence);

  return (
    <li
      className="absolute inset-x-0"
      style={{ top, height: MEMBER_ROW_HEIGHT }}
      aria-posinset={top / MEMBER_ROW_HEIGHT + 1}
      aria-setsize={setSize}
    >
      <button
        type="button"
        onClick={() => onOpen(user.id)}
        onContextMenu={(event) =>
          openMenuFor(
            event,
            displayName(member),
            memberMenuItems(guildId, user.id, {
              onProfile: () => onOpen(user.id),
            }),
          )
        }
        className={`flex h-full w-full items-center gap-3 rounded px-2 py-0 text-left transition-colors hover:bg-hover ${
          hasPresence && isOffline ? "opacity-40 hover:opacity-100" : ""
        }`}
      >
        <span className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={userAvatarUrl(user, 32)} alt="" className="h-8 w-8 rounded-full" />
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
              <span className={color ? undefined : "text-muted"}>{displayName(member)}</span>
            </span>
            <BotTag user={user} />
          </span>
          {activity && <span className="block truncate text-xs text-muted">{activity}</span>}
        </span>
      </button>
    </li>
  );
});

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
export const MemberSidebar = memo(function MemberSidebar() {
  const guildId = useClient((state) => state.selectedGuildId);
  const guild = useClient((state) => (guildId ? state.guilds[guildId] : undefined));
  const memberListVersion = useClient((state) =>
    guildId ? (state.memberListVersionByGuild[guildId] ?? 0) : 0,
  );
  const memberRequestVersion = useClient((state) =>
    guildId ? (state.memberRequestVersionByGuild[guildId] ?? 0) : 0,
  );
  const onlineMembers = useClient((state) =>
    guildId
      ? (state.onlineMembersByGuild[guildId] ?? EMPTY_ONLINE_MEMBERS)
      : EMPTY_ONLINE_MEMBERS,
  );
  const selfId = useClient((state) => state.user?.id);
  const selfPresence = useClient((state) => state.selfPresence);

  const hasPresence = useClient((state) => state.presenceEnabled);
  const getGateway = useClient((state) => state.getGateway);
  const status = useClient((state) => state.status);

  const [query, setQuery] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const openMember = useClient((state) =>
    guildId && openUserId
      ? state.membersByGuild[guildId]?.[openUserId]
      : undefined,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState({
    guildId: null as string | null,
    query: "",
    top: 0,
  });
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    if (!guildId) return;
    const currentGateway = getGateway();
    if (!currentGateway) return;
    let requested = requestedMemberPresences.get(currentGateway);
    if (!requested) {
      requested = new Map();
      requestedMemberPresences.set(currentGateway, requested);
    }
    if (status !== "ready") {
      requested.clear();
      return;
    }
    // Presences only come back when the connection actually carries the intent.
    const previousRequest = requested.get(guildId);
    if (
      previousRequest?.version === memberRequestVersion &&
      (previousRequest.presences || previousRequest.presences === hasPresence)
    ) {
      return;
    }
    currentGateway.requestGuildMembers(guildId, { presences: hasPresence });
    requested.set(guildId, {
      version: memberRequestVersion,
      presences: hasPresence || Boolean(previousRequest?.presences),
    });
  }, [guildId, status, hasPresence, getGateway, memberRequestVersion]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => setViewportHeight(list.clientHeight));
    observer.observe(list);
    setViewportHeight(list.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [guildId, query]);

  const roles: APIRole[] = useMemo(() => guild?.roles ?? [], [guild]);

  const memberSnapshot = useMemo(
    () => ({
      version: memberListVersion,
      members: Object.values(useClient.getState().membersByGuild[guildId ?? ""] ?? {}).filter(
        (member) => member.user,
      ),
    }),
    [guildId, memberListVersion],
  );
  const all = memberSnapshot.members;
  const selfIsOnline = selfPresence.status !== "invisible";

  const groups: MemberGroup[] = useMemo(() => {
    return measureMemberSidebarMetric(
      "member-filter-group-sort",
      () => {
        const needle = query.trim().toLowerCase();
        const visible = memberSnapshot.members.filter((member) => matches(member, needle));
        let result: MemberGroup[];
        if (!hasPresence) {
          result = groupMembersByHoistedRole(visible, roles);
        } else {
          // With presences, offline members are pulled out into their own group.
          const online: APIGuildMember[] = [];
          const offline: APIGuildMember[] = [];
          for (const member of visible) {
            const isOnline =
              member.user!.id === selfId ? selfIsOnline : Boolean(onlineMembers[member.user!.id]);
            (isOnline ? online : offline).push(member);
          }
          result = groupMembersByHoistedRole(online, roles, { defaultLabel: "Online" });
          if (offline.length > 0) {
            result.push({
              id: OFFLINE_GROUP_ID,
              name: "Offline",
              color: null,
              members: [...offline].sort(compareByDisplayName),
            });
          }
        }
        return result;
      },
      memberSnapshot.members.length,
    );
  }, [memberSnapshot, query, roles, hasPresence, onlineMembers, selfId, selfIsOnline]);

  const shown = groups.reduce((total, group) => total + group.members.length, 0);
  const onlineCount = useMemo(
    () =>
      hasPresence
        ? memberSnapshot.members.filter((member) =>
            member.user!.id === selfId
              ? selfIsOnline
              : Boolean(onlineMembers[member.user!.id]),
          ).length
        : 0,
    [memberSnapshot, hasPresence, onlineMembers, selfId, selfIsOnline],
  );
  const groupLayouts = useMemo(() => layoutGroups(groups), [groups]);
  const scrollTop =
    scrollPosition.guildId === guildId && scrollPosition.query === query
      ? scrollPosition.top
      : 0;
  const visibleStart = Math.max(0, scrollTop - LIST_OVERSCAN);
  const visibleEnd = scrollTop + viewportHeight + LIST_OVERSCAN;

  // Derived, so switching guilds drops the card without an effect.
  const openUser = openUserId && openMember ? openUserId : null;
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

      <div
        ref={listRef}
        onScroll={(event) =>
          setScrollPosition({ guildId, query, top: event.currentTarget.scrollTop })
        }
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
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
          <div
            className="relative"
            style={{ height: groupLayouts.height }}
          >
            {groupLayouts.layouts.map(({ group, top }) => {
              const rowsTop = top + GROUP_HEADING_HEIGHT;
              const groupBottom =
                rowsTop + group.members.length * MEMBER_ROW_HEIGHT + GROUP_GAP_HEIGHT;
              if (top >= visibleEnd || groupBottom <= visibleStart) return null;

              const startIndex = Math.max(
                0,
                Math.floor((visibleStart - rowsTop) / MEMBER_ROW_HEIGHT),
              );
              const endIndex = Math.max(
                0,
                Math.min(
                  group.members.length,
                  Math.ceil((visibleEnd - rowsTop) / MEMBER_ROW_HEIGHT),
                ),
              );

              return (
                <section
                  key={group.id}
                  aria-labelledby={`${group.id}-heading`}
                  className="absolute inset-x-0"
                  style={{
                    top,
                    height:
                      GROUP_HEADING_HEIGHT +
                      group.members.length * MEMBER_ROW_HEIGHT +
                      GROUP_GAP_HEIGHT,
                  }}
                >
                  <h3
                    id={`${group.id}-heading`}
                    className="h-[21px] px-2 pb-1 text-[11px] font-semibold tracking-wide uppercase"
                    style={group.color ? { color: group.color } : undefined}
                  >
                    <span className={group.color ? undefined : "text-muted"}>
                      {group.name} — <span className="font-mono">{group.members.length}</span>
                    </span>
                  </h3>
                  <ul
                    className="relative"
                    style={{ height: group.members.length * MEMBER_ROW_HEIGHT }}
                  >
                    {group.members.slice(startIndex, endIndex).map((member, index) => {
                      const userId = member.user!.id;
                      const isOnline =
                        userId === selfId ? selfIsOnline : Boolean(onlineMembers[userId]);
                      return (
                        <MemberRow
                          key={userId}
                          guildId={guildId}
                          userId={userId}
                          roles={roles}
                          hasPresence={hasPresence}
                          isOffline={!isOnline}
                          top={(startIndex + index) * MEMBER_ROW_HEIGHT}
                          setSize={group.members.length}
                          selfPresence={userId === selfId ? selfPresence : undefined}
                          onOpen={setOpenUserId}
                        />
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
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
});
