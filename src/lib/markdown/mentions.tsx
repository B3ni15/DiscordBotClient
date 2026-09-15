"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { emojiUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";
import { formatFullTimestamp, formatTimestamp, relativeRefreshMs } from "./timestamp";
import type { TimestampStyle } from "./types";

interface MarkdownContextValue {
  /** Guild the message belongs to; decides which member and role cache is used. */
  guildId: string | null;
}

const MarkdownContext = createContext<MarkdownContextValue>({ guildId: null });

export function MarkdownProvider({
  guildId,
  children,
}: {
  guildId: string | null;
  children: React.ReactNode;
}) {
  return <MarkdownContext.Provider value={{ guildId }}>{children}</MarkdownContext.Provider>;
}

export function useMarkdownContext() {
  return useContext(MarkdownContext);
}

const PILL = "rounded px-1 py-px font-medium transition-colors";

/** Shown when the cache cannot resolve an id, so the raw mention stays readable. */
function RawMention({ text }: { text: string }) {
  return <span className="rounded bg-raised px-1 font-mono text-[0.85em] text-muted">{text}</span>;
}

export function UserMention({ id }: { id: string }) {
  const { guildId } = useMarkdownContext();
  const name = useClient((state) => {
    if (state.user?.id === id) return state.user.global_name ?? state.user.username;
    const scoped = guildId ? [state.membersByGuild[guildId]] : Object.values(state.membersByGuild);
    for (const members of scoped) {
      const member = members?.[id];
      if (member) return member.nick ?? member.user?.global_name ?? member.user?.username ?? null;
    }
    return null;
  });

  if (!name) return <RawMention text={`<@${id}>`} />;
  return (
    <span className={`${PILL} bg-accent/15 text-accent hover:bg-accent/25`} title={id}>
      @{name}
    </span>
  );
}

export function RoleMention({ id }: { id: string }) {
  const { guildId } = useMarkdownContext();
  const name = useClient((state) => findRole(state.guilds, guildId, id)?.name ?? null);
  const color = useClient((state) => findRole(state.guilds, guildId, id)?.color ?? 0);

  if (!name) return <RawMention text={`<@&${id}>`} />;
  const hex = color ? `#${color.toString(16).padStart(6, "0")}` : null;
  return (
    <span
      className={PILL}
      title={id}
      style={
        hex
          ? { color: hex, backgroundColor: `${hex}26` }
          : undefined
      }
    >
      <span className={hex ? undefined : "text-accent"}>@{name}</span>
    </span>
  );
}

type Guilds = ReturnType<typeof useClient.getState>["guilds"];

function findRole(guilds: Guilds, guildId: string | null, roleId: string) {
  const search = guildId ? [guilds[guildId]] : Object.values(guilds);
  for (const guild of search) {
    const role = guild?.roles?.find((entry) => entry.id === roleId);
    if (role) return role;
  }
  return undefined;
}

export function ChannelMention({ id }: { id: string }) {
  const name = useClient((state) => {
    const channel = state.channelsById[id];
    return channel && "name" in channel ? (channel.name ?? null) : null;
  });
  const select = useClient((state) => state.selectChannel);
  const known = useClient((state) => state.channelsById[id] !== undefined);

  if (!name) return <RawMention text={`<#${id}>`} />;
  return (
    <button
      type="button"
      className={`${PILL} bg-accent/15 text-accent hover:bg-accent/25`}
      title={id}
      onClick={() => {
        if (known) void select(id);
      }}
    >
      #{name}
    </button>
  );
}

export function CommandMention({ name, id }: { name: string; id: string }) {
  return (
    <span className={`${PILL} bg-accent/15 text-accent`} title={id}>
      /{name}
    </span>
  );
}

export function BroadcastMention({ name }: { name: "everyone" | "here" }) {
  return <span className={`${PILL} bg-amber/15 text-amber`}>@{name}</span>;
}

export function Timestamp({ unix, style }: { unix: number; style: TimestampStyle }) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (style !== "R") return;
    const timer = setInterval(() => tick((value) => value + 1), relativeRefreshMs(unix));
    return () => clearInterval(timer);
  }, [style, unix]);

  return (
    <time
      // Server and client may sit in different time zones during export.
      suppressHydrationWarning
      dateTime={isoOrUndefined(unix)}
      title={formatFullTimestamp(unix)}
      className="rounded bg-raised px-1 py-px text-[0.95em]"
    >
      {formatTimestamp(unix, style)}
    </time>
  );
}

function isoOrUndefined(unix: number): string | undefined {
  const date = new Date(unix * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function CustomEmoji({
  name,
  id,
  animated,
}: {
  name: string;
  id: string;
  animated: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={emojiUrl(id, animated, 48)}
      alt={`:${name}:`}
      title={`:${name}:`}
      loading="lazy"
      className="inline-block h-[1.375em] w-[1.375em] align-[-0.3em] object-contain"
    />
  );
}
