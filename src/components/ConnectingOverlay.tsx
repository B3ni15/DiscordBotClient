"use client";

import { useEffect, useState } from "react";
import { useClient } from "@/lib/store/client";

/** Discord shows a rotating hint while it connects; these play the same part. */
const TIPS = [
  "Your bot token never leaves this browser.",
  "Presence needs the PRESENCE INTENT enabled in the Developer Portal.",
  "Shift+Enter puts a line break in a message instead of sending it.",
  "Open a DM from any member card — it gets filed under Direct Messages.",
  "Message text arrives empty without the MESSAGE CONTENT intent.",
  "Scroll up in a channel to pull in older history.",
];

const LABELS: Record<string, string> = {
  idle: "Getting ready…",
  connecting: "Connecting to Discord…",
  identifying: "Identifying the bot…",
  reconnecting: "Reconnecting…",
  closed: "Connection closed",
};

/**
 * Covers the app until the first gateway handshake is done, so the layout is
 * never shown half-populated.
 */
export function ConnectingOverlay() {
  const status = useClient((state) => state.status);
  const error = useClient((state) => state.error);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    const timer = setInterval(() => setTip((index) => (index + 1) % TIPS.length), 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-6 bg-chat px-6 text-center">
      {/* Three dots that swell in turn, the way Discord's loader does. */}
      <span aria-hidden className="flex items-center gap-2">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="typing-dot h-3 w-3 rounded-full bg-accent"
            style={{ animationDelay: `${index * 180}ms` }}
          />
        ))}
      </span>

      <p role="status" className="text-sm font-medium text-bright">
        {error ?? LABELS[status] ?? "Connecting…"}
      </p>

      <p key={tip} className="max-w-sm animate-fade-in text-xs leading-relaxed text-muted">
        <span className="font-semibold text-text">Did you know: </span>
        {TIPS[tip]}
      </p>
    </div>
  );
}
