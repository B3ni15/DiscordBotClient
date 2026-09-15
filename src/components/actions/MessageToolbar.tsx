"use client";

import { useEffect, useRef, useState } from "react";
import type { APIMessage } from "discord-api-types/v10";
import {
  addReaction,
  copyMessageLink,
  togglePin,
} from "@/lib/discord/messageActions";
import { useClient } from "@/lib/store/client";
import { DeleteConfirm } from "./DeleteConfirm";
import { EmojiPicker, type PickedEmoji } from "./EmojiPicker";

export interface MessageToolbarProps {
  message: APIMessage;
  /** Enables the edit action; only the bot's own messages can be edited. */
  isOwn: boolean;
  onReply: (message: APIMessage) => void;
  onEdit: (message: APIMessage) => void;
  /** Called after the message was deleted on Discord's side. */
  onDeleted?: (message: APIMessage) => void;
  className?: string;
}

interface ActionDef {
  key: string;
  label: string;
  icon: string;
  danger?: boolean;
  onRun: () => void;
}

export function MessageToolbar({
  message,
  isOwn,
  onReply,
  onEdit,
  onDeleted,
  className = "",
}: MessageToolbarProps) {
  const getRest = useClient((state) => state.getRest);
  const guildId = useClient((state) => state.selectedGuildId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pinned, setPinned] = useState(message.pinned ?? false);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const toolbar = useRef<HTMLDivElement>(null);
  const reactionButton = useRef<HTMLButtonElement>(null);

  // Server truth wins over the optimistic flag whenever the message updates.
  const [lastPinned, setLastPinned] = useState(message.pinned ?? false);
  if (lastPinned !== (message.pinned ?? false)) {
    setLastPinned(message.pinned ?? false);
    setPinned(message.pinned ?? false);
  }

  // Notices ("Link copied") are transient.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function handleCopyLink() {
    try {
      await copyMessageLink({ ...message, guild_id: guildId ?? undefined });
      setNotice("Link copied");
    } catch {
      setNotice("Could not copy link");
    }
  }

  async function handleTogglePin() {
    const next = !pinned;
    setPinned(next);
    try {
      await togglePin(getRest(), message.channel_id, message.id, pinned);
      setNotice(next ? "Pinned" : "Unpinned");
    } catch (cause) {
      setPinned(!next);
      setNotice(cause instanceof Error ? cause.message : "Could not change the pin. Try again.");
    }
  }

  async function handlePick(emoji: PickedEmoji) {
    setPickerOpen(false);
    reactionButton.current?.focus();
    try {
      await addReaction(getRest(), message.channel_id, message.id, emoji);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not add the reaction. Try again.");
    }
  }

  const actions: ActionDef[] = [
    {
      key: "react",
      label: "Add reaction",
      icon: "☺",
      onRun: () => setPickerOpen((open) => !open),
    },
    { key: "reply", label: "Reply", icon: "↩", onRun: () => onReply(message) },
    ...(isOwn
      ? [{ key: "edit", label: "Edit", icon: "✎", onRun: () => onEdit(message) }]
      : []),
    {
      key: "pin",
      label: pinned ? "Unpin message" : "Pin message",
      icon: "📌",
      onRun: () => void handleTogglePin(),
    },
    { key: "link", label: "Copy link", icon: "🔗", onRun: () => void handleCopyLink() },
    ...(isOwn
      ? [
          {
            key: "delete",
            label: "Delete",
            icon: "🗑",
            danger: true,
            onRun: () => setConfirmOpen(true),
          },
        ]
      : []),
  ];

  /** Roving tabindex: the toolbar is one tab stop, arrows move between buttons. */
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && (pickerOpen || confirmOpen)) return;
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (focusIndex + step + actions.length) % actions.length;
    setFocusIndex(next);
    toolbar.current
      ?.querySelectorAll<HTMLButtonElement>("button[data-action]")
      [next]?.focus();
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={toolbar}
        role="toolbar"
        aria-label="Message actions"
        onKeyDown={handleKeyDown}
        className={`flex items-center gap-0.5 rounded-md border border-line bg-raised p-0.5 shadow-lg transition-opacity ${
          pickerOpen || confirmOpen
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100"
        }`}
      >
        {actions.map((action, index) => (
          <button
            key={action.key}
            ref={action.key === "react" ? reactionButton : undefined}
            type="button"
            data-action={action.key}
            tabIndex={index === focusIndex ? 0 : -1}
            title={action.label}
            aria-label={action.label}
            aria-expanded={action.key === "react" ? pickerOpen : undefined}
            onFocus={() => setFocusIndex(index)}
            onClick={action.onRun}
            className={`flex h-7 w-7 items-center justify-center rounded text-xs leading-none ${
              action.danger ? "text-danger hover:bg-danger/15" : "text-muted hover:bg-panel hover:text-text"
            }`}
          >
            <span aria-hidden>{action.icon}</span>
          </button>
        ))}
      </div>

      {notice && (
        <p
          role="status"
          className="absolute top-full right-0 mt-1 rounded bg-raised px-2 py-1 text-[11px] whitespace-nowrap text-muted shadow"
        >
          {notice}
        </p>
      )}

      {pickerOpen && (
        <div className="absolute top-full right-0 z-40 mt-1">
          <EmojiPicker
            guildId={guildId}
            onSelect={(emoji) => void handlePick(emoji)}
            onClose={() => {
              setPickerOpen(false);
              reactionButton.current?.focus();
            }}
          />
        </div>
      )}

      {confirmOpen && (
        <DeleteConfirm
          message={message}
          onClose={() => setConfirmOpen(false)}
          onDeleted={() => onDeleted?.(message)}
        />
      )}
    </div>
  );
}
