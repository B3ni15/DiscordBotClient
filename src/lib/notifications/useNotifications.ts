"use client";

import { useEffect } from "react";
import type {
  APIMessage,
  GatewayMessageCreateDispatchData,
} from "discord-api-types/v10";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";
import { subscribeDispatch } from "./dispatch";
import { notificationsSupported } from "./permission";
import { getSettings } from "./settings";
import { playBlip } from "./sound";
import { startUnreadTracking } from "./unread";

const BODY_LIMIT = 140;

/**
 * Turns gateway messages into browser notifications.
 *
 * Mount once, high in the tree. Settings are read fresh on every event so the
 * subscription never has to be torn down when a preference changes, and it also
 * keeps the unread tracker alive for as long as the app is mounted.
 */
export function useNotifications() {
  useEffect(() => {
    const stopUnread = startUnreadTracking();
    const stopDispatch = subscribeDispatch(handleDispatch);
    return () => {
      stopDispatch();
      stopUnread();
    };
  }, []);
}

function handleDispatch(event: string, raw: unknown) {
  if (event !== "MESSAGE_CREATE") return;
  const message = raw as GatewayMessageCreateDispatchData;
  if (!shouldNotify(message)) return;
  notify(message);
}

function shouldNotify(message: GatewayMessageCreateDispatchData): boolean {
  const settings = getSettings();
  if (!settings.enabled || settings.mode === "none") return false;

  const state = useClient.getState();
  const selfId = state.user?.id;
  // Never notify about the bot's own echo.
  if (!selfId || message.author?.id === selfId) return false;

  if (settings.mutedChannelIds.includes(message.channel_id)) return false;
  const guildId = message.guild_id ?? guildOf(message.channel_id);
  if (guildId && settings.mutedGuildIds.includes(guildId)) return false;

  // Reading the channel right now with the tab in front is not worth a popup.
  if (state.selectedChannelId === message.channel_id && isPageActive()) return false;

  if (settings.mode === "mentions" && !mentionsSelf(message, selfId, guildId)) return false;
  return true;
}

function mentionsSelf(
  message: GatewayMessageCreateDispatchData,
  selfId: string,
  guildId: string | undefined,
): boolean {
  if (message.mention_everyone) return true;
  if ((message.mentions ?? []).some((user) => user.id === selfId)) return true;
  const roles = message.mention_roles ?? [];
  if (roles.length === 0 || !guildId) return false;
  const selfRoles = useClient.getState().membersByGuild[guildId]?.[selfId]?.roles ?? [];
  return roles.some((roleId) => selfRoles.includes(roleId));
}

function notify(message: GatewayMessageCreateDispatchData) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;

  const state = useClient.getState();
  const channel = state.channelsById[message.channel_id] as { name?: string | null } | undefined;
  const author =
    message.member?.nick ?? message.author.global_name ?? message.author.username ?? "Unknown";
  const where = channel?.name ? `#${channel.name}` : "Direct message";

  let notification: Notification;
  try {
    notification = new Notification(`${author} - ${where}`, {
      body: body(message),
      icon: userAvatarUrl(message.author, 64),
      // One live popup per channel instead of a stack of them.
      tag: `disbotclient:${message.channel_id}`,
      silent: true,
    });
  } catch {
    // Some browsers only allow notifications from a service worker.
    return;
  }

  notification.onclick = () => {
    window.focus();
    void useClient.getState().selectChannel(message.channel_id);
    notification.close();
  };

  if (getSettings().sound) playBlip();
}

function body(message: APIMessage): string {
  const text = message.content?.trim();
  if (text) return text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT - 1)}…` : text;
  if (message.attachments?.length) return "[attachment]";
  if (message.embeds?.length) return "[embed]";
  if (message.sticker_items?.length) return "[sticker]";
  return "[empty message]";
}

function guildOf(channelId: string): string | undefined {
  const channel = useClient.getState().channelsById[channelId] as
    | { guild_id?: string }
    | undefined;
  return channel?.guild_id;
}

function isPageActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
}
