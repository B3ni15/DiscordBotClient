"use client";

import { useId } from "react";

export type PresenceStatus = "online" | "idle" | "dnd" | "offline" | "streaming" | string;

const STATUS_COLOR: Record<string, string> = {
  online: "var(--online)",
  idle: "var(--amber)",
  dnd: "var(--danger)",
  streaming: "#593695",
  offline: "var(--faint)",
  invisible: "var(--faint)",
};

export const STATUS_LABEL: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  streaming: "Streaming",
  offline: "Offline",
  invisible: "Offline",
};

export interface StatusDotProps {
  status: PresenceStatus;
  size?: number;
  /** Tailwind colour of the ring that separates the dot from the avatar. */
  ringClassName?: string;
  className?: string;
  /** Omit to keep the dot decorative; set for a standalone indicator. */
  label?: string;
}

/**
 * Discord's presence indicator: a filled circle for online, a crescent for idle,
 * a barred circle for do-not-disturb and a hollow ring for offline. The shapes
 * are cut with an SVG mask so the status reads without relying on colour alone.
 */
export function StatusDot({
  status,
  size = 10,
  ringClassName = "bg-panel",
  className,
  label,
}: StatusDotProps) {
  const maskId = useId();
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.offline;

  return (
    <span
      className={`grid place-items-center rounded-full transition-colors ${ringClassName} ${className ?? ""}`}
      style={{ padding: Math.max(2, Math.round(size / 5)) }}
      title={label ?? STATUS_LABEL[status] ?? "Offline"}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg width={size} height={size} viewBox="0 0 10 10" className="block">
        <mask id={maskId}>
          <circle cx="5" cy="5" r="5" fill="white" />
          {status === "idle" && <circle cx="2" cy="2" r="4.2" fill="black" />}
          {status === "dnd" && <rect x="1.2" y="3.9" width="7.6" height="2.2" rx="1.1" fill="black" />}
          {(status === "offline" || status === "invisible") && (
            <circle cx="5" cy="5" r="2.6" fill="black" />
          )}
          {status === "streaming" && <circle cx="5" cy="5" r="2.6" fill="black" />}
        </mask>
        <circle cx="5" cy="5" r="5" fill={color} mask={`url(#${maskId})`} />
        {status === "streaming" && <polygon points="3.8,3.2 7.2,5 3.8,6.8" fill={color} />}
      </svg>
    </span>
  );
}
