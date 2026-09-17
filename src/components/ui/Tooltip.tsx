"use client";

import { useState, type ReactNode } from "react";

export interface TooltipProps {
  label: ReactNode;
  side?: "top" | "right";
  children: ReactNode;
  className?: string;
}

/**
 * Discord's dark tooltip. Shown on hover and on keyboard focus, so it is not
 * pointer-only; the label is decorative here because every trigger that uses it
 * carries its own accessible name.
 */
export function Tooltip({ label, side = "top", children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);

  const position =
    side === "right"
      ? "left-full top-1/2 ml-3 -translate-y-1/2"
      : "bottom-full left-1/2 mb-2 -translate-x-1/2";

  return (
    <span
      className={`relative inline-flex ${className ?? ""}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          aria-hidden
          className={`pointer-events-none absolute z-50 animate-pop-in rounded-md bg-floating px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-bright shadow-lg ${position}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
