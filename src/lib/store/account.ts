"use client";

import { create } from "zustand";
import {
  getAllDMs,
  getRemovedDMs,
  setAllDMs,
  setRemovedDMs,
  subscribeDMs,
  type StoredDM,
} from "@/components/nav/dmStore";
import {
  getAllScripts,
  scriptKey,
  setAllScripts,
  subscribeScripts,
  type StoredScript,
} from "@/lib/commands/scriptStore";
import {
  getReadState,
  mergeReadState,
  subscribeReadState,
  type ReadState,
} from "@/lib/notifications/readState";
import {
  getSettings,
  setSettings,
  subscribeSettings,
  type NotificationSettings,
} from "@/lib/notifications/settings";
import {
  vaultApi,
  type AccountUser,
  type WrapperSummary,
} from "@/lib/vault/api";
import {
  decryptJson,
  encryptJson,
  generateRecoveryCode,
  generateVaultKey,
  fromBase64Url,
  itemRef,
  keyFromPrf,
  keyFromSecretText,
  normalizeRecoveryCode,
  randomBytes,
  toBase64Url,
  unwrapVaultKey,
  wrapVaultKey,
  PBKDF2_ITERATIONS,
  type Bytes,
} from "@/lib/vault/crypto";
import { forgetKey, recallKey, rememberKey } from "@/lib/vault/deviceKey";
import { loadBase, saveBase, threeWayMerge } from "@/lib/vault/merge";
import { createPasskey, evaluatePrf, PasskeyError } from "@/lib/vault/passkey";

/** One bot this account can sign in as. The token is only ever stored encrypted. */
export interface SavedBot {
  /** The bot's own user id, which is what makes it unique. */
  id: string;
  name: string;
  avatar: string | null;
  discriminator: string | null;
  token: string;
  addedAt: number;
  lastUsedAt: number;
}

export type AccountStatus =
  /** Still asking the server who we are. */
  | "loading"
  /** This deployment has no database or no Discord app: local-only mode. */
  | "unavailable"
  | "signedOut"
  /** Signed in, but the vault has never been set up. */
  | "needsSetup"
  /** Signed in with a vault that this browser cannot open yet. */
  | "locked"
  | "unlocked";

interface AccountState {
  status: AccountStatus;
  user: AccountUser | null;
  wrappers: WrapperSummary[];
  bots: SavedBot[];
  error: string | null;
  busy: boolean;
  /** Shown once, right after it is generated; never stored in the clear. */
  freshRecoveryCode: string | null;

  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;

  /** First run: makes a vault key and locks it behind a passkey or a code. */
  setUpVault: (options: { passkey: boolean; passphrase?: string }) => Promise<void>;
  unlockWithPasskey: () => Promise<void>;
  unlockWithRecoveryCode: (code: string) => Promise<void>;
  unlockWithPassphrase: (passphrase: string) => Promise<void>;
  /** Forgets the key on this device without touching the account. */
  lock: () => Promise<void>;

  addPasskey: () => Promise<void>;
  addPassphrase: (passphrase: string) => Promise<void>;
  newRecoveryCode: () => Promise<string>;
  removeWrapper: (id: string) => Promise<void>;
  dismissRecoveryCode: () => void;

  /** Saves (or refreshes) a bot in the vault. */
  saveBot: (bot: Omit<SavedBot, "addedAt" | "lastUsedAt"> & { addedAt?: number }) => Promise<void>;
  removeBot: (id: string) => Promise<void>;
  markBotUsed: (id: string) => Promise<void>;
  /** Pushes this browser's DM list into the vault and merges what is there. */
  syncDMs: () => Promise<void>;
  /** Merges notification preferences with whatever the vault holds. */
  syncSettings: () => Promise<void>;
  /** Brings the bots' command scripts and the vault's copy into agreement. */
  syncScripts: () => Promise<void>;
  /** Merges where each channel was last read with the vault's copy. */
  syncReadState: () => Promise<void>;
}

/** The PRF output is already uniform, so HKDF needs no salt of its own. */
const EMPTY_SALT = new Uint8Array(new ArrayBuffer(0)) as Bytes;

/** Stops the live sync subscriptions; null while nothing is subscribed. */
let stopWatching: (() => void) | null = null;

/**
 * What the DM list and the preferences looked like the last time they matched
 * the vault. A change notification that leaves them equal to this (the sync's
 * own write, a bot switch, another tab echoing the same list) needs no request.
 */
let syncedDMs: string | null = null;
let syncedSettings: string | null = null;
let syncedScripts: string | null = null;
let syncedReadState: string | null = null;

/** The DM sync running right now, and whether another was asked for meanwhile. */
let dmSync: Promise<void> | null = null;
let dmSyncAgain = false;
let scriptSync: Promise<void> | null = null;
let scriptSyncAgain = false;

/** The vault key lives here, outside React state, and never in storage. */
let vaultKey: CryptoKey | null = null;

export function currentVaultKey(): CryptoKey | null {
  return vaultKey;
}

export const useAccount = create<AccountState>((set, get) => ({
  status: "loading",
  user: null,
  wrappers: [],
  bots: [],
  error: null,
  busy: false,
  freshRecoveryCode: null,

  refresh: async () => {
    try {
      const session = await vaultApi.session();
      if (!session.available) {
        set({ status: "unavailable", user: null, wrappers: [], bots: [] });
        return;
      }
      if (!session.user) {
        vaultKey = null;
        set({ status: "signedOut", user: null, wrappers: [], bots: [] });
        return;
      }

      set({ user: session.user, wrappers: session.wrappers, error: null });

      if (session.wrappers.length === 0) {
        set({ status: "needsSetup" });
        return;
      }

      // A device that has already unlocked once stays unlocked.
      const remembered = await recallKey(session.user.id);
      if (remembered) {
        vaultKey = remembered;
        set({ status: "unlocked" });
        await loadItems(set);
        await get().syncDMs();
        await get().syncSettings();
        await get().syncScripts();
        await get().syncReadState();
        startWatching(get);
        return;
      }
      set({ status: "locked" });
    } catch (cause) {
      set({ status: "unavailable", error: message(cause, "Could not reach the account service.") });
    }
  },

  signOut: async () => {
    stopWatching?.();
    stopWatching = null;
    await vaultApi.signOut().catch(() => {});
    await forgetKey();
    vaultKey = null;
    set({ status: "signedOut", user: null, wrappers: [], bots: [], error: null });
  },

  deleteAccount: async () => {
    set({ busy: true, error: null });
    try {
      stopWatching?.();
      stopWatching = null;
      await vaultApi.deleteAccount();
      await forgetKey();
      vaultKey = null;
      set({ status: "signedOut", user: null, wrappers: [], bots: [], busy: false });
    } catch (cause) {
      set({ busy: false, error: message(cause, "Could not delete the account.") });
      throw cause;
    }
  },

  setUpVault: async ({ passkey, passphrase }) => {
    const user = get().user;
    if (!user) return;
    set({ busy: true, error: null });
    try {
      const key = await generateVaultKey();

      if (passkey) {
        const created = await createPasskey({
          id: user.id,
          name: user.username,
          displayName: user.globalName ?? user.username,
        });
        const wrappingKey = await keyFromPrf(created.secret, EMPTY_SALT);
        await vaultApi.addWrapper({
          kind: "passkey",
          label: created.label,
          credentialId: created.credentialId,
          salt: created.salt,
          wrapped: await wrapVaultKey(key, wrappingKey),
        });
      }

      if (passphrase) {
        await addPassphraseWrapper(key, passphrase);
      }

      // The recovery code is the way back in when the passkey is gone.
      const code = await addRecoveryWrapper(key);

      vaultKey = key;
      await rememberKey(user.id, key);
      set({ status: "unlocked", busy: false, freshRecoveryCode: code });
      await refreshWrappers(set);
      await loadItems(set);
      // Whatever this browser already had becomes the vault's first contents.
      await get().syncDMs();
      await pushSettings();
      await get().syncScripts();
      await get().syncReadState();
      startWatching(get);
    } catch (cause) {
      vaultKey = null;
      set({ busy: false, error: message(cause, "Could not set the vault up.") });
      throw cause;
    }
  },

  unlockWithPasskey: async () => {
    const user = get().user;
    if (!user) return;
    set({ busy: true, error: null });
    try {
      const { wrappers } = await vaultApi.wrappers();
      const candidates = wrappers.filter(
        (wrapper) => wrapper.kind === "passkey" && wrapper.credentialId,
      );
      if (candidates.length === 0) {
        throw new PasskeyError("This account has no passkey yet.", true);
      }

      let lastError: unknown = null;
      for (const wrapper of candidates) {
        try {
          const secret = await evaluatePrf(wrapper.credentialId!, wrapper.salt);
          const wrappingKey = await keyFromPrf(secret, EMPTY_SALT);
          const key = await unwrapVaultKey(wrapper.wrapped, wrappingKey);
          await finishUnlock(set, get, user.id, key, wrapper.id);
          return;
        } catch (cause) {
          lastError = cause;
          // A dismissed prompt means the person changed their mind; stop here.
          if (cause instanceof PasskeyError && !cause.unsupported) break;
        }
      }
      throw lastError ?? new Error("None of the passkeys opened the vault.");
    } catch (cause) {
      set({ busy: false, error: message(cause, "The passkey did not unlock the vault.") });
      throw cause;
    }
  },

  unlockWithRecoveryCode: async (code) => {
    await unlockWithText(set, get, "recovery", normalizeRecoveryCode(code), "That recovery code did not work.");
  },

  unlockWithPassphrase: async (passphrase) => {
    await unlockWithText(set, get, "passphrase", passphrase, "That passphrase did not work.");
  },

  lock: async () => {
    stopWatching?.();
    stopWatching = null;
    await forgetKey();
    vaultKey = null;
    set({ status: "locked", bots: [] });
  },

  addPasskey: async () => {
    const user = get().user;
    if (!user || !vaultKey) return;
    set({ busy: true, error: null });
    try {
      const created = await createPasskey({
        id: user.id,
        name: user.username,
        displayName: user.globalName ?? user.username,
      });
      const wrappingKey = await keyFromPrf(created.secret, EMPTY_SALT);
      await vaultApi.addWrapper({
        kind: "passkey",
        label: created.label,
        credentialId: created.credentialId,
        salt: created.salt,
        wrapped: await wrapVaultKey(vaultKey, wrappingKey),
      });
      set({ busy: false });
      await refreshWrappers(set);
    } catch (cause) {
      set({ busy: false, error: message(cause, "Could not add the passkey.") });
      throw cause;
    }
  },

  addPassphrase: async (passphrase) => {
    if (!vaultKey) return;
    set({ busy: true, error: null });
    try {
      await addPassphraseWrapper(vaultKey, passphrase);
      set({ busy: false });
      await refreshWrappers(set);
    } catch (cause) {
      set({ busy: false, error: message(cause, "Could not save the passphrase.") });
      throw cause;
    }
  },

  newRecoveryCode: async () => {
    if (!vaultKey) throw new Error("The vault is locked.");
    set({ busy: true, error: null });
    try {
      const code = await addRecoveryWrapper(vaultKey);
      set({ busy: false, freshRecoveryCode: code });
      await refreshWrappers(set);
      return code;
    } catch (cause) {
      set({ busy: false, error: message(cause, "Could not make a recovery code.") });
      throw cause;
    }
  },

  removeWrapper: async (id) => {
    set({ busy: true, error: null });
    try {
      await vaultApi.removeWrapper(id);
      set({ busy: false });
      await refreshWrappers(set);
    } catch (cause) {
      set({ busy: false, error: message(cause, "Could not remove that unlock method.") });
      throw cause;
    }
  },

  dismissRecoveryCode: () => set({ freshRecoveryCode: null }),

  saveBot: async (bot) => {
    if (!vaultKey) return;
    const now = Date.now();
    const existing = get().bots.find((entry) => entry.id === bot.id);
    const saved: SavedBot = {
      ...bot,
      addedAt: existing?.addedAt ?? bot.addedAt ?? now,
      lastUsedAt: now,
    };
    set((state) => ({
      bots: [...state.bots.filter((entry) => entry.id !== saved.id), saved].sort(byLastUsed),
    }));
    await vaultApi
      .putItems([
        {
          kind: "bot",
          ref: await itemRef(vaultKey, "bot", saved.id),
          ciphertext: await encryptJson(vaultKey, saved),
        },
      ])
      .catch((cause: unknown) => set({ error: message(cause, "Could not save the bot.") }));
  },

  removeBot: async (id) => {
    if (!vaultKey) return;
    set((state) => ({ bots: state.bots.filter((bot) => bot.id !== id) }));
    const ref = await itemRef(vaultKey, "bot", id);
    await vaultApi.removeItems("bot", [ref]).catch(() => {});
  },

  markBotUsed: async (id) => {
    const bot = get().bots.find((entry) => entry.id === id);
    if (bot) await get().saveBot(bot);
  },

  syncSettings: async () => {
    if (!vaultKey) return;
    try {
      const { items } = await vaultApi.items();
      const stored = items.find((item) => item.kind === "settings");
      if (stored) {
        try {
          // Whatever was saved last wins; preferences are not worth a merge.
          const remote = await decryptJson<NotificationSettings>(vaultKey, stored.ciphertext);
          setSettings(remote);
          syncedSettings = JSON.stringify(getSettings());
        } catch {
          // Written under another key.
        }
      } else {
        await pushSettings();
      }
    } catch {
      // Sync is best-effort; the app works without it.
    }
  },

  syncDMs: async () => {
    // One sync at a time; anything asked for meanwhile is folded into one more.
    if (dmSync) {
      dmSyncAgain = true;
      return dmSync;
    }
    dmSync = (async () => {
      do {
        dmSyncAgain = false;
        const accountId = get().user?.id;
        if (accountId) await syncDMsOnce(set, accountId);
      } while (dmSyncAgain && vaultKey);
    })().finally(() => {
      dmSync = null;
    });
    return dmSync;
  },

  syncScripts: async () => {
    if (scriptSync) {
      scriptSyncAgain = true;
      return scriptSync;
    }
    scriptSync = (async () => {
      do {
        scriptSyncAgain = false;
        const accountId = get().user?.id;
        if (accountId) await syncScriptsOnce(set, accountId);
      } while (scriptSyncAgain && vaultKey);
    })().finally(() => {
      scriptSync = null;
    });
    return scriptSync;
  },

  syncReadState: one(() => syncReadStateOnce()),
}));

/**
 * Wraps a sync so only one runs at a time; anything asked for meanwhile is
 * folded into a single extra run.
 */
function one(run: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await run();
      } while (again && vaultKey);
    })().finally(() => {
      running = null;
    });
    return running;
  };
}

type Setter = (partial: Partial<AccountState> | ((state: AccountState) => Partial<AccountState>)) => void;

/**
 * Keeps the vault in step with this browser while it stays unlocked: whatever
 * the DM list or the preferences do locally is encrypted and pushed after a
 * short pause, so a burst of changes costs one request.
 */
function startWatching(get: () => AccountState) {
  stopWatching?.();
  let dmTimer: ReturnType<typeof setTimeout> | null = null;
  let settingsTimer: ReturnType<typeof setTimeout> | null = null;
  let scriptTimer: ReturnType<typeof setTimeout> | null = null;
  let readTimer: ReturnType<typeof setTimeout> | null = null;
  // Read markers move with every message looked at; one push per half minute is plenty.
  const unsubscribeReadState = subscribeReadState(() => {
    if (readTimer) return;
    readTimer = setTimeout(() => {
      readTimer = null;
      if (JSON.stringify(getReadState()) !== syncedReadState) void get().syncReadState();
    }, 30_000);
  });
  const unsubscribeScripts = subscribeScripts(() => {
    if (scriptTimer) clearTimeout(scriptTimer);
    scriptTimer = setTimeout(() => {
      scriptTimer = null;
      if (JSON.stringify(getAllScripts()) !== syncedScripts) void get().syncScripts();
    }, 1500);
  });
  const unsubscribeDMs = subscribeDMs(() => {
    if (dmTimer) clearTimeout(dmTimer);
    dmTimer = setTimeout(() => {
      dmTimer = null;
      if (dmSnapshot() !== syncedDMs) void get().syncDMs();
    }, 1500);
  });
  const unsubscribeSettings = subscribeSettings(() => {
    if (settingsTimer) clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      settingsTimer = null;
      if (JSON.stringify(getSettings()) !== syncedSettings) void pushSettings();
    }, 1500);
  });
  stopWatching = () => {
    if (dmTimer) clearTimeout(dmTimer);
    if (settingsTimer) clearTimeout(settingsTimer);
    if (scriptTimer) clearTimeout(scriptTimer);
    if (readTimer) clearTimeout(readTimer);
    unsubscribeReadState();
    unsubscribeDMs();
    unsubscribeSettings();
    unsubscribeScripts();
    syncedDMs = null;
    syncedSettings = null;
    syncedScripts = null;
    syncedReadState = null;
  };
}

/** Encrypts the current preferences into the vault. */
async function pushSettings() {
  if (!vaultKey) return;
  const settings = getSettings();
  const serialized = JSON.stringify(settings);
  await vaultApi
    .putItems([
      {
        kind: "settings",
        ref: await itemRef(vaultKey, "settings", "notifications"),
        ciphertext: await encryptJson(vaultKey, settings),
      },
    ])
    .then(() => {
      syncedSettings = serialized;
    })
    .catch(() => {});
}

/** Shared tail of every successful unlock. */
async function finishUnlock(
  set: Setter,
  get: () => AccountState,
  userId: string,
  key: CryptoKey,
  wrapperId: string,
) {
  vaultKey = key;
  await rememberKey(userId, key);
  set({ status: "unlocked", busy: false, error: null });
  void vaultApi.touchWrapper(wrapperId);
  await loadItems(set);
  await get().syncDMs();
  await get().syncSettings();
  await get().syncScripts();
  await get().syncReadState();
  startWatching(get);
}

async function unlockWithText(
  set: Setter,
  get: () => AccountState,
  kind: "recovery" | "passphrase",
  secret: string,
  failure: string,
) {
  const user = get().user;
  if (!user) return;
  set({ busy: true, error: null });
  try {
    const { wrappers } = await vaultApi.wrappers();
    const wrapper = wrappers.find((entry) => entry.kind === kind);
    if (!wrapper) throw new Error(`This account has no ${kind === "recovery" ? "recovery code" : "passphrase"}.`);

    const wrappingKey = await keyFromSecretText(
      secret,
      fromBase64Url(wrapper.salt),
      wrapper.params?.iterations ?? PBKDF2_ITERATIONS,
    );
    // A wrong secret shows up here: AES-GCM refuses to authenticate the blob.
    const key = await unwrapVaultKey(wrapper.wrapped, wrappingKey);
    await finishUnlock(set, get, user.id, key, wrapper.id);
  } catch (cause) {
    set({ busy: false, error: cause instanceof Error && cause.message ? cause.message : failure });
    throw cause;
  }
}

async function addPassphraseWrapper(key: CryptoKey, passphrase: string) {
  const salt = randomBytes(16);
  const wrappingKey = await keyFromSecretText(passphrase, salt);
  await vaultApi.addWrapper({
    kind: "passphrase",
    label: "Passphrase",
    salt: toBase64Url(salt),
    wrapped: await wrapVaultKey(key, wrappingKey),
    params: { iterations: PBKDF2_ITERATIONS },
  });
}

async function addRecoveryWrapper(key: CryptoKey): Promise<string> {
  const code = generateRecoveryCode();
  const salt = randomBytes(16);
  const wrappingKey = await keyFromSecretText(normalizeRecoveryCode(code), salt);
  await vaultApi.addWrapper({
    kind: "recovery",
    label: "Recovery code",
    salt: toBase64Url(salt),
    wrapped: await wrapVaultKey(key, wrappingKey),
    params: { iterations: PBKDF2_ITERATIONS },
  });
  return code;
}

async function refreshWrappers(set: Setter) {
  const session = await vaultApi.session().catch(() => null);
  if (session?.user) set({ wrappers: session.wrappers });
}

/** Pulls the encrypted records down and decrypts what this key can open. */
async function loadItems(set: Setter) {
  if (!vaultKey) return;
  try {
    const { items } = await vaultApi.items();
    const bots: SavedBot[] = [];
    for (const item of items) {
      if (item.kind !== "bot") continue;
      try {
        bots.push(await decryptJson<SavedBot>(vaultKey, item.ciphertext));
      } catch {
        // Written by a different vault key; leave it alone.
      }
    }
    set({ bots: bots.sort(byLastUsed) });
  } catch (cause) {
    set({ error: message(cause, "Could not read the vault.") });
  }
}

/** Newest use first, which is the order a switcher wants. */
function byLastUsed(a: SavedBot, b: SavedBot): number {
  return b.lastUsedAt - a.lastUsedAt;
}

/** Where this browser keeps the DM list as it was at the last successful sync. */
const DM_BASE_KEY = "disbotclient:dms-synced";

/**
 * Brings this browser's DM list and the vault's into agreement. The vault wins
 * wherever the two differ and this browser has not changed the DM since the
 * last sync; a DM removed here has its vault row deleted, and a DM another
 * device removed (its row is gone) is removed here too.
 */
async function syncDMsOnce(set: Setter, accountId: string) {
  const key = vaultKey;
  if (!key) return;
  try {
    const { items } = await vaultApi.items();
    const remote: StoredDM[] = [];
    /** Vault row reference per channel, for deleting it. */
    const refs = new Map<string, string>();
    /** Rows left behind by older versions, which marked a removal instead of deleting. */
    const tombstones: RemovedDM[] = [];
    for (const item of items) {
      if (item.kind !== "dm") continue;
      try {
        const record = await decryptJson<StoredDM | RemovedDM>(key, item.ciphertext);
        refs.set(record.channelId, item.ref);
        if (isRemoved(record)) tombstones.push(record);
        else remote.push(record);
      } catch {
        // A record this key cannot open is not ours to touch.
      }
    }

    const removed = { ...getRemovedDMs() };
    for (const tombstone of tombstones) {
      removed[tombstone.channelId] = Math.max(removed[tombstone.channelId] ?? 0, tombstone.removedAt);
    }
    // A removal only covers what happened before it; newer activity undoes it.
    const isRemovedHere = (dm: StoredDM) =>
      removed[dm.channelId] !== undefined && dm.lastUsedAt <= removed[dm.channelId];
    const local = getAllDMs().filter((dm) => !isRemovedHere(dm));

    const merge = threeWayMerge(
      local,
      remote,
      loadBase(DM_BASE_KEY, accountId),
      (dm) => dm.channelId,
      (_id, dm) => isRemovedHere(dm),
    );

    // Gone because another device removed it: remember that, so a scan of the
    // old messages does not list it again.
    const now = Date.now();
    for (const channelId of merge.dropped) removed[channelId] = Math.max(removed[channelId] ?? 0, now);
    for (const dm of merge.local) {
      if (removed[dm.channelId] !== undefined && dm.lastUsedAt > removed[dm.channelId]) {
        delete removed[dm.channelId];
      }
    }

    const doomed = [
      ...merge.remove,
      ...tombstones.map((tombstone) => tombstone.channelId),
    ].flatMap((channelId) => {
      const ref = refs.get(channelId);
      return ref ? [ref] : [];
    });
    for (let index = 0; index < doomed.length; index += 100) {
      await vaultApi.removeItems("dm", doomed.slice(index, index + 100));
    }

    const payload = [];
    for (const record of merge.push) {
      payload.push({
        kind: "dm",
        ref: await itemRef(key, "dm", record.channelId),
        ciphertext: await encryptJson(key, record),
      });
    }
    // The endpoint takes batches; a DM list this long is already unusual.
    for (let index = 0; index < payload.length; index += 100) {
      await vaultApi.putItems(payload.slice(index, index + 100));
    }

    // Only once the vault has caught up does this become the agreed state.
    saveBase(DM_BASE_KEY, accountId, merge.base);
    setRemovedDMs(removed);
    setAllDMs(sortDMs(merge.local));
    syncedDMs = dmSnapshot();
  } catch (cause) {
    set({ error: message(cause, "Could not sync direct messages.") });
  }
}

/** Where this browser keeps the scripts as they were at the last successful sync. */
const SCRIPT_BASE_KEY = "disbotclient:command-scripts-synced";

/** Same rules as the DM sync: the vault wins, and a removal deletes the row. */
async function syncScriptsOnce(set: Setter, accountId: string) {
  const key = vaultKey;
  if (!key) return;
  try {
    const { items } = await vaultApi.items();
    const remote: StoredScript[] = [];
    const refs = new Map<string, string>();
    for (const item of items) {
      if (item.kind !== "script") continue;
      try {
        const record = await decryptJson<StoredScript>(key, item.ciphertext);
        const id = scriptKey(record.botId, record.name);
        refs.set(id, item.ref);
        remote.push(record);
      } catch {
        // Written under another key.
      }
    }

    const merge = threeWayMerge(
      getAllScripts(),
      remote,
      loadBase(SCRIPT_BASE_KEY, accountId),
      (script) => scriptKey(script.botId, script.name),
    );

    const doomed = merge.remove.flatMap((id) => {
      const ref = refs.get(id);
      return ref ? [ref] : [];
    });
    if (doomed.length > 0) await vaultApi.removeItems("script", doomed);

    const payload = [];
    for (const record of merge.push) {
      payload.push({
        kind: "script",
        ref: await itemRef(key, "script", scriptKey(record.botId, record.name)),
        ciphertext: await encryptJson(key, record),
      });
    }
    for (let index = 0; index < payload.length; index += 50) {
      await vaultApi.putItems(payload.slice(index, index + 50));
    }

    saveBase(SCRIPT_BASE_KEY, accountId, merge.base);
    // Newest edit first, with the key as a stable tie-break.
    setAllScripts(
      [...merge.local].sort(
        (a, b) =>
          b.updatedAt - a.updatedAt ||
          scriptKey(a.botId, a.name).localeCompare(scriptKey(b.botId, b.name)),
      ),
    );
    syncedScripts = JSON.stringify(getAllScripts());
  } catch (cause) {
    set({ error: message(cause, "Could not sync command scripts.") });
  }
}

/**
 * Read markers are split into a few records per bot, by channel id, so a bot
 * in a great many servers stays under the vault's size limit per record.
 */
const READ_STATE_PARTS = 16n;

interface ReadStateRecord {
  botId: string;
  part: number;
  marks: Record<string, string>;
}

function readStateRecords(state: ReadState): ReadStateRecord[] {
  const records: ReadStateRecord[] = [];
  for (const [botId, marks] of Object.entries(state)) {
    const parts = new Map<number, Record<string, string>>();
    for (const [channelId, messageId] of Object.entries(marks)) {
      const part = Number(BigInt(channelId) % READ_STATE_PARTS);
      parts.set(part, { ...(parts.get(part) ?? {}), [channelId]: messageId });
    }
    for (const [part, partMarks] of parts) records.push({ botId, part, marks: partMarks });
  }
  return records;
}

/**
 * Markers only move forward, so merging is "newest per channel" in both
 * directions: the vault's are folded in here, then every part this browser
 * has moved further is written back.
 */
async function syncReadStateOnce() {
  const key = vaultKey;
  if (!key) return;
  try {
    const { items } = await vaultApi.items();
    const remote: ReadState = {};
    const remoteJson = new Map<string, string>();
    for (const item of items) {
      if (item.kind !== "readstate") continue;
      try {
        const record = await decryptJson<ReadStateRecord>(key, item.ciphertext);
        remote[record.botId] = { ...(remote[record.botId] ?? {}), ...record.marks };
        remoteJson.set(`${record.botId}:${record.part}`, JSON.stringify(record.marks));
      } catch {
        // Written under another key.
      }
    }
    mergeReadState(remote);

    const payload = [];
    for (const record of readStateRecords(getReadState())) {
      const id = `${record.botId}:${record.part}`;
      if (remoteJson.get(id) === JSON.stringify(record.marks)) continue;
      payload.push({
        kind: "readstate",
        ref: await itemRef(key, "readstate", id),
        ciphertext: await encryptJson(key, record),
      });
    }
    for (let index = 0; index < payload.length; index += 50) {
      await vaultApi.putItems(payload.slice(index, index + 50));
    }
    syncedReadState = JSON.stringify(getReadState());
  } catch {
    // Best-effort: the markers are still kept in this browser.
  }
}

/** What older versions left in the vault for a removed DM, instead of deleting it. */
interface RemovedDM {
  channelId: string;
  removedAt: number;
}

function isRemoved(record: StoredDM | RemovedDM): record is RemovedDM {
  return typeof (record as RemovedDM).removedAt === "number" && !("recipientId" in record);
}

/** The DM list and its removals, as compared against the last sync. */
function dmSnapshot(): string {
  return JSON.stringify([getAllDMs(), getRemovedDMs()]);
}

/**
 * Most recently used first. Ties fall back to the channel id: the vault hands
 * records back in whatever order they were last written, and an order that
 * flips between syncs would look like a change and trigger yet another sync.
 */
function sortDMs(dms: StoredDM[]): StoredDM[] {
  return [...dms].sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt || (a.channelId < b.channelId ? -1 : a.channelId > b.channelId ? 1 : 0),
  );
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
