"use client";

/**
 * Keeps the unlocked vault key on this device, so a passkey prompt is not
 * needed on every reload.
 *
 * IndexedDB stores the `CryptoKey` object itself rather than its bytes, and the
 * key is scoped to the account that unlocked it. This is a convenience, not a
 * second line of defence: anyone who can run scripts in this browser profile
 * could use the key. What it does buy is that the key is still never sent
 * anywhere — the server, and the database behind it, stay unable to read a thing.
 */

const DB_NAME = "disbotclient-vault";
const STORE = "keys";
const RECORD = "vaultKey";

interface StoredKey {
  id: string;
  userId: string;
  key: CryptoKey;
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // A private window or blocked storage is not an error worth surfacing.
    request.onerror = () => resolve(null);
  });
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open().then(
    (database) =>
      new Promise<T | null>((resolve) => {
        if (!database) return resolve(null);
        try {
          const request = run(database.transaction(STORE, mode).objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function rememberKey(userId: string, key: CryptoKey): Promise<void> {
  await transact("readwrite", (store) =>
    store.put({ id: RECORD, userId, key } satisfies StoredKey),
  );
}

/** The key this device remembers for the account, if it is still the same one. */
export async function recallKey(userId: string): Promise<CryptoKey | null> {
  const record = (await transact<StoredKey>("readonly", (store) => store.get(RECORD))) as
    | StoredKey
    | null;
  if (!record || record.userId !== userId) return null;
  return record.key ?? null;
}

export async function forgetKey(): Promise<void> {
  await transact("readwrite", (store) => store.delete(RECORD));
}
