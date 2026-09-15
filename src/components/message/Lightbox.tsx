"use client";

import { useEffect, useRef } from "react";

export interface LightboxProps {
  src: string;
  alt: string;
  /** Shown as the caption and used as the download file name hint. */
  name?: string;
  onClose: () => void;
}

/** Full-screen image viewer: closes on ESC or backdrop click, traps focus. */
export function Lightbox({ src, alt, name, onClose }: LightboxProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialog.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/90 p-4"
      onClick={onClose}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={name ?? alt ?? "Image viewer"}
        className="flex max-h-full max-w-full flex-col items-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[80vh] max-w-full rounded border border-line object-contain"
        />
        <div className="flex items-center gap-3 text-xs">
          {name && <span className="max-w-[40ch] truncate text-muted">{name}</span>}
          <a
            href={src}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent hover:underline"
          >
            Open in new tab
          </a>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="rounded border border-line bg-raised px-2 py-1 hover:bg-panel"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
