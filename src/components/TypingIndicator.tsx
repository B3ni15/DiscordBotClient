"use client";

import { useEffect, useState } from "react";
import { useClient } from "@/lib/store/client";

const TYPING_TTL = 9000;

/** Discord stops the indicator 9s after the last TYPING_START. */
export function TypingIndicator({ channelId }: { channelId: string }) {
  const typing = useClient((state) => state.typingByChannel[channelId] ?? []);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const active = typing.filter((entry) => now - entry.startedAt < TYPING_TTL);
  if (active.length === 0) return <div className="h-5" aria-hidden />;

  const names = active.map((entry) => entry.name);
  const label =
    names.length === 1
      ? `${names[0]} gépel…`
      : names.length <= 3
        ? `${names.join(", ")} gépelnek…`
        : "Többen gépelnek…";

  return (
    <p aria-live="polite" className="h-5 px-4 text-xs text-muted">
      {label}
    </p>
  );
}
