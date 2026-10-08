/**
 * Runs a command script in a dedicated Web Worker.
 *
 * The worker is started from a `data:` URL, which gives it an opaque origin: it
 * cannot read this site's localStorage, IndexedDB (where the vault key lives) or
 * cookies, and it never sees the bot token. Everything it may do to Discord goes
 * through `postMessage` back to this page, which makes the request on its
 * behalf. A runaway loop only burns the worker's thread, never the UI's, and is
 * cut off by `terminate()` once the time limit is reached.
 */

/** Names the script can use, in the order the worker passes them in. */
export const SCRIPT_GLOBALS = [
  "interaction",
  "options",
  "user",
  "member",
  "guildId",
  "channelId",
  "reply",
  "defer",
  "followUp",
  "editReply",
  "deleteReply",
  "send",
  "discord",
  "EmbedBuilder",
  "sleep",
  "console",
] as const;

/**
 * The worker itself, as plain JavaScript: it is shipped as a string, so it must
 * not rely on anything the bundler would normally provide.
 */
const WORKER_SOURCE = String.raw`
"use strict";
const pending = new Map();
let nextCall = 0;

function plain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function call(method, ...args) {
  const id = ++nextCall;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      postMessage({ type: "call", id, method, args: args.map(plain) });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

/**
 * An error as "Name: message (line N)". The stack itself would mostly show
 * this worker's own data: URL; the script's line is the useful part of it. The
 * function header the constructor wraps the script in takes two lines.
 */
function describeError(error) {
  const match = /<anonymous>:(\d+):\d+/.exec(error.stack || "");
  const line = match ? Number(match[1]) - 2 : 0;
  return (error.name || "Error") + ": " + error.message + (line > 0 ? " (line " + line + ")" : "");
}

function format(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return describeError(value);
  if (value === undefined) return "undefined";
  if (typeof value === "function") return "[function " + (value.name || "anonymous") + "]";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function log(level, args) {
  postMessage({ type: "log", level, text: args.map(format).join(" ") });
}

const scriptConsole = {
  log: (...args) => log("log", args),
  info: (...args) => log("info", args),
  debug: (...args) => log("log", args),
  warn: (...args) => log("warn", args),
  error: (...args) => log("error", args),
};

function resolveColor(color) {
  if (typeof color === "number") return color;
  if (Array.isArray(color)) return (color[0] << 16) + (color[1] << 8) + color[2];
  if (typeof color === "string") {
    const hex = color.replace(/^#/, "");
    const parsed = parseInt(hex, 16);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

class EmbedBuilder {
  constructor(data) {
    this.data = Object.assign({}, data && data.toJSON ? data.toJSON() : data);
  }
  setTitle(title) { this.data.title = title; return this; }
  setDescription(description) { this.data.description = description; return this; }
  setURL(url) { this.data.url = url; return this; }
  setColor(color) { this.data.color = resolveColor(color); return this; }
  setAuthor(author) {
    if (author == null) { delete this.data.author; return this; }
    if (typeof author === "string") author = { name: author };
    this.data.author = { name: author.name, url: author.url, icon_url: author.iconURL || author.icon_url };
    return this;
  }
  setFooter(footer) {
    if (footer == null) { delete this.data.footer; return this; }
    if (typeof footer === "string") footer = { text: footer };
    this.data.footer = { text: footer.text, icon_url: footer.iconURL || footer.icon_url };
    return this;
  }
  setImage(url) { this.data.image = url ? { url } : undefined; return this; }
  setThumbnail(url) { this.data.thumbnail = url ? { url } : undefined; return this; }
  setTimestamp(time) {
    this.data.timestamp = time === null ? undefined : new Date(time === undefined ? Date.now() : time).toISOString();
    return this;
  }
  addFields(...fields) {
    const list = fields.flat().map((field) => ({ name: String(field.name), value: String(field.value), inline: Boolean(field.inline) }));
    this.data.fields = (this.data.fields || []).concat(list);
    return this;
  }
  setFields(...fields) { this.data.fields = []; return this.addFields(...fields); }
  toJSON() { return Object.assign({}, this.data); }
}

function makeOptions(interaction) {
  const data = interaction.data || {};
  let list = data.options || [];
  let group = null;
  let subcommand = null;
  if (list[0] && list[0].type === 2) { group = list[0].name; list = list[0].options || []; }
  if (list[0] && list[0].type === 1) { subcommand = list[0].name; list = list[0].options || []; }
  const values = {};
  for (const option of list) values[option.name] = option.value;
  const resolved = data.resolved || {};
  const get = (name) => (values[name] === undefined ? null : values[name]);
  const pick = (kind, name) => {
    const id = values[name];
    if (id === undefined) return null;
    return (resolved[kind] && resolved[kind][id]) || { id };
  };
  return {
    data: values,
    get,
    getString: get,
    getInteger: get,
    getNumber: get,
    getBoolean: get,
    getUser: (name) => pick("users", name),
    getMember: (name) => {
      const id = values[name];
      if (id === undefined || !resolved.members || !resolved.members[id]) return null;
      return Object.assign({ user: resolved.users && resolved.users[id] }, resolved.members[id]);
    },
    getChannel: (name) => pick("channels", name),
    getRole: (name) => pick("roles", name),
    getAttachment: (name) => pick("attachments", name),
    getMentionable: (name) => {
      const id = values[name];
      if (id === undefined) return null;
      return (resolved.users && resolved.users[id]) || (resolved.roles && resolved.roles[id]) || { id };
    },
    getSubcommand: () => subcommand,
    getSubcommandGroup: () => group,
  };
}

const discord = {
  get: (path, query) => call("rest", "GET", path, { query }),
  post: (path, body) => call("rest", "POST", path, { body }),
  patch: (path, body) => call("rest", "PATCH", path, { body }),
  put: (path, body) => call("rest", "PUT", path, { body }),
  delete: (path) => call("rest", "DELETE", path, {}),
};

async function run(code, interaction) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let fn;
  try {
    fn = new AsyncFunction(...PARAMS, code);
  } catch (error) {
    postMessage({ type: "error", phase: "compile", message: error && error.message ? error.message : format(error) });
    return;
  }
  const scope = {
    interaction,
    options: makeOptions(interaction),
    user: (interaction.member && interaction.member.user) || interaction.user || null,
    member: interaction.member || null,
    guildId: interaction.guild_id || null,
    channelId: interaction.channel_id || (interaction.channel && interaction.channel.id) || null,
    reply: (payload) => call("reply", payload),
    defer: (opts) => call("defer", opts || {}),
    followUp: (payload) => call("followUp", payload),
    editReply: (payload) => call("editReply", payload),
    deleteReply: () => call("deleteReply"),
    send: (channelId, payload) => call("send", channelId, payload),
    discord,
    EmbedBuilder,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    console: scriptConsole,
  };
  try {
    const value = await fn(...PARAMS.map((name) => scope[name]));
    let result;
    try { result = plain(value); } catch { result = undefined; }
    postMessage({ type: "done", value: result });
  } catch (error) {
    postMessage({ type: "error", phase: "run", message: format(error) });
  }
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "result") {
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.value);
    else entry.reject(new Error(message.error));
  } else if (message.type === "run") {
    void run(message.code, message.interaction);
  }
};

self.onunhandledrejection = (event) => {
  log("error", ["Unhandled rejection:", event.reason]);
};

postMessage({ type: "ready" });
`;

function workerSource(): string {
  return `const PARAMS = ${JSON.stringify(SCRIPT_GLOBALS)};\n${WORKER_SOURCE}`;
}

export type LogLevel = "log" | "info" | "warn" | "error";

export interface SandboxHost {
  /** Carries out a call the script made: reply, defer, a REST request… */
  call: (method: string, args: unknown[]) => Promise<unknown>;
  log: (level: LogLevel, text: string) => void;
}

export type SandboxResult =
  | { status: "ok"; value: unknown }
  | { status: "error"; message: string; phase: "compile" | "run" | "start" }
  | { status: "timeout" };

type WorkerMessage =
  | { type: "ready" }
  | { type: "log"; level: LogLevel; text: string }
  | { type: "call"; id: number; method: string; args: unknown[] }
  | { type: "done"; value: unknown }
  | { type: "error"; phase: "compile" | "run"; message: string };

/**
 * Starts a worker for one script run. A `data:` worker is preferred for its
 * opaque origin; a browser that refuses one gets a `blob:` worker instead.
 */
function startWorker(onReady: (worker: Worker) => void, onFail: (message: string) => void) {
  const source = workerSource();
  const attempts = [
    () => new Worker(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`),
    () => {
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const worker = new Worker(url);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return worker;
    },
  ];

  const tryNext = (index: number) => {
    if (index >= attempts.length) {
      onFail("This browser could not start a worker for the script.");
      return;
    }
    let worker: Worker;
    try {
      worker = attempts[index]();
    } catch {
      tryNext(index + 1);
      return;
    }
    const handleMessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data?.type !== "ready") return;
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      onReady(worker);
    };
    const handleError = (event: Event) => {
      event.preventDefault();
      worker.terminate();
      tryNext(index + 1);
    };
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
  };

  tryNext(0);
}

/** Runs `code` against `interaction` and settles once the script returns or fails. */
export function runInSandbox(
  code: string,
  interaction: unknown,
  host: SandboxHost,
  timeoutMs: number,
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    let settled = false;
    let worker: Worker | null = null;

    const finish = (result: SandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker?.terminate();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);

    startWorker(
      (started) => {
        if (settled) {
          started.terminate();
          return;
        }
        worker = started;
        started.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
          const message = event.data;
          switch (message?.type) {
            case "log":
              host.log(message.level, message.text);
              break;
            case "call":
              host.call(message.method, message.args).then(
                (value) => {
                  if (!settled) started.postMessage({ type: "result", id: message.id, ok: true, value });
                },
                (cause: unknown) => {
                  if (settled) return;
                  started.postMessage({
                    type: "result",
                    id: message.id,
                    ok: false,
                    error: cause instanceof Error ? cause.message : String(cause),
                  });
                },
              );
              break;
            case "done":
              finish({ status: "ok", value: message.value });
              break;
            case "error":
              finish({ status: "error", phase: message.phase, message: message.message });
              break;
          }
        });
        started.addEventListener("error", (event) => {
          event.preventDefault();
          finish({ status: "error", phase: "run", message: event.message || "The worker crashed." });
        });
        started.postMessage({ type: "run", code, interaction });
      },
      (message) => finish({ status: "error", phase: "start", message }),
    );
  });
}
