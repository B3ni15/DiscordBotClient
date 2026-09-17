"use client";

import { Spinner } from "@/components/ui/Spinner";
import { useClient } from "@/lib/store/client";

const LABELS: Record<string, string> = {
  idle: "Not connected",
  connecting: "Connecting to the gateway…",
  identifying: "Identifying…",
  ready: "Connected",
  reconnecting: "Reconnecting…",
  closed: "Connection closed",
};

/** Shown only while the gateway is not ready, so it never becomes wallpaper. */
export function StatusBar() {
  const status = useClient((state) => state.status);
  const error = useClient((state) => state.error);
  const logout = useClient((state) => state.logout);

  return (
    <div
      role="status"
      className={`flex shrink-0 animate-fade-in items-center justify-between gap-3 px-4 py-1.5 text-xs font-medium ${
        error ? "bg-danger text-white" : "bg-amber text-black"
      }`}
    >
      <span className="flex items-center gap-2">
        {!error && status !== "closed" && <Spinner size={12} />}
        {error ?? LABELS[status]}
      </span>
      {(status === "closed" || error) && (
        <button
          type="button"
          onClick={logout}
          className="rounded bg-black/20 px-2 py-0.5 font-semibold transition-colors hover:bg-black/40"
        >
          Sign out
        </button>
      )}
    </div>
  );
}
