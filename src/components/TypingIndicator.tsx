"use client";

import { useEffect, useState } from "react";
import { useClient, type TypingUser } from "@/lib/store/client";

const TYPING_TTL = 9000;
const EMPTY_TYPING_USERS: TypingUser[] = [];

/** Discord stops the indicator 9s after the last TYPING_START. */
export function TypingIndicator({ channelId }: { channelId: string }) {
  const typing = useClient((state) => state.typingByChannel[channelId] ?? EMPTY_TYPING_USERS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const active = typing.filter((entry) => now - entry.startedAt < TYPING_TTL);
  if (active.length === 0) return <div className="h-6" aria-hidden />;

  const names = active.map((entry) => entry.name);

  return (
    <p
      aria-live="polite"
      className="flex h-6 animate-fade-in items-center gap-2 px-4 text-xs text-text"
    >
      <span aria-hidden className="flex items-end gap-0.5 pb-px">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="typing-dot h-1.5 w-1.5 rounded-full bg-muted"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
      <span className="truncate">
        {names.length === 1 ? (
          <>
            <b className="font-semibold">{names[0]}</b> is typing…
          </>
        ) : names.length <= 3 ? (
          <>
            <b className="font-semibold">{names.join(", ")}</b> are typing…
          </>
        ) : (
          "Several people are typing…"
        )}
      </span>
    </p>
  );
}
