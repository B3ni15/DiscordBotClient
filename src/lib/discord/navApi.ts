import type {
  APIChannel,
  APIDMChannel,
  APIMessage,
  APIMessagePin,
  APIThreadList,
  RESTGetAPIGuildMessagesSearchResult,
} from "discord-api-types/v10";
import { DiscordHTTPError, type RestClient } from "./rest";

export interface SearchQuery {
  /** Free text; matched against message content. */
  content?: string;
  /** Snowflake of the author to restrict results to. */
  authorId?: string;
  /** Restrict to a single channel. */
  channelId?: string;
  limit?: number;
}

export interface SearchOutcome {
  messages: APIMessage[];
  /** True when the results come from the locally loaded history, not from Discord. */
  local: boolean;
  /** Set when the server-side search was refused (bot tokens get 403). */
  reason?: string;
}

/**
 * Endpoints used by the navigation panels. Kept apart from `api.ts` so the
 * chat surface and the navigation surface can evolve independently.
 */
export const navApi = {
  /** Every thread in the guild the bot can see that is not archived. */
  activeThreads: (rest: RestClient, guildId: string) =>
    rest.get<APIThreadList>(`/guilds/${guildId}/threads/active`),

  /** The bot must be a member of a thread before it can post there. */
  joinThread: (rest: RestClient, threadId: string) =>
    rest.put<void>(`/channels/${threadId}/thread-members/@me`),

  leaveThread: (rest: RestClient, threadId: string) =>
    rest.delete<void>(`/channels/${threadId}/thread-members/@me`),

  /**
   * Pinned messages. Discord replaced `GET /channels/{id}/pins` (a plain message
   * array) with `GET /channels/{id}/messages/pins` (`{ items: [{ message }] }`);
   * older guild shards still answer only the legacy route, so both are tried.
   */
  pinnedMessages: async (rest: RestClient, channelId: string): Promise<APIMessage[]> => {
    try {
      const result = await rest.get<{ items: APIMessagePin[]; has_more: boolean }>(
        `/channels/${channelId}/messages/pins`,
      );
      return (result.items ?? []).map((item) => item.message);
    } catch (error) {
      if (!(error instanceof DiscordHTTPError) || error.status !== 404) throw error;
      return rest.get<APIMessage[]>(`/channels/${channelId}/pins`);
    }
  },

  /**
   * Server-side message search. Discord only exposes this to user tokens, so a
   * bot token reliably gets 403 — callers should fall back to `searchLoaded`.
   */
  searchGuildMessages: (rest: RestClient, guildId: string, query: SearchQuery) =>
    rest.get<RESTGetAPIGuildMessagesSearchResult>(`/guilds/${guildId}/messages/search`, {
      query: {
        content: query.content || undefined,
        author_id: query.authorId || undefined,
        channel_id: query.channelId || undefined,
        limit: query.limit ?? 25,
      },
    }),

  createDM: (rest: RestClient, recipientId: string) =>
    rest.post<APIDMChannel>("/users/@me/channels", { body: { recipient_id: recipientId } }),

  channel: (rest: RestClient, channelId: string) =>
    rest.get<APIChannel>(`/channels/${channelId}`),
};

/** Client-side fallback: filters the history that is already in the store. */
export function searchLoaded(messages: APIMessage[], query: SearchQuery): APIMessage[] {
  const needle = query.content?.trim().toLowerCase() ?? "";
  const author = query.authorId?.trim().toLowerCase() ?? "";
  return messages
    .filter((message) => {
      if (needle && !message.content.toLowerCase().includes(needle)) return false;
      if (!author) return true;
      const candidates = [
        message.author.id,
        message.author.username,
        message.author.global_name ?? "",
      ].map((value) => value.toLowerCase());
      return candidates.some((value) => value.includes(author));
    })
    .slice(0, query.limit ?? 100);
}

/**
 * Tries Discord first and falls back to the loaded history. `local` tells the UI
 * which of the two produced the result so it can say so.
 */
export async function searchMessages(
  rest: RestClient,
  guildId: string | null,
  loaded: APIMessage[],
  query: SearchQuery,
): Promise<SearchOutcome> {
  if (guildId) {
    try {
      const result = await navApi.searchGuildMessages(rest, guildId, query);
      if ("messages" in result) {
        return { messages: result.messages.flat() as APIMessage[], local: false };
      }
      return {
        messages: searchLoaded(loaded, query),
        local: true,
        reason: "A szerver indexelése még nem készült el.",
      };
    } catch (error) {
      const forbidden = error instanceof DiscordHTTPError && (error.status === 403 || error.status === 401);
      return {
        messages: searchLoaded(loaded, query),
        local: true,
        reason: forbidden
          ? "A Discord keresési végpontja bot tokennel nem érhető el."
          : error instanceof Error
            ? error.message
            : "Ismeretlen hiba a keresés közben.",
      };
    }
  }
  return { messages: searchLoaded(loaded, query), local: true };
}

/** 10 = announcement thread, 11 = public thread, 12 = private thread. */
export const THREAD_CHANNEL_TYPES = new Set([10, 11, 12]);

export function isThread(channel: APIChannel | undefined): boolean {
  return channel !== undefined && THREAD_CHANNEL_TYPES.has(channel.type);
}
