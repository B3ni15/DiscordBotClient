/**
 * Notification permission as an external store.
 *
 * The browser gives no change event for `Notification.permission`, so the store
 * is nudged manually after a request. Reading it through `useSyncExternalStore`
 * keeps the value out of effects (no state updates in effects) and makes server
 * rendering report "unsupported" instead of touching the API.
 */

import { useSyncExternalStore } from "react";

export type PermissionState = NotificationPermission | "unsupported";

const listeners = new Set<() => void>();

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PermissionState {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

function getServerSnapshot(): PermissionState {
  return "unsupported";
}

export function useNotificationPermission(): PermissionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Ask the browser for permission. Call this only from a user gesture (a button
 * click) - browsers reject or penalise automatic prompts.
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    for (const listener of listeners) listener();
    return result;
  } catch {
    return Notification.permission;
  }
}
