import type { APIChannel, APIGuildMember, APIMessage } from "discord-api-types/v10";
import { guildIconUrl } from "@/lib/discord/cdn";
import { isThreadChannel } from "@/lib/discord/permissions";
import type { RestClient } from "@/lib/discord/rest";
import { roleMap } from "@/lib/discord/roles";
import { useClient } from "@/lib/store/client";
import {
  createExportPacer,
  fetchChannelMessages,
  fetchMissingMembers,
  fetchThreads,
  MAX_MEMBER_LOOKUPS,
  type Throttle,
} from "./fetch";
import { FORMATS, renderExport, type ExportContext, type ExportFormat } from "./render";
import { ZipWriter } from "./zip";

export type ThreadMode = "none" | "active" | "all";

export interface ExportOptions {
  guildId: string;
  channelIds: string[];
  format: ExportFormat;
  after: Date | null;
  before: Date | null;
  threads: ThreadMode;
  /** Copies attachments, avatars and emoji into the archive, so it outlives Discord's links. */
  downloadAssets: boolean;
}

export type ExportPhase = "threads" | "messages" | "members" | "assets" | "packing";

export interface ExportProgress {
  phase: ExportPhase;
  /** 1-based index of the channel or file being worked on. */
  current: number;
  total: number;
  /** Channel name while fetching, file count while downloading media. */
  label: string;
  /** Messages fetched from the current channel. */
  messages: number;
  /** 0-1 progress of the current step, when it can be told. */
  fraction: number | null;
  /**
   * Set while the export holds back on purpose: Discord answered 429, or the
   * pacer takes its regular break. `until` is an epoch ms.
   */
  paused: { reason: "rate-limit" | "cooldown"; until: number } | null;
}

type Step = Omit<ExportProgress, "paused">;

export interface ExportResult {
  blob: Blob;
  fileName: string;
  channels: number;
  messages: number;
  /** Channels Discord would not hand over, with its reason. */
  failed: { name: string; reason: string }[];
  /** Media that could not be copied and stays a link to Discord. */
  missingAssets: number;
}

function channelLabel(channel: APIChannel): string {
  return ("name" in channel ? channel.name : null) ?? channel.id;
}

/** Keeps a path segment valid on Windows, macOS and Linux alike. */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Short stable hash, so two files named `image.png` do not collide. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

function assetPath(url: string): string {
  const parsed = new URL(url);
  const base = parsed.pathname.split("/").pop() || "file";
  // Signed attachment links differ only by query; the path names the file.
  return `assets/${hash(parsed.origin + parsed.pathname)}-${safeFileName(decodeURIComponent(base))}`;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Parallel media downloads; the CDN is not the API, but it limits too. */
const DOWNLOAD_WORKERS = 4;

async function download(
  url: string,
  signal: AbortSignal,
  onRateLimit: (ms: number) => void,
): Promise<Uint8Array<ArrayBuffer> | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { signal });
      if (response.status === 429) {
        // Retry-After is only readable when the CDN exposes it; back off anyway.
        const header = Number(response.headers.get("Retry-After"));
        const ms = header > 0 ? header * 1000 : 2_000 * 2 ** attempt;
        onRateLimit(ms);
        await sleep(ms, signal);
        continue;
      }
      if (!response.ok) return null;
      return new Uint8Array(await response.arrayBuffer());
    } catch (cause) {
      if (signal.aborted) throw cause;
      // The CDN refused the page's origin; the export keeps the link instead.
      return null;
    }
  }
  return null;
}

/**
 * Runs a whole export in the browser: fetches the history, resolves the
 * people in it, optionally copies its media, and hands back one file to save.
 */
export async function runExport(
  rest: RestClient,
  options: ExportOptions,
  signal: AbortSignal,
  onProgress: (progress: ExportProgress) => void,
): Promise<ExportResult> {
  // A fresh pacer per export: one slowed by an earlier run starts at full pace.
  let step: Step = { phase: "messages", current: 0, total: 0, label: "", messages: 0, fraction: null };
  const report = (next: Step) => {
    step = next;
    onProgress({ ...next, paused: null });
  };
  const pause = (reason: "rate-limit" | "cooldown", ms: number) =>
    onProgress({ ...step, paused: { reason, until: Date.now() + ms } });
  const throttle: Throttle = {
    rest,
    pacer: createExportPacer(),
    signal,
    onWait: (state, ms) => pause(state === "backing-off" ? "rate-limit" : "cooldown", ms),
  };

  const state = useClient.getState();
  const guild = state.guilds[options.guildId];
  if (!guild) throw new Error("The server is no longer available.");

  let channels = options.channelIds
    .map((id) => state.channelsById[id])
    .filter((channel): channel is APIChannel => channel !== undefined);

  if (options.threads !== "none") {
    report({ phase: "threads", current: 0, total: 0, label: "", messages: 0, fraction: null });
    const parents = new Set(channels.filter((channel) => !isThreadChannel(channel)).map((c) => c.id));
    if (parents.size > 0) {
      const threads = await fetchThreads(throttle, options.guildId, parents, {
        archived: options.threads === "all",
      });
      const known = new Set(channels.map((channel) => channel.id));
      // Each thread goes right after its parent, the order the sidebar shows.
      const ordered: APIChannel[] = [];
      for (const channel of channels) {
        ordered.push(channel);
        for (const thread of threads) {
          if (thread.parent_id === channel.id && !known.has(thread.id)) ordered.push(thread);
        }
      }
      channels = ordered;
    }
  }

  const histories: { channel: APIChannel; messages: APIMessage[] }[] = [];
  const failed: ExportResult["failed"] = [];

  for (const [index, channel] of channels.entries()) {
    const label = channelLabel(channel);
    report({ phase: "messages", current: index + 1, total: channels.length, label, messages: 0, fraction: 0 });
    try {
      const messages = await fetchChannelMessages(throttle, channel.id, {
        after: options.after,
        before: options.before,
        onProgress: ({ count, fraction }) =>
          report({ phase: "messages", current: index + 1, total: channels.length, label, messages: count, fraction }),
      });
      histories.push({ channel, messages });
    } catch (cause) {
      if (signal.aborted) throw cause;
      failed.push({ name: label, reason: cause instanceof Error ? cause.message : "Request failed." });
    }
  }

  // Nicknames and colours come from the members; ask for the ones not cached.
  const members = new Map<string, APIGuildMember | null>(
    Object.entries(state.membersByGuild[options.guildId] ?? {}),
  );
  const authored = new Map<string, number>();
  const count = (id: string) => authored.set(id, (authored.get(id) ?? 0) + 1);
  for (const { messages } of histories) {
    for (const message of messages) {
      if (!message.webhook_id) count(message.author.id);
      if (message.referenced_message) count(message.referenced_message.author.id);
    }
  }
  // Busiest authors first, so the lookup cap leaves out the rare ones.
  const missing = [...authored.entries()]
    .filter(([id]) => !members.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const lookups = Math.min(missing.length, MAX_MEMBER_LOOKUPS);
  if (lookups > 0) {
    report({ phase: "members", current: 0, total: lookups, label: "", messages: 0, fraction: 0 });
    await fetchMissingMembers(state.getGateway(), options.guildId, missing, members, {
      signal,
      onProgress: (done) =>
        report({ phase: "members", current: done, total: lookups, label: "", messages: 0, fraction: done / lookups }),
      onWait: (ms) => pause("rate-limit", ms),
    });
  }

  const roles = roleMap(guild);
  const lookupChannel = (id: string) => {
    const channel = useClient.getState().channelsById[id];
    return channel ? channelLabel(channel) : null;
  };
  const exportedAt = new Date();
  const format = FORMATS.find((entry) => entry.id === options.format)!;

  const contextFor = (channel: APIChannel, asset: (url: string) => string): ExportContext => {
    const parentId = "parent_id" in channel ? channel.parent_id : null;
    const parent = parentId ? state.channelsById[parentId] : undefined;
    return {
      guild: { id: guild.id, name: guild.name, iconUrl: guildIconUrl(guild, 256) },
      channel,
      channelName: channelLabel(channel),
      parentName: parent ? channelLabel(parent) : null,
      topic: "topic" in channel ? (channel.topic ?? null) : null,
      after: options.after,
      before: options.before,
      exportedAt,
      roles,
      members,
      lookupChannel,
      asset,
    };
  };

  if (histories.length === 0) {
    throw new Error(
      failed.length
        ? `Nothing could be exported. ${failed[0].name}: ${failed[0].reason}`
        : "There were no channels to export.",
    );
  }

  // Media is found by rendering once and noting every link the output uses.
  const assets = new Map<string, string>();
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let missingAssets = 0;
  if (options.downloadAssets) {
    const wanted = new Set<string>();
    for (const { channel, messages } of histories) {
      renderExport(options.format, messages, contextFor(channel, (url) => (wanted.add(url), url)));
    }
    const queue = [...wanted].filter((url) => /^https?:/.test(url));
    const total = queue.length;
    let done = 0;
    const worker = async () => {
      for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
        const data = await download(url, signal, (ms) => pause("rate-limit", ms));
        if (data) {
          const path = assetPath(url);
          assets.set(url, path);
          files.set(path, data);
        } else {
          missingAssets += 1;
        }
        done += 1;
        report({ phase: "assets", current: done, total, label: "", messages: 0, fraction: done / total });
      }
    };
    await Promise.all(Array.from({ length: DOWNLOAD_WORKERS }, worker));
  }

  report({ phase: "packing", current: 0, total: 0, label: "", messages: 0, fraction: null });

  const render = (channel: APIChannel, messages: APIMessage[]) =>
    renderExport(options.format, messages, contextFor(channel, (url) => assets.get(url) ?? url));
  const finish = (blob: Blob, fileName: string): ExportResult => ({
    blob,
    fileName,
    channels: histories.length,
    messages: histories.reduce((sum, history) => sum + history.messages.length, 0),
    failed,
    missingAssets,
  });
  const baseName = (channel: APIChannel) => {
    const parentId = "parent_id" in channel ? channel.parent_id : null;
    const parent = parentId ? state.channelsById[parentId] : undefined;
    const parts = [guild.name, parent ? channelLabel(parent) : null, channelLabel(channel)];
    return `${safeFileName(parts.filter(Boolean).join(" - "))} [${channel.id}]`;
  };

  // One channel without media is just that file; anything more is a zip.
  if (histories.length === 1 && files.size === 0) {
    const [{ channel, messages }] = histories;
    return finish(
      new Blob([render(channel, messages)], { type: `${MIME[options.format]};charset=utf-8` }),
      `${baseName(channel)}.${format.extension}`,
    );
  }

  const zip = new ZipWriter();
  for (const [path, data] of files) zip.add(path, data);
  for (const { channel, messages } of histories) {
    zip.add(`${baseName(channel)}.${format.extension}`, render(channel, messages));
  }
  const zipName =
    histories.length === 1 ? baseName(histories[0].channel) : `${safeFileName(guild.name)} - export`;
  return finish(zip.toBlob(), `${zipName}.zip`);
}

const MIME: Record<ExportFormat, string> = {
  "html-dark": "text/html",
  "html-light": "text/html",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
};

/** Hands a finished export to the browser as a download. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers start the download asynchronously; give them a moment.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
