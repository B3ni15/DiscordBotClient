"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { searchMessages, type SearchOutcome } from "@/lib/discord/navApi";
import { useClient } from "@/lib/store/client";
import { jumpToMessage } from "./jumpToMessage";

export interface SearchPanelProps {
  /** Guild to search in. Defaults to the selected guild. */
  guildId?: string;
  /** Channel used when the scope is limited to one channel. Defaults to the selection. */
  channelId?: string;
  /** Replaces the default DOM-based jump. */
  onJump?: (messageId: string, channelId: string) => void;
  onClose?: () => void;
  className?: string;
}

/** Message search with a client-side fallback over the already loaded history. */
export function SearchPanel({ guildId, channelId, onJump, onClose, className }: SearchPanelProps) {
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const channelsByGuild = useClient((state) => state.channelsByGuild);
  const channelsById = useClient((state) => state.channelsById);
  const messagesByChannel = useClient((state) => state.messagesByChannel);
  const selectChannel = useClient((state) => state.selectChannel);
  const getRest = useClient((state) => state.getRest);

  const guild = guildId ?? selectedGuildId;
  const channel = channelId ?? selectedChannelId;

  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [onlyThisChannel, setOnlyThisChannel] = useState(true);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /** Everything already in the store that falls inside the chosen scope. */
  const loaded = useMemo(() => {
    const ids =
      onlyThisChannel && channel
        ? [channel]
        : guild
          ? (channelsByGuild[guild] ?? [])
          : Object.keys(messagesByChannel);
    return ids
      .flatMap((id) => messagesByChannel[id] ?? [])
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }, [onlyThisChannel, channel, guild, channelsByGuild, messagesByChannel]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() && !author.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await searchMessages(getRest(), guild, loaded, {
        content: content.trim() || undefined,
        authorId: author.trim() || undefined,
        channelId: onlyThisChannel ? (channel ?? undefined) : undefined,
      });
      setOutcome(result);
    } finally {
      setBusy(false);
    }
  }

  function handleJump(message: APIMessage) {
    const target = message.channel_id;
    if (onJump) {
      onJump(message.id, target);
      return;
    }
    if (target !== selectedChannelId) void selectChannel(target);
    // Give the chat panel a frame to render before looking for the row.
    window.setTimeout(() => {
      setNotice(
        jumpToMessage(message.id)
          ? null
          : "Az üzenet nincs a kirajzolt előzményben — görgess feljebb a csatornában.",
      );
    }, 120);
  }

  return (
    <aside
      aria-label="Keresés"
      className={`flex min-h-0 w-80 shrink-0 flex-col border-l border-line bg-panel ${className ?? ""}`}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h2 className="text-xs font-semibold text-muted">Keresés</h2>
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
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-b border-line px-4 py-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Szöveg
          <input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Keresett kifejezés"
            className="rounded border border-line bg-raised px-2 py-1.5 text-sm text-text placeholder:text-muted"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Szerző (ID vagy név)
          <input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="pl. 123456789012345678"
            className="rounded border border-line bg-raised px-2 py-1.5 font-mono text-sm text-text placeholder:text-muted"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={onlyThisChannel}
            onChange={(event) => setOnlyThisChannel(event.target.checked)}
          />
          Csak az aktuális csatornában
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent/15 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? "Keresés…" : "Keresés"}
        </button>
        <p className="text-[11px] leading-relaxed text-muted">
          A Discord szerveroldali keresője bot tokennel nem érhető el, ezért a találatok a már
          betöltött előzményből származnak. Görgess feljebb a csatornában, ha régebbi üzenetek közt
          is keresnél.
        </p>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {notice && <p className="px-2 pb-2 text-xs leading-relaxed text-amber">{notice}</p>}

        {outcome === null ? (
          <p className="px-2 text-xs text-muted">Adj meg keresési feltételt.</p>
        ) : (
          <>
            <p className="px-2 pb-2 text-[11px] leading-relaxed text-muted">
              <span className="font-mono">{outcome.messages.length}</span> találat
              {outcome.local
                ? ` — helyi keresés a betöltött ${loaded.length} üzenet között.`
                : " — szerveroldali keresés."}
              {outcome.reason && <span className="block text-amber">{outcome.reason}</span>}
            </p>
            {outcome.messages.length === 0 ? (
              <p className="px-2 text-xs leading-relaxed text-muted">Nincs találat.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {outcome.messages.map((message) => {
                  const origin = channelsById[message.channel_id];
                  const originName = origin && "name" in origin ? origin.name : message.channel_id;
                  return (
                    <li key={message.id}>
                      <button
                        type="button"
                        onClick={() => handleJump(message)}
                        className="w-full rounded px-2 py-2 text-left transition-colors hover:bg-raised/60"
                      >
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-xs font-semibold">
                            {message.author.global_name ?? message.author.username}
                          </span>
                          <span className="truncate text-[10px] text-muted">#{originName}</span>
                          <time
                            dateTime={message.timestamp}
                            className="ml-auto shrink-0 font-mono text-[10px] text-muted"
                          >
                            {new Date(message.timestamp).toLocaleDateString("hu-HU")}
                          </time>
                        </span>
                        <span className="mt-0.5 line-clamp-3 block text-xs leading-relaxed break-words text-muted">
                          {message.content || "(nincs szöveges tartalom)"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
