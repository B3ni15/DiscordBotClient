/**
 * Threads the user opened, per bot, persisted in localStorage and mirrored to
 * the vault. They stay in the sidebar under their channel until closed, even
 * after Discord archives them or the page is reloaded.
 */

export const OPEN_THREADS_STORAGE_KEY = "disbotclient:open-threads";

const MAX_PER_BOT = 50;

export interface OpenThread {
  id: string;
  guildId: string;
  parentId: string;
  name: string;
}

export interface OpenThreadsRecord {
  threads: OpenThread[];
  /** Last local change; the newer copy wins when two devices disagree. */
  updatedAt: number;
}

/** `botId -> record`. */
export type OpenThreadsState = Record<string, OpenThreadsRecord>;

const EMPTY: OpenThreadsState = {};
let cache: OpenThreadsState = EMPTY;
let cacheSource: string | null = null;
const listeners = new Set<() => void>();

export function subscribeOpenThreads(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === OPEN_THREADS_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Every bot's open threads. Stable while the stored JSON is unchanged. */
export function getOpenThreadsState(): OpenThreadsState {
  if (typeof localStorage === "undefined") return EMPTY;
  const raw = localStorage.getItem(OPEN_THREADS_STORAGE_KEY);
  if (raw === cacheSource) return cache;
  cacheSource = raw;
  cache = parse(raw);
  return cache;
}

const NONE: OpenThread[] = [];

export function getOpenThreads(botId: string | null | undefined): OpenThread[] {
  return (botId && getOpenThreadsState()[botId]?.threads) || NONE;
}

function write(next: OpenThreadsState) {
  const serialized = JSON.stringify(next);
  if (serialized === (localStorage.getItem(OPEN_THREADS_STORAGE_KEY) ?? "{}")) return;
  try {
    localStorage.setItem(OPEN_THREADS_STORAGE_KEY, serialized);
  } catch {
    return;
  }
  cacheSource = null;
  for (const listener of listeners) listener();
}

function update(botId: string, threads: OpenThread[]) {
  write({
    ...getOpenThreadsState(),
    [botId]: { threads: threads.slice(0, MAX_PER_BOT), updatedAt: Date.now() },
  });
}

/** Adds the thread, or refreshes its name and parent when it is already open. */
export function openThread(botId: string, thread: OpenThread) {
  const current = getOpenThreads(botId);
  const existing = current.find((entry) => entry.id === thread.id);
  if (
    existing &&
    existing.name === thread.name &&
    existing.parentId === thread.parentId &&
    existing.guildId === thread.guildId
  ) {
    return;
  }
  update(botId, [thread, ...current.filter((entry) => entry.id !== thread.id)]);
}

export function closeThread(botId: string, threadId: string) {
  const current = getOpenThreads(botId);
  if (!current.some((entry) => entry.id === threadId)) return;
  update(
    botId,
    current.filter((entry) => entry.id !== threadId),
  );
}

/** Folds the vault's copy in: per bot, whichever list changed last wins. */
export function mergeOpenThreads(other: OpenThreadsState) {
  const state = getOpenThreadsState();
  let next: OpenThreadsState | null = null;
  for (const [botId, record] of Object.entries(other)) {
    if (record.updatedAt > (state[botId]?.updatedAt ?? 0)) {
      next = { ...(next ?? state), [botId]: record };
    }
  }
  if (next) write(next);
}

function parse(raw: string | null): OpenThreadsState {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return EMPTY;
    const result: OpenThreadsState = {};
    for (const [botId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = sanitize(value);
      if (record) result[botId] = record;
    }
    return result;
  } catch {
    return EMPTY;
  }
}

/** Validates one bot's record, whether read from storage or from the vault. */
export function sanitize(value: unknown): OpenThreadsRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const { threads, updatedAt } = value as Partial<OpenThreadsRecord>;
  if (!Array.isArray(threads) || typeof updatedAt !== "number") return null;
  return {
    updatedAt,
    threads: threads
      .filter(
        (thread): thread is OpenThread =>
          !!thread &&
          typeof thread.id === "string" &&
          typeof thread.guildId === "string" &&
          typeof thread.parentId === "string" &&
          typeof thread.name === "string",
      )
      .slice(0, MAX_PER_BOT),
  };
}
