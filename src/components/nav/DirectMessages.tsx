"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { BotTag } from "@/components/ui/BotTag";
import { Spinner } from "@/components/ui/Spinner";
import { UserPanel } from "@/components/UserPanel";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { DiscordHTTPError } from "@/lib/discord/rest";
import { useClient } from "@/lib/store/client";
import { scanGuildDMs, type DMScanProgress } from "./dmScan";
import {
  forgetDM,
  getDMs,
  getServerDMs,
  setDMNote,
  subscribeDMs,
  type StoredDM,
} from "./dmStore";

export type { StoredDM };

export interface DirectMessagesProps {
  /** Called after a DM was opened or picked; the store selection happens either way. */
  onSelect?: (channelId: string) => void;
  className?: string;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

function formatDay(value: number | undefined): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", DATE_FORMAT).format(new Date(value));
}

/**
 * DM view. Bot tokens have no "list my DMs" endpoint, so the opened channels are
 * remembered locally, together with everything known about the recipient at the
 * time — the bot cannot look them up again once they share no server.
 */
export function DirectMessages({ onSelect, className }: DirectMessagesProps) {
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectChannel = useClient((state) => state.selectChannel);
  const openDM = useClient((state) => state.openDM);

  // localStorage is only readable in the browser; the server snapshot is empty.
  const entries = useSyncExternalStore(subscribeDMs, getDMs, getServerDMs);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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
      const channelId = await openDM(recipientId);
      setUserId("");
      onSelect?.(channelId);
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
    forgetDM(channelId);
    if (expanded === channelId) setExpanded(null);
  }

  return (
    <section
      aria-label="Direct messages"
      className={`flex min-h-0 w-60 shrink-0 flex-col bg-panel ${className ?? ""}`}
    >
      <header className="flex h-12 shrink-0 items-center px-4 shadow-[0_1px_0_rgba(0,0,0,0.2),0_2px_0_rgba(0,0,0,0.05)]">
        <h2 className="text-[15px] font-semibold text-bright">Direct messages</h2>
      </header>

      <form onSubmit={handleSubmit} className="flex shrink-0 flex-col gap-2 px-3 py-3">
        <label className="flex flex-col gap-1 text-[11px] font-bold tracking-wide text-muted uppercase">
          Start a DM by user ID
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            inputMode="numeric"
            placeholder="123456789012345678"
            className="rounded bg-ink px-2 py-1.5 font-mono text-sm font-normal tracking-normal text-text normal-case transition-shadow outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {busy && <Spinner size={14} />}
          {busy ? "Opening…" : "Open DM"}
        </button>
        {error && <p className="animate-fade-in text-xs leading-relaxed text-danger">{error}</p>}
      </form>

      <DMScanner />

      <div className="min-h-0 flex-1 animate-sidebar-in overflow-y-auto px-2 pb-2">
        {entries.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-muted">
            Discord gives bot tokens no DM list, so only the conversations you open here show up.
            Opened DMs — and what is known about the person — are kept in this browser’s
            <span className="font-mono text-amber"> localStorage</span> (
            <span className="font-mono">disbotclient:dms</span>). Nothing is sent anywhere else.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {entries.map((entry) => {
              const active = entry.channelId === selectedChannelId;
              const isOpen = expanded === entry.channelId;
              const handle = entry.username
                ? `@${entry.username}${entry.discriminator && entry.discriminator !== "0" ? `#${entry.discriminator}` : ""}`
                : entry.recipientId;

              return (
                <li key={entry.channelId} className="group">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => open(entry.channelId)}
                      aria-current={active ? "true" : undefined}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors ${
                        active ? "bg-raised text-bright" : "text-muted hover:bg-hover hover:text-text"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={userAvatarUrl({ id: entry.recipientId, avatar: entry.avatar }, 32)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full"
                      />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-medium">{entry.name}</span>
                          <BotTag
                            user={{ bot: entry.bot, public_flags: entry.publicFlags }}
                            size="sm"
                          />
                        </span>
                        <span className="block truncate text-[11px] text-faint">{handle}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : entry.channelId)}
                      aria-expanded={isOpen}
                      aria-label={`Details of ${entry.name}`}
                      className="shrink-0 rounded px-1.5 py-1 text-xs text-muted opacity-0 transition-opacity hover:text-bright group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                    >
                      <span aria-hidden>ⓘ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(entry.channelId)}
                      aria-label={`Remove the DM with ${entry.name}`}
                      title="Remove from Direct Messages"
                      className="shrink-0 rounded px-1.5 py-1 text-sm leading-none text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </div>

                  {isOpen && (
                    <dl className="mt-1 mb-2 animate-fade-in rounded bg-ink px-3 py-2 text-[11px] leading-relaxed">
                      <Detail label="User ID">
                        <span className="font-mono break-all">{entry.recipientId}</span>
                      </Detail>
                      {entry.globalName && <Detail label="Display name">{entry.globalName}</Detail>}
                      {entry.username && (
                        <Detail label="Username">
                          <span className="font-mono">{handle}</span>
                        </Detail>
                      )}
                      {entry.nick && <Detail label="Nickname">{entry.nick}</Detail>}
                      {entry.guildName && <Detail label="Met in">{entry.guildName}</Detail>}
                      {entry.roles && entry.roles.length > 0 && (
                        <Detail label="Roles">{entry.roles.join(", ")}</Detail>
                      )}
                      <Detail label="First opened">{formatDay(entry.openedAt)}</Detail>
                      <Detail label="Last opened">{formatDay(entry.lastUsedAt)}</Detail>

                      <div className="mt-2 border-t border-line pt-2">
                        <label className="block text-[10px] font-bold tracking-wide text-muted uppercase">
                          Note
                          <input
                            defaultValue={entry.note ?? ""}
                            placeholder="Why you are talking to them"
                            onBlur={(event) => setDMNote(entry.channelId, event.target.value)}
                            className="mt-1 w-full rounded bg-panel px-2 py-1 text-[11px] font-normal tracking-normal text-text normal-case outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => remove(entry.channelId)}
                          className="mt-2 rounded px-1 text-[11px] text-muted transition-colors hover:text-danger"
                        >
                          Remove this conversation
                        </button>
                      </div>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <UserPanel />
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-text">{children}</dd>
    </div>
  );
}

/** Every server, or one picked by id. */
const ALL_GUILDS = "all";

/**
 * Looks through the members of the bot's servers for DMs it already has, so a
 * conversation started elsewhere (or in another browser) shows up here too.
 */
function DMScanner() {
  const guilds = useClient((state) => state.guilds);
  const guildOrder = useClient((state) => state.guildOrder);
  const selfId = useClient((state) => state.user?.id);
  const getRest = useClient((state) => state.getRest);

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(ALL_GUILDS);
  const [progress, setProgress] = useState<DMScanProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  // A scan must not outlive the panel (or the bot) that started it.
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    controller.current?.abort();
  }, [selfId]);

  async function start() {
    if (!selfId) return;
    const picked = (target === ALL_GUILDS ? guildOrder : [target])
      .map((id) => guilds[id])
      .filter(Boolean);
    if (picked.length === 0) return;

    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setResult(null);
    setProgress(null);
    try {
      const done = await scanGuildDMs(getRest(), picked, selfId, {
        signal: abort.signal,
        onProgress: setProgress,
      });
      setResult(`Checked ${done.checked} members, found ${done.found} new DMs.`);
    } catch (cause) {
      if (abort.signal.aborted) {
        setResult("Stopped. DMs found so far were kept.");
      } else if (cause instanceof DiscordHTTPError && cause.status === 403) {
        setResult(
          "Discord refused the member list. Turn on the Server Members intent for this bot in the Developer Portal.",
        );
      } else {
        setResult(cause instanceof Error ? cause.message : "The scan failed.");
      }
    } finally {
      if (controller.current === abort) controller.current = null;
      setRunning(false);
    }
  }

  return (
    <div className="shrink-0 px-3 pb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="text-[11px] font-bold tracking-wide text-muted uppercase transition-colors hover:text-text"
      >
        {open ? "▾" : "▸"} Find existing DMs
      </button>

      {open && (
        <div className="mt-2 flex animate-fade-in flex-col gap-2">
          <p className="text-[11px] leading-relaxed text-faint">
            Opens a DM with every member of the chosen servers and lists the ones that already
            have messages. Large servers take a while because of Discord&apos;s rate limits.
          </p>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={running}
            aria-label="Servers to search"
            className="rounded bg-ink px-2 py-1.5 text-sm text-text outline-none focus:shadow-[0_0_0_1px_var(--accent)] disabled:opacity-60"
          >
            <option value={ALL_GUILDS}>All servers</option>
            {guildOrder.map((id) =>
              guilds[id] ? (
                <option key={id} value={id}>
                  {guilds[id].name}
                </option>
              ) : null,
            )}
          </select>
          {running ? (
            <button
              type="button"
              onClick={() => controller.current?.abort()}
              className="rounded bg-raised px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-hover"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={!selfId || guildOrder.length === 0}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              Search
            </button>
          )}
          {running && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Spinner size={12} />
              <span className="min-w-0 truncate">
                {progress
                  ? `${progress.guildName}: ${progress.checked} checked, ${progress.found} found`
                  : "Starting…"}
              </span>
            </p>
          )}
          {result && !running && (
            <p className="animate-fade-in text-xs leading-relaxed text-muted">{result}</p>
          )}
        </div>
      )}
    </div>
  );
}
