/**
 * In-memory unread counters per channel and per guild.
 *
 * Deliberately kept outside the zustand client store: unread state is a UI
 * concern, it must not survive a reload, and the store stays untouched. Counters
 * are fed by the same gateway dispatch stream the notifications use and reset
 * when a channel becomes the selected one.
 */

import { useSyncExternalStore } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { useClient } from "@/lib/store/client";
import { subscribeDispatch } from "./dispatch";

const countsByChannel = new Map<string, number>();
const countsByGuild = new Map<string, number>();
/** Remembers which guild a counted channel belongs to, so resets stay balanced. */
const guildByChannel = new Map<string, string>();

const listeners = new Set<() => void>();
let trackers = 0;
let stopDispatch: (() => void) | null = null;
let stopStore: (() => void) | null = null;
let lastSelectedChannelId: string | null = null;

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Start counting. Ref-counted: every caller must invoke the returned function.
 * Mounted badges start it implicitly, `useNotifications` keeps it alive too.
 */
export function startUnreadTracking(): () => void {
  trackers += 1;
  if (trackers === 1) {
    lastSelectedChannelId = useClient.getState().selectedChannelId;
    stopDispatch = subscribeDispatch(handleDispatch);
    stopStore = useClient.subscribe((state) => {
      if (state.selectedChannelId === lastSelectedChannelId) return;
      lastSelectedChannelId = state.selectedChannelId;
      if (state.selectedChannelId) clearUnread(state.selectedChannelId);
    });
  }
  return () => {
    trackers -= 1;
    if (trackers > 0) return;
    stopDispatch?.();
    stopDispatch = null;
    stopStore?.();
    stopStore = null;
  };
}

function handleDispatch(event: string, raw: unknown) {
  if (event !== "MESSAGE_CREATE") return;
  const message = raw as APIMessage & { guild_id?: string };
  const state = useClient.getState();
  if (message.author?.id === state.user?.id) return;
  // The channel the user is looking at right now is read by definition.
  if (state.selectedChannelId === message.channel_id && isPageActive()) return;

  const guildId = message.guild_id ?? guildOf(message.channel_id);
  countsByChannel.set(message.channel_id, (countsByChannel.get(message.channel_id) ?? 0) + 1);
  if (guildId) {
    guildByChannel.set(message.channel_id, guildId);
    countsByGuild.set(guildId, (countsByGuild.get(guildId) ?? 0) + 1);
  }
  emit();
}

function guildOf(channelId: string): string | undefined {
  const channel = useClient.getState().channelsById[channelId] as
    | { guild_id?: string }
    | undefined;
  return channel?.guild_id;
}

/** Drop the channel's counter and subtract it from its guild total. */
export function clearUnread(channelId: string) {
  const count = countsByChannel.get(channelId);
  if (!count) return;
  countsByChannel.delete(channelId);
  const guildId = guildByChannel.get(channelId);
  if (guildId) {
    const next = (countsByGuild.get(guildId) ?? 0) - count;
    if (next > 0) countsByGuild.set(guildId, next);
    else countsByGuild.delete(guildId);
    guildByChannel.delete(channelId);
  }
  emit();
}

export function clearAllUnread() {
  if (countsByChannel.size === 0 && countsByGuild.size === 0) return;
  countsByChannel.clear();
  countsByGuild.clear();
  guildByChannel.clear();
  emit();
}

export function getUnread(channelId: string): number {
  return countsByChannel.get(channelId) ?? 0;
}

export function getGuildUnread(guildId: string): number {
  return countsByGuild.get(guildId) ?? 0;
}

function isPageActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
}

/** Subscribing also keeps the tracker running while any badge is mounted. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  const stop = startUnreadTracking();
  return () => {
    listeners.delete(listener);
    stop();
  };
}

export function useUnread(channelId: string): number {
  return useSyncExternalStore(
    subscribe,
    () => getUnread(channelId),
    () => 0,
  );
}

export function useGuildUnread(guildId: string): number {
  return useSyncExternalStore(
    subscribe,
    () => getGuildUnread(guildId),
    () => 0,
  );
}
