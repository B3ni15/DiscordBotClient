"use client";

import { useClient } from "@/lib/store/client";

const LABELS: Record<string, string> = {
  idle: "Nincs kapcsolat",
  connecting: "Csatlakozás a gatewayhez…",
  identifying: "Azonosítás…",
  ready: "Kapcsolódva",
  reconnecting: "Újracsatlakozás…",
  closed: "A kapcsolat lezárult",
};

/** Shown only while the gateway is not ready, so it never becomes wallpaper. */
export function StatusBar() {
  const status = useClient((state) => state.status);
  const error = useClient((state) => state.error);
  const logout = useClient((state) => state.logout);

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-panel px-4 py-1.5 text-xs"
    >
      <span className={error ? "text-danger" : "text-muted"}>{error ?? LABELS[status]}</span>
      {(status === "closed" || error) && (
        <button type="button" onClick={logout} className="text-accent hover:underline">
          Kijelentkezés
        </button>
      )}
    </div>
  );
}
