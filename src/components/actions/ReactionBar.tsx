"use client";

import { useCallback, useState } from "react";
import type { APIMessage, APIReaction } from "discord-api-types/v10";
import { emojiUrl } from "@/lib/discord/cdn";
import {
  emojiKey,
  emojiLabel,
  getReactionUsers,
  type ReactionEmoji,
  toggleReaction,
} from "@/lib/discord/messageActions";
import { useClient } from "@/lib/store/client";

export interface ReactionBarProps {
  message: APIMessage;
  /** Rendered as the trailing "+" button; omit to hide it. */
  onAddReaction?: () => void;
  className?: string;
}

interface LocalOverride {
  me: boolean;
  delta: number;
}

export function ReactionBar({ message, onAddReaction, className = "" }: ReactionBarProps) {
  const getRest = useClient((state) => state.getRest);
  /** Optimistic deltas keyed by emoji; cleared once the gateway echo lands. */
  const [overrides, setOverrides] = useState<Record<string, LocalOverride>>({});
  const [error, setError] = useState<string | null>(null);

  // The gateway rewrites `reactions`; drop local guesses so counts stay truthful.
  const [lastReactions, setLastReactions] = useState(message.reactions);
  if (lastReactions !== message.reactions) {
    setLastReactions(message.reactions);
    if (Object.keys(overrides).length) setOverrides({});
  }

  const reactions = message.reactions ?? [];

  if (reactions.length === 0 && !onAddReaction) return null;

  async function toggle(reaction: APIReaction) {
    const key = emojiKey(reaction.emoji);
    const override = overrides[key];
    const currentlyReacted = override ? override.me : reaction.me;
    setOverrides((current) => ({
      ...current,
      [key]: { me: !currentlyReacted, delta: currentlyReacted ? -1 : 1 },
    }));
    setError(null);
    try {
      await toggleReaction(
        getRest(),
        message.channel_id,
        message.id,
        reaction.emoji,
        currentlyReacted,
      );
    } catch (cause) {
      // Roll back to whatever the server last told us.
      setOverrides((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setError(cause instanceof Error ? cause.message : "Could not update the reaction. Try again.");
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {reactions.map((reaction) => {
        const key = emojiKey(reaction.emoji);
        const override = overrides[key];
        const count = Math.max(0, reaction.count + (override?.delta ?? 0));
        const mine = override ? override.me : reaction.me;
        if (count === 0) return null;
        return (
          <ReactionPill
            key={key}
            message={message}
            emoji={reaction.emoji}
            count={count}
            mine={mine}
            onToggle={() => void toggle(reaction)}
          />
        );
      })}

      {onAddReaction && (
        <button
          type="button"
          onClick={onAddReaction}
          aria-label="Add reaction"
          title="Add reaction"
          className="flex h-[26px] items-center rounded-lg border border-transparent bg-panel px-2 text-xs text-muted transition-colors hover:border-line hover:text-bright"
        >
          +
        </button>
      )}

      {error && (
        <span role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

function ReactionPill({
  message,
  emoji,
  count,
  mine,
  onToggle,
}: {
  message: APIMessage;
  emoji: ReactionEmoji;
  count: number;
  mine: boolean;
  onToggle: () => void;
}) {
  const getRest = useClient((state) => state.getRest);
  const [names, setNames] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  /** Count the cached name list belongs to; a different count means it is stale. */
  const [namesForCount, setNamesForCount] = useState<number | null>(null);

  // Who-reacted is fetched only when the pill is actually pointed at or focused.
  const loadNames = useCallback(() => {
    if (namesForCount === count || loading) return;
    setNamesForCount(count);
    setLoading(true);
    getReactionUsers(getRest(), message.channel_id, message.id, emoji, { limit: 12 })
      .then((users) => setNames(users.map((user) => user.global_name ?? user.username)))
      .catch(() => setNames([]))
      .finally(() => setLoading(false));
  }, [count, emoji, getRest, loading, message.channel_id, message.id, namesForCount]);

  const fresh = namesForCount === count ? names : null;

  const label = emojiLabel(emoji);
  const tooltip = loading
    ? "Loading…"
    : fresh === null
      ? `${label} — ${count} reactions`
      : fresh.length === 0
        ? `${label} — could not load who reacted`
        : `${label}: ${fresh.join(", ")}${count > fresh.length ? ` and ${count - fresh.length} more` : ""}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={loadNames}
      onFocus={loadNames}
      title={tooltip}
      aria-label={`${label}, ${count} reactions${mine ? ", including you" : ""}`}
      aria-pressed={mine}
      className={`flex h-[26px] items-center gap-1 rounded-lg border px-2 text-xs transition-colors ${
        mine
          ? "border-accent bg-accent/15 text-accent"
          : "border-line bg-panel text-muted hover:border-accent hover:text-text"
      }`}
    >
      {emoji.id ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={emojiUrl(emoji.id, emoji.animated, 44)}
          alt={label}
          className="h-4 w-4"
        />
      ) : (
        <span aria-hidden>{emoji.name}</span>
      )}
      <span className="font-mono tabular-nums">{count}</span>
    </button>
  );
}
