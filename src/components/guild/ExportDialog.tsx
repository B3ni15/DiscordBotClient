"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type { APIChannel } from "discord-api-types/v10";
import {
  AnnouncementIcon,
  CheckIcon,
  HashIcon,
  SearchIcon,
  SpeakerIcon,
  StageIcon,
} from "@/components/ui/icons";
import { Field, inputClass, Modal, Switch } from "@/components/ui/Modal";
import { isExportable } from "@/lib/export/fetch";
import { FORMATS, type ExportFormat } from "@/lib/export/render";
import {
  runExport,
  saveBlob,
  type ExportProgress,
  type ExportResult,
  type ThreadMode,
} from "@/lib/export/run";
import { useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

const THREAD_MODES: { id: ThreadMode; label: string }[] = [
  { id: "none", label: "None" },
  { id: "active", label: "Active" },
  { id: "all", label: "All" },
];

interface Group {
  id: string | null;
  name: string | null;
  channels: APIChannel[];
}

function channelName(channel: APIChannel): string {
  return ("name" in channel ? channel.name : null) ?? channel.id;
}

function ChannelGlyph({ type }: { type: number }) {
  if (type === ChannelType.GuildAnnouncement) return <AnnouncementIcon size={16} />;
  if (type === ChannelType.GuildVoice) return <SpeakerIcon size={16} />;
  if (type === ChannelType.GuildStageVoice) return <StageIcon size={16} />;
  return <HashIcon size={16} />;
}

/**
 * Saves the history of a server's channels to files, the way
 * DiscordChatExporter does: pick the channels, a format and a date range,
 * and the browser downloads the result.
 */
export function ExportDialog({
  guildId,
  initialChannelIds,
  onClose,
}: {
  guildId: string;
  initialChannelIds?: string[];
  onClose: () => void;
}) {
  const guild = useClient((state) => state.guilds[guildId]);
  const channelIds = useClient((state) => state.channelsByGuild[guildId]);
  const channelsById = useClient((state) => state.channelsById);
  const getRest = useClient((state) => state.getRest);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(guildId);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialChannelIds ?? []));
  const [format, setFormat] = useState<ExportFormat>("html-dark");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [threads, setThreads] = useState<ThreadMode>("none");
  const [downloadAssets, setDownloadAssets] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ExportResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  const running = progress !== null;

  /** Readable channels, grouped under their categories like the sidebar. */
  const groups = useMemo(() => {
    const channels = (channelIds ?? [])
      .map((id) => channelsById[id])
      .filter((channel): channel is APIChannel => channel !== undefined);
    const exportable = channels.filter(isExportable);
    const result: Group[] = [];
    const loose = exportable.filter((channel) => !("parent_id" in channel && channel.parent_id));
    if (loose.length) result.push({ id: null, name: null, channels: loose });
    for (const category of channels.filter((channel) => channel.type === ChannelType.GuildCategory)) {
      const inside = exportable.filter(
        (channel) => "parent_id" in channel && channel.parent_id === category.id,
      );
      if (inside.length) result.push({ id: category.id, name: channelName(category), channels: inside });
    }
    return result;
  }, [channelIds, channelsById]);

  // Until the bot's own member arrives, every channel is offered and Discord decides.
  const readable = (channel: APIChannel) =>
    !powers.ready ||
    powers.canIn(channel, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory);

  const needle = query.trim().toLowerCase();
  const visibleGroups = needle
    ? groups
        .map((group) => ({
          ...group,
          channels: group.channels.filter(
            (channel) =>
              channelName(channel).toLowerCase().includes(needle) ||
              (group.name ?? "").toLowerCase().includes(needle),
          ),
        }))
        .filter((group) => group.channels.length > 0)
    : groups;
  const visibleIds = visibleGroups.flatMap((group) =>
    group.channels.filter(readable).map((channel) => channel.id),
  );

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function parseDate(value: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  async function start() {
    if (running || selected.size === 0) return;
    const afterDate = parseDate(after);
    const beforeDate = parseDate(before);
    if (afterDate && beforeDate && afterDate >= beforeDate) {
      setError("The start of the range has to come before its end.");
      return;
    }

    // Keep the sidebar's order rather than the order of the clicks; a thread
    // opened from its own menu is not in the list and goes last.
    const listed = groups.flatMap((group) => group.channels).map((channel) => channel.id);
    const ordered = [...listed, ...[...selected].filter((id) => !listed.includes(id))];
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setReport(null);
    setProgress({
      phase: "messages",
      current: 0,
      total: selected.size,
      label: "",
      messages: 0,
      fraction: 0,
      paused: null,
    });

    try {
      const result = await runExport(
        getRest(),
        {
          guildId,
          channelIds: ordered.filter((id) => selected.has(id)),
          format,
          after: afterDate,
          before: beforeDate,
          threads,
          downloadAssets,
        },
        controller.signal,
        setProgress,
      );
      saveBlob(result.blob, result.fileName);
      if (result.failed.length === 0 && result.missingAssets === 0) {
        toast(
          `Exported ${result.messages.toLocaleString("en-US")} message${result.messages === 1 ? "" : "s"} from ${result.channels} channel${result.channels === 1 ? "" : "s"}.`,
        );
        onClose();
        return;
      }
      setReport(result);
    } catch (cause) {
      if (controller.signal.aborted) toast("Export cancelled.");
      else setError(cause instanceof Error ? cause.message : "The export failed.");
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  function close() {
    abort.current?.abort();
    onClose();
  }

  const footer = running ? (
    <button
      type="button"
      onClick={() => abort.current?.abort()}
      className="rounded bg-danger px-4 py-2 text-sm font-medium text-white transition hover:brightness-90"
    >
      Cancel export
    </button>
  ) : (
    <>
      <button
        type="button"
        onClick={close}
        className="rounded px-4 py-2 text-sm text-text transition-colors hover:underline"
      >
        {report ? "Close" : "Cancel"}
      </button>
      <button
        type="button"
        onClick={() => void start()}
        disabled={selected.size === 0}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selected.size > 1 ? `Export ${selected.size} channels` : "Export"}
      </button>
    </>
  );

  return (
    <Modal
      title="Export chat"
      subtitle={guild ? `Save the message history of ${guild.name} to a file.` : undefined}
      onClose={close}
      footer={footer}
      size="lg"
    >
      {running && <ProgressPanel progress={progress} />}

      {report && <ReportPanel report={report} />}

      <fieldset disabled={running} className="min-w-0 disabled:opacity-60">
        <Field label={`Channels${selected.size ? ` · ${selected.size} selected` : ""}`}>
          <div className="mb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search channels"
                aria-label="Search channels"
                className={`${inputClass} pr-9`}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
                <SearchIcon size={16} />
              </span>
            </div>
            <button
              type="button"
              onClick={() => toggle(visibleIds, true)}
              className="rounded bg-raised px-3 py-2 text-xs font-medium whitespace-nowrap text-text transition-colors hover:bg-hover"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => toggle(visibleIds, false)}
              className="rounded bg-raised px-3 py-2 text-xs font-medium whitespace-nowrap text-text transition-colors hover:bg-hover"
            >
              Clear
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded bg-ink p-1">
            {visibleGroups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                {groups.length === 0 ? "This server has no channels to export." : "No matches."}
              </p>
            ) : (
              visibleGroups.map((group) => {
                const ids = group.channels.filter(readable).map((channel) => channel.id);
                const all = ids.length > 0 && ids.every((id) => selected.has(id));
                return (
                  <div key={group.id ?? "__root__"} className="mb-1">
                    {group.name && (
                      <button
                        type="button"
                        onClick={() => toggle(ids, !all)}
                        className="flex w-full items-center justify-between rounded px-2 pt-2 pb-1 text-left text-[11px] font-bold tracking-wide text-muted uppercase hover:text-bright"
                      >
                        <span className="truncate">{group.name}</span>
                        <span className="text-[10px] font-semibold normal-case">
                          {all ? "Deselect" : "Select"} all
                        </span>
                      </button>
                    )}
                    <ul>
                      {group.channels.map((channel) => {
                        const allowed = readable(channel);
                        const checked = selected.has(channel.id);
                        return (
                          <li key={channel.id}>
                            <button
                              type="button"
                              onClick={() => toggle([channel.id], !checked)}
                              disabled={!allowed}
                              aria-pressed={checked}
                              title={allowed ? undefined : "The bot cannot read this channel's history."}
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span
                                aria-hidden
                                className={`grid h-5 w-5 shrink-0 place-items-center rounded border-2 transition-colors ${
                                  checked ? "border-accent bg-accent text-white" : "border-muted"
                                }`}
                              >
                                {checked && <CheckIcon size={12} />}
                              </span>
                              <span className="text-muted">
                                <ChannelGlyph type={channel.type} />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-text">
                                {channelName(channel)}
                              </span>
                              {!allowed && <span className="text-[11px] text-faint">No access</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </Field>

        <Field label="Format">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FORMATS.map((entry) => {
              const active = format === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setFormat(entry.id)}
                  aria-pressed={active}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-accent bg-accent/15"
                      : "border-transparent bg-ink hover:bg-hover"
                  }`}
                >
                  <span className="block text-sm font-medium text-bright">{entry.label}</span>
                  <span className="block text-[11px] leading-snug text-muted">{entry.hint}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Date range" hint="Leave both empty to export the whole history.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">After</span>
              <input
                type="datetime-local"
                value={after}
                onChange={(event) => setAfter(event.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Before</span>
              <input
                type="datetime-local"
                value={before}
                onChange={(event) => setBefore(event.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </label>
          </div>
        </Field>

        <Field
          label="Threads"
          hint="Threads under the selected channels are exported as files of their own."
        >
          <div className="inline-flex rounded-md bg-ink p-1">
            {THREAD_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setThreads(mode.id)}
                aria-pressed={threads === mode.id}
                className={`rounded px-4 py-1.5 text-sm transition-colors ${
                  threads === mode.id ? "bg-raised font-medium text-bright" : "text-muted hover:text-text"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </Field>

        <Switch
          checked={downloadAssets}
          onChange={setDownloadAssets}
          label="Download media"
          description="Copies attachments, avatars and emoji into a .zip next to the export, so it keeps working after Discord's links expire."
        />
      </fieldset>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}

function ProgressPanel({ progress }: { progress: ExportProgress }) {
  let text: string;
  switch (progress.phase) {
    case "threads":
      text = "Looking up threads…";
      break;
    case "messages":
      text = progress.label
        ? `#${progress.label} (${progress.current}/${progress.total}) · ${progress.messages.toLocaleString("en-US")} messages`
        : "Starting…";
      break;
    case "members":
      text = `Looking up authors ${progress.current}/${progress.total}…`;
      break;
    case "assets":
      text = `Downloading media ${progress.current}/${progress.total}…`;
      break;
    case "packing":
      text = "Writing the file…";
      break;
  }
  const width = progress.fraction === null ? null : Math.round(progress.fraction * 100);

  return (
    <div className="mb-4 rounded-md bg-ink p-3" aria-live="polite">
      <p className="mb-2 truncate text-sm text-text">{text}</p>
      {progress.paused && <PauseNotice paused={progress.paused} />}
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        {width === null ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        ) : (
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${width}%` }}
          />
        )}
      </div>
    </div>
  );
}

/** Says why the export is standing still, with a countdown to when it resumes. */
function PauseNotice({ paused }: { paused: NonNullable<ExportProgress["paused"]> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.ceil((paused.until - now) / 1000);
  if (seconds <= 0) return null;
  return (
    <p className="mb-2 text-xs text-muted">
      {paused.reason === "rate-limit"
        ? `Discord asked to slow down; resuming in ${seconds}s at a gentler pace.`
        : `Short break to stay under Discord's rate limit; resuming in ${seconds}s.`}
    </p>
  );
}

function ReportPanel({ report }: { report: ExportResult }) {
  return (
    <div className="mb-4 rounded-md bg-ink p-3 text-sm">
      <p className="text-text">
        Saved <span className="font-semibold text-bright">{report.fileName}</span> with{" "}
        {report.messages.toLocaleString("en-US")} messages from {report.channels} channel
        {report.channels === 1 ? "" : "s"}.
      </p>
      {report.missingAssets > 0 && (
        <p className="mt-2 text-muted">
          {report.missingAssets} media file{report.missingAssets === 1 ? "" : "s"} could not be
          downloaded and stay linked to Discord instead.
        </p>
      )}
      {report.failed.length > 0 && (
        <>
          <p className="mt-2 font-medium text-danger">Skipped:</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {report.failed.map((entry) => (
              <li key={entry.name}>
                <span className="text-text">#{entry.name}</span> — {entry.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
