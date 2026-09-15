"use client";

import { useState, type FormEvent } from "react";
import {
  AUTO_ARCHIVE_DURATIONS,
  ThreadType,
  autoArchiveLabel,
  threadApi,
  type AutoArchiveDuration,
} from "@/lib/discord/threadApi";
import { useClient } from "@/lib/store/client";

export interface ThreadCreateProps {
  /** Parent channel the thread is started in. */
  channelId: string;
  /** When given, the thread is anchored to this message. */
  messageId?: string;
  onCreated?: (threadId: string) => void;
  onClose: () => void;
}

const MAX_NAME_LENGTH = 100;

/**
 * Thread creation form. With a `messageId` the thread hangs off that message and
 * Discord decides the type; without one the type is chosen here.
 */
export function ThreadCreate({ channelId, messageId, onCreated, onClose }: ThreadCreateProps) {
  const getRest = useClient((state) => state.getRest);

  const [name, setName] = useState("");
  const [duration, setDuration] = useState<AutoArchiveDuration>(1440);
  const [type, setType] = useState<ThreadType>(ThreadType.Public);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromMessage = messageId !== undefined;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the thread a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const thread = fromMessage
        ? await threadApi.createFromMessage(getRest(), channelId, messageId, {
            name: trimmed,
            auto_archive_duration: duration,
          })
        : await threadApi.create(getRest(), channelId, {
            name: trimmed,
            auto_archive_duration: duration,
            type,
          });
      onCreated?.(thread.id);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not create the thread: ${cause.message}`
          : "Could not create the thread.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Create thread"
      className="flex w-80 flex-col gap-3 rounded-lg border border-line bg-panel p-4 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {fromMessage ? "Thread from message" : "New thread"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close form"
          className="text-muted hover:text-text"
        >
          ✕
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="thread-name"
          autoFocus
          className="rounded border border-line bg-raised px-2 py-1.5 text-sm text-text placeholder:text-muted"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Archive after inactivity
        <select
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value) as AutoArchiveDuration)}
          className="rounded border border-line bg-raised px-2 py-1.5 text-sm text-text"
        >
          {AUTO_ARCHIVE_DURATIONS.map((value) => (
            <option key={value} value={value}>
              {autoArchiveLabel(value)}
            </option>
          ))}
        </select>
      </label>

      {fromMessage ? (
        <p className="text-[11px] leading-relaxed text-muted">
          The thread is attached to message{" "}
          <span className="font-mono text-amber">{messageId}</span>; Discord derives its type from
          the parent channel.
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <select
            value={type}
            onChange={(event) => setType(Number(event.target.value) as ThreadType)}
            className="rounded border border-line bg-raised px-2 py-1.5 text-sm text-text"
          >
            <option value={ThreadType.Public}>Public thread</option>
            <option value={ThreadType.Private}>Private thread</option>
          </select>
        </label>
      )}

      {error && <p className="text-xs leading-relaxed text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded bg-accent/15 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create thread"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
