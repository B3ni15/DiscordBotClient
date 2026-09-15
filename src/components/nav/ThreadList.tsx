"use client";

import { useEffect, useState } from "react";
import type { APIChannel } from "discord-api-types/v10";
import { navApi } from "@/lib/discord/navApi";
import { useClient } from "@/lib/store/client";

export interface ThreadListProps {
  /** Parent channel whose threads are listed. Defaults to the selected channel. */
  channelId?: string;
  /** Guild to query. Defaults to the selected guild. */
  guildId?: string;
  /** Called after a thread was picked; the store selection happens either way. */
  onSelect?: (threadId: string) => void;
  className?: string;
}

interface Loaded {
  /** Identifies the request this result belongs to. */
  key: string;
  threads: APIChannel[];
  error: string | null;
}

/** Active threads of one channel. A thread is a channel, so picking one selects it. */
export function ThreadList({ channelId, guildId, onSelect, className }: ThreadListProps) {
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectChannel = useClient((state) => state.selectChannel);
  const getRest = useClient((state) => state.getRest);
  const token = useClient((state) => state.token);

  const guild = guildId ?? selectedGuildId;
  const parent = channelId ?? selectedChannelId;

  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Results carry the key they were fetched for, so a stale answer is simply ignored.
  const key = `${guild ?? ""}:${token ? "1" : "0"}:${nonce}`;

  useEffect(() => {
    if (!guild || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await navApi.activeThreads(getRest(), guild);
        if (!cancelled) setLoaded({ key, threads: result.threads ?? [], error: null });
      } catch (cause) {
        if (cancelled) return;
        setLoaded({
          key,
          threads: [],
          error: cause instanceof Error ? cause.message : "Could not load threads. Try refreshing.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guild, token, getRest, key]);

  const current = loaded?.key === key ? loaded : null;
  const loading = guild !== null && token !== null && current === null;

  async function join(threadId: string) {
    setJoining(threadId);
    setJoinError(null);
    try {
      await navApi.joinThread(getRest(), threadId);
    } catch (cause) {
      setJoinError(cause instanceof Error ? cause.message : "Could not join the thread. Try again.");
    } finally {
      setJoining(null);
    }
  }

  function open(threadId: string) {
    void selectChannel(threadId);
    onSelect?.(threadId);
  }

  const visible = (current?.threads ?? []).filter(
    (thread) => !parent || ("parent_id" in thread && thread.parent_id === parent),
  );
  const error = current?.error ?? joinError;

  return (
    <section
      aria-label="Threads"
      className={`flex min-h-0 flex-col bg-panel ${className ?? ""}`}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h2 className="text-xs font-semibold text-muted">Threads</h2>
        <button
          type="button"
          onClick={() => setNonce((value) => value + 1)}
          className="text-xs text-accent hover:underline"
        >
          Refresh
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {error && <p className="px-2 pb-2 text-xs leading-relaxed text-danger">{error}</p>}

        {!guild ? (
          <p className="px-2 text-xs text-muted">Select a server to see its threads.</p>
        ) : loading ? (
          <p className="px-2 text-xs text-muted">Loading threads…</p>
        ) : visible.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-muted">
            No active threads in this channel. Archived threads are not listed.
          </p>
        ) : (
          <ul>
            {visible.map((thread) => {
              const name = "name" in thread ? thread.name : null;
              const active = thread.id === selectedChannelId;
              const count = "message_count" in thread ? (thread.message_count ?? null) : null;
              return (
                <li key={thread.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => open(thread.id)}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                      active
                        ? "bg-raised text-text"
                        : "text-muted hover:bg-raised/60 hover:text-text"
                    }`}
                  >
                    <span aria-hidden className="text-muted">
                      ›
                    </span>
                    <span className="truncate">{name ?? thread.id}</span>
                    {count !== null && (
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
                        {count}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void join(thread.id)}
                    disabled={joining === thread.id}
                    title="Join this thread as the bot"
                    className="shrink-0 rounded px-1.5 py-1 text-[11px] text-muted opacity-0 transition-opacity hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                  >
                    {joining === thread.id ? "…" : "Join"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
