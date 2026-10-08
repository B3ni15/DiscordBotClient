/**
 * Unread messages per channel, and the catch-up that finds them after the
 * client was closed.
 *
 * What counts as read is persisted (`readState.ts`): the newest message that
 * was on screen in each channel. Every message with a larger id is unread. On
 * each fresh gateway session the tracker compares every channel's
 * `last_message_id` with its marker and fetches what came in meanwhile, so the
 * badges show everything since the channel was last looked at — not only what
 * arrived while the tab happened to be open.
 *
 * The unread ids themselves are in memory only; they are rebuilt from the
 * markers whenever the client connects.
 */

import { useSyncExternalStore } from "react";
import {
  ChannelType,
  PermissionFlagsBits,
  type APIChannel,
  type APIGuildMember,
  type APIMessage,
  type GatewayGuildCreateDispatchData,
} from "discord-api-types/v10";
import { getDMs } from "@/components/nav/dmStore";
import { api } from "@/lib/discord/api";
import { channelPermissions, has } from "@/lib/discord/permissions";
import { useClient } from "@/lib/store/client";
import { subscribeDispatch } from "./dispatch";
import { getLastRead, isNewer, markRead, subscribeReadState } from "./readState";
import { getSettings, subscribeSettings } from "./settings";

/** Channel types with a message history of their own. */
const MESSAGE_CHANNELS = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.DM,
  ChannelType.GroupDM,
]);

/** Discord hands back at most this many messages per request; the badge says "99+" anyway. */
const CATCH_UP_LIMIT = 100;
/** Requests in flight at once during a catch-up; the REST client handles rate limits. */
const CATCH_UP_CONCURRENCY = 3;
/** Ids remembered per channel; beyond this the exact number no longer shows. */
const MAX_IDS_PER_CHANNEL = 500;

const unreadByChannel = new Map<string, Set<string>>();
/** Remembers which guild a channel belongs to, for the server totals. */
const guildByChannel = new Map<string, string>();
/** Newest message id seen per channel, which is what "mark as read" stores. */
const latestByChannel = new Map<string, string>();

const listeners = new Set<() => void>();
let trackers = 0;
let stopDispatch: (() => void) | null = null;
let stopStore: (() => void) | null = null;
let stopReadState: (() => void) | null = null;
let stopSettings: (() => void) | null = null;
let stopPage: (() => void) | null = null;
let lastSelectedChannelId: string | null = null;
/** Bumped on every new session, so a catch-up from the previous one stops. */
let generation = 0;
let baseTitle: string | null = null;

function emit() {
  for (const listener of listeners) listener();
  updateTotals();
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
      if (state.selectedChannelId) markChannelRead(state.selectedChannelId);
    });
    // Another tab or device read something: drop what that covers.
    stopReadState = subscribeReadState(applyMarkers);
    stopSettings = subscribeSettings(updateTotals);
    stopPage = watchPage();
  }
  return () => {
    trackers -= 1;
    if (trackers > 0) return;
    stopDispatch?.();
    stopDispatch = null;
    stopStore?.();
    stopStore = null;
    stopReadState?.();
    stopReadState = null;
    stopSettings?.();
    stopSettings = null;
    stopPage?.();
    stopPage = null;
  };
}

function selfId(): string | null {
  return useClient.getState().user?.id ?? null;
}

function handleDispatch(event: string, raw: unknown) {
  switch (event) {
    case "READY":
      // A fresh session: whatever was counted is rebuilt from the markers.
      generation += 1;
      unreadByChannel.clear();
      emit();
      void catchUpDMs(generation);
      break;
    case "GUILD_CREATE":
      catchUpGuild(raw as GatewayGuildCreateDispatchData, generation);
      break;
    case "CHANNEL_CREATE":
    case "CHANNEL_UPDATE": {
      const channel = raw as APIChannel & { guild_id?: string };
      if (channel.guild_id) guildByChannel.set(channel.id, channel.guild_id);
      break;
    }
    case "CHANNEL_DELETE": {
      const channel = raw as APIChannel;
      if (unreadByChannel.delete(channel.id)) emit();
      break;
    }
    case "MESSAGE_CREATE":
      handleMessage(raw as APIMessage & { guild_id?: string });
      break;
    case "MESSAGE_DELETE": {
      const data = raw as { id: string; channel_id: string };
      if (unreadByChannel.get(data.channel_id)?.delete(data.id)) emit();
      break;
    }
  }
}

function handleMessage(message: APIMessage & { guild_id?: string }) {
  const bot = selfId();
  if (!bot) return;
  if (message.guild_id) guildByChannel.set(message.channel_id, message.guild_id);
  if (isNewer(message.id, latestByChannel.get(message.channel_id))) {
    latestByChannel.set(message.channel_id, message.id);
  }

  // Writing in a channel means having read it, as in Discord.
  if (message.author?.id === bot) {
    markChannelRead(message.channel_id);
    return;
  }
  // The channel the user is looking at right now is read by definition.
  if (useClient.getState().selectedChannelId === message.channel_id && isPageActive()) {
    markRead(bot, { [message.channel_id]: message.id });
    return;
  }
  if (!isNewer(message.id, getLastRead(bot, message.channel_id))) return;
  addUnread(message.channel_id, [message.id]);
}

function addUnread(channelId: string, ids: string[]) {
  if (ids.length === 0) return;
  const set = unreadByChannel.get(channelId) ?? new Set<string>();
  const before = set.size;
  for (const id of ids) {
    if (set.size >= MAX_IDS_PER_CHANNEL) break;
    set.add(id);
  }
  unreadByChannel.set(channelId, set);
  if (set.size !== before) emit();
}

/**
 * Marks everything in the channel as read: clears its badge and moves its
 * marker to the newest message this client knows of.
 */
export function markChannelRead(channelId: string) {
  const bot = selfId();
  const loaded = useClient.getState().messagesByChannel[channelId];
  const newestLoaded = loaded?.length ? loaded[loaded.length - 1].id : undefined;
  const candidates = [latestByChannel.get(channelId), newestLoaded, ...(unreadByChannel.get(channelId) ?? [])];
  let newest: string | undefined;
  for (const id of candidates) if (id && isNewer(id, newest)) newest = id;
  if (bot && newest) markRead(bot, { [channelId]: newest });
  if (unreadByChannel.delete(channelId)) emit();
}

/** Same as before: drop a channel's badge (used by "Mark as read" menus). */
export function clearUnread(channelId: string) {
  markChannelRead(channelId);
}

export function clearAllUnread() {
  const channels = [...unreadByChannel.keys()];
  for (const channelId of channels) markChannelRead(channelId);
}

/** Drops unread ids that a newer marker (another tab, the vault) now covers. */
function applyMarkers() {
  const bot = selfId();
  if (!bot) return;
  let changed = false;
  for (const [channelId, ids] of unreadByChannel) {
    const marker = getLastRead(bot, channelId);
    for (const id of ids) {
      if (!isNewer(id, marker)) {
        ids.delete(id);
        changed = true;
      }
    }
    if (ids.size === 0) unreadByChannel.delete(channelId);
  }
  if (changed) emit();
}

/** Every text channel of a guild the bot may read, checked against its marker. */
function catchUpGuild(guild: GatewayGuildCreateDispatchData, session: number) {
  const bot = selfId();
  if (!bot || guild.unavailable) return;
  const self = (guild.members ?? []).find((member) => member.user?.id === bot) as
    | APIGuildMember
    | undefined;

  const baseline: Record<string, string> = {};
  const work: Array<{ channelId: string; after: string }> = [];
  for (const channel of (guild.channels ?? []) as APIChannel[]) {
    guildByChannel.set(channel.id, guild.id);
    if (!MESSAGE_CHANNELS.has(channel.type)) continue;
    const last = "last_message_id" in channel ? channel.last_message_id : null;
    if (!last) continue;
    if (isNewer(last, latestByChannel.get(channel.id))) latestByChannel.set(channel.id, last);
    if (self) {
      const permissions = channelPermissions(guild, self, channel);
      if (!has(permissions, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory)) {
        continue;
      }
    }
    const marker = getLastRead(bot, channel.id);
    // A channel never seen before starts out read; only what comes after counts.
    if (!marker) baseline[channel.id] = last;
    else if (isNewer(last, marker)) work.push({ channelId: channel.id, after: marker });
  }
  markRead(bot, baseline);
  runCatchUp(work, session);
}

/** The bot's remembered DMs, checked the same way. */
async function catchUpDMs(session: number) {
  const bot = selfId();
  if (!bot) return;
  const rest = useClient.getState().getRest();
  const work: Array<{ channelId: string; after: string }> = [];
  const baseline: Record<string, string> = {};
  for (const dm of getDMs()) {
    const marker = getLastRead(bot, dm.channelId);
    if (marker) {
      work.push({ channelId: dm.channelId, after: marker });
      continue;
    }
    try {
      const channel = (await api.channel(rest, dm.channelId)) as APIChannel & { last_message_id?: string | null };
      if (session !== generation) return;
      if (channel.last_message_id) baseline[dm.channelId] = channel.last_message_id;
    } catch {
      // A DM the bot can no longer open has nothing to report.
    }
  }
  markRead(bot, baseline);
  runCatchUp(work, session);
}

interface CatchUpItem {
  channelId: string;
  after: string;
  session: number;
}

/** One queue for every server and DM, so a bot in many servers does not flood Discord. */
const catchUpQueue: CatchUpItem[] = [];
let catchUpWorkers = 0;

/** Fetches what arrived after each marker, a few channels at a time. */
function runCatchUp(work: Array<{ channelId: string; after: string }>, session: number) {
  for (const item of work) catchUpQueue.push({ ...item, session });
  while (catchUpWorkers < CATCH_UP_CONCURRENCY && catchUpQueue.length > 0) {
    catchUpWorkers += 1;
    void catchUpWorker().finally(() => {
      catchUpWorkers -= 1;
    });
  }
}

async function catchUpWorker() {
  for (;;) {
    const item = catchUpQueue.shift();
    if (!item) return;
    if (item.session !== generation) continue;
    try {
      await catchUpChannel(item);
    } catch {
      // No access any more, or the channel is gone: nothing to show.
    }
  }
}

async function catchUpChannel({ channelId, after, session }: CatchUpItem) {
  const messages = await api.messages(useClient.getState().getRest(), channelId, {
    after,
    limit: CATCH_UP_LIMIT,
  });
  const bot = selfId();
  if (session !== generation || !bot) return;
  // Re-read the marker: the channel may have been opened meanwhile.
  const marker = getLastRead(bot, channelId);
  const fresh = messages.filter((message) => isNewer(message.id, marker));
  for (const message of fresh) {
    if (isNewer(message.id, latestByChannel.get(channelId))) latestByChannel.set(channelId, message.id);
  }
  // Up to the bot's own last message the channel counts as read.
  let ownLast: string | undefined;
  for (const message of fresh) {
    if (message.author.id === bot && isNewer(message.id, ownLast)) ownLast = message.id;
  }
  if (ownLast) markRead(bot, { [channelId]: ownLast });
  if (useClient.getState().selectedChannelId === channelId && isPageActive()) {
    markChannelRead(channelId);
    return;
  }
  addUnread(
    channelId,
    fresh
      .filter((message) => message.author.id !== bot && isNewer(message.id, ownLast))
      .map((message) => message.id),
  );
}

/** Coming back to the tab reads the channel that is open in it. */
function watchPage(): () => void {
  if (typeof window === "undefined") return () => {};
  const onActive = () => {
    const channelId = useClient.getState().selectedChannelId;
    if (channelId && isPageActive()) markChannelRead(channelId);
  };
  window.addEventListener("focus", onActive);
  document.addEventListener("visibilitychange", onActive);
  return () => {
    window.removeEventListener("focus", onActive);
    document.removeEventListener("visibilitychange", onActive);
  };
}

/**
 * The tab title and the installed app's icon badge carry the total, the way
 * Discord's own tab does. Muted channels and servers do not count towards it.
 */
function updateTotals() {
  if (typeof document === "undefined") return;
  const settings = getSettings();
  let total = 0;
  for (const [channelId, ids] of unreadByChannel) {
    const guildId = guildByChannel.get(channelId);
    if (settings.mutedChannelIds.includes(channelId)) continue;
    if (guildId && settings.mutedGuildIds.includes(guildId)) continue;
    total += ids.size;
  }
  baseTitle ??= document.title.replace(/^\(\d+\+?\) /, "");
  document.title = total > 0 ? `(${total > 99 ? "99+" : total}) ${baseTitle}` : baseTitle;
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (total > 0) void nav.setAppBadge?.(total).catch(() => {});
  else void nav.clearAppBadge?.().catch(() => {});
}

export function getUnread(channelId: string): number {
  return unreadByChannel.get(channelId)?.size ?? 0;
}

export function getGuildUnread(guildId: string): number {
  let total = 0;
  for (const [channelId, ids] of unreadByChannel) {
    if (guildByChannel.get(channelId) === guildId) total += ids.size;
  }
  return total;
}

/** Every unread message outside servers, i.e. in direct messages. */
export function getDMUnread(): number {
  let total = 0;
  for (const [channelId, ids] of unreadByChannel) {
    if (!guildByChannel.has(channelId)) total += ids.size;
  }
  return total;
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

export function useDMUnread(): number {
  return useSyncExternalStore(subscribe, getDMUnread, () => 0);
}
