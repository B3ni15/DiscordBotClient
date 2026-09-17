"use client";

import { useRef, useState } from "react";
import type { APIMessage } from "discord-api-types/v10";
import { EmojiPicker } from "@/components/actions/EmojiPicker";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/discord/api";
import { replyToMessage } from "@/lib/discord/messageActions";
import { useClient } from "@/lib/store/client";

const TYPING_THROTTLE = 8000;

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
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastTypingAt = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  async function send() {
    if (sending || (!content.trim() && files.length === 0)) return;
    setSending(true);
    setError(null);
    try {
      if (replyTo && files.length === 0) {
        await replyToMessage(getRest(), channelId, replyTo.id, content);
      } else {
        await sendMessage(channelId, content, files);
      }
      onCancelReply?.();
      setContent("");
      setFiles([]);
      if (textarea.current) textarea.current.style.height = "auto";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(event.target.value);
    // Grow with the text instead of scrolling inside the box.
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;

    if (Date.now() - lastTypingAt.current > TYPING_THROTTLE) {
      lastTypingAt.current = Date.now();
      void api.triggerTyping(getRest(), channelId).catch(() => {});
    }
  }

  return (
    <div className="shrink-0 px-4 pb-6">
      {replyTo && (
        <div className="flex animate-fade-in items-center gap-2 rounded-t-lg bg-panel-alt px-4 py-2 text-xs text-muted">
          <span className="truncate">
            Replying to{" "}
            <span className="font-semibold text-bright">
              {replyTo.author.global_name ?? replyTo.author.username}
            </span>
            {files.length > 0 && " — sent as a plain message because it has attachments"}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="ml-auto rounded px-1 text-sm text-muted transition-colors hover:text-bright"
            aria-label="Cancel reply"
          >
            ×
          </button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex animate-pop-in items-center gap-2 rounded-lg bg-panel-alt px-2.5 py-1.5 text-xs"
            >
              <span className="max-w-40 truncate font-mono">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
                className="text-muted hover:text-danger"
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className={`relative flex items-end gap-3 bg-raised px-4 py-2.5 transition-shadow focus-within:shadow-[0_0_0_1px_var(--accent)] ${
          replyTo ? "rounded-b-lg" : "rounded-lg"
        }`}
      >
        {pickerOpen && (
          <EmojiPicker
            className="absolute bottom-full left-0 mb-2 z-20"
            onSelect={(emoji) => {
              setContent((current) => current + emoji.text);
              setPickerOpen(false);
              textarea.current?.focus();
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="grid h-6 w-6 shrink-0 place-items-center self-end rounded-full bg-muted text-lg leading-none text-raised transition-colors hover:bg-bright"
          aria-label="Attach a file"
        >
          <span aria-hidden className="-mt-px">
            +
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            setFiles([...files, ...Array.from(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
          aria-label="Insert emoji"
          className="shrink-0 self-end pb-0.5 text-xl leading-none grayscale transition-all hover:scale-110 hover:grayscale-0"
        >
          <span aria-hidden>🙂</span>
        </button>
        <textarea
          ref={textarea}
          rows={1}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isDM ? `Message @${channelName}` : `Message #${channelName}`}
          aria-label={isDM ? `Message ${channelName}` : `Message #${channelName}`}
          className="max-h-50 flex-1 resize-none self-center bg-transparent py-0.5 text-[15px] leading-relaxed text-text outline-none placeholder:text-faint"
        />
        {sending && <Spinner size={14} className="self-end pb-1 text-muted" label="Sending" />}
      </div>

      {error && (
        <p role="alert" className="mt-2 animate-fade-in text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
