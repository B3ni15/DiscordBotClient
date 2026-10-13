import { ChannelType } from "discord-api-types/v10";
import type {
  APIChannel,
  APIGuildMember,
  APIMessage,
  APIThreadChannel,
  APIThreadList,
} from "discord-api-types/v10";
import { RequestPacer, type PacerState } from "@/lib/discord/dmPacer";
import type { GatewayClient } from "@/lib/discord/gateway";
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
 * At most this many authors are looked up. The gateway answers 100 per
 * request, and Discord may rate limit those requests per server.
 */
export const MAX_MEMBER_LOOKUPS = 300;
const MEMBER_BATCH = 100;
/** How long a batch may take before the export moves on without it. */
const MEMBER_TIMEOUT_MS = 15_000;

/**
 * Members behind the authors of an export, for nicknames and role colours.
 *
 * Asked over the gateway, 100 at a time, rather than with one REST request
 * per author: everyone who has left the server would answer 404 there, and
 * Discord counts every 4xx towards a limit that ends in a temporary ban. The
 * gateway lists them as `not_found` instead. Busiest authors go first; anyone
 * past the cap, or not found, keeps their account name.
 */
export async function fetchMissingMembers(
  gateway: GatewayClient | null,
  guildId: string,
  userIds: string[],
  known: Map<string, APIGuildMember | null>,
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number) => void;
    onWait?: (ms: number) => void;
  } = {},
): Promise<void> {
  // Without a live gateway the export goes on with account names only.
  if (!gateway || gateway.status !== "ready") return;
  const wanted = userIds.filter((id) => !known.has(id)).slice(0, MAX_MEMBER_LOOKUPS);

  for (let start = 0; start < wanted.length; start += MEMBER_BATCH) {
    options.signal?.throwIfAborted();
    const batch = wanted.slice(start, start + MEMBER_BATCH);
    const members = await requestMembers(gateway, guildId, batch, options);
    for (const member of members) if (member.user) known.set(member.user.id, member);
    for (const id of batch) if (!known.has(id)) known.set(id, null);
    options.onProgress?.(start + batch.length);
  }
}

interface MembersChunk {
  nonce?: string;
  members: APIGuildMember[];
  chunk_index: number;
  chunk_count: number;
}

interface RateLimited {
  opcode: number;
  retry_after: number;
  meta?: { guild_id?: string; nonce?: string };
}

/** One gateway member request, retried when Discord says it came too soon. */
function requestMembers(
  gateway: GatewayClient,
  guildId: string,
  userIds: string[],
  options: { signal?: AbortSignal; onWait?: (ms: number) => void },
): Promise<APIGuildMember[]> {
  return new Promise((resolve, reject) => {
    const nonce = Math.random().toString(36).slice(2, 18);
    const members: APIGuildMember[] = [];
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      unsubscribe();
      clearTimeout(timeout);
      clearTimeout(retry);
      options.signal?.removeEventListener("abort", onAbort);
    };
    // A lost answer is not worth failing the export over.
    const finish = () => {
      cleanup();
      resolve(members);
    };
    const send = () => {
      gateway.requestGuildMembers(guildId, { userIds, nonce });
      clearTimeout(timeout);
      timeout = setTimeout(finish, MEMBER_TIMEOUT_MS);
    };
    function onAbort() {
      cleanup();
      reject(options.signal!.reason);
    }

    const unsubscribe = gateway.on("dispatch", (event, data) => {
      if (event === "GUILD_MEMBERS_CHUNK") {
        const chunk = data as MembersChunk;
        if (chunk.nonce !== nonce) return;
        members.push(...chunk.members);
        if (chunk.chunk_index + 1 >= chunk.chunk_count) finish();
      } else if (event === "RATE_LIMITED") {
        const limited = data as RateLimited;
        if (limited.meta?.nonce !== nonce) return;
        const ms = Math.ceil(limited.retry_after * 1000);
        options.onWait?.(ms);
        clearTimeout(timeout);
        retry = setTimeout(send, ms);
      }
    });

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    send();
  });
}
