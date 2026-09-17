/**
 * Icons for Discord's "detectable games" - titles Discord recognises from a
 * running process but that never sent rich-presence assets over the gateway.
 * The desktop client fills their artwork in from this list; a bot connection
 * only ever gets the bare activity (name, type, application id), so without
 * this lookup those activities have no image at all.
 *
 * Fetched once and cached for the life of the page, read through
 * `useSyncExternalStore` so components re-render when it lands.
 */

import { useSyncExternalStore } from "react";
import { CDN_BASE } from "./constants";
import type { RestClient } from "./rest";

interface DetectableApplication {
  id: string;
  icon: string | null;
}

const icons = new Map<string, string | null>();
const listeners = new Set<() => void>();
let loadState: "idle" | "loading" | "loaded" | "error" = "idle";

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return loadState;
}

function getServerSnapshot() {
  return "idle" as const;
}

/** Kicks off the one-time fetch of Discord's detectable-games list, if not already under way. */
export function ensureDetectableAppsLoaded(rest: RestClient) {
  if (loadState !== "idle") return;
  loadState = "loading";
  rest
    .get<DetectableApplication[]>("/applications/detectable")
    .then((apps) => {
      for (const app of apps) icons.set(app.id, app.icon ?? null);
      loadState = "loaded";
      notify();
    })
    .catch(() => {
      loadState = "error";
      notify();
    });
}

/** The box-art icon Discord shows for a detected game that carries no rich-presence assets. */
export function detectableAppIconUrl(applicationId: string, size = 160): string | null {
  const icon = icons.get(applicationId);
  return icon ? `${CDN_BASE}/app-icons/${applicationId}/${icon}.png?size=${size}` : null;
}

/** Re-renders once the detectable-games list finishes loading (or fails to). */
export function useDetectableAppsLoaded(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) !== "idle";
}
