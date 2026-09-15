/**
 * Opened DM channels, persisted in localStorage.
 *
 * Bot tokens have no endpoint that lists existing DMs, so the only way to show a
 * DM list is to remember the channels this browser opened. Exposed as an external
 * store so several panels stay in sync and server rendering sees an empty list.
 */

export const DM_STORAGE_KEY = "disbotclient:dms";

export interface StoredDM {
  /** DM channel id — this is what gets selected. */
  channelId: string;
  recipientId: string;
  name: string;
  avatar: string | null;
  openedAt: number;
}

const EMPTY: StoredDM[] = [];
let cache: StoredDM[] = EMPTY;
let cacheSource: string | null = null;
const listeners = new Set<() => void>();

export function subscribeDMs(listener: () => void) {
  listeners.add(listener);
  // Another tab may write the same key.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Must return a stable reference while the stored JSON is unchanged. */
export function getDMs(): StoredDM[] {
  const raw = localStorage.getItem(DM_STORAGE_KEY);
  if (raw === cacheSource) return cache;
  cacheSource = raw;
  cache = parse(raw);
  return cache;
}

export function getServerDMs(): StoredDM[] {
  return EMPTY;
}

export function setDMs(next: StoredDM[]) {
  localStorage.setItem(DM_STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

function parse(raw: string | null): StoredDM[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter(
      (item): item is StoredDM =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as StoredDM).channelId === "string" &&
        typeof (item as StoredDM).recipientId === "string",
    );
  } catch {
    return EMPTY;
  }
}
