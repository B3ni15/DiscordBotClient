"use client";

import { useEffect, useState } from "react";
import { ChatIcon } from "@/components/ui/icons";
import { useClient } from "@/lib/store/client";

/** Discord shows a rotating hint while it connects; these play the same part. */
const TIPS = [
  "Your bot token never leaves this browser.",
  "Presence needs the PRESENCE INTENT enabled in the Developer Portal.",
  "Shift+Enter puts a line break in a message instead of sending it.",
  "Open a DM from any member card — it gets filed under Direct Messages.",
  "Message text arrives empty without the MESSAGE CONTENT intent.",
  "Scroll up in a channel to pull in older history.",
  "Paste a screenshot straight into the message box to attach it.",
  "Drop files anywhere on the chat to upload them.",
  "Click the server name for its menu, including Server Settings.",
  "Right-click a message and pick Forward to share it elsewhere.",
];

const LABELS: Record<string, string> = {
  idle: "Starting…",
  connecting: "Connecting to Discord…",
  identifying: "Identifying the bot…",
  reconnecting: "Reconnecting…",
  closed: "Connection closed",
};

/**
 * Discord's loading screen: a pulsing mark, a "did you know" tip that rotates,
 * and what the connection is doing. Shown while a stored session restores and
 * until the first gateway handshake is done, so the layout is never shown
 * half-populated.
 */
export function LoadingScreen({ label, error }: { label: string; error?: string | null }) {
  // The page is pre-rendered, so the first tip has to be the same on the server
  // and in the browser; the rotation takes over from there.
  const [tip, setTip] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTip((index) => (index + 1) % TIPS.length), 5000);
    // After a while, admit it is taking long rather than spinning forever.
    const slowTimer = setTimeout(() => setSlow(true), 12_000);
    return () => {
      clearInterval(timer);
      clearTimeout(slowTimer);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex animate-fade-in flex-col items-center justify-center bg-chat px-6 text-center">
      <div className="loader-mark relative grid h-[88px] w-[88px] place-items-center bg-accent text-white shadow-[0_8px_32px_rgb(88_101_242/0.35)]">
        <ChatIcon size={44} />
        <span aria-hidden className="loader-ring absolute inset-[-10px] rounded-[36px] border-2 border-accent/40" />
      </div>

      <p className="mt-10 text-xs font-bold tracking-[0.12em] text-bright uppercase">
        Did you know
      </p>
      <p key={tip} className="mt-2 max-w-sm animate-fade-in text-sm leading-relaxed text-text">
        {TIPS[tip]}
      </p>

      <p
        role="status"
        className={`mt-8 flex items-center gap-2 text-xs font-medium ${error ? "text-danger" : "text-muted"}`}
      >
        {!error && (
          <span aria-hidden className="flex gap-1">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="typing-dot h-1.5 w-1.5 rounded-full bg-muted"
                style={{ animationDelay: `${index * 160}ms` }}
              />
            ))}
          </span>
        )}
        {error ?? label}
      </p>
      {slow && !error && (
        <p className="mt-3 max-w-xs animate-fade-in text-xs text-faint">
          This is taking longer than usual. Check your connection, or reload the page.
        </p>
      )}
    </div>
  );
}

/** The loading screen while the gateway performs its first handshake. */
export function ConnectingOverlay() {
  const status = useClient((state) => state.status);
  const error = useClient((state) => state.error);
  return <LoadingScreen label={LABELS[status] ?? "Connecting…"} error={error} />;
}
