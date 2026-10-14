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

import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";

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
  "guild",
  "channels",
  "messages",
  "roles",
  "members",
  "webhooks",
  "threads",
  "emojis",
  "events",
  "invites",
  "users",
  "Permissions",
  "ChannelType",
  "imageData",
  "EmbedBuilder",
  "sleep",
  "console",
] as const;

/** Permission names → bit values as strings, for `Permissions.SendMessages` and name lists. */
const PERMISSION_BITS: Record<string, string> = Object.fromEntries(
  Object.entries(PermissionFlagsBits).map(([name, bit]) => [name, bit.toString()]),
);

/** Channel type names → numbers, e.g. `ChannelType.GuildText`. */
const CHANNEL_TYPES: Record<string, number> = Object.fromEntries(
  Object.entries(ChannelType).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
);

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

/** opts may be a plain reason string, or { reason, ... }. */
function reasonOf(opts) {
  if (typeof opts === "string") return opts;
  return opts && opts.reason != null ? String(opts.reason) : undefined;
}

const discord = {
  get: (path, query, opts) => call("rest", "GET", path, { query, reason: reasonOf(opts) }),
  post: (path, body, opts) => call("rest", "POST", path, { body, reason: reasonOf(opts) }),
  patch: (path, body, opts) => call("rest", "PATCH", path, { body, reason: reasonOf(opts) }),
  put: (path, body, opts) => call("rest", "PUT", path, { body, reason: reasonOf(opts) }),
  delete: (path, opts) => call("rest", "DELETE", path, { reason: reasonOf(opts) }),
  request: (method, path, opts) => {
    opts = opts || {};
    return call("rest", String(method).toUpperCase(), path, { query: opts.query, body: opts.body, reason: reasonOf(opts) });
  },
};

/** A snowflake from an id string, a number or anything carrying an id. */
function id(value, what) {
  if (value && typeof value === "object" && value.id != null) value = value.id;
  if (typeof value === "number" || typeof value === "bigint") value = String(value);
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) {
    throw new TypeError((what || "id") + " must be a Discord id (a string of digits), got " + format(value));
  }
  return value;
}

/** Turns a camelCase key into Discord's snake_case. */
function snake(key) {
  return key.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
}

/** Accepts camelCase or snake_case keys, one level deep, and sends snake_case. */
function body(data) {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return data;
  if (typeof data.toJSON === "function") return data.toJSON();
  const out = {};
  for (const key of Object.keys(data)) {
    if (key === "reason" || data[key] === undefined) continue;
    out[snake(key)] = data[key];
  }
  return out;
}

/**
 * A permission bit field as Discord's decimal string, from a number, a bigint,
 * a decimal string, a permission name, or a list of any of those.
 */
function permissionBits(value) {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    let bits = 0n;
    for (const entry of value) bits |= BigInt(permissionBits(entry));
    return bits.toString();
  }
  if (typeof value === "bigint" || typeof value === "number") return BigInt(value).toString();
  const text = String(value);
  if (/^\d+$/.test(text)) return text;
  const lower = text.toLowerCase().replace(/[\s_-]/g, "");
  const match = Object.keys(PERMISSIONS).find((key) => key.toLowerCase() === lower);
  if (!match) throw new TypeError("Unknown permission: " + text);
  return PERMISSIONS[match];
}

const Permissions = Object.freeze(Object.assign({}, PERMISSIONS, {
  /** Whether the bit field (e.g. member.permissions) includes every permission given. */
  has(bits, permission) {
    const want = BigInt(permissionBits(permission));
    const have = BigInt(bits || 0);
    const admin = BigInt(PERMISSIONS.Administrator);
    return (have & admin) === admin || (have & want) === want;
  },
  /** Combines names, numbers or bit strings into one bit field string. */
  resolve: (value) => permissionBits(value),
}));

const ChannelType = Object.freeze(Object.assign({}, CHANNEL_TYPES));

/** Short names for channel types: "text", "voice", "category", "announcement", "stage", "forum", "media". */
const CHANNEL_ALIASES = { text: 0, voice: 2, category: 4, announcement: 5, news: 5, stage: 13, forum: 15, media: 16 };

function channelType(value) {
  if (value == null || typeof value === "number") return value;
  const key = String(value).toLowerCase();
  if (key in CHANNEL_ALIASES) return CHANNEL_ALIASES[key];
  const match = Object.keys(CHANNEL_TYPES).find((name) => name.toLowerCase() === key || name.toLowerCase() === "guild" + key);
  if (match) return CHANNEL_TYPES[match];
  throw new TypeError("Unknown channel type: " + value);
}

/** "#5865f2", a number or [r, g, b]. */
function color(value) {
  return value === undefined ? undefined : resolveColor(value);
}

/** A message given as a string, or an object with embeds made by EmbedBuilder. */
function message(value) {
  if (value == null) throw new TypeError("There is nothing to send.");
  if (typeof value !== "object") return { content: String(value) };
  const out = body(value);
  if (Array.isArray(out.embeds)) out.embeds = out.embeds.map((embed) => (embed && embed.toJSON ? embed.toJSON() : embed));
  if (out.reply_to !== undefined) {
    out.message_reference = { message_id: id(out.reply_to, "replyTo"), fail_if_not_exists: false };
    delete out.reply_to;
  }
  return out;
}

/** Overwrites in Discord's shape, from { id, type: "role" | "member", allow, deny }. */
function overwrite(entry) {
  const type = entry.type === "member" || entry.type === 1 ? 1 : 0;
  return { id: id(entry.id, "overwrite id"), type, allow: permissionBits(entry.allow) || "0", deny: permissionBits(entry.deny) || "0" };
}

function channelBody(data) {
  const out = body(data);
  if (out.type !== undefined) out.type = channelType(out.type);
  if (out.parent !== undefined) { out.parent_id = out.parent === null ? null : id(out.parent, "parent"); delete out.parent; }
  if (Array.isArray(out.permission_overwrites)) out.permission_overwrites = out.permission_overwrites.map(overwrite);
  return out;
}

function roleBody(data) {
  const out = body(data);
  if (out.permissions !== undefined) out.permissions = permissionBits(out.permissions);
  if (out.color !== undefined) out.color = color(out.color);
  return out;
}

/** The guild a helper works in: the one given, or the one the command was used in. */
let currentGuild = null;
function guildOf(value) {
  if (value != null) return id(value, "guildId");
  if (!currentGuild) throw new Error("This command was not used in a server; pass a guildId.");
  return currentGuild;
}

function emojiPath(emoji) {
  if (emoji && typeof emoji === "object") emoji = emoji.id ? (emoji.name || "_") + ":" + emoji.id : emoji.name;
  const text = String(emoji).replace(/^<a?:/, "").replace(/>$/, "");
  return encodeURIComponent(text);
}

const guild = {
  get: (opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId), { with_counts: true }),
  edit: (data, opts) => discord.patch("/guilds/" + guildOf(opts && opts.guildId), body(data), opts),
  channels: (guildId) => discord.get("/guilds/" + guildOf(guildId) + "/channels"),
  roles: (guildId) => discord.get("/guilds/" + guildOf(guildId) + "/roles"),
  bans: (opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId) + "/bans", { limit: (opts && opts.limit) || 1000, after: opts && opts.after }),
  bulkBan: (userIds, opts) => discord.post("/guilds/" + guildOf(opts && opts.guildId) + "/bulk-ban", { user_ids: userIds.map((user) => id(user, "user")), delete_message_seconds: (opts && opts.deleteMessageSeconds) || 0 }, opts),
  invites: (guildId) => discord.get("/guilds/" + guildOf(guildId) + "/invites"),
  webhooks: (guildId) => discord.get("/guilds/" + guildOf(guildId) + "/webhooks"),
  auditLog: (opts) => {
    opts = opts || {};
    return discord.get("/guilds/" + guildOf(opts.guildId) + "/audit-logs", { user_id: opts.userId, action_type: opts.actionType, before: opts.before, after: opts.after, limit: opts.limit || 50 });
  },
  pruneCount: (opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId) + "/prune", { days: (opts && opts.days) || 7 }),
  prune: (opts) => discord.post("/guilds/" + guildOf(opts && opts.guildId) + "/prune", { days: (opts && opts.days) || 7, compute_prune_count: true }, opts),
  voiceRegions: (guildId) => discord.get("/guilds/" + guildOf(guildId) + "/regions"),
  leave: (guildId) => discord.delete("/users/@me/guilds/" + guildOf(guildId)),
};

const channels = {
  get: (channelId) => discord.get("/channels/" + id(channelId, "channelId")),
  list: (guildId) => guild.channels(guildId),
  create: (data, opts) => discord.post("/guilds/" + guildOf((opts && opts.guildId) || (data && data.guildId)) + "/channels", channelBody(Object.assign({}, data, { guildId: undefined })), opts),
  edit: (channelId, data, opts) => discord.patch("/channels/" + id(channelId, "channelId"), channelBody(data), opts),
  delete: (channelId, opts) => discord.delete("/channels/" + id(channelId, "channelId"), opts),
  setPositions: (list, opts) => discord.patch("/guilds/" + guildOf(opts && opts.guildId) + "/channels", list.map((entry) => ({ id: id(entry.id, "channel"), position: entry.position, parent_id: entry.parentId, lock_permissions: entry.lockPermissions })), opts),
  setPermission: (channelId, target, perms, opts) => {
    const entry = overwrite(Object.assign({ id: target, type: perms && perms.type }, perms));
    return discord.put("/channels/" + id(channelId, "channelId") + "/permissions/" + entry.id, { type: entry.type, allow: entry.allow, deny: entry.deny }, opts);
  },
  deletePermission: (channelId, target, opts) => discord.delete("/channels/" + id(channelId, "channelId") + "/permissions/" + id(target, "role or user"), opts),
  invites: (channelId) => discord.get("/channels/" + id(channelId, "channelId") + "/invites"),
  createInvite: (channelId, data, opts) => discord.post("/channels/" + id(channelId, "channelId") + "/invites", body(Object.assign({ maxAge: 86400 }, data)), opts),
  typing: (channelId) => discord.post("/channels/" + id(channelId, "channelId") + "/typing"),
  follow: (announcementChannelId, targetChannelId) => discord.post("/channels/" + id(announcementChannelId, "channelId") + "/followers", { webhook_channel_id: id(targetChannelId, "targetChannelId") }),
};

const messages = {
  send: (channelId, value) => discord.post("/channels/" + id(channelId, "channelId") + "/messages", message(value)),
  get: (channelId, messageId) => discord.get("/channels/" + id(channelId, "channelId") + "/messages/" + id(messageId, "messageId")),
  list: (channelId, opts) => {
    opts = opts || {};
    return discord.get("/channels/" + id(channelId, "channelId") + "/messages", { limit: opts.limit || 50, before: opts.before, after: opts.after, around: opts.around });
  },
  edit: (channelId, messageId, value) => discord.patch("/channels/" + id(channelId, "channelId") + "/messages/" + id(messageId, "messageId"), message(value)),
  delete: (channelId, messageId, opts) => discord.delete("/channels/" + id(channelId, "channelId") + "/messages/" + id(messageId, "messageId"), opts),
  /** Deletes up to 100 messages younger than two weeks: a list of ids, or the newest N. */
  bulkDelete: async (channelId, which, opts) => {
    const channel = id(channelId, "channelId");
    let ids;
    if (typeof which === "number") {
      const count = Math.max(1, Math.min(100, Math.floor(which)));
      const cutoff = Date.now() - 14 * 24 * 3600 * 1000 + 60000;
      const recent = await messages.list(channel, { limit: count });
      ids = recent.filter((entry) => Number(BigInt(entry.id) >> 22n) + 1420070400000 > cutoff).map((entry) => entry.id);
    } else {
      ids = which.map((entry) => id(entry, "messageId")).slice(0, 100);
    }
    if (ids.length === 0) return 0;
    if (ids.length === 1) await messages.delete(channel, ids[0], opts);
    else await discord.post("/channels/" + channel + "/messages/bulk-delete", { messages: ids }, opts);
    return ids.length;
  },
  pins: (channelId) => discord.get("/channels/" + id(channelId, "channelId") + "/pins"),
  pin: (channelId, messageId, opts) => discord.put("/channels/" + id(channelId, "channelId") + "/pins/" + id(messageId, "messageId"), undefined, opts),
  unpin: (channelId, messageId, opts) => discord.delete("/channels/" + id(channelId, "channelId") + "/pins/" + id(messageId, "messageId"), opts),
  react: (channelId, messageId, emoji) => discord.put("/channels/" + id(channelId, "channelId") + "/messages/" + id(messageId, "messageId") + "/reactions/" + emojiPath(emoji) + "/@me"),
  unreact: (channelId, messageId, emoji, userId) => discord.delete("/channels/" + id(channelId, "channelId") + "/messages/" + id(messageId, "messageId") + "/reactions/" + emojiPath(emoji) + "/" + (userId ? id(userId, "userId") : "@me")),
  reactions: (channelId, messageId, emoji, opts) => discord.get("/channels/" + id(channelId, "channelId") + "/messages/" + id(messageId, "messageId") + "/reactions/" + emojiPath(emoji), { limit: (opts && opts.limit) || 100, after: opts && opts.after }),
  clearReactions: (channelId, messageId, emoji) => discord.delete("/channels/" + id(channelId, "channelId") + "/messages/" + id(messageId, "messageId") + "/reactions" + (emoji ? "/" + emojiPath(emoji) : "")),
  crosspost: (channelId, messageId) => discord.post("/channels/" + id(channelId, "channelId") + "/messages/" + id(messageId, "messageId") + "/crosspost"),
  endPoll: (channelId, messageId) => discord.post("/channels/" + id(channelId, "channelId") + "/polls/" + id(messageId, "messageId") + "/expire"),
};

const roles = {
  list: (guildId) => guild.roles(guildId),
  get: (roleId, opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId) + "/roles/" + id(roleId, "roleId")),
  create: (data, opts) => discord.post("/guilds/" + guildOf(opts && opts.guildId) + "/roles", roleBody(data), opts),
  edit: (roleId, data, opts) => discord.patch("/guilds/" + guildOf(opts && opts.guildId) + "/roles/" + id(roleId, "roleId"), roleBody(data), opts),
  delete: (roleId, opts) => discord.delete("/guilds/" + guildOf(opts && opts.guildId) + "/roles/" + id(roleId, "roleId"), opts),
  setPositions: (list, opts) => discord.patch("/guilds/" + guildOf(opts && opts.guildId) + "/roles", list.map((entry) => ({ id: id(entry.id, "role"), position: entry.position })), opts),
  add: (userId, roleId, opts) => discord.put("/guilds/" + guildOf(opts && opts.guildId) + "/members/" + id(userId, "userId") + "/roles/" + id(roleId, "roleId"), undefined, opts),
  remove: (userId, roleId, opts) => discord.delete("/guilds/" + guildOf(opts && opts.guildId) + "/members/" + id(userId, "userId") + "/roles/" + id(roleId, "roleId"), opts),
};

function memberPath(userId, opts) {
  return "/guilds/" + guildOf(opts && opts.guildId) + "/members/" + id(userId, "userId");
}

const members = {
  get: (userId, opts) => discord.get(memberPath(userId, opts)),
  list: (opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId) + "/members", { limit: (opts && opts.limit) || 100, after: opts && opts.after }),
  search: (query, opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId) + "/members/search", { query: String(query), limit: (opts && opts.limit) || 25 }),
  edit: (userId, data, opts) => {
    const out = body(data);
    if (out.roles) out.roles = out.roles.map((role) => id(role, "role"));
    return discord.patch(memberPath(userId, opts), out, opts);
  },
  setNickname: (userId, nick, opts) => discord.patch(memberPath(userId, opts), { nick: nick || null }, opts),
  /** ms of timeout from now (up to 28 days); null or 0 lifts it. */
  timeout: (userId, ms, opts) => discord.patch(memberPath(userId, opts), { communication_disabled_until: ms ? new Date(Date.now() + ms).toISOString() : null }, opts),
  kick: (userId, opts) => discord.delete(memberPath(userId, opts), opts),
  ban: (userId, opts) => discord.put("/guilds/" + guildOf(opts && opts.guildId) + "/bans/" + id(userId, "userId"), { delete_message_seconds: (opts && opts.deleteMessageSeconds) || 0 }, opts),
  unban: (userId, opts) => discord.delete("/guilds/" + guildOf(opts && opts.guildId) + "/bans/" + id(userId, "userId"), opts),
  /** Moves someone to another voice channel; null disconnects them. */
  move: (userId, channelId, opts) => discord.patch(memberPath(userId, opts), { channel_id: channelId == null ? null : id(channelId, "channelId") }, opts),
  mute: (userId, muted, opts) => discord.patch(memberPath(userId, opts), { mute: muted !== false }, opts),
  deafen: (userId, deafened, opts) => discord.patch(memberPath(userId, opts), { deaf: deafened !== false }, opts),
  me: (opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId) + "/members/@me"),
  setMyNickname: (nick, opts) => discord.patch("/guilds/" + guildOf(opts && opts.guildId) + "/members/@me", { nick: nick || null }, opts),
};

/** A webhook given as its URL, { id, token }, or id and token separately. */
function webhookTarget(webhook, token) {
  if (typeof webhook === "string" && webhook.includes("/")) {
    const match = /webhooks\/(\d+)\/([\w-]+)/.exec(webhook);
    if (!match) throw new TypeError("Not a webhook URL: " + webhook);
    return "/webhooks/" + match[1] + "/" + match[2];
  }
  if (webhook && typeof webhook === "object") { token = webhook.token; webhook = webhook.id; }
  if (typeof token !== "string" || !/^[\w-]+$/.test(token)) throw new TypeError("A webhook token is needed.");
  return "/webhooks/" + id(webhook, "webhook") + "/" + token;
}

const webhooks = {
  create: (channelId, data, opts) => discord.post("/channels/" + id(channelId, "channelId") + "/webhooks", body(typeof data === "string" ? { name: data } : data), opts),
  list: (channelId) => discord.get("/channels/" + id(channelId, "channelId") + "/webhooks"),
  listGuild: (guildId) => guild.webhooks(guildId),
  get: (webhookId) => discord.get("/webhooks/" + id(webhookId, "webhookId")),
  edit: (webhookId, data, opts) => {
    const out = body(data);
    if (out.channel !== undefined) { out.channel_id = id(out.channel, "channel"); delete out.channel; }
    return discord.patch("/webhooks/" + id(webhookId, "webhookId"), out, opts);
  },
  delete: (webhookId, opts) => discord.delete("/webhooks/" + id(webhookId, "webhookId"), opts),
  /** Posts through a webhook, optionally with another name and avatar. */
  send: (webhook, value, opts) => {
    opts = opts || {};
    const payload = message(value);
    if (opts.username) payload.username = opts.username;
    if (opts.avatarURL) payload.avatar_url = opts.avatarURL;
    if (opts.threadName) payload.thread_name = opts.threadName;
    return discord.post(webhookTarget(webhook, opts.token) + "?wait=" + (opts.wait === false ? "false" : "true") + (opts.threadId ? "&thread_id=" + id(opts.threadId, "threadId") : ""), payload);
  },
  editMessage: (webhook, messageId, value, opts) => discord.patch(webhookTarget(webhook, opts && opts.token) + "/messages/" + id(messageId, "messageId"), message(value)),
  deleteMessage: (webhook, messageId, opts) => discord.delete(webhookTarget(webhook, opts && opts.token) + "/messages/" + id(messageId, "messageId")),
};

const threads = {
  /** A thread in a text channel, or a post in a forum (pass message for the first post). */
  create: (channelId, data, opts) => {
    const out = body(typeof data === "string" ? { name: data } : data);
    if (out.type === "private") out.type = 12;
    else if (out.type === "public" || out.type === undefined) out.type = out.message ? undefined : 11;
    if (out.message) out.message = message(out.message);
    return discord.post("/channels/" + id(channelId, "channelId") + "/threads", out, opts);
  },
  fromMessage: (channelId, messageId, data, opts) => discord.post("/channels/" + id(channelId, "channelId") + "/messages/" + id(messageId, "messageId") + "/threads", body(typeof data === "string" ? { name: data } : data), opts),
  edit: (threadId, data, opts) => discord.patch("/channels/" + id(threadId, "threadId"), body(data), opts),
  archive: (threadId, archived, opts) => discord.patch("/channels/" + id(threadId, "threadId"), { archived: archived !== false }, opts),
  lock: (threadId, locked, opts) => discord.patch("/channels/" + id(threadId, "threadId"), { locked: locked !== false }, opts),
  delete: (threadId, opts) => discord.delete("/channels/" + id(threadId, "threadId"), opts),
  join: (threadId) => discord.put("/channels/" + id(threadId, "threadId") + "/thread-members/@me"),
  leave: (threadId) => discord.delete("/channels/" + id(threadId, "threadId") + "/thread-members/@me"),
  addMember: (threadId, userId) => discord.put("/channels/" + id(threadId, "threadId") + "/thread-members/" + id(userId, "userId")),
  removeMember: (threadId, userId) => discord.delete("/channels/" + id(threadId, "threadId") + "/thread-members/" + id(userId, "userId")),
  members: (threadId) => discord.get("/channels/" + id(threadId, "threadId") + "/thread-members"),
  active: (guildId) => discord.get("/guilds/" + guildOf(guildId) + "/threads/active"),
  archived: (channelId, opts) => discord.get("/channels/" + id(channelId, "channelId") + "/threads/archived/" + (opts && opts.private ? "private" : "public"), { limit: (opts && opts.limit) || 50, before: opts && opts.before }),
};

const emojis = {
  list: (guildId) => discord.get("/guilds/" + guildOf(guildId) + "/emojis"),
  get: (emojiId, opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId) + "/emojis/" + id(emojiId, "emojiId")),
  /** image: a data: URI — imageData(url) makes one. */
  create: (data, opts) => discord.post("/guilds/" + guildOf(opts && opts.guildId) + "/emojis", { name: data.name, image: data.image, roles: (data.roles || []).map((role) => id(role, "role")) }, opts),
  edit: (emojiId, data, opts) => discord.patch("/guilds/" + guildOf(opts && opts.guildId) + "/emojis/" + id(emojiId, "emojiId"), body(data), opts),
  delete: (emojiId, opts) => discord.delete("/guilds/" + guildOf(opts && opts.guildId) + "/emojis/" + id(emojiId, "emojiId"), opts),
  stickers: (guildId) => discord.get("/guilds/" + guildOf(guildId) + "/stickers"),
  deleteSticker: (stickerId, opts) => discord.delete("/guilds/" + guildOf(opts && opts.guildId) + "/stickers/" + id(stickerId, "stickerId"), opts),
};

const EVENT_TYPES = { stage: 1, voice: 2, external: 3 };

function eventBody(data) {
  const out = body(data);
  if (typeof out.entity_type === "string") out.entity_type = EVENT_TYPES[out.entity_type];
  if (out.channel !== undefined) { out.channel_id = id(out.channel, "channel"); delete out.channel; }
  if (out.location !== undefined) { out.entity_metadata = { location: out.location }; delete out.location; }
  for (const key of ["scheduled_start_time", "scheduled_end_time"]) {
    if (out[key] instanceof Date || typeof out[key] === "number") out[key] = new Date(out[key]).toISOString();
  }
  if (out.privacy_level === undefined && out.name !== undefined) out.privacy_level = 2;
  return out;
}

const events = {
  list: (guildId) => discord.get("/guilds/" + guildOf(guildId) + "/scheduled-events", { with_user_count: true }),
  get: (eventId, opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId) + "/scheduled-events/" + id(eventId, "eventId"), { with_user_count: true }),
  create: (data, opts) => discord.post("/guilds/" + guildOf(opts && opts.guildId) + "/scheduled-events", eventBody(data), opts),
  edit: (eventId, data, opts) => discord.patch("/guilds/" + guildOf(opts && opts.guildId) + "/scheduled-events/" + id(eventId, "eventId"), eventBody(data), opts),
  delete: (eventId, opts) => discord.delete("/guilds/" + guildOf(opts && opts.guildId) + "/scheduled-events/" + id(eventId, "eventId"), opts),
  users: (eventId, opts) => discord.get("/guilds/" + guildOf(opts && opts.guildId) + "/scheduled-events/" + id(eventId, "eventId") + "/users", { limit: (opts && opts.limit) || 100, with_member: true }),
};

function inviteCode(code) {
  const text = String(code).replace(/^https?:\/\/(www\.)?(discord\.gg|discord(app)?\.com\/invite)\//, "");
  if (!/^[\w-]+$/.test(text)) throw new TypeError("Not an invite code: " + code);
  return text;
}

const invites = {
  get: (code) => discord.get("/invites/" + inviteCode(code), { with_counts: true }),
  delete: (code, opts) => discord.delete("/invites/" + inviteCode(code), opts),
  create: (channelId, data, opts) => channels.createInvite(channelId, data, opts),
};

const users = {
  get: (userId) => discord.get("/users/" + id(userId, "userId")),
  me: () => discord.get("/users/@me"),
  /** Opens (or reuses) the DM with someone and sends them a message there. */
  dm: async (userId, value) => {
    const channel = await discord.post("/users/@me/channels", { recipient_id: id(userId, "userId") });
    return messages.send(channel.id, value);
  },
  guilds: () => discord.get("/users/@me/guilds"),
};

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Downloads an image and returns it as a data: URI, for emojis, icons and avatars. */
async function imageData(url) {
  const response = await fetch(String(url));
  if (!response.ok) throw new Error("Could not download the image: " + response.status);
  const blob = await response.blob();
  if (blob.size > IMAGE_MAX_BYTES) throw new Error("The image is larger than 8 MB.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  }
  return "data:" + (blob.type || "image/png") + ";base64," + btoa(binary);
}

async function run(code, interaction) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let fn;
  try {
    fn = new AsyncFunction(...PARAMS, code);
  } catch (error) {
    postMessage({ type: "error", phase: "compile", message: error && error.message ? error.message : format(error) });
    return;
  }
  currentGuild = interaction.guild_id || null;
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
    guild,
    channels,
    messages,
    roles,
    members,
    webhooks,
    threads,
    emojis,
    events,
    invites,
    users,
    Permissions,
    ChannelType,
    imageData,
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
  return [
    `const PARAMS = ${JSON.stringify(SCRIPT_GLOBALS)};`,
    `const PERMISSIONS = ${JSON.stringify(PERMISSION_BITS)};`,
    `const CHANNEL_TYPES = ${JSON.stringify(CHANNEL_TYPES)};`,
    WORKER_SOURCE,
  ].join("\n");
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
  | { status: "timeout" }
  /** Stopped from outside, through the signal. */
  | { status: "aborted" };

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
  signal?: AbortSignal,
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
    if (signal?.aborted) {
      finish({ status: "aborted" });
      return;
    }
    signal?.addEventListener("abort", () => finish({ status: "aborted" }), { once: true });

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
