"use client";

import { useEffect, useRef, useState } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { deleteMessage } from "@/lib/discord/messageActions";
import { useClient } from "@/lib/store/client";

export interface DeleteConfirmProps {
  message: APIMessage;
  /** Closes the dialog; called on cancel, Esc and after a successful delete. */
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteConfirm({ message, onClose, onDeleted }: DeleteConfirmProps) {
  const getRest = useClient((state) => state.getRest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    // Restore focus to whatever opened the dialog.
    return () => opener.current?.focus?.();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    // Focus trap: cycle within the dialog's focusable elements.
    const focusable = dialog.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMessage(getRest(), message.channel_id, message.id);
      onDeleted?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the message. Try again.");
      setBusy(false);
    }
  }

  const preview = message.content.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        className="w-full max-w-sm rounded-lg border border-line bg-raised p-4 shadow-xl"
      >
        <h2 id="delete-confirm-title" className="text-sm font-semibold">
          Delete message
        </h2>
        <p className="mt-1 text-xs text-muted">
          Delete this message? This cannot be undone.
        </p>

        <div className="mt-3 max-h-32 overflow-y-auto rounded border border-line bg-panel px-2 py-1.5 text-xs whitespace-pre-wrap">
          {preview || <span className="text-muted">(no text content)</span>}
        </div>
        <p className="mt-2 font-mono text-[10px] text-muted">{message.id}</p>

        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelButton}
            type="button"
            onClick={onClose}
            className="rounded border border-line px-3 py-1.5 text-xs hover:bg-panel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="rounded bg-danger/20 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/30 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete message"}
          </button>
        </div>
      </div>
    </div>
  );
}
