"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/discord/api";
import { useClient } from "@/lib/store/client";

const TYPING_THROTTLE = 8000;

export function Composer({ channelId, channelName }: { channelId: string; channelName: string }) {
  const sendMessage = useClient((state) => state.sendMessage);
  const getRest = useClient((state) => state.getRest);
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const lastTypingAt = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  async function send() {
    if (sending || (!content.trim() && files.length === 0)) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(channelId, content, files);
      setContent("");
      setFiles([]);
      if (textarea.current) textarea.current.style.height = "auto";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nem sikerült elküldeni az üzenetet.");
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
    <div className="shrink-0 px-4 pb-4">
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded border border-line bg-panel px-2 py-1 text-xs"
            >
              <span className="max-w-40 truncate font-mono">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
                className="text-muted hover:text-danger"
                aria-label={`${file.name} eltávolítása`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 rounded-lg border border-line bg-panel px-3 py-2 focus-within:border-accent">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="pb-1 text-lg leading-none text-muted hover:text-text"
          aria-label="Fájl csatolása"
        >
          +
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
        <textarea
          ref={textarea}
          rows={1}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`Üzenet ide: #${channelName}`}
          className="max-h-50 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted"
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
