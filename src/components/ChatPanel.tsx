"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";
import { Composer } from "./Composer";
import { TypingIndicator } from "./TypingIndicator";

export function ChatPanel() {
  const channelId = useClient((state) => state.selectedChannelId);
  const channel = useClient((state) => (channelId ? state.channelsById[channelId] : null));
  const messages = useClient((state) => (channelId ? state.messagesByChannel[channelId] : undefined));
  const loadOlder = useClient((state) => state.loadOlderMessages);
  const scroller = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  // Keep the newest message in view unless the reader scrolled up.
  useLayoutEffect(() => {
    if (pinnedToBottom && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [messages, pinnedToBottom]);

  useEffect(() => {
    setPinnedToBottom(true);
  }, [channelId]);

  function handleScroll() {
    const element = scroller.current;
    if (!element) return;
    setPinnedToBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
    if (element.scrollTop < 200 && channelId) {
      const previousHeight = element.scrollHeight;
      void loadOlder(channelId).then(() => {
        // Hold the reading position while older messages are prepended.
        element.scrollTop += element.scrollHeight - previousHeight;
      });
    }
  }

  if (!channelId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
        Válassz csatornát a bal oldali listából.
      </div>
    );
  }

  const channelName = channel && "name" in channel ? channel.name : channelId;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-ink">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span aria-hidden className="text-muted">
          #
        </span>
        <h2 className="truncate text-sm font-semibold">{channelName}</h2>
      </header>

      <div ref={scroller} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4">
        {messages === undefined ? (
          <p className="text-sm text-muted">Üzenetek betöltése…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted">Még nincs üzenet ebben a csatornában.</p>
        ) : (
          <ol>
            {messages.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                previous={messages[index - 1]}
              />
            ))}
          </ol>
        )}
      </div>

      <TypingIndicator channelId={channelId} />
      <Composer channelId={channelId} channelName={channelName ?? ""} />
    </section>
  );
}

/** Consecutive messages from one author within 7 minutes render as one block. */
function MessageRow({ message, previous }: { message: APIMessage; previous?: APIMessage }) {
  const grouped =
    previous !== undefined &&
    previous.author.id === message.author.id &&
    Date.parse(message.timestamp) - Date.parse(previous.timestamp) < 7 * 60 * 1000;

  // The gateway attaches a partial member object that APIMessage does not declare.
  const nick = (message as APIMessage & { member?: { nick?: string | null } }).member?.nick;
  const displayName = nick ?? message.author.global_name ?? message.author.username;

  return (
    <li className={`group relative rounded px-2 hover:bg-panel/60 ${grouped ? "py-0.5" : "mt-4 py-1"}`}>
      {grouped ? (
        <div className="pl-12 text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      ) : (
        <div className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={userAvatarUrl(message.author, 80)}
            alt=""
            className="mt-0.5 h-9 w-9 shrink-0 rounded-full"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{displayName}</span>
              {message.author.bot && (
                <span className="rounded bg-accent/15 px-1 font-mono text-[10px] font-medium text-accent">
                  BOT
                </span>
              )}
              <time
                dateTime={message.timestamp}
                className="font-mono text-[11px] text-muted"
                title={new Date(message.timestamp).toLocaleString("hu-HU")}
              >
                {new Date(message.timestamp).toLocaleTimeString("hu-HU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
