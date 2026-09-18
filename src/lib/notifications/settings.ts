/**
 * Notification preferences, persisted in localStorage.
 *
 * Exposed as an external store (like the DM store) so every panel stays in sync,
 * other browser tabs pick up changes through the `storage` event, and server
 * rendering sees the defaults instead of touching localStorage.
 */

import { useSyncExternalStore } from "react";

export const NOTIFICATION_STORAGE_KEY = "disbotclient:notifications";

/** all = every message, mentions = only when the bot is pinged, none = silent. */
export type NotificationMode = "all" | "mentions" | "none";

export interface NotificationSettings {
  /** Master switch; when off nothing is shown regardless of the other fields. */
  enabled: boolean;
  sound: boolean;
  mode: NotificationMode;
  mutedChannelIds: string[];
  mutedGuildIds: string[];
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  sound: false,
  mode: "mentions",
  mutedChannelIds: [],
  mutedGuildIds: [],
};

const MODES: NotificationMode[] = ["all", "mentions", "none"];

export const MODE_LABELS: Record<NotificationMode, string> = {
  all: "All messages",
  mentions: "Mentions only",
  none: "Nothing",
};

let cache: NotificationSettings = DEFAULT_SETTINGS;
let cacheSource: string | null = null;
const listeners = new Set<() => void>();

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  // Another tab may write the same key.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Subscribes a component to the stored settings; SSR sees the defaults. */
export function useNotificationSettings(): NotificationSettings {
  return useSyncExternalStore(subscribeSettings, getSettings, getServerSettings);
}

/** Must return a stable reference while the stored JSON is unchanged. */
export function getSettings(): NotificationSettings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
  if (raw === cacheSource) return cache;
  cacheSource = raw;
  cache = parse(raw);
  return cache;
}

export function getServerSettings(): NotificationSettings {
  return DEFAULT_SETTINGS;
}

export function setSettings(next: NotificationSettings) {
  const serialized = JSON.stringify(next);
  // Writing back exactly what was already stored must not notify: a listener
  // that reacts by re-syncing would otherwise re-trigger itself forever over
  // an update that changed nothing.
  if (serialized === localStorage.getItem(NOTIFICATION_STORAGE_KEY)) return;
  localStorage.setItem(NOTIFICATION_STORAGE_KEY, serialized);
  for (const listener of listeners) listener();
}

export function patchSettings(patch: Partial<NotificationSettings>) {
  setSettings({ ...getSettings(), ...patch });
}

export function isChannelMuted(channelId: string): boolean {
  return getSettings().mutedChannelIds.includes(channelId);
}

export function isGuildMuted(guildId: string): boolean {
  return getSettings().mutedGuildIds.includes(guildId);
}

export function setChannelMuted(channelId: string, muted: boolean) {
  patchSettings({ mutedChannelIds: toggleId(getSettings().mutedChannelIds, channelId, muted) });
}

export function setGuildMuted(guildId: string, muted: boolean) {
  patchSettings({ mutedGuildIds: toggleId(getSettings().mutedGuildIds, guildId, muted) });
}

function toggleId(ids: string[], id: string, present: boolean): string[] {
  const without = ids.filter((entry) => entry !== id);
  return present ? [...without, id] : without;
}

function parse(raw: string | null): NotificationSettings {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    const value = parsed as Partial<NotificationSettings>;
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
      sound: typeof value.sound === "boolean" ? value.sound : DEFAULT_SETTINGS.sound,
      mode:
        typeof value.mode === "string" && MODES.includes(value.mode as NotificationMode)
          ? (value.mode as NotificationMode)
          : DEFAULT_SETTINGS.mode,
      mutedChannelIds: stringArray(value.mutedChannelIds),
      mutedGuildIds: stringArray(value.mutedGuildIds),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
