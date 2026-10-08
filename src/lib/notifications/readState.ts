/**
 * Where each bot last read each channel, persisted in localStorage.
 *
 * A channel's marker is the id of the newest message that was on screen when
 * it was last looked at. Snowflakes grow with time, so "unread" is simply every
 * message with a larger id — which is what lets the client work out, after it
 * was closed for a while, everything that happened since.
 *
 * Markers only ever move forward. That makes merging two copies (another tab,
 * the vault) trivial: per channel, the larger id wins.
 */

export const READ_STATE_STORAGE_KEY = "disbotclient:read-state";

/** `botId -> channelId -> last read message id`. */
export type ReadState = Record<string, Record<string, string>>;

const EMPTY: ReadState = {};
let cache: ReadState = EMPTY;
let cacheSource: string | null = null;
const listeners = new Set<() => void>();

export function subscribeReadState(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === READ_STATE_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Every bot's markers. Stable while the stored JSON is unchanged. */
export function getReadState(): ReadState {
  if (typeof localStorage === "undefined") return EMPTY;
  const raw = localStorage.getItem(READ_STATE_STORAGE_KEY);
  if (raw === cacheSource) return cache;
  cacheSource = raw;
  cache = parse(raw);
  return cache;
}

function write(next: ReadState) {
  const serialized = JSON.stringify(next);
  if (serialized === (localStorage.getItem(READ_STATE_STORAGE_KEY) ?? "{}")) return;
  localStorage.setItem(READ_STATE_STORAGE_KEY, serialized);
  cacheSource = null;
  for (const listener of listeners) listener();
}

/** True when snowflake `a` is newer than `b`. */
export function isNewer(a: string, b: string | undefined | null): boolean {
  if (!b) return true;
  try {
    return BigInt(a) > BigInt(b);
  } catch {
    return false;
  }
}

export function getLastRead(botId: string, channelId: string): string | undefined {
  return getReadState()[botId]?.[channelId];
}

/** Moves the markers forward; an older id than the stored one is ignored. */
export function markRead(botId: string, marks: Record<string, string>) {
  const state = getReadState();
  const mine = state[botId] ?? {};
  let changed = false;
  const next = { ...mine };
  for (const [channelId, messageId] of Object.entries(marks)) {
    if (!isNewer(messageId, next[channelId])) continue;
    next[channelId] = messageId;
    changed = true;
  }
  if (changed) write({ ...state, [botId]: next });
}

/** Folds another copy in, keeping the newer marker for every channel. */
export function mergeReadState(other: ReadState) {
  const state = getReadState();
  const next: ReadState = { ...state };
  for (const [botId, marks] of Object.entries(other)) {
    const mine = { ...(next[botId] ?? {}) };
    for (const [channelId, messageId] of Object.entries(marks)) {
      if (typeof messageId === "string" && isNewer(messageId, mine[channelId])) {
        mine[channelId] = messageId;
      }
    }
    next[botId] = mine;
  }
  write(next);
}

function parse(raw: string | null): ReadState {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return EMPTY;
    const result: ReadState = {};
    for (const [botId, marks] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof marks !== "object" || marks === null) continue;
      result[botId] = Object.fromEntries(
        Object.entries(marks as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string" && /^\d+$/.test(entry[1]),
        ),
      );
    }
    return result;
  } catch {
    return EMPTY;
  }
}
