"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { MessageEditor } from "@/components/actions/MessageEditor";
import { MessageToolbar } from "@/components/actions/MessageToolbar";
import { ReactionBar } from "@/components/actions/ReactionBar";
import { MessageContent } from "@/components/message/MessageContent";
import { ThreadCreate } from "@/components/nav/ThreadCreate";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";
import { Composer } from "./Composer";
import { TypingIndicator } from "./TypingIndicator";

export function ChatPanel() {
  const channelId = useClient((state) => state.selectedChannelId);

  if (!channelId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
        Pick a channel from the list to start reading.
      </div>
    );
  }

  // Keyed by channel so scroll, reply and edit state reset on their own.
  return <ChannelView key={channelId} channelId={channelId} />;
}

function ChannelView({ channelId }: { channelId: string }) {
  const channel = useClient((state) => state.channelsById[channelId]);
  const messages = useClient((state) => state.messagesByChannel[channelId]);
  const loadOlder = useClient((state) => state.loadOlderMessages);
  const selfId = useClient((state) => state.user?.id);
  const scroller = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<APIMessage | null>(null);
  const [creatingThread, setCreatingThread] = useState(false);
  const selectChannel = useClient((state) => state.selectChannel);

  // Keep the newest message in view unless the reader scrolled up.
  useLayoutEffect(() => {
    if (pinnedToBottom && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [messages, pinnedToBottom]);

  function handleScroll() {
    const element = scroller.current;
    if (!element) return;
    setPinnedToBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
    if (element.scrollTop < 200) {
      const previousHeight = element.scrollHeight;
      void loadOlder(channelId).then(() => {
        // Hold the reading position while older messages are prepended.
        element.scrollTop += element.scrollHeight - previousHeight;
      });
    }
  }

  const channelName = channel && "name" in channel ? channel.name : channelId;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-ink">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span aria-hidden className="text-muted">
          #
        </span>
        <h2 className="truncate text-sm font-semibold">{channelName}</h2>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCreatingThread(true)}
            title="New thread"
            aria-label="New thread"
            className="grid h-8 w-8 place-items-center rounded text-base text-muted transition-colors hover:bg-raised hover:text-text"
          >
            ⌥
          </button>
          <HeaderButton panel="pins" label="Pinned messages" glyph="⚑" />
          <HeaderButton panel="search" label="Search" glyph="⌕" />
        </div>
      </header>

      {creatingThread && (
        <div className="border-b border-line bg-panel px-4 py-3">
          <ThreadCreate
            channelId={channelId}
            onCreated={(threadId) => void selectChannel(threadId)}
            onClose={() => setCreatingThread(false)}
          />
        </div>
      )}

      <div ref={scroller} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4">
        {messages === undefined ? (
          <p className="text-sm text-muted">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted">No messages in this channel yet.</p>
        ) : (
          <ol>
            {messages.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                previous={messages[index - 1]}
                isOwn={message.author.id === selfId}
                editing={editingId === message.id}
                onReply={setReplyTo}
                onEdit={(target) => setEditingId(target.id)}
                onEditDone={() => setEditingId(null)}
              />
            ))}
          </ol>
        )}
      </div>

      <TypingIndicator channelId={channelId} />
      <Composer
        channelId={channelId}
        channelName={channelName ?? ""}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </section>
  );
}

function HeaderButton({
  panel,
  label,
  glyph,
}: {
  panel: "pins" | "search";
  label: string;
  glyph: string;
}) {
  const togglePanel = useUI((state) => state.togglePanel);
  const active = useUI((state) => state.panel === panel);

  return (
    <button
      type="button"
      onClick={() => togglePanel(panel)}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-8 w-8 place-items-center rounded text-base transition-colors ${
        active ? "bg-raised text-accent" : "text-muted hover:bg-raised hover:text-text"
      }`}
    >
      {glyph}
    </button>
  );
}

interface MessageRowProps {
  message: APIMessage;
  previous?: APIMessage;
  isOwn: boolean;
  editing: boolean;
  onReply: (message: APIMessage) => void;
  onEdit: (message: APIMessage) => void;
  onEditDone: () => void;
}

/** Consecutive messages from one author within 7 minutes render as one block. */
function MessageRow({
  message,
  previous,
  isOwn,
  editing,
  onReply,
  onEdit,
  onEditDone,
}: MessageRowProps) {
  const grouped =
    previous !== undefined &&
    previous.author.id === message.author.id &&
    Date.parse(message.timestamp) - Date.parse(previous.timestamp) < 7 * 60 * 1000;

  // The gateway attaches a partial member object that APIMessage does not declare.
  const nick = (message as APIMessage & { member?: { nick?: string | null } }).member?.nick;
  const displayName = nick ?? message.author.global_name ?? message.author.username;

  const body = editing ? (
    <MessageEditor message={message} onDone={onEditDone} />
  ) : (
    <>
      <MessageContent message={message} />
      <ReactionBar message={message} className="mt-1" />
    </>
  );

  return (
    <li
      data-message-id={message.id}
      className={`group relative rounded px-2 hover:bg-panel/60 ${grouped ? "py-0.5" : "mt-4 py-1"}`}
    >
      <MessageToolbar
        message={message}
        isOwn={isOwn}
        onReply={onReply}
        onEdit={onEdit}
        className="absolute top-0 right-2 z-10 -translate-y-1/2"
      />

      {grouped ? (
        <div className="pl-12">{body}</div>
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
                title={new Date(message.timestamp).toLocaleString("en-US")}
              >
                {new Date(message.timestamp).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
            {body}
          </div>
        </div>
      )}
    </li>
  );
}
