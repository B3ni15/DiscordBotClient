import { ChannelType } from "discord-api-types/v10";
import type {
  APIChannel,
  APIGuildMember,
  APIMessage,
  APIThreadChannel,
  APIThreadList,
} from "discord-api-types/v10";
import { RequestPacer, type PacerState } from "@/lib/discord/dmPacer";
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

/**
 * How an export talks to Discord. Every request takes its turn through the
 * pacer, so a long export runs at an even pace instead of draining the rate
 * limit and then sitting on 429s, which Discord counts against the bot.
 */
export interface Throttle {
  rest: RestClient;
  pacer: RequestPacer;
  signal?: AbortSignal;
  /** Hears when the pacer holds back, so the UI can say why it is waiting. */
  onWait?: (state: PacerState, ms: number) => void;
}

/**
 * Around three requests a second: a 100k-message channel takes about five
 * minutes. Each 429 doubles the spacing for the rest of the export and rests
 * a few seconds first; a short break every 150 requests keeps long exports
 * from crowding out the rest of the app.
 */
export function createExportPacer(): RequestPacer {
  return new RequestPacer({
    intervalMs: 300,
    jitterMs: 150,
    batch: 150,
    cooldownMs: 5_000,
    maxIntervalMs: 5_000,
  });
}

function get<T>(
  throttle: Throttle,
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const { rest, pacer, signal, onWait } = throttle;
  return pacer.run(rest, () => rest.get<T>(path, { query, signal }), { signal, onWait });
}

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
  throttle: Throttle,
  channelId: string,
  options: {
    after: Date | null;
    before: Date | null;
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
    throttle.signal?.throwIfAborted();
    const page = await get<APIMessage[]>(throttle, `/channels/${channelId}/messages`, {
      limit: 100,
      after: cursor,
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
  throttle: Throttle,
  guildId: string,
  parentIds: Set<string>,
  options: { archived: boolean },
): Promise<APIThreadChannel[]> {
  const found = new Map<string, APIThreadChannel>();

  const active = await get<APIThreadList>(throttle, `/guilds/${guildId}/threads/active`);
  for (const thread of active.threads as APIThreadChannel[]) {
    if (thread.parent_id && parentIds.has(thread.parent_id)) found.set(thread.id, thread);
  }

  if (options.archived) {
    let privateDenied = false;
    for (const parentId of parentIds) {
      for (const kind of ["public", "private"] as const) {
        if (kind === "private" && privateDenied) continue;
        let before: string | undefined;
        try {
          for (;;) {
            throttle.signal?.throwIfAborted();
            const page = await get<APIThreadList & { has_more?: boolean }>(
              throttle,
              `/channels/${parentId}/threads/archived/${kind}`,
              { limit: 100, before },
            );
            const threads = page.threads as APIThreadChannel[];
            for (const thread of threads) found.set(thread.id, thread);
            const last = threads[threads.length - 1];
            if (!page.has_more || !last?.thread_metadata?.archive_timestamp) break;
            before = last.thread_metadata.archive_timestamp;
          }
        } catch (cause) {
          if (throttle.signal?.aborted) throw cause;
          // Missing access to this parent's archive; the rest still exports.
          // Private archives need Manage Threads, so skip asking when that
          // already failed once rather than collecting a 403 per channel.
          if (kind === "private") privateDenied = true;
        }
      }
    }
  }

  return [...found.values()];
}

/**
 * At most this many authors are looked up one by one. Everyone who left the
 * server answers 404, and Discord counts every 4xx towards a limit that ends
 * in a temporary ban, so a huge history does not get one request per author.
 */
export const MAX_MEMBER_LOOKUPS = 250;

/**
 * Members behind the authors of an export, for nicknames and role colours.
 * The gateway rarely has them all, so the missing ones are asked for one by
 * one, busiest authors first; someone who left the server, or anyone past the
 * cap, simply keeps their account name.
 */
export async function fetchMissingMembers(
  throttle: Throttle,
  guildId: string,
  userIds: string[],
  known: Map<string, APIGuildMember | null>,
  onProgress?: (done: number) => void,
): Promise<void> {
  let done = 0;
  for (const userId of userIds.slice(0, MAX_MEMBER_LOOKUPS)) {
    if (known.has(userId)) continue;
    throttle.signal?.throwIfAborted();
    try {
      known.set(
        userId,
        await get<APIGuildMember>(throttle, `/guilds/${guildId}/members/${userId}`),
      );
    } catch (cause) {
      if (throttle.signal?.aborted) throw cause;
      known.set(userId, null);
    }
    done += 1;
    onProgress?.(done);
  }
}
