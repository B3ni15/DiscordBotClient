"use client";

import { useEffect, useState } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { navApi } from "@/lib/discord/navApi";
import { useClient } from "@/lib/store/client";
import { jumpToMessage } from "./jumpToMessage";

export interface PinnedPanelProps {
  /** Channel to read pins from. Defaults to the selected channel. */
  channelId?: string;
  /** Replaces the default DOM-based jump. */
  onJump?: (messageId: string, channelId: string) => void;
  onClose?: () => void;
  className?: string;
}

interface Loaded {
  /** Identifies the request this result belongs to. */
  key: string;
  messages: APIMessage[];
  error: string | null;
}

/** Side panel listing the pinned messages of a channel. */
export function PinnedPanel({ channelId, onJump, onClose, className }: PinnedPanelProps) {
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const getRest = useClient((state) => state.getRest);
  const token = useClient((state) => state.token);

  const target = channelId ?? selectedChannelId;

  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Results carry the key they were fetched for, so a stale answer is simply ignored.
  const key = `${target ?? ""}:${token ? "1" : "0"}:${nonce}`;

  useEffect(() => {
    if (!target || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const pins = await navApi.pinnedMessages(getRest(), target);
        if (!cancelled) setLoaded({ key, messages: pins, error: null });
      } catch (cause) {
        if (cancelled) return;
        setLoaded({
          key,
          messages: [],
          error:
            cause instanceof Error ? cause.message : "Nem sikerült lekérni a pinelt üzeneteket.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, token, getRest, key]);

  const current = loaded?.key === key ? loaded : null;
  const loading = target !== null && token !== null && current === null;

  function handleJump(message: APIMessage) {
    if (!target) return;
    if (onJump) {
      onJump(message.id, target);
      return;
    }
    setNotice(
      jumpToMessage(message.id)
        ? null
        : "Az üzenet nincs a betöltött előzményben — görgess feljebb, majd próbáld újra.",
    );
  }

  return (
    <aside
      aria-label="Pinelt üzenetek"
      className={`flex min-h-0 w-72 shrink-0 flex-col border-l border-line bg-panel ${className ?? ""}`}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h2 className="text-xs font-semibold text-muted">Pinelt üzenetek</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="text-xs text-accent hover:underline"
          >
            Frissítés
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Panel bezárása"
              className="text-muted hover:text-text"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {current?.error && (
          <p className="px-2 pb-2 text-xs leading-relaxed text-danger">{current.error}</p>
        )}
        {notice && <p className="px-2 pb-2 text-xs leading-relaxed text-amber">{notice}</p>}

        {!target ? (
          <p className="px-2 text-xs text-muted">Válassz csatornát.</p>
        ) : loading ? (
          <p className="px-2 text-xs text-muted">Betöltés…</p>
        ) : current!.messages.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-muted">
            Ebben a csatornában nincs pinelt üzenet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {current!.messages.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  onClick={() => handleJump(message)}
                  className="flex w-full gap-2 rounded px-2 py-2 text-left transition-colors hover:bg-raised/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={userAvatarUrl(message.author, 32)}
                    alt=""
                    className="mt-0.5 h-6 w-6 shrink-0 rounded-full"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-xs font-semibold">
                        {message.author.global_name ?? message.author.username}
                      </span>
                      <time
                        dateTime={message.timestamp}
                        className="shrink-0 font-mono text-[10px] text-muted"
                      >
                        {new Date(message.timestamp).toLocaleDateString("hu-HU")}
                      </time>
                    </span>
                    <span className="mt-0.5 line-clamp-3 block text-xs leading-relaxed break-words text-muted">
                      {message.content || "(nincs szöveges tartalom)"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
