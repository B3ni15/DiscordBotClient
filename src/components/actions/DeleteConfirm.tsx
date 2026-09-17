"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  /*
   * Rendered into the body rather than in place: the toolbar that opens this
   * dialog is translated, and a transform makes an ancestor the containing
   * block for `fixed`, which squeezed the dialog into the toolbar's own width.
   */
  if (typeof document === "undefined") return null;

  return createPortal(
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
        className="w-full max-w-md animate-pop-in overflow-hidden rounded-md bg-panel shadow-2xl"
      >
        <div className="px-4 pt-4">
          <h2 id="delete-confirm-title" className="text-xl font-bold text-bright">
            Delete message
          </h2>
          <p className="mt-2 text-sm text-text">
            Are you sure you want to delete this message? This cannot be undone.
          </p>

          <div className="mt-4 max-h-40 overflow-y-auto rounded bg-chat px-3 py-2 text-sm break-words whitespace-pre-wrap">
            {preview || <span className="text-muted">(no text content)</span>}
          </div>
          <p className="mt-2 font-mono text-[10px] text-faint">{message.id}</p>

          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-3 bg-panel-alt px-4 py-4">
          <button
            ref={cancelButton}
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm whitespace-nowrap text-text transition-colors hover:underline"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="rounded bg-danger px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:brightness-90 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
