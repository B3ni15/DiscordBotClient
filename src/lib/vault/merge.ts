/**
 * Three-way merge between this browser's copy of a collection and the vault's.
 *
 * The third party is the *base*: every record as it was the last time this
 * browser and the vault agreed, kept in localStorage. With it a missing record
 * can be told apart from a new one — gone from the vault but in the base means
 * another device deleted it, so it goes here too; gone from here but in the base
 * means it was deleted here, so its vault row is removed. Whenever the two sides
 * disagree and this browser has not changed the record since the last sync, the
 * vault's version wins.
 */

interface StoredBase {
  /** The account the base was recorded for; another account's base is ignored. */
  accountId: string;
  entries: Record<string, string>;
}

/** The base for `accountId`, or null when this browser has never synced it. */
export function loadBase(storageKey: string, accountId: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBase;
    if (parsed?.accountId !== accountId || typeof parsed.entries !== "object" || !parsed.entries) {
      return null;
    }
    return parsed.entries;
  } catch {
    return null;
  }
}

export function saveBase(storageKey: string, accountId: string, entries: Record<string, string>) {
  const stored: StoredBase = { accountId, entries };
  localStorage.setItem(storageKey, JSON.stringify(stored));
}

export interface MergeResult<T> {
  /** The collection as this browser should hold it from now on. */
  local: T[];
  /** Records the vault is missing, or holds in an older form. */
  push: T[];
  /** Ids whose vault rows have to go. */
  remove: string[];
  /** Ids dropped here because another device deleted them. */
  dropped: string[];
  /** What both sides hold once `push` and `remove` are applied: the next base. */
  base: Record<string, string>;
}

export function threeWayMerge<T>(
  local: T[],
  remote: T[],
  base: Record<string, string> | null,
  idOf: (record: T) => string,
  /** Records deleted here that the vault may still hold, even with no base yet. */
  deletedLocally: (id: string, remote: T) => boolean = () => false,
): MergeResult<T> {
  const localById = new Map(local.map((record) => [idOf(record), record]));
  const remoteById = new Map(remote.map((record) => [idOf(record), record]));
  // Without a base the vault is the authority — unless it is still empty, in
  // which case this browser's collection becomes its first contents.
  const vaultIsEmpty = remoteById.size === 0;

  const result: MergeResult<T> = { local: [], push: [], remove: [], dropped: [], base: {} };
  const keep = (id: string, record: T) => {
    result.local.push(record);
    result.base[id] = JSON.stringify(record);
  };

  for (const [id, mine] of localById) {
    const theirs = remoteById.get(id);
    const known = base?.[id];
    if (theirs !== undefined) {
      const mineJson = JSON.stringify(mine);
      const theirsJson = JSON.stringify(theirs);
      if (mineJson === theirsJson || base === null || known !== theirsJson || known === mineJson) {
        // Equal, or the vault changed it, or both did: the vault's copy wins.
        keep(id, theirs);
      } else {
        // Only this browser changed it since the last sync.
        keep(id, mine);
        result.push.push(mine);
      }
    } else if (base === null ? vaultIsEmpty : known === undefined) {
      // New here.
      keep(id, mine);
      result.push.push(mine);
    } else {
      // The vault no longer has it: deleted on another device.
      result.dropped.push(id);
    }
  }

  for (const [id, theirs] of remoteById) {
    if (localById.has(id)) continue;
    if ((base !== null && base[id] !== undefined) || deletedLocally(id, theirs)) {
      // Deleted here since the last sync.
      result.remove.push(id);
    } else {
      // New in the vault.
      keep(id, theirs);
    }
  }

  return result;
}
