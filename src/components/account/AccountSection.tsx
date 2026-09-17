"use client";

import { useAccount } from "@/lib/store/account";
import { useUI } from "@/lib/store/ui";

/**
 * The account block in the settings panel: whether cloud sync is on, what it
 * holds, and the way to set it up, open it or throw it away.
 */
export function AccountSection() {
  const status = useAccount((state) => state.status);
  const user = useAccount((state) => state.user);
  const bots = useAccount((state) => state.bots);
  const wrappers = useAccount((state) => state.wrappers);
  const signOut = useAccount((state) => state.signOut);
  const openDialog = useUI((state) => state.openDialog);

  if (status === "loading" || status === "unavailable") {
    return (
      <section className="mb-6">
        <h3 className="pb-2 text-xs font-semibold text-muted">Sync</h3>
        <p className="rounded border border-line bg-raised px-3 py-3 text-xs leading-relaxed text-muted">
          {status === "loading"
            ? "Checking whether this deployment offers an account…"
            : "This deployment has no account service, so everything stays in this browser."}
        </p>
      </section>
    );
  }

  if (status === "signedOut") {
    return (
      <section className="mb-6">
        <h3 className="pb-2 text-xs font-semibold text-muted">Sync</h3>
        <div className="rounded border border-line bg-raised px-3 py-3">
          <p className="text-xs leading-relaxed text-muted">
            Sign in with Discord to keep your bots and DM list across devices. Everything is
            encrypted in this browser first — the server stores ciphertext it cannot read.
          </p>
          <a
            href="/api/auth/discord"
            className="mt-3 flex items-center justify-center gap-2 rounded bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
          >
            <span aria-hidden>🔗</span>
            Sign in with Discord
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <h3 className="pb-2 text-xs font-semibold text-muted">Sync</h3>
      <div className="rounded border border-line bg-raised px-3 py-3">
        <p className="flex items-center gap-2 text-sm">
          <span aria-hidden>🔗</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-bright">
            {user?.globalName ?? user?.username}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="shrink-0 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-hover hover:text-bright"
          >
            Sign out
          </button>
        </p>

        {status === "needsSetup" && (
          <>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Nothing is synced yet. Pick how this account should be unlocked and the vault is
              created here, in your browser.
            </p>
            <button
              type="button"
              onClick={() => openDialog({ kind: "accountSetup" })}
              className="mt-3 w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              Turn on sync
            </button>
          </>
        )}

        {status === "locked" && (
          <>
            <p className="mt-2 text-xs leading-relaxed text-amber">
              The vault is locked on this device. Unlock it to see your saved bots and DMs.
            </p>
            <button
              type="button"
              onClick={() => openDialog({ kind: "accountUnlock" })}
              className="mt-3 w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              Unlock
            </button>
          </>
        )}

        {status === "unlocked" && (
          <>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {bots.length} bot{bots.length === 1 ? "" : "s"} and your DM list are synced, encrypted
              with {wrappers.length} unlock method{wrappers.length === 1 ? "" : "s"}.
            </p>
            <button
              type="button"
              onClick={() => openDialog({ kind: "accountSecurity" })}
              className="mt-3 w-full rounded bg-panel px-3 py-2 text-sm text-text transition-colors hover:bg-hover"
            >
              Passkeys and recovery
            </button>
          </>
        )}
      </div>
    </section>
  );
}
