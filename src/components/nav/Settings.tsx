"use client";

import { userAvatarUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";

export interface SettingsProps {
  onClose?: () => void;
  className?: string;
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  identifying: "Identifying…",
  ready: "Connected",
  reconnecting: "Reconnecting…",
  closed: "Connection closed",
};

/** Account and session panel: who is logged in, gateway state, logout. */
export function Settings({ onClose, className }: SettingsProps) {
  const user = useClient((state) => state.user);
  const status = useClient((state) => state.status);
  const error = useClient((state) => state.error);
  const logout = useClient((state) => state.logout);

  return (
    <aside
      aria-label="Settings"
      className={`flex min-h-0 w-80 shrink-0 flex-col border-l border-line bg-panel ${className ?? ""}`}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h2 className="text-xs font-semibold text-muted">Settings</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="text-muted hover:text-text"
          >
            ✕
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="mb-6">
          <h3 className="pb-2 text-xs font-semibold text-muted">Signed-in bot</h3>
          {user ? (
            <div className="flex items-center gap-3 rounded border border-line bg-raised px-3 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={userAvatarUrl(user, 80)} alt="" className="h-10 w-10 rounded-full" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{user.global_name ?? user.username}</span>
                  {user.bot && (
                    <span className="rounded bg-accent/15 px-1 font-mono text-[10px] text-accent">
                      BOT
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-[11px] text-muted">{user.id}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">Not signed in. Add a bot token to connect.</p>
          )}
        </section>

        <section className="mb-6">
          <h3 className="pb-2 text-xs font-semibold text-muted">Gateway</h3>
          <p className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${
                status === "ready"
                  ? "bg-accent"
                  : status === "closed" || error
                    ? "bg-danger"
                    : "bg-amber"
              }`}
            />
            <span className={status === "ready" ? "text-text" : "text-muted"}>
              {STATUS_LABELS[status] ?? status}
            </span>
          </p>
          {error && <p className="mt-1 text-xs leading-relaxed text-danger">{error}</p>}
        </section>

        <section className="mb-6">
          <h3 className="pb-2 text-xs font-semibold text-muted">Token</h3>
          <p className="text-xs leading-relaxed text-muted">
            Your bot token is stored only in this browser’s
            <span className="font-mono text-amber"> localStorage</span>
            (<span className="font-mono">disbotclient:token</span>). There is no server, and it is
            never sent anywhere but Discord. Signing out clears it — always sign out on a shared
            machine.
          </p>
        </section>

        <button
          type="button"
          onClick={logout}
          className="w-full rounded border border-line px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
