"use client";

import { useEffect, useState } from "react";
import { Field, Modal, ModalActions, inputClass } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { copyText } from "@/lib/discord/messageActions";
import { useAccount } from "@/lib/store/account";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";
import { passkeysAvailable } from "@/lib/vault/passkey";

/**
 * Everything the account needs a dialog for: setting the vault up, opening it,
 * managing the ways in, adding another bot, and deleting the lot.
 *
 * Mounted next to the app rather than inside it, because the sign-in screen
 * needs the same dialogs as the client does.
 */
export function AccountDialogs() {
  const dialog = useUI((state) => state.dialog);
  const close = useUI((state) => state.closeDialog);

  if (!dialog) return null;
  switch (dialog.kind) {
    case "accountSetup":
      return <SetupDialog onClose={close} />;
    case "accountUnlock":
      return <UnlockDialog onClose={close} />;
    case "accountSecurity":
      return <SecurityDialog onClose={close} />;
    case "accountDelete":
      return <DeleteDialog onClose={close} />;
    case "addBot":
      return <AddBotDialog onClose={close} />;
    default:
      return null;
  }
}

/** The one screen that explains what is being protected and how. */
function SetupDialog({ onClose }: { onClose: () => void }) {
  const setUpVault = useAccount((state) => state.setUpVault);
  const busy = useAccount((state) => state.busy);
  const error = useAccount((state) => state.error);
  const code = useAccount((state) => state.freshRecoveryCode);
  const [mode, setMode] = useState<"choose" | "passphrase">("choose");
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const [canUsePasskeys] = useState(() => passkeysAvailable());

  if (code) return <RecoveryCodeDialog onClose={onClose} />;

  async function withPasskey() {
    setLocal(null);
    await setUpVault({ passkey: true }).catch(() => {});
  }

  async function withPassphrase() {
    if (passphrase.length < 10) {
      setLocal("Use at least 10 characters.");
      return;
    }
    if (passphrase !== repeat) {
      setLocal("The two passphrases do not match.");
      return;
    }
    setLocal(null);
    await setUpVault({ passkey: false, passphrase }).catch(() => {});
  }

  return (
    <Modal
      title="Turn on sync"
      subtitle="Your bots and DMs, encrypted before they ever leave this browser."
      onClose={onClose}
    >
      <p className="mb-4 text-sm leading-relaxed text-text">
        Sync stores your bot tokens and DM list on the server as ciphertext. The key that opens
        them is made here, on this device, and the server never receives it — so nobody who can
        read the database can read your data, the person running it included.
      </p>

      {mode === "choose" ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void withPasskey()}
            disabled={busy || !canUsePasskeys}
            title={canUsePasskeys ? undefined : "This browser has no passkey support."}
            className="flex items-center gap-3 rounded bg-accent px-4 py-3 text-left text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? <Spinner size={16} /> : <span aria-hidden className="text-lg">🔑</span>}
            <span>
              <span className="block text-sm font-semibold">Use a passkey</span>
              <span className="block text-xs text-white/80">
                Touch ID, Windows Hello or your phone. Nothing to remember.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode("passphrase")}
            disabled={busy}
            className="flex items-center gap-3 rounded bg-ink px-4 py-3 text-left transition-colors hover:bg-hover disabled:opacity-50"
          >
            <span aria-hidden className="text-lg text-muted">
              ✎
            </span>
            <span>
              <span className="block text-sm font-semibold text-bright">Use a passphrase</span>
              <span className="block text-xs text-muted">
                Works everywhere, including browsers without passkey support.
              </span>
            </span>
          </button>
        </div>
      ) : (
        <>
          <Field label="Passphrase" htmlFor="vault-passphrase" hint="At least 10 characters.">
            <input
              id="vault-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <Field label="Repeat passphrase" htmlFor="vault-passphrase-repeat">
            <input
              id="vault-passphrase-repeat"
              type="password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="text-sm text-muted transition-colors hover:text-bright"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void withPassphrase()}
              disabled={busy}
              className="ml-auto rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? "Working…" : "Turn on sync"}
            </button>
          </div>
        </>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        A recovery code is generated as well, so a lost passkey does not mean lost data.
      </p>

      {(local ?? error) && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {local ?? error}
        </p>
      )}
    </Modal>
  );
}

/** Shown once, right after a code is made. It cannot be shown again. */
function RecoveryCodeDialog({ onClose }: { onClose: () => void }) {
  const code = useAccount((state) => state.freshRecoveryCode);
  const dismiss = useAccount((state) => state.dismissRecoveryCode);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!code) return null;

  return (
    <Modal
      title="Save your recovery code"
      subtitle="The only way back in if you lose your passkey."
      onClose={() => {
        dismiss();
        onClose();
      }}
      footer={
        <button
          type="button"
          onClick={() => {
            dismiss();
            onClose();
          }}
          disabled={!acknowledged}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          Done
        </button>
      }
    >
      <p className="mb-3 text-sm leading-relaxed text-text">
        Write this down or put it in a password manager. It is not stored anywhere in readable
        form, so this is the last time it can be shown.
      </p>

      <p className="rounded bg-ink px-4 py-3 text-center font-mono text-base tracking-widest break-all text-bright select-all">
        {code}
      </p>

      <button
        type="button"
        onClick={() => {
          void copyText(code).then(() => setCopied(true));
        }}
        className="mt-2 w-full rounded bg-panel-alt px-3 py-2 text-sm text-muted transition-colors hover:bg-raised hover:text-bright"
      >
        {copied ? "Copied" : "Copy to clipboard"}
      </button>

      <label className="mt-4 flex items-start gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        I have saved this code somewhere safe.
      </label>
    </Modal>
  );
}

function UnlockDialog({ onClose }: { onClose: () => void }) {
  const wrappers = useAccount((state) => state.wrappers);
  const unlockWithPasskey = useAccount((state) => state.unlockWithPasskey);
  const unlockWithRecoveryCode = useAccount((state) => state.unlockWithRecoveryCode);
  const unlockWithPassphrase = useAccount((state) => state.unlockWithPassphrase);
  const busy = useAccount((state) => state.busy);
  const error = useAccount((state) => state.error);
  const status = useAccount((state) => state.status);
  const [mode, setMode] = useState<"choose" | "recovery" | "passphrase">("choose");
  const [secret, setSecret] = useState("");

  const hasPasskey = wrappers.some((wrapper) => wrapper.kind === "passkey");
  const hasPassphrase = wrappers.some((wrapper) => wrapper.kind === "passphrase");

  // The dialog's job is done the moment the vault opens.
  useEffect(() => {
    if (status === "unlocked") onClose();
  }, [status, onClose]);

  return (
    <Modal title="Unlock your vault" subtitle="Your bots and DMs are encrypted." onClose={onClose}>
      {mode === "choose" && (
        <div className="flex flex-col gap-2">
          {hasPasskey && (
            <button
              type="button"
              onClick={() => void unlockWithPasskey().catch(() => {})}
              disabled={busy}
              className="flex items-center gap-3 rounded bg-accent px-4 py-3 text-left text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? <Spinner size={16} /> : <span aria-hidden className="text-lg">🔑</span>}
              <span className="text-sm font-semibold">Unlock with a passkey</span>
            </button>
          )}
          {hasPassphrase && (
            <button
              type="button"
              onClick={() => setMode("passphrase")}
              className="rounded bg-ink px-4 py-3 text-left text-sm text-bright transition-colors hover:bg-hover"
            >
              Use your passphrase
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode("recovery")}
            className="rounded bg-ink px-4 py-3 text-left text-sm text-bright transition-colors hover:bg-hover"
          >
            Use your recovery code
          </button>
        </div>
      )}

      {mode !== "choose" && (
        <>
          <Field
            label={mode === "recovery" ? "Recovery code" : "Passphrase"}
            htmlFor="unlock-secret"
          >
            <input
              id="unlock-secret"
              type={mode === "recovery" ? "text" : "password"}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder={mode === "recovery" ? "ABCD-EFGH-…" : ""}
              autoComplete={mode === "recovery" ? "off" : "current-password"}
              spellCheck={false}
              className={`${inputClass} ${mode === "recovery" ? "font-mono tracking-widest" : ""}`}
            />
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="text-sm text-muted transition-colors hover:text-bright"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                const run =
                  mode === "recovery" ? unlockWithRecoveryCode(secret) : unlockWithPassphrase(secret);
                void run.catch(() => {});
              }}
              disabled={busy || secret.trim().length === 0}
              className="ml-auto rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? "Unlocking…" : "Unlock"}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}

const WRAPPER_ICON: Record<string, string> = {
  passkey: "🔑",
  recovery: "🧾",
  passphrase: "✎",
};

function SecurityDialog({ onClose }: { onClose: () => void }) {
  const wrappers = useAccount((state) => state.wrappers);
  const addPasskey = useAccount((state) => state.addPasskey);
  const addPassphrase = useAccount((state) => state.addPassphrase);
  const newRecoveryCode = useAccount((state) => state.newRecoveryCode);
  const removeWrapper = useAccount((state) => state.removeWrapper);
  const lock = useAccount((state) => state.lock);
  const busy = useAccount((state) => state.busy);
  const error = useAccount((state) => state.error);
  const code = useAccount((state) => state.freshRecoveryCode);
  const openDialog = useUI((state) => state.openDialog);
  const toast = useUI((state) => state.toast);
  const [passphrase, setPassphrase] = useState("");
  const [adding, setAdding] = useState(false);

  if (code) return <RecoveryCodeDialog onClose={onClose} />;

  return (
    <Modal
      title="Unlock methods"
      subtitle="Anything listed here can open your vault."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => openDialog({ kind: "accountDelete" })}
            className="mr-auto rounded px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/15"
          >
            Delete account
          </button>
          <button
            type="button"
            onClick={() => {
              void lock();
              toast("Locked on this device.");
              onClose();
            }}
            className="rounded px-4 py-2 text-sm text-text transition-colors hover:underline"
          >
            Lock this device
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
          >
            Done
          </button>
        </>
      }
    >
      <ul className="mb-4 flex flex-col">
        {wrappers.map((wrapper) => (
          <li
            key={wrapper.id}
            className="flex items-center gap-3 border-b border-line py-2 last:border-0"
          >
            <span aria-hidden className="w-5 text-center">
              {WRAPPER_ICON[wrapper.kind] ?? "•"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text">{wrapper.label}</span>
              <span className="block text-[11px] text-muted">
                Added {new Date(wrapper.createdAt).toLocaleDateString("en-US")}
                {wrapper.lastUsedAt &&
                  ` · last used ${new Date(wrapper.lastUsedAt).toLocaleDateString("en-US")}`}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void removeWrapper(wrapper.id).catch(() => {})}
              disabled={busy || wrappers.length <= 1}
              title={
                wrappers.length <= 1
                  ? "This is the only way left into the vault."
                  : `Remove ${wrapper.label}`
              }
              className="shrink-0 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void addPasskey().catch(() => {})}
          disabled={busy || !passkeysAvailable()}
          className="rounded bg-ink px-3 py-2 text-sm text-bright transition-colors hover:bg-hover disabled:opacity-50"
        >
          Add a passkey
        </button>
        <button
          type="button"
          onClick={() => void newRecoveryCode().catch(() => {})}
          disabled={busy}
          className="rounded bg-ink px-3 py-2 text-sm text-bright transition-colors hover:bg-hover disabled:opacity-50"
        >
          New recovery code
        </button>
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          disabled={busy}
          className="rounded bg-ink px-3 py-2 text-sm text-bright transition-colors hover:bg-hover disabled:opacity-50"
        >
          Set a passphrase
        </button>
      </div>

      {adding && (
        <div className="mt-3">
          <Field label="New passphrase" htmlFor="new-passphrase" hint="At least 10 characters.">
            <input
              id="new-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <button
            type="button"
            onClick={() => {
              if (passphrase.length < 10) return;
              void addPassphrase(passphrase)
                .then(() => {
                  setPassphrase("");
                  setAdding(false);
                  toast("Passphrase saved.");
                })
                .catch(() => {});
            }}
            disabled={busy || passphrase.length < 10}
            className="rounded bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            Save passphrase
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const deleteAccount = useAccount((state) => state.deleteAccount);
  const user = useAccount((state) => state.user);
  const busy = useAccount((state) => state.busy);
  const error = useAccount((state) => state.error);
  const toast = useUI((state) => state.toast);
  const [confirmation, setConfirmation] = useState("");

  const ready = confirmation.trim().toUpperCase() === "DELETE";

  return (
    <Modal
      title="Delete your account"
      subtitle={user ? `@${user.username}` : undefined}
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => {
            void deleteAccount()
              .then(() => {
                toast("Account deleted.");
                onClose();
              })
              .catch(() => {});
          }}
          confirmLabel="Delete everything"
          busy={busy}
          danger
          disabled={!ready}
        />
      }
    >
      <p className="text-sm leading-relaxed text-text">
        This removes the account itself, every saved bot, every remembered DM and every way of
        unlocking them. It cannot be undone, and there is no copy anywhere else — the encryption
        key only ever existed in your browsers.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        The bot you are signed in as right now stays signed in on this device until you sign out of
        it separately. Nothing is changed on Discord itself.
      </p>

      <Field label="Type DELETE to confirm" htmlFor="delete-confirm">
        <input
          id="delete-confirm"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          className={`${inputClass} mt-3`}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}

/** Signs in as another bot; the vault remembers it if it is unlocked. */
function AddBotDialog({ onClose }: { onClose: () => void }) {
  const login = useClient((state) => state.login);
  const error = useClient((state) => state.error);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!token.trim()) return;
    setBusy(true);
    await login(token.trim());
    setBusy(false);
    // login() reports its own failure through the client store's error.
    if (!useClient.getState().error) onClose();
  }

  return (
    <Modal
      title="Add another bot"
      subtitle="Sign in as a second bot and switch between them."
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void submit()}
          confirmLabel="Sign in"
          busy={busy}
          disabled={!token.trim()}
        />
      }
    >
      <Field
        label="Bot token"
        htmlFor="add-bot-token"
        hint="From the Bot tab of the Discord Developer Portal."
      >
        <input
          id="add-bot-token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="MTE4OTQy…"
          className={`${inputClass} font-mono`}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
