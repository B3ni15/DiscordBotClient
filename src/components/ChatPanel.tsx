"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { MessageEditor } from "@/components/actions/MessageEditor";
import { MessageToolbar } from "@/components/actions/MessageToolbar";
import { ReactionBar } from "@/components/actions/ReactionBar";
import { MessageContent } from "@/components/message/MessageContent";
import { ThreadCreate } from "@/components/nav/ThreadCreate";
import { BotTag } from "@/components/ui/BotTag";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { Tooltip } from "@/components/ui/Tooltip";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";
import { Composer } from "./Composer";
import { TypingIndicator } from "./TypingIndicator";

const DM_TYPES = new Set([1, 3]);
/** 2 = voice, 13 = stage; both carry Discord's built-in voice text chat. */
const VOICE_TYPES = new Set([2, 13]);

export function ChatPanel() {
  const channelId = useClient((state) => state.selectedChannelId);

  if (!channelId) return <EmptyChat />;

  // Keyed by channel so scroll, reply and edit state reset on their own.
  return <ChannelView key={channelId} channelId={channelId} />;
}

/** Discord's "no channel open" state, rather than a bare line of text. */
function EmptyChat() {
  return (
    <div className="flex flex-1 animate-fade-in flex-col items-center justify-center gap-3 bg-chat px-6 text-center">
      <span aria-hidden className="text-5xl opacity-40">
        💬
      </span>
      <h2 className="text-lg font-semibold text-bright">No channel open</h2>
      <p className="max-w-sm text-sm text-muted">
        Pick a channel from the list to start reading, or open a direct message from the rail on
        the left.
      </p>
    </div>
  );
}

function ChannelView({ channelId }: { channelId: string }) {
  const channel = useClient((state) => state.channelsById[channelId]);
  const messages = useClient((state) => state.messagesByChannel[channelId]);
  const loadOlder = useClient((state) => state.loadOlderMessages);
  const hasMore = useClient((state) => state.hasMoreByChannel[channelId]);
  const selfId = useClient((state) => state.user?.id);
  const scroller = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<APIMessage | null>(null);
  const [creatingThread, setCreatingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
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
    if (element.scrollTop < 200 && !loadingOlder && hasMore !== false) {
      const previousHeight = element.scrollHeight;
      setLoadingOlder(true);
      void loadOlder(channelId)
        .then(() => {
          // Hold the reading position while older messages are prepended.
          element.scrollTop += element.scrollHeight - previousHeight;
        })
        .finally(() => setLoadingOlder(false));
    }
  }

  const isDM = channel !== undefined && DM_TYPES.has(channel.type);
  const isVoice = channel !== undefined && VOICE_TYPES.has(channel.type);
  const recipient = isDM
    ? (channel as { recipients?: Array<{ username?: string; global_name?: string | null }> })
        .recipients?.[0]
    : undefined;
  const channelName = isDM
    ? (recipient?.global_name ?? recipient?.username ?? "Direct message")
    : channel && "name" in channel
      ? channel.name
      : channelId;
  const topic = channel && "topic" in channel ? channel.topic : null;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-chat">
      <header className="z-10 flex h-12 shrink-0 items-center gap-2 px-4 shadow-[0_1px_0_rgba(0,0,0,0.2),0_2px_0_rgba(0,0,0,0.05)]">
        <span aria-hidden className="text-xl leading-none text-faint">
          {isDM ? "@" : isVoice ? (channel?.type === 13 ? "📡" : "🔊") : "#"}
        </span>
        <h2 className="truncate text-base font-semibold text-bright">{channelName}</h2>
        {topic && (
          <>
            <span aria-hidden className="h-6 w-px shrink-0 bg-line" />
            <p className="hidden min-w-0 truncate text-sm text-muted xl:block" title={topic}>
              {topic}
            </p>
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!isDM && !isVoice && (
            <Tooltip label="New thread">
              <button
                type="button"
                onClick={() => setCreatingThread(true)}
                aria-label="New thread"
                className="grid h-8 w-8 place-items-center rounded text-base text-muted transition-colors hover:bg-hover hover:text-bright"
              >
                <span aria-hidden>🧵</span>
              </button>
            </Tooltip>
          )}
          <HeaderButton panel="pins" label="Pinned messages" glyph="📌" />
          <HeaderButton panel="search" label="Search" glyph="🔍" />
        </div>
      </header>

      {isVoice && (
        <p className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-4 py-1.5 text-xs text-muted">
          <span aria-hidden>🔇</span>
          This is the channel&rsquo;s text chat. A bot client cannot join the voice stream itself.
        </p>
      )}

      {creatingThread && (
        <div className="animate-fade-in border-b border-line bg-panel px-4 py-3">
          <ThreadCreate
            channelId={channelId}
            onCreated={(threadId) => void selectChannel(threadId)}
            onClose={() => setCreatingThread(false)}
          />
        </div>
      )}

      <div
        ref={scroller}
        onScroll={handleScroll}
        className="scroll-always min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {messages === undefined ? (
          <MessageSkeletons />
        ) : messages.length === 0 ? (
          <ChannelIntro name={channelName ?? channelId} isDM={isDM} isVoice={isVoice} />
        ) : (
          <>
            {loadingOlder && (
              <p className="flex items-center justify-center gap-2 py-3 text-xs text-muted">
                <Spinner size={14} />
                Loading older messages…
              </p>
            )}
            {hasMore === false && !loadingOlder && (
              <ChannelIntro
                name={channelName ?? channelId}
                isDM={isDM}
                isVoice={isVoice}
                compact
              />
            )}
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
          </>
        )}
      </div>

      <TypingIndicator channelId={channelId} />
      <Composer
        channelId={channelId}
        channelName={channelName ?? ""}
        isDM={isDM}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </section>
  );
}

/** The "this is the beginning of #channel" block Discord puts above the history. */
function ChannelIntro({
  name,
  isDM,
  isVoice = false,
  compact = false,
}: {
  name: string;
  isDM: boolean;
  isVoice?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`animate-fade-in ${compact ? "pt-2 pb-6" : "flex h-full flex-col justify-end pb-6"}`}>
      <div className="grid h-16 w-16 place-items-center rounded-full bg-raised text-3xl">
        <span aria-hidden>{isDM ? "@" : isVoice ? "🔊" : "#"}</span>
      </div>
      <h3 className="mt-4 text-2xl font-bold text-bright">
        {isDM ? name : isVoice ? name : `Welcome to #${name}`}
      </h3>
      <p className="mt-1 text-sm text-muted">
        {isDM
          ? `This is the start of your direct message history with ${name}.`
          : isVoice
            ? `This is the text chat of the ${name} voice channel.`
            : `This is the beginning of the #${name} channel.`}
      </p>
    </div>
  );
}

/** Placeholder history, shaped like real messages, while the first page loads. */
function MessageSkeletons() {
  const lines = [
    ["62%", "38%"],
    ["44%"],
    ["70%", "52%", "30%"],
    ["36%"],
    ["58%", "42%"],
  ];

  return (
    <div aria-hidden className="flex flex-col gap-6 py-2">
      {lines.map((widths, index) => (
        <div key={index} className="flex gap-4">
          <Skeleton width={40} height={40} rounded="full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <Skeleton height={12} width="18%" rounded="sm" />
            {widths.map((width, line) => (
              <Skeleton key={line} height={10} width={width} rounded="sm" />
            ))}
          </div>
        </div>
      ))}
    </div>
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
    <Tooltip label={label}>
      <button
        type="button"
        onClick={() => togglePanel(panel)}
        aria-label={label}
        aria-pressed={active}
        className={`grid h-8 w-8 place-items-center rounded text-base transition-colors ${
          active ? "bg-hover text-bright" : "text-muted hover:bg-hover hover:text-bright"
        }`}
      >
        <span aria-hidden>{glyph}</span>
      </button>
    </Tooltip>
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

const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

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

  const sentAt = new Date(message.timestamp);
  const newDay =
    previous !== undefined &&
    new Date(previous.timestamp).toDateString() !== sentAt.toDateString();

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
    <>
      {newDay && (
        <li className="relative my-4 flex items-center" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          <span className="px-2 text-[11px] font-semibold text-muted">
            {sentAt.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span className="h-px flex-1 bg-line" />
        </li>
      )}
      <li
        data-message-id={message.id}
        className={`group relative animate-message-in px-2 transition-colors hover:bg-[rgb(0_0_0/0.06)] ${
          grouped ? "py-0.5" : "mt-4 py-1"
        }`}
      >
        <MessageToolbar
          message={message}
          isOwn={isOwn}
          onReply={onReply}
          onEdit={onEdit}
        />

        {grouped ? (
          <div className="flex gap-3">
            {/* The timestamp of a grouped message only appears on hover, as in Discord. */}
            <time
              dateTime={message.timestamp}
              className="w-9 shrink-0 pt-1 text-right font-mono text-[10px] text-faint opacity-0 transition-opacity group-hover:opacity-100"
            >
              {sentAt.toLocaleTimeString("en-US", TIME_FORMAT)}
            </time>
            <div className="min-w-0 flex-1">{body}</div>
          </div>
        ) : (
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={userAvatarUrl(message.author, 80)}
              alt=""
              className="mt-0.5 h-10 w-10 shrink-0 rounded-full"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] leading-tight font-medium text-bright">
                  {displayName}
                </span>
                <BotTag user={message.author} />
                <time
                  dateTime={message.timestamp}
                  className="text-[11px] text-faint"
                  title={sentAt.toLocaleString("en-US")}
                >
                  {sentAt.toLocaleTimeString("en-US", TIME_FORMAT)}
                </time>
              </div>
              {body}
            </div>
          </div>
        )}
      </li>
    </>
  );
}
