"use client";

import { useEffect, useRef, useState } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { editMessage } from "@/lib/discord/messageActions";
import { useClient } from "@/lib/store/client";

export interface MessageEditorProps {
  message: APIMessage;
  /** Called after a successful save, or when the user cancels. */
  onDone: () => void;
  /** Optional hook for optimistic updates by the surrounding list. */
  onSaved?: (content: string) => void;
  className?: string;
}

export function MessageEditor({ message, onDone, onSaved, className = "" }: MessageEditorProps) {
  const getRest = useClient((state) => state.getRest);
  const [content, setContent] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    autoGrow(element);
  }, []);

  async function save() {
    if (saving) return;
    const trimmed = content.trim();
    if (trimmed === message.content.trim()) {
      onDone();
      return;
    }
    if (!trimmed) {
      setError("Message cannot be empty. Delete it instead.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await editMessage(getRest(), message.channel_id, message.id, trimmed);
      onSaved?.(trimmed);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the edit. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDone();
    }
  }

  return (
    <div className={className}>
      <textarea
        ref={textarea}
        rows={1}
        value={content}
        disabled={saving}
        aria-label="Edit message"
        onChange={(event) => {
          setContent(event.target.value);
          autoGrow(event.target);
        }}
        onKeyDown={handleKeyDown}
        className="max-h-60 w-full resize-none rounded border border-line bg-panel px-2 py-1.5 text-sm leading-relaxed outline-none focus:border-accent disabled:opacity-60"
      />
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
        <span>
          Enter <span className="text-text">saves</span> · Esc{" "}
          <span className="text-text">cancels</span> · Shift+Enter for a new line
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onDone}
          className="rounded px-2 py-0.5 hover:bg-raised hover:text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-accent/20 px-2 py-0.5 text-accent hover:bg-accent/30 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Keep the box the height of its text instead of scrolling inside it. */
function autoGrow(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
}
