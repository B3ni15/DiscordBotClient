/**
 * Known DM channels, persisted in localStorage.
 *
 * Bot tokens have no endpoint that lists existing DMs, so the only way to show a
 * DM list is to remember the channels this browser opened. Exposed as an external
 * store so several panels stay in sync and server rendering sees an empty list.
 *
 * Everything worth knowing about the recipient is stored alongside the channel:
 * the bot cannot look a user up again once it no longer shares a server with
 * them, so the name, avatar, tag and where the DM was started from are kept here.
 */

export const DM_STORAGE_KEY = "disbotclient:dms";

/** What is known about a DM recipient at the moment the DM is opened. */
export interface DMUserInfo {
  username?: string;
  globalName?: string | null;
  discriminator?: string | null;
  avatar?: string | null;
  bot?: boolean;
  /** `public_flags`, so a verified application stays marked as one. */
  publicFlags?: number | null;
  /** Nickname in the server the DM was opened from. */
  nick?: string | null;
  /** The server the DM was started from, kept as context. */
  guildId?: string | null;
  guildName?: string | null;
  /** Role names in that server, for context on who this is. */
  roles?: string[];
}

export interface StoredDM extends DMUserInfo {
  /** DM channel id — this is what gets selected. */
  channelId: string;
  recipientId: string;
  /** Display name at the time the DM was opened. */
  name: string;
  avatar: string | null;
  /** First time this browser opened the DM. */
  openedAt: number;
  /** Last time it was opened or written to. */
  lastUsedAt: number;
  /** Free-text note the user can attach to the person. */
  note?: string;
}

interface DMChannel {
  id: string;
  /** 1 for a one-to-one DM, 3 for a group DM. */
  type?: number;
  recipients?: Array<{
    id: string;
    username?: string;
    global_name?: string | null;
    discriminator?: string | null;
    avatar?: string | null;
    bot?: boolean;
    public_flags?: number | null;
  }>;
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
  cacheSource = null;
  for (const listener of listeners) listener();
}

export function getDM(channelId: string): StoredDM | undefined {
  return getDMs().find((entry) => entry.channelId === channelId);
}

export function findDMByRecipient(recipientId: string): StoredDM | undefined {
  return getDMs().find((entry) => entry.recipientId === recipientId);
}

/**
 * Files a DM channel under Direct Messages, merging in anything newly learned
 * about the recipient. Details already stored are never dropped just because the
 * current payload is thinner — a `createDM` response, for instance, carries far
 * less than a guild member object.
 */
export function rememberDM(channel: DMChannel, about: DMUserInfo = {}): StoredDM | undefined {
  const recipient = channel.recipients?.[0];
  const current = getDMs();
  const byChannel = current.find((item) => item.channelId === channel.id);
  // A re-open of a known channel may arrive without a recipients array.
  const id = recipient?.id ?? byChannel?.recipientId;
  if (!id) return undefined;

  // One conversation per person: a group DM aside, a second channel id for the
  // same recipient replaces the old row instead of stacking a duplicate on it.
  const groupDM = channel.type === 3;
  const previous =
    byChannel ?? (groupDM ? undefined : current.find((item) => item.recipientId === id));

  const merged: DMUserInfo = {
    username: about.username ?? recipient?.username ?? previous?.username,
    globalName: about.globalName ?? recipient?.global_name ?? previous?.globalName ?? null,
    discriminator:
      about.discriminator ?? recipient?.discriminator ?? previous?.discriminator ?? null,
    avatar: about.avatar ?? recipient?.avatar ?? previous?.avatar ?? null,
    bot: about.bot ?? recipient?.bot ?? previous?.bot,
    publicFlags: about.publicFlags ?? recipient?.public_flags ?? previous?.publicFlags ?? null,
    nick: about.nick ?? previous?.nick ?? null,
    guildId: about.guildId ?? previous?.guildId ?? null,
    guildName: about.guildName ?? previous?.guildName ?? null,
    roles: about.roles ?? previous?.roles,
  };

  const now = Date.now();
  const entry: StoredDM = {
    ...merged,
    channelId: channel.id,
    recipientId: id,
    name: merged.nick || merged.globalName || merged.username || previous?.name || id,
    avatar: merged.avatar ?? null,
    openedAt: previous?.openedAt ?? now,
    lastUsedAt: now,
    note: previous?.note,
  };

  setDMs([
    entry,
    ...current.filter(
      (item) =>
        item.channelId !== entry.channelId &&
        (groupDM || item.recipientId !== entry.recipientId),
    ),
  ]);
  return entry;
}

/** Attaches (or clears) the free-text note kept with a DM. */
export function setDMNote(channelId: string, note: string) {
  const trimmed = note.trim();
  setDMs(
    getDMs().map((entry) =>
      entry.channelId === channelId ? { ...entry, note: trimmed || undefined } : entry,
    ),
  );
}

function parse(raw: string | null): StoredDM[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed
      .filter(
        (item): item is StoredDM =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as StoredDM).channelId === "string" &&
          typeof (item as StoredDM).recipientId === "string",
      )
      // Entries written by an older version have no lastUsedAt.
      .map((item) => ({ ...item, lastUsedAt: item.lastUsedAt ?? item.openedAt ?? 0 }));
  } catch {
    return EMPTY;
  }
}
