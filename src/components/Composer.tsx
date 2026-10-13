"use client";

import { useEffect, useRef, useState } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { EmbedCreator } from "@/components/actions/EmbedCreator";
import { EmojiPicker } from "@/components/actions/EmojiPicker";
import { PollCreator } from "@/components/actions/PollCreator";
import {
  CloseIcon,
  EmbedIcon,
  EyeOffIcon,
  FileIcon,
  PlusCircleIcon,
  PollIcon,
  SmileStrokeIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { Tooltip } from "@/components/ui/Tooltip";
import { api } from "@/lib/discord/api";
import { replyToMessage } from "@/lib/discord/messageActions";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

const TYPING_THROTTLE = 8000;
/** Discord's cap on a bot's message text. */
const MAX_LENGTH = 2000;
/** The counter only appears once the end is in sight, as in Discord. */
const COUNTER_FROM = MAX_LENGTH - 200;
/** Discord takes at most ten attachments per message. */
const MAX_FILES = 10;
/** Discord reads this filename prefix as "hide behind a spoiler". */
const SPOILER_PREFIX = "SPOILER_";

/** A file waiting in the composer, with the preview its card shows. */
interface Draft {
  id: number;
  file: File;
  /** Object URL of an image or video, revoked once the draft is gone. */
  preview: string | null;
  spoiler: boolean;
}

let nextDraftId = 1;

function toDraft(file: File): Draft {
  const previewable = file.type.startsWith("image/") || file.type.startsWith("video/");
  return {
    id: nextDraftId++,
    file,
    preview: previewable ? URL.createObjectURL(file) : null,
    spoiler: file.name.startsWith(SPOILER_PREFIX),
  };
}

function releaseDraft(draft: Draft) {
  if (draft.preview) URL.revokeObjectURL(draft.preview);
}

/** The file as it goes to Discord, renamed when it is marked as a spoiler. */
function uploadable(draft: Draft): File {
  const named = draft.file.name.startsWith(SPOILER_PREFIX);
  if (draft.spoiler === named) return draft.file;
  const name = draft.spoiler
    ? `${SPOILER_PREFIX}${draft.file.name}`
    : draft.file.name.slice(SPOILER_PREFIX.length);
  return new File([draft.file], name, { type: draft.file.type });
}

/**
 * A pasted screenshot arrives as "image.png" from every source; a timestamp
 * keeps several of them apart in the message.
 */
function namePasted(file: File, index: number): File {
  if (file.name && file.name !== "image.png") return file;
  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return new File([file], `pasted-${stamp}${index ? `-${index}` : ""}.${extension}`, {
    type: file.type,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ComposerProps {
  channelId: string;
  channelName: string;
  /** A DM is addressed by name, a channel by #name. */
  isDM?: boolean;
  /** When set, the next message is sent as a reply to it. */
  replyTo?: APIMessage | null;
  onCancelReply?: () => void;
}

export function Composer({
  channelId,
  channelName,
  isDM = false,
  replyTo,
  onCancelReply,
}: ComposerProps) {
  const sendMessage = useClient((state) => state.sendMessage);
  const getRest = useClient((state) => state.getRest);
  const toast = useUI((state) => state.toast);
  const [content, setContent] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  /** Whether the reply pings its author; Discord's "@ ON" switch. */
  const [mentionReply, setMentionReply] = useState(true);
  const guildId = useClient(
    (state) => (state.channelsById[channelId] as { guild_id?: string } | undefined)?.guild_id ?? null,
  );
  const lastTypingAt = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const plusMenu = useRef<HTMLDivElement>(null);
  /** The latest drafts, for releasing their previews when the composer goes. */
  const draftsRef = useRef<Draft[]>([]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => () => draftsRef.current.forEach(releaseDraft), []);

  // Hitting reply should put the caret in the box, not make you click it.
  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  /** Adds files to the message, keeping to Discord's ten-per-message limit. */
  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return;
    setDrafts((current) => {
      const room = MAX_FILES - current.length;
      if (incoming.length > room) {
        toast(`A message can carry at most ${MAX_FILES} files.`, "error");
      }
      return [...current, ...incoming.slice(0, Math.max(room, 0)).map(toDraft)];
    });
    textarea.current?.focus();
  }

  function removeDraft(id: number) {
    setDrafts((current) => {
      const gone = current.find((draft) => draft.id === id);
      if (gone) releaseDraft(gone);
      return current.filter((draft) => draft.id !== id);
    });
  }

  function toggleSpoiler(id: number) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, spoiler: !draft.spoiler } : draft)),
    );
  }

  /*
   * "Mention" in a context menu drops the mention in here rather than on the
   * clipboard, and a drop on the chat hands its files over the same way.
   * Subscribing straight to the store keeps it a one-way push: the composer
   * never renders the pending value, it just consumes it.
   */
  useEffect(
    () =>
      useUI.subscribe((state, previous) => {
        const insert = state.pendingInsert;
        if (insert && insert !== previous.pendingInsert) {
          setContent((current) =>
            current.trim() ? `${current.trimEnd()} ${insert.text} ` : `${insert.text} `,
          );
          textarea.current?.focus();
          useUI.getState().clearInsert();
        }
        const dropped = state.pendingFiles;
        if (dropped && dropped !== previous.pendingFiles) {
          addFiles(dropped.files);
          useUI.getState().clearPendingFiles();
        }
      }),
    // addFiles only touches state setters and refs, which never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * Typing anywhere that is not already a field jumps into the composer, the way
   * Discord lets you answer without aiming at the box first. Focusing during
   * keydown means the character itself still lands in the textarea.
   */
  useEffect(() => {
    function handleGlobalKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Printable characters only; navigation and shortcuts stay where they are.
      if (event.key.length !== 1) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active?.isContentEditable ||
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active?.closest('[role="dialog"]')
      ) {
        return;
      }
      textarea.current?.focus();
    }
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, []);

  // The "+" menu folds away on any click outside it.
  useEffect(() => {
    if (!plusOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!plusMenu.current?.contains(event.target as Node)) setPlusOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [plusOpen]);

  const tooLong = content.length > MAX_LENGTH;
  const canSend = !sending && !tooLong && (content.trim().length > 0 || drafts.length > 0);

  async function send() {
    if (!canSend) {
      if (tooLong) setError(`Messages are capped at ${MAX_LENGTH} characters.`);
      return;
    }
    setSending(true);
    setError(null);
    const files = drafts.map(uploadable);
    try {
      if (replyTo) {
        await replyToMessage(getRest(), channelId, replyTo.id, content, {
          mention: mentionReply,
          files,
        });
      } else {
        await sendMessage(channelId, content, files);
      }
      onCancelReply?.();
      setContent("");
      drafts.forEach(releaseDraft);
      setDrafts([]);
      if (textarea.current) textarea.current.style.height = "auto";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The message could not be sent.");
    } finally {
      setSending(false);
      textarea.current?.focus();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
      return;
    }
    if (event.key === "Escape" && replyTo) {
      event.preventDefault();
      onCancelReply?.();
    }
  }

  /**
   * Pasting an image (a screenshot, a copied picture, files from the file
   * manager) attaches it, as Discord does. Plain text still pastes as text.
   */
  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    // Office apps put a rendered picture next to the text they copy; the text
    // is what was meant there, so only a paste without any text attaches.
    if (event.clipboardData.getData("text/plain")) return;
    event.preventDefault();
    addFiles(files.map(namePasted));
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(event.target.value);
    if (error) setError(null);
    // Grow with the text instead of scrolling inside the box.
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 280)}px`;

    if (event.target.value && Date.now() - lastTypingAt.current > TYPING_THROTTLE) {
      lastTypingAt.current = Date.now();
      void api.triggerTyping(getRest(), channelId).catch(() => {});
    }
  }

  const replyName = replyTo ? (replyTo.author.global_name ?? replyTo.author.username) : "";
  const attached = drafts.length > 0;

  return (
    <div className="shrink-0 px-4 pb-6">
      <div
        className={`relative rounded-lg bg-raised transition-shadow ${
          sending ? "opacity-80" : ""
        } focus-within:shadow-[0_0_0_1px_rgb(88_101_242/0.6)]`}
      >
        {replyTo && (
          <div className="flex animate-fade-in items-center gap-2 rounded-t-lg border-b border-black/20 bg-panel-alt py-2 pr-2 pl-4 text-sm text-muted">
            <span className="min-w-0 flex-1 truncate">
              Replying to <span className="font-semibold text-text">{replyName}</span>
            </span>
            <button
              type="button"
              onClick={() => setMentionReply((on) => !on)}
              aria-pressed={mentionReply}
              title={
                mentionReply
                  ? `${replyName} will be pinged. Click to turn it off.`
                  : `${replyName} will not be pinged. Click to turn it on.`
              }
              className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold transition-colors hover:bg-hover ${
                mentionReply ? "text-link" : "text-muted"
              }`}
            >
              @ {mentionReply ? "ON" : "OFF"}
            </button>
            <span aria-hidden className="h-4 w-px bg-line" />
            <button
              type="button"
              onClick={onCancelReply}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-bright"
              aria-label="Cancel reply"
              title="Cancel reply (Esc)"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        )}

        {attached && (
          <ul
            aria-label="Attachments"
            className={`flex gap-4 overflow-x-auto border-b border-black/20 px-4 pt-5 pb-3 ${
              replyTo ? "" : "rounded-t-lg"
            }`}
          >
            {drafts.map((draft) => (
              <AttachmentCard
                key={draft.id}
                draft={draft}
                onRemove={() => removeDraft(draft.id)}
                onToggleSpoiler={() => toggleSpoiler(draft.id)}
              />
            ))}
          </ul>
        )}

        <div className="flex items-start gap-1 pr-2 pl-2">
          <div ref={plusMenu} className="relative shrink-0 self-start">
            {/* The tooltip would sit on top of the menu it describes. */}
            <Tooltip label={plusOpen ? null : "Upload a file or create"}>
              <button
                type="button"
                onClick={() => setPlusOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={plusOpen}
                aria-label="Upload a file or create"
                className={`grid h-11 w-10 place-items-center transition-colors ${
                  plusOpen ? "text-bright" : "text-muted hover:text-bright"
                }`}
              >
                <PlusCircleIcon size={24} />
              </button>
            </Tooltip>
            {plusOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 z-30 mb-3 w-60 animate-pop-in rounded-lg border border-black/30 bg-floating p-1.5 shadow-2xl"
              >
                <PlusItem
                  icon={<UploadIcon size={20} />}
                  label="Upload a File"
                  hint="Or paste it, or drop it on the chat"
                  onSelect={() => {
                    setPlusOpen(false);
                    fileInput.current?.click();
                  }}
                />
                <PlusItem
                  icon={<PollIcon size={20} />}
                  label="Create Poll"
                  onSelect={() => {
                    setPlusOpen(false);
                    setPollOpen(true);
                  }}
                />
                <PlusItem
                  icon={<EmbedIcon size={20} />}
                  label="Create Embed"
                  onSelect={() => {
                    setPlusOpen(false);
                    setEmbedOpen(true);
                  }}
                />
              </div>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />

          <textarea
            ref={textarea}
            rows={1}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isDM ? `Message @${channelName}` : `Message #${channelName}`}
            aria-label={isDM ? `Message ${channelName}` : `Message #${channelName}`}
            aria-invalid={tooLong || undefined}
            className="max-h-[280px] min-h-11 flex-1 resize-none bg-transparent focus-visible:outline-none py-[11px] text-[15px] leading-[22px] text-text outline-none placeholder:text-faint"
          />

          <div className="flex shrink-0 items-center gap-0.5 self-start py-1.5">
            {sending && <Spinner size={16} className="mx-1 text-muted" label="Sending" />}
            <div className="relative">
              {pickerOpen && (
                <EmojiPicker
                  guildId={guildId ?? undefined}
                  className="absolute right-0 bottom-full z-30 mb-4"
                  onSelect={(emoji) => {
                    setContent((current) => current + emoji.text);
                    setPickerOpen(false);
                    textarea.current?.focus();
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              )}
              <Tooltip label="Emoji">
                <button
                  type="button"
                  onClick={() => setPickerOpen((open) => !open)}
                  aria-expanded={pickerOpen}
                  aria-label="Insert emoji"
                  className={`grid h-8 w-8 place-items-center rounded transition-[color,transform] hover:scale-110 ${
                    pickerOpen ? "text-amber" : "text-muted hover:text-amber"
                  }`}
                >
                  <SmileStrokeIcon size={22} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        {content.length > COUNTER_FROM && (
          <span
            aria-live="polite"
            className={`pointer-events-none absolute right-3 bottom-1 text-[11px] font-semibold tabular-nums ${
              tooLong ? "text-danger" : "text-muted"
            }`}
          >
            {MAX_LENGTH - content.length}
          </span>
        )}
      </div>

      {pollOpen && <PollCreator channelId={channelId} onClose={() => setPollOpen(false)} />}
      {embedOpen && (
        <EmbedCreator
          confirmLabel="Send"
          withContent
          guildId={guildId}
          onClose={() => setEmbedOpen(false)}
          onConfirm={async ({ content: text, embed }) => {
            await api.sendMessage(getRest(), channelId, {
              content: text || undefined,
              embeds: [embed],
              message_reference: replyTo
                ? { message_id: replyTo.id, channel_id: channelId, fail_if_not_exists: false }
                : undefined,
            });
            // The message itself arrives over the gateway as MESSAGE_CREATE.
            onCancelReply?.();
            setEmbedOpen(false);
          }}
        />
      )}

      {error && (
        <p role="alert" className="mt-2 animate-fade-in text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function PlusItem({
  icon,
  label,
  hint,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="group/item flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm font-medium text-text transition-colors hover:bg-accent hover:text-white"
    >
      <span className="text-muted group-hover/item:text-white">{icon}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block">{label}</span>
        {hint && (
          <span className="block text-[11px] font-normal text-faint group-hover/item:text-white/80">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

/** Discord's attachment card: a preview, the file name, and actions on hover. */
function AttachmentCard({
  draft,
  onRemove,
  onToggleSpoiler,
}: {
  draft: Draft;
  onRemove: () => void;
  onToggleSpoiler: () => void;
}) {
  const { file, preview, spoiler } = draft;
  const isVideo = file.type.startsWith("video/");

  return (
    <li className="group/card relative flex w-52 shrink-0 animate-pop-in flex-col rounded-md bg-panel p-2">
      <div className="absolute -top-3 right-0 z-10 flex overflow-hidden rounded-md bg-panel shadow-md ring-1 ring-black/30 transition-opacity md:opacity-0 md:group-hover/card:opacity-100 md:focus-within:opacity-100">
        <Tooltip label={spoiler ? "Remove spoiler" : "Mark as spoiler"}>
          <button
            type="button"
            onClick={onToggleSpoiler}
            aria-pressed={spoiler}
            aria-label={`${spoiler ? "Remove spoiler from" : "Mark as spoiler:"} ${file.name}`}
            className={`grid h-8 w-8 place-items-center transition-colors hover:bg-hover ${
              spoiler ? "text-accent" : "text-muted hover:text-bright"
            }`}
          >
            <EyeOffIcon size={18} />
          </button>
        </Tooltip>
        <Tooltip label="Remove attachment">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${file.name}`}
            className="grid h-8 w-8 place-items-center text-danger transition-colors hover:bg-hover"
          >
            <TrashIcon size={18} />
          </button>
        </Tooltip>
      </div>

      <div className="relative grid h-40 place-items-center overflow-hidden rounded bg-panel-alt">
        {preview ? (
          isVideo ? (
            <video
              src={preview}
              muted
              preload="metadata"
              className={`h-full w-full object-contain ${spoiler ? "scale-110 blur-xl" : ""}`}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className={`h-full w-full object-contain ${spoiler ? "scale-110 blur-xl" : ""}`}
            />
          )
        ) : (
          <span className="text-muted">
            <FileIcon size={56} />
          </span>
        )}
        {spoiler && (
          <span className="absolute rounded-full bg-black/70 px-3 py-1 text-xs font-bold tracking-wide text-white uppercase">
            Spoiler
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-sm text-text" title={file.name}>
        {file.name}
      </p>
      <p className="text-[11px] text-faint">{formatBytes(file.size)}</p>
    </li>
  );
}
