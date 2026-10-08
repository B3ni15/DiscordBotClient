"use client";

import type {
  APIInteraction,
  APIInteractionResponseCallbackData,
  APIMessage,
} from "discord-api-types/v10";
import { api } from "@/lib/discord/api";
import { commandApi } from "@/lib/discord/commandApi";
import type { RestClient } from "@/lib/discord/rest";
import { runInSandbox, type LogLevel } from "./sandbox";
import { appendLog, finishRun, startRun } from "./scriptRuns";
import { patchInteraction, snowflakeTimestamp } from "./useInteractions";

/** A script that has not finished by then is stopped. */
export const SCRIPT_TIMEOUT_MS = 60_000;

/**
 * Discord drops an interaction that is not acknowledged within three seconds.
 * A script still busy at this point is deferred on its behalf, so a slow fetch
 * does not end in "The application did not respond".
 */
const AUTO_DEFER_AFTER_MS = 2_000;

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
 */
function checkPath(path: unknown): string {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error('A Discord API path must start with "/", e.g. "/channels/123/messages".');
  }
  if (path.includes("..") || path.includes("\\") || path.includes("//") || /[?#]/.test(path)) {
    throw new Error("That path is not allowed. Pass query parameters as the second argument.");
  }
  return path;
}

type ResponseState = "none" | "deferred" | "replied";

/**
 * Answers one interaction the way discord.js would let a handler: the first
 * reply goes to the callback route, a reply after a defer edits the
 * placeholder, and anything after that becomes a follow-up. Operations are
 * queued so the automatic defer cannot race the script's own reply.
 */
class Responder {
  state: ResponseState = "none";
  autoDeferred = false;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly rest: RestClient,
    private readonly interaction: APIInteraction,
    /** Test runs talk to nothing; they only log what would have been sent. */
    private readonly test: boolean,
    private readonly log: (text: string) => void,
  ) {}

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(task, task);
    this.#queue = result.catch(() => {});
    return result;
  }

  #mark(state: ResponseState, note: string) {
    this.state = state;
    if (!this.test) {
      patchInteraction(this.interaction.id, state === "deferred" ? "deferred" : "answered", note);
    }
  }

  reply(payload: Payload): Promise<APIMessage | null> {
    return this.#enqueue(async () => {
      const { id, token, application_id } = this.interaction;
      if (this.state === "none") {
        this.log(`reply → ${summarize(payload)}`);
        if (!this.test) await commandApi.respond(this.rest, id, token, payload);
        this.#mark("replied", "Answered by its command script.");
        return null;
      }
      if (this.state === "deferred") {
        this.log(`reply (edits the deferred response) → ${summarize(payload)}`);
        const message = this.test
          ? null
          : await commandApi.editOriginalResponse(this.rest, application_id, token, payload);
        this.#mark("replied", "Answered by its command script.");
        return message;
      }
      this.log(`reply (already answered, sent as a follow-up) → ${summarize(payload)}`);
      return this.test ? null : commandApi.followUp(this.rest, application_id, token, payload);
    });
  }

  defer(ephemeral: boolean, automatic = false): Promise<null> {
    return this.#enqueue(async () => {
      if (this.state !== "none") return null;
      this.log(
        `${automatic ? "deferred automatically (the script is still running)" : "defer"}${
          ephemeral ? " — ephemeral" : ""
        }`,
      );
      if (!this.test) await commandApi.defer(this.rest, this.interaction.id, this.interaction.token, ephemeral);
      this.autoDeferred = automatic;
      this.#mark("deferred", "Deferred by its command script.");
      return null;
    });
  }

  followUp(payload: Payload): Promise<APIMessage | null> {
    if (this.state === "none") return this.reply(payload);
    return this.#enqueue(async () => {
      this.log(`followUp → ${summarize(payload)}`);
      if (this.test) return null;
      return commandApi.followUp(this.rest, this.interaction.application_id, this.interaction.token, payload);
    });
  }

  editReply(payload: Payload): Promise<APIMessage | null> {
    if (this.state === "none") return this.reply(payload);
    return this.#enqueue(async () => {
      this.log(`editReply → ${summarize(payload)}`);
      const message = this.test
        ? null
        : await commandApi.editOriginalResponse(
            this.rest,
            this.interaction.application_id,
            this.interaction.token,
            payload,
          );
      this.#mark("replied", "Answered by its command script.");
      return message;
    });
  }

  deleteReply(): Promise<null> {
    return this.#enqueue(async () => {
      if (this.state === "none") throw new Error("There is no reply to delete yet.");
      this.log("deleteReply");
      if (!this.test) {
        await this.rest.delete<void>(
          `/webhooks/${this.interaction.application_id}/${this.interaction.token}/messages/@original`,
        );
      }
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
  test = false,
}: RunScriptOptions): Promise<void> {
  const invoker = interaction.member?.user ?? interaction.user ?? null;
  const runId = startRun(botId, name, test, invoker ? (invoker.global_name ?? invoker.username) : null);
  const system = (text: string) => appendLog(runId, "system", text);
  const responder = new Responder(rest, interaction, test, system);

  if (test) system("Test run: replies are only logged here; discord.* and send() calls are real.");

  // Acknowledge on the script's behalf before Discord's three seconds run out.
  const createdAt = test ? Date.now() : snowflakeTimestamp(interaction.id);
  let running = true;
  const deferTimer = setTimeout(
    () => {
      if (running && responder.state === "none") {
        responder.defer(false, true).catch((cause: unknown) => {
          system(`Automatic defer failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        });
      }
    },
    Math.max(0, createdAt + AUTO_DEFER_AFTER_MS - Date.now()),
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
        const [verb, path, options] = args as [string, unknown, { query?: Record<string, string>; body?: unknown }];
        const allowed = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
        const httpMethod = allowed.find((entry) => entry === verb);
        if (!httpMethod) throw new Error(`Unsupported method ${verb}.`);
        const checked = checkPath(path);
        system(`discord.${httpMethod.toLowerCase()} ${checked}`);
        return rest.request(checked, {
          method: httpMethod,
          query: options?.query ?? undefined,
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
  );
  running = false;
  clearTimeout(deferTimer);

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
      system(`Finished in ${Date.now() - createdAt} ms.`);
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
