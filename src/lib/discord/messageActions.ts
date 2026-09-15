import { AllowedMentionsTypes } from "discord-api-types/v10";
import type {
  APIMessage,
  APIUser,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import { api } from "./api";
import type { RestClient } from "./rest";

/** Shape Discord uses inside `message.reactions[].emoji` and reaction gateway events. */
export interface ReactionEmoji {
  id?: string | null;
  name?: string | null;
  animated?: boolean;
}

/**
 * Reaction routes take the emoji as `name:id` for custom emoji and the raw
 * character for unicode ones. The whole token is URL-encoded by the caller.
 */
export function reactionToken(emoji: ReactionEmoji | string): string {
  if (typeof emoji === "string") return emoji;
  if (emoji.id) return `${emoji.name ?? "_"}:${emoji.id}`;
  return emoji.name ?? "";
}

/** Stable identity for a reaction: custom emoji by id, unicode by character. */
export function emojiKey(emoji: ReactionEmoji | string): string {
  if (typeof emoji === "string") return emoji;
  return emoji.id ?? emoji.name ?? "";
}

/** What a user sees in the reaction pill. */
export function emojiLabel(emoji: ReactionEmoji | string): string {
  if (typeof emoji === "string") return emoji;
  return emoji.id ? `:${emoji.name ?? "emoji"}:` : (emoji.name ?? "");
}

export function editMessage(
  rest: RestClient,
  channelId: string,
  messageId: string,
  content: string,
) {
  return api.editMessage(rest, channelId, messageId, content);
}

export function deleteMessage(
  rest: RestClient,
  channelId: string,
  messageId: string,
  reason?: string,
) {
  return rest.delete<void>(`/channels/${channelId}/messages/${messageId}`, { reason });
}

/**
 * Reply to a message. `fail_if_not_exists: false` degrades to a plain message
 * when the referenced one was deleted meanwhile, instead of erroring out.
 */
export function replyToMessage(
  rest: RestClient,
  channelId: string,
  messageId: string,
  content: string,
  options: { mention?: boolean } = {},
) {
  const body: RESTPostAPIChannelMessageJSONBody = {
    content,
    message_reference: { message_id: messageId, channel_id: channelId, fail_if_not_exists: false },
    allowed_mentions: { replied_user: options.mention ?? false, parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role] },
  };
  return api.sendMessage(rest, channelId, body);
}

export function addReaction(
  rest: RestClient,
  channelId: string,
  messageId: string,
  emoji: ReactionEmoji | string,
) {
  return api.addReaction(rest, channelId, messageId, reactionToken(emoji));
}

export function removeOwnReaction(
  rest: RestClient,
  channelId: string,
  messageId: string,
  emoji: ReactionEmoji | string,
) {
  return api.removeReaction(rest, channelId, messageId, reactionToken(emoji));
}

export function toggleReaction(
  rest: RestClient,
  channelId: string,
  messageId: string,
  emoji: ReactionEmoji | string,
  currentlyReacted: boolean,
) {
  return currentlyReacted
    ? removeOwnReaction(rest, channelId, messageId, emoji)
    : addReaction(rest, channelId, messageId, emoji);
}

export function removeUserReaction(
  rest: RestClient,
  channelId: string,
  messageId: string,
  emoji: ReactionEmoji | string,
  userId: string,
) {
  return rest.delete<void>(
    `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(
      reactionToken(emoji),
    )}/${userId}`,
  );
}

export function removeAllReactions(rest: RestClient, channelId: string, messageId: string) {
  return rest.delete<void>(`/channels/${channelId}/messages/${messageId}/reactions`);
}

export function getReactionUsers(
  rest: RestClient,
  channelId: string,
  messageId: string,
  emoji: ReactionEmoji | string,
  options: { limit?: number; after?: string; signal?: AbortSignal } = {},
) {
  return rest.get<APIUser[]>(
    `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(
      reactionToken(emoji),
    )}`,
    { query: { limit: options.limit ?? 25, after: options.after }, signal: options.signal },
  );
}

export function pinMessage(
  rest: RestClient,
  channelId: string,
  messageId: string,
  reason?: string,
) {
  return rest.put<void>(`/channels/${channelId}/pins/${messageId}`, { reason });
}

export function unpinMessage(
  rest: RestClient,
  channelId: string,
  messageId: string,
  reason?: string,
) {
  return rest.delete<void>(`/channels/${channelId}/pins/${messageId}`, { reason });
}

export function togglePin(
  rest: RestClient,
  channelId: string,
  messageId: string,
  currentlyPinned: boolean,
) {
  return currentlyPinned
    ? unpinMessage(rest, channelId, messageId)
    : pinMessage(rest, channelId, messageId);
}

export function fetchMessage(rest: RestClient, channelId: string, messageId: string) {
  return rest.get<APIMessage>(`/channels/${channelId}/messages/${messageId}`);
}

/** Direct messages have no guild, and Discord spells that part `@me` in links. */
export function messageLink(
  message: Pick<APIMessage, "id" | "channel_id"> & { guild_id?: string | null },
): string {
  return `https://discord.com/channels/${message.guild_id ?? "@me"}/${message.channel_id}/${message.id}`;
}

/** Clipboard API needs a secure context; fall back to a hidden textarea. */
export async function copyMessageLink(
  message: Pick<APIMessage, "id" | "channel_id"> & { guild_id?: string | null },
): Promise<string> {
  const link = messageLink(message);
  await copyText(link);
  return link;
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const holder = document.createElement("textarea");
  holder.value = text;
  holder.setAttribute("readonly", "");
  holder.style.position = "fixed";
  holder.style.opacity = "0";
  document.body.appendChild(holder);
  holder.select();
  document.execCommand("copy");
  holder.remove();
}

export function messageErrorText(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
}
