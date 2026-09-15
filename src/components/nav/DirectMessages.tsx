"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { navApi } from "@/lib/discord/navApi";
import { useClient } from "@/lib/store/client";
import { getDMs, getServerDMs, rememberDM, setDMs, subscribeDMs, type StoredDM } from "./dmStore";

export type { StoredDM };

export interface DirectMessagesProps {
  /** Called after a DM was opened or picked; the store selection happens either way. */
  onSelect?: (channelId: string) => void;
  className?: string;
}

/**
 * DM view. Bot tokens have no "list my DMs" endpoint, so the opened channels are
 * remembered locally and re-listed from there.
 */
export function DirectMessages({ onSelect, className }: DirectMessagesProps) {
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectChannel = useClient((state) => state.selectChannel);
  const getRest = useClient((state) => state.getRest);

  // localStorage is only readable in the browser; the server snapshot is empty.
  const entries = useSyncExternalStore(subscribeDMs, getDMs, getServerDMs);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const recipientId = userId.trim();
    if (!/^\d{15,}$/.test(recipientId)) {
      setError("Enter a valid user ID (digits only).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const channel = await navApi.createDM(getRest(), recipientId);
      rememberDM(channel);
      setUserId("");
      open(channel.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not open the DM: ${cause.message}`
          : "Could not open the DM.",
      );
    } finally {
      setBusy(false);
    }
  }

  function open(channelId: string) {
    void selectChannel(channelId);
    onSelect?.(channelId);
  }

  function remove(channelId: string) {
    setDMs(entries.filter((item) => item.channelId !== channelId));
  }

  return (
    <section
      aria-label="Direct messages"
      className={`flex min-h-0 w-60 shrink-0 flex-col border-r border-line bg-panel ${className ?? ""}`}
    >
      <header className="flex h-12 shrink-0 items-center border-b border-line px-4">
        <h2 className="text-sm font-semibold">Direct messages</h2>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-b border-line px-3 py-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          User ID
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            inputMode="numeric"
            placeholder="123456789012345678"
            className="rounded border border-line bg-raised px-2 py-1.5 font-mono text-sm text-text placeholder:text-muted"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent/15 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? "Opening…" : "Open DM"}
        </button>
        {error && <p className="text-xs leading-relaxed text-danger">{error}</p>}
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {entries.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-muted">
            Discord gives bot tokens no DM list, so only the conversations you open here show up.
            Opened DMs are kept in this browser’s
            <span className="font-mono text-amber"> localStorage</span>
            (<span className="font-mono">disbotclient:dms</span>). Enter a user ID above to start one.
          </p>
        ) : (
          <ul>
            {entries.map((entry) => {
              const active = entry.channelId === selectedChannelId;
              return (
                <li key={entry.channelId} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => open(entry.channelId)}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                      active ? "bg-raised text-text" : "text-muted hover:bg-raised/60 hover:text-text"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={userAvatarUrl({ id: entry.recipientId, avatar: entry.avatar }, 32)}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{entry.name}</span>
                      <span className="block truncate font-mono text-[10px] text-muted">
                        {entry.recipientId}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(entry.channelId)}
                    aria-label="Remove from list"
                    className="shrink-0 px-1.5 py-1 text-xs text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    ✕
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
