"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  title: string;
  /** Sub-line under the title, for context the title cannot carry. */
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** The action row at the bottom; usually Cancel plus a primary button. */
  footer?: React.ReactNode;
  /** Wider shell, for the permission editor's two columns. */
  size?: "md" | "lg";
}

/**
 * Discord's modal shell: dimmed backdrop, a panel with a titled head, a
 * scrolling body and a footer bar. Escape and a click on the backdrop close it,
 * and focus is kept inside while it is open.
 */
export function Modal({ title, subtitle, onClose, children, footer, size = "md" }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    // The first field is what a keyboard user wants, not the dialog itself.
    const focusable = panel.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select, button',
    );
    (focusable ?? panel.current)?.focus();
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
    const focusable = panel.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex animate-fade-in items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex max-h-[85vh] w-full animate-pop-in flex-col overflow-hidden rounded-md bg-panel shadow-2xl outline-none ${
          size === "lg" ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <header className="shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl leading-tight font-bold text-bright">{title}</h2>
              {subtitle && <p className="mt-1 text-sm break-words text-muted">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted transition-colors hover:text-bright"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>

        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-3 bg-panel-alt px-4 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Cancel + confirm pair, styled the way Discord's dialogs end. */
export function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
  busy = false,
  danger = false,
  disabled = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-4 py-2 text-sm whitespace-nowrap text-text transition-colors hover:underline"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || disabled}
        className={`rounded px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors disabled:opacity-60 ${
          danger ? "bg-danger hover:brightness-90" : "bg-accent hover:bg-accent-strong"
        }`}
      >
        {busy ? "Working…" : confirmLabel}
      </button>
    </>
  );
}

/** A labelled form row; the label is the same small caps Discord uses. */
export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[11px] font-bold tracking-wide text-muted uppercase"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded bg-ink px-3 py-2 text-sm text-text outline-none transition-shadow placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]";

/** Discord's pill switch, used for role flags and channel options. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors disabled:opacity-50 ${
          checked ? "bg-online" : "bg-faint"
        }`}
      >
        <span
          aria-hidden
          className="block h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "none" }}
        />
      </button>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-bright">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </div>
  );
}
