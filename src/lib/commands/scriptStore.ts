/**
 * Command handlers ("scripts"), persisted in localStorage.
 *
 * Every slash command can carry a piece of JavaScript that runs in this browser
 * whenever someone uses the command. A script belongs to one bot and is keyed
 * by the command's name, so it survives deleting and recreating the command, or
 * moving it between the global and a server scope.
 *
 * The stored array holds every bot's scripts; the vault sync mirrors it, and
 * removing a script here deletes its vault row as well.
 */

export const SCRIPT_STORAGE_KEY = "disbotclient:command-scripts";

/**
 * Upper bound for one script, in UTF-8 bytes. The vault accepts 64 KiB of
 * ciphertext per record, which this leaves room for after JSON, AES-GCM and
 * base64 have had their share.
 */
export const SCRIPT_MAX_BYTES = 40_000;

export interface StoredScript {
  botId: string;
  /** Command name, exactly as registered with Discord. */
  name: string;
  code: string;
  /** A disabled script is kept but never run; the interaction lands in the inbox. */
  enabled: boolean;
  updatedAt: number;
}

const EMPTY: StoredScript[] = [];
let cache: StoredScript[] = EMPTY;
let cacheSource: string | null = null;
const listeners = new Set<() => void>();

export function scriptKey(botId: string, name: string): string {
  return `${botId}:${name}`;
}

export function subscribeScripts(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SCRIPT_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

/** Every stored script, whichever bot it belongs to. Stable while the JSON is unchanged. */
export function getAllScripts(): StoredScript[] {
  if (typeof localStorage === "undefined") return EMPTY;
  const raw = localStorage.getItem(SCRIPT_STORAGE_KEY);
  if (raw === cacheSource) return cache;
  cacheSource = raw;
  cache = parse(raw);
  return cache;
}

export function getServerScripts(): StoredScript[] {
  return EMPTY;
}

/** Replaces the whole stored list — every bot's scripts, not just one bot's. */
export function setAllScripts(next: StoredScript[]) {
  const serialized = JSON.stringify(next);
  // Writing back exactly what is stored must not notify, or a sync that
  // listens for changes would keep re-triggering itself.
  if (serialized === (localStorage.getItem(SCRIPT_STORAGE_KEY) ?? "[]")) return;
  localStorage.setItem(SCRIPT_STORAGE_KEY, serialized);
  cacheSource = null;
  notify();
}

/** The script of one bot's command, if it has one. */
export function getScript(botId: string, name: string): StoredScript | undefined {
  return getAllScripts().find((entry) => entry.botId === botId && entry.name === name);
}

export function saveScript(botId: string, name: string, code: string, enabled: boolean) {
  const entry: StoredScript = { botId, name, code, enabled, updatedAt: Date.now() };
  setAllScripts([
    entry,
    ...getAllScripts().filter((item) => item.botId !== botId || item.name !== name),
  ]);
}

export function removeScript(botId: string, name: string) {
  setAllScripts(getAllScripts().filter((item) => item.botId !== botId || item.name !== name));
}

/** Size of a script as the vault will see it. */
export function scriptBytes(code: string): number {
  return new TextEncoder().encode(JSON.stringify(code)).length;
}

function parse(raw: string | null): StoredScript[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter(
      (item): item is StoredScript =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as StoredScript).botId === "string" &&
        typeof (item as StoredScript).name === "string" &&
        typeof (item as StoredScript).code === "string" &&
        typeof (item as StoredScript).updatedAt === "number",
    );
  } catch {
    return EMPTY;
  }
}
