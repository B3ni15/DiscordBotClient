"use client";

import { create } from "zustand";
import { getAllDMs, setAllDMs, subscribeDMs, type StoredDM } from "@/components/nav/dmStore";
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
}

/** The PRF output is already uniform, so HKDF needs no salt of its own. */
const EMPTY_SALT = new Uint8Array(new ArrayBuffer(0)) as Bytes;

/** Stops the live sync subscriptions; null while nothing is subscribed. */
let stopWatching: (() => void) | null = null;

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
        startWatching(() => {
          void get().syncDMs();
          void pushSettings();
        });
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
      startWatching(() => {
        void get().syncDMs();
        void pushSettings();
      });
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
          setSettings(await decryptJson<NotificationSettings>(vaultKey, stored.ciphertext));
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
    if (!vaultKey) return;
    try {
      const { items } = await vaultApi.items();
      const remote: StoredDM[] = [];
      for (const item of items) {
        if (item.kind !== "dm") continue;
        try {
          remote.push(await decryptJson<StoredDM>(vaultKey, item.ciphertext));
        } catch {
          // A record this key cannot open is not ours to touch.
        }
      }

      const merged = mergeDMs(getAllDMs(), remote);
      setAllDMs(merged);

      const payload = [];
      for (const dm of merged) {
        payload.push({
          kind: "dm",
          ref: await itemRef(vaultKey, "dm", dm.channelId),
          ciphertext: await encryptJson(vaultKey, dm),
        });
      }
      // The endpoint takes batches; a DM list this long is already unusual.
      for (let index = 0; index < payload.length; index += 100) {
        await vaultApi.putItems(payload.slice(index, index + 100));
      }
    } catch (cause) {
      set({ error: message(cause, "Could not sync direct messages.") });
    }
  },
}));

type Setter = (partial: Partial<AccountState> | ((state: AccountState) => Partial<AccountState>)) => void;

/**
 * Keeps the vault in step with this browser while it stays unlocked: whatever
 * the DM list or the preferences do locally is encrypted and pushed after a
 * short pause, so a burst of changes costs one request.
 */
function startWatching(push: () => void) {
  stopWatching?.();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, 1500);
  };
  const unsubscribeDMs = subscribeDMs(schedule);
  const unsubscribeSettings = subscribeSettings(schedule);
  stopWatching = () => {
    if (timer) clearTimeout(timer);
    unsubscribeDMs();
    unsubscribeSettings();
  };
}

/** Encrypts the current preferences into the vault. */
async function pushSettings() {
  if (!vaultKey) return;
  await vaultApi
    .putItems([
      {
        kind: "settings",
        ref: await itemRef(vaultKey, "settings", "notifications"),
        ciphertext: await encryptJson(vaultKey, getSettings()),
      },
    ])
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
  startWatching(() => {
    void get().syncDMs();
    void pushSettings();
  });
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

/** Local and remote DM lists, with the more recently used copy winning. */
function mergeDMs(local: StoredDM[], remote: StoredDM[]): StoredDM[] {
  const byChannel = new Map<string, StoredDM>();
  for (const dm of [...remote, ...local]) {
    const existing = byChannel.get(dm.channelId);
    const winner = !existing || dm.lastUsedAt > existing.lastUsedAt ? dm : existing;
    // Which bot a DM belongs to never changes once known, so an older copy
    // written before it was claimed must not un-claim it.
    const botId = winner.botId ?? dm.botId ?? existing?.botId;
    byChannel.set(dm.channelId, botId ? { ...winner, botId } : winner);
  }
  return [...byChannel.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
