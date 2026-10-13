import { ChannelType } from "discord-api-types/v10";
import type {
  APIChannel,
  APIGuildMember,
  APIMessage,
  APIThreadChannel,
  APIThreadList,
} from "discord-api-types/v10";
import { DISCORD_EPOCH } from "@/lib/discord/roles";
import type { RestClient } from "@/lib/discord/rest";

/** Channel types that hold messages of their own and can be exported. */
export const EXPORTABLE_TYPES = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
]);

export function isExportable(channel: APIChannel | undefined): boolean {
  return channel !== undefined && EXPORTABLE_TYPES.has(channel.type);
}

/** The smallest snowflake Discord could have issued at this moment. */
export function snowflakeAt(date: Date): string {
  const ms = BigInt(Math.max(0, date.getTime() - DISCORD_EPOCH));
  return (ms << 22n).toString();
}

export interface FetchProgress {
  /** Messages collected from this channel so far. */
  count: number;
  /** 0-1 share of the requested time range already covered, when it can be told. */
  fraction: number | null;
}

/**
 * Every message of a channel inside the range, oldest first.
 *
 * Pages forward with `after`, the way DiscordChatExporter does, so a cancelled
 * export still holds a coherent beginning of the history.
 */
export async function fetchChannelMessages(
  rest: RestClient,
  channelId: string,
  options: {
    after: Date | null;
    before: Date | null;
    signal?: AbortSignal;
    onProgress?: (progress: FetchProgress) => void;
  },
): Promise<APIMessage[]> {
  const start = options.after ? BigInt(snowflakeAt(options.after)) : 0n;
  const stop = options.before ? BigInt(snowflakeAt(options.before)) : null;
  const end = stop ?? BigInt(snowflakeAt(new Date()));
  // Nothing before the channel existed can be in it, so progress starts there.
  const floor = start > BigInt(channelId) ? start : BigInt(channelId);

  const messages: APIMessage[] = [];
  let cursor = start.toString();

  for (;;) {
    options.signal?.throwIfAborted();
    const page = await rest.get<APIMessage[]>(`/channels/${channelId}/messages`, {
      query: { limit: 100, after: cursor },
      signal: options.signal,
    });
    // Discord sends the page newest first even when paging forward.
    page.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

    let done = page.length < 100;
    for (const message of page) {
      if (stop !== null && BigInt(message.id) >= stop) {
        done = true;
        break;
      }
      messages.push(message);
    }

    const last = page[page.length - 1];
    if (last) cursor = last.id;
    const span = end - floor;
    options.onProgress?.({
      count: messages.length,
      fraction:
        last && span > 0n
          ? Math.min(1, Number(((BigInt(last.id) - floor) * 1000n) / span) / 1000)
          : null,
    });
    if (done || !last) break;
  }

  return messages;
}

/**
 * Threads under the given parents: the active ones and, with `archived`, the
 * archived public ones too. Private archived threads need Manage Threads, so
 * they are tried and quietly skipped when Discord says no.
 */
export async function fetchThreads(
  rest: RestClient,
  guildId: string,
  parentIds: Set<string>,
  options: { archived: boolean; signal?: AbortSignal },
): Promise<APIThreadChannel[]> {
  const found = new Map<string, APIThreadChannel>();

  const active = await rest.get<APIThreadList>(`/guilds/${guildId}/threads/active`, {
    signal: options.signal,
  });
  for (const thread of active.threads as APIThreadChannel[]) {
    if (thread.parent_id && parentIds.has(thread.parent_id)) found.set(thread.id, thread);
  }

  if (options.archived) {
    for (const parentId of parentIds) {
      for (const kind of ["public", "private"] as const) {
        let before: string | undefined;
        try {
          for (;;) {
            options.signal?.throwIfAborted();
            const page = await rest.get<APIThreadList & { has_more?: boolean }>(
              `/channels/${parentId}/threads/archived/${kind}`,
              { query: { limit: 100, before }, signal: options.signal },
            );
            const threads = page.threads as APIThreadChannel[];
            for (const thread of threads) found.set(thread.id, thread);
            const last = threads[threads.length - 1];
            if (!page.has_more || !last?.thread_metadata?.archive_timestamp) break;
            before = last.thread_metadata.archive_timestamp;
          }
        } catch (cause) {
          if (options.signal?.aborted) throw cause;
          // Missing access to this parent's archive; the rest still exports.
        }
      }
    }
  }

  return [...found.values()];
}

/**
 * Members behind the authors of an export, for nicknames and role colours.
 * The gateway rarely has them all, so the missing ones are asked for one by
 * one; someone who left the server simply stays unknown.
 */
export async function fetchMissingMembers(
  rest: RestClient,
  guildId: string,
  userIds: Iterable<string>,
  known: Map<string, APIGuildMember | null>,
  signal?: AbortSignal,
): Promise<void> {
  for (const userId of userIds) {
    if (known.has(userId)) continue;
    signal?.throwIfAborted();
    try {
      known.set(
        userId,
        await rest.get<APIGuildMember>(`/guilds/${guildId}/members/${userId}`, { signal }),
      );
    } catch (cause) {
      if (signal?.aborted) throw cause;
      known.set(userId, null);
    }
  }
}
