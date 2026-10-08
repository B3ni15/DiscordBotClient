"use client";

import type {
  APIInteraction,
  APIInteractionResponseCallbackData,
  APIMessage,
} from "discord-api-types/v10";
import { api } from "@/lib/discord/api";
import { commandApi } from "@/lib/discord/commandApi";
import { DiscordHTTPError, type RestClient } from "@/lib/discord/rest";
import { runInSandbox, type LogLevel } from "./sandbox";
import { appendLog, finishRun, startRun } from "./scriptRuns";
import { patchInteraction } from "./useInteractions";

/** A script that has not finished by then is stopped. */
export const SCRIPT_TIMEOUT_MS = 60_000;

/**
 * Discord drops an interaction that is not acknowledged within three seconds.
 * A script still busy this long after the interaction arrived is deferred on
 * its behalf, so a slow fetch does not end in "The application did not
 * respond". Measured from arrival rather than from the snowflake, so a
 * computer clock that is off cannot push it past the deadline.
 */
const AUTO_DEFER_AFTER_MS = 1_500;

/** Discord: the interaction was already acknowledged (by another client). */
const ALREADY_ACKNOWLEDGED = 40060;
/** Discord: unknown interaction — usually one whose three seconds are over. */
const UNKNOWN_INTERACTION = 10062;

const EPHEMERAL = 1 << 6;

/** What the person using the command sees when the script itself broke. */
const FAILURE_REPLY = "⚠️ Something went wrong while running this command.";

type Payload = APIInteractionResponseCallbackData;

/** A script may pass a string, or a message object with an `ephemeral` shortcut. */
function toPayload(value: unknown, allowEphemeral = true): Payload {
  if (value === null || value === undefined) throw new Error("There is nothing to send.");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { content: String(value) };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Send a string or a message object such as { content, embeds }.");
  }
  const { ephemeral, ...rest } = value as Payload & { ephemeral?: boolean };
  const payload: Payload = { ...rest };
  if (ephemeral && allowEphemeral) payload.flags = (Number(payload.flags) || 0) | EPHEMERAL;
  return payload;
}

/** Edits cannot change whether a message is ephemeral; Discord rejects the flag there. */
function forEdit(payload: Payload): Payload {
  if (payload.flags === undefined) return payload;
  const flags = (Number(payload.flags) || 0) & ~EPHEMERAL;
  return { ...payload, flags: flags || undefined };
}

function isEphemeral(payload: Payload): boolean {
  return ((Number(payload.flags) || 0) & EPHEMERAL) !== 0;
}

/** Whether a script's return value looks like something worth replying with. */
function isReplyable(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return "content" in value || "embeds" in value || "components" in value || "poll" in value;
}

/** One line for the console, without dumping a whole embed. */
function summarize(payload: Payload): string {
  const parts: string[] = [];
  if (payload.content) {
    parts.push(JSON.stringify(payload.content.length > 120 ? `${payload.content.slice(0, 120)}…` : payload.content));
  }
  if (payload.embeds?.length) parts.push(`${payload.embeds.length} embed(s)`);
  if (payload.components?.length) parts.push(`${payload.components.length} component row(s)`);
  if ((Number(payload.flags) || 0) & EPHEMERAL) parts.push("ephemeral");
  return parts.join(", ") || "(empty message)";
}

/**
 * Discord paths only. The REST client prefixes them with the same-origin proxy,
 * so a path that climbed out of it would reach this app's own routes instead.
 * A query string written into the path is split off into `query`.
 */
function checkPath(raw: unknown): { path: string; query: Record<string, string> } {
  if (typeof raw !== "string" || !raw.startsWith("/")) {
    throw new Error('A Discord API path must start with "/", e.g. "/channels/123/messages".');
  }
  const [path, search = ""] = raw.split("#")[0].split("?", 2);
  if (path.includes("..") || path.includes("\\") || path.includes("//") || /%2e|%2f|%5c/i.test(path)) {
    throw new Error("That path is not allowed.");
  }
  return { path, query: Object.fromEntries(new URLSearchParams(search)) };
}

type ResponseState = "none" | "deferred" | "replied";

/** Thrown when another client answered first, or the interaction expired. */
class LostInteraction extends Error {}

/**
 * Answers one interaction the way discord.js would let a handler: the first
 * reply goes to the callback route, a reply after a defer edits the
 * placeholder, and anything after that becomes a follow-up. Operations are
 * queued so the automatic defer cannot race the script's own reply.
 */
class Responder {
  state: ResponseState = "none";
  autoDeferred = false;
  #ephemeralDefer = false;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly rest: RestClient,
    private readonly interaction: APIInteraction,
    /** Test runs talk to nothing; they only log what would have been sent. */
    private readonly test: boolean,
    private readonly log: (text: string) => void,
    /** Called when the interaction turns out to be someone else's to answer. */
    private readonly onLost: (reason: string) => void,
  ) {}

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(task, task);
    this.#queue = result.catch(() => {});
    return result;
  }

  /** Resolves once every queued response has gone out (or failed). */
  idle(): Promise<void> {
    return this.#queue.then(() => undefined);
  }

  #mark(state: ResponseState, note: string) {
    this.state = state;
    if (!this.test) {
      patchInteraction(this.interaction.id, state === "deferred" ? "deferred" : "answered", note);
    }
  }

  /** The first acknowledgement; failing it means the interaction is not ours. */
  async #acknowledge(send: () => Promise<unknown>) {
    if (this.test) return;
    try {
      await send();
    } catch (cause) {
      if (cause instanceof DiscordHTTPError && cause.code === ALREADY_ACKNOWLEDGED) {
        this.onLost("Another client (another browser or device) answered this interaction first.");
        throw new LostInteraction("Another client already answered this interaction.");
      }
      if (cause instanceof DiscordHTTPError && cause.code === UNKNOWN_INTERACTION) {
        this.onLost("Discord no longer accepts an answer — the three seconds were over.");
        throw new LostInteraction("The interaction expired before it was answered.");
      }
      throw cause;
    }
  }

  #edit(payload: Payload) {
    return commandApi.editOriginalResponse(
      this.rest,
      this.interaction.application_id,
      this.interaction.token,
      forEdit(payload),
    );
  }

  #followUp(payload: Payload) {
    return commandApi.followUp(this.rest, this.interaction.application_id, this.interaction.token, payload);
  }

  #deleteOriginal() {
    return this.rest.delete<void>(
      `/webhooks/${this.interaction.application_id}/${this.interaction.token}/messages/@original`,
    );
  }

  reply(payload: Payload): Promise<APIMessage | null> {
    return this.#enqueue(() => this.#reply(payload));
  }

  /** The reply itself; only ever called from inside the queue. */
  async #reply(payload: Payload): Promise<APIMessage | null> {
    const { id, token } = this.interaction;
    if (this.state === "none") {
      this.log(`reply → ${summarize(payload)}`);
      await this.#acknowledge(() => commandApi.respond(this.rest, id, token, payload));
      this.#mark("replied", "Answered by its command script.");
      return null;
    }
    if (this.state === "deferred") {
      // The automatic defer was public; an ephemeral answer must not become
      // public by editing it. The placeholder goes first — Discord turns the
      // first follow-up after a defer into the edit of it otherwise.
      if (this.autoDeferred && !this.#ephemeralDefer && isEphemeral(payload)) {
        this.log(`reply (ephemeral, replaces the automatic “thinking…”) → ${summarize(payload)}`);
        if (!this.test) await this.#deleteOriginal();
        const message = this.test ? null : await this.#followUp(payload);
        this.#mark("replied", "Answered by its command script.");
        return message;
      }
      this.log(`reply (fills in the deferred response) → ${summarize(forEdit(payload))}`);
      const message = this.test ? null : await this.#edit(payload);
      this.#mark("replied", "Answered by its command script.");
      return message;
    }
    this.log(`reply (already answered, sent as a follow-up) → ${summarize(payload)}`);
    return this.test ? null : this.#followUp(payload);
  }

  defer(ephemeral: boolean, automatic = false): Promise<null> {
    return this.#enqueue(async () => {
      if (this.state !== "none") return null;
      this.log(
        `${automatic ? "deferred automatically (the script is still running)" : "defer"}${
          ephemeral ? " — ephemeral" : ""
        }`,
      );
      await this.#acknowledge(() =>
        commandApi.defer(this.rest, this.interaction.id, this.interaction.token, ephemeral),
      );
      this.autoDeferred = automatic;
      this.#ephemeralDefer = ephemeral;
      this.#mark("deferred", "Deferred by its command script.");
      return null;
    });
  }

  followUp(payload: Payload): Promise<APIMessage | null> {
    return this.#enqueue(async () => {
      // Decided in the queue, so a reply still on its way counts as sent.
      if (this.state !== "replied") return this.#reply(payload);
      this.log(`followUp → ${summarize(payload)}`);
      return this.test ? null : this.#followUp(payload);
    });
  }

  editReply(payload: Payload): Promise<APIMessage | null> {
    return this.#enqueue(async () => {
      if (this.state === "none") return this.#reply(payload);
      this.log(`editReply → ${summarize(forEdit(payload))}`);
      const message = this.test ? null : await this.#edit(payload);
      this.#mark("replied", "Answered by its command script.");
      return message;
    });
  }

  deleteReply(): Promise<null> {
    return this.#enqueue(async () => {
      if (this.state === "none") throw new Error("There is no reply to delete yet.");
      this.log("deleteReply");
      if (!this.test) await this.#deleteOriginal();
      return null;
    });
  }
}

export interface RunScriptOptions {
  rest: RestClient;
  botId: string;
  name: string;
  code: string;
  interaction: APIInteraction;
  /** When this client received the interaction (epoch ms); now by default. */
  receivedAt?: number;
  /** Simulates the interaction responses instead of sending them. */
  test?: boolean;
}

/** Runs one command script against one interaction, logging into the run console. */
export async function runCommandScript({
  rest,
  botId,
  name,
  code,
  interaction,
  receivedAt = Date.now(),
  test = false,
}: RunScriptOptions): Promise<void> {
  const invoker = interaction.member?.user ?? interaction.user ?? null;
  const runId = startRun(botId, name, test, invoker ? (invoker.global_name ?? invoker.username) : null);
  const system = (text: string) => appendLog(runId, "system", text);
  const stop = new AbortController();
  let lostReason: string | null = null;
  const responder = new Responder(rest, interaction, test, system, (reason) => {
    lostReason = reason;
    stop.abort();
  });

  if (test) system("Test run: replies are only logged here; discord.* and send() calls are real.");

  // Acknowledge on the script's behalf before Discord's three seconds run out.
  let running = true;
  const deferTimer = setTimeout(
    () => {
      if (running && responder.state === "none") {
        responder.defer(false, true).catch((cause: unknown) => {
          system(`Automatic defer failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        });
      }
    },
    Math.max(0, receivedAt + AUTO_DEFER_AFTER_MS - Date.now()),
  );

  const call = async (method: string, args: unknown[]): Promise<unknown> => {
    switch (method) {
      case "reply":
        return responder.reply(toPayload(args[0]));
      case "defer": {
        const options = (args[0] ?? {}) as { ephemeral?: boolean };
        return responder.defer(Boolean(options.ephemeral));
      }
      case "followUp":
        return responder.followUp(toPayload(args[0]));
      case "editReply":
        return responder.editReply(toPayload(args[0]));
      case "deleteReply":
        return responder.deleteReply();
      case "send": {
        const channelId = args[0];
        if (typeof channelId !== "string" || !/^\d+$/.test(channelId)) {
          throw new Error("send(channelId, message) needs a channel id.");
        }
        const payload = toPayload(args[1], false);
        system(`send to ${channelId} → ${summarize(payload)}`);
        return api.sendMessage(rest, channelId, payload as Parameters<typeof api.sendMessage>[2]);
      }
      case "rest": {
        const [verb, rawPath, options] = args as [
          string,
          unknown,
          { query?: Record<string, string> | null; body?: unknown } | null,
        ];
        const allowed = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
        const httpMethod = allowed.find((entry) => entry === verb);
        if (!httpMethod) throw new Error(`Unsupported method ${verb}.`);
        const { path, query } = checkPath(rawPath);
        system(`discord.${httpMethod.toLowerCase()} ${path}`);
        return rest.request(path, {
          method: httpMethod,
          query: { ...query, ...(options?.query ?? {}) },
          body: httpMethod === "GET" || httpMethod === "DELETE" ? undefined : options?.body,
        });
      }
      default:
        throw new Error(`Unknown call: ${method}`);
    }
  };

  const result = await runInSandbox(
    code,
    interaction,
    {
      call,
      log: (level: LogLevel, text: string) => appendLog(runId, level, text),
    },
    SCRIPT_TIMEOUT_MS,
    stop.signal,
  );
  running = false;
  clearTimeout(deferTimer);
  // A reply the script did not await may still be on its way.
  await responder.idle();

  if (lostReason !== null || result.status === "aborted") {
    system(`Stopped: ${lostReason ?? "the run was cancelled."}`);
    finishRun(runId, "error");
    if (!test) patchInteraction(interaction.id, "answered", lostReason ?? "Cancelled.");
    return;
  }

  try {
    if (result.status === "ok") {
      // `return "text"` is a shorthand for replying with it.
      if (responder.state !== "replied" && isReplyable(result.value)) {
        await responder.reply(toPayload(result.value));
      } else if (responder.state === "none") {
        system("The script finished without replying, so Discord will show “The application did not respond”.");
        if (!test) patchInteraction(interaction.id, "failed", "Its command script finished without replying.");
      } else if (responder.state === "deferred" && responder.autoDeferred) {
        // Nobody is going to fill in the "thinking…" placeholder; take it away.
        await responder.deleteReply();
        if (!test) {
          patchInteraction(interaction.id, "answered", "Its command script finished without replying.");
        }
      }
      system(`Finished in ${Date.now() - receivedAt} ms.`);
      finishRun(runId, "ok");
      return;
    }

    const reason =
      result.status === "timeout"
        ? `Stopped after ${SCRIPT_TIMEOUT_MS / 1000} s.`
        : result.phase === "compile"
          ? `Syntax error: ${result.message}`
          : result.message;
    appendLog(runId, "error", reason);
    finishRun(runId, result.status === "timeout" ? "timeout" : "error");
    try {
      // Tell the person who used the command, privately, instead of leaving them hanging.
      if (responder.state === "none") await responder.reply({ content: FAILURE_REPLY, flags: EPHEMERAL });
      else if (responder.state === "deferred") await responder.editReply({ content: FAILURE_REPLY });
    } finally {
      if (!test) patchInteraction(interaction.id, "failed", `Command script failed: ${reason}`);
    }
  } catch (cause) {
    appendLog(runId, "error", cause instanceof Error ? cause.message : String(cause));
    finishRun(runId, "error");
  }
}
