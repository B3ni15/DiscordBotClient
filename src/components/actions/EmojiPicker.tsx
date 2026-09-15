"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { emojiUrl } from "@/lib/discord/cdn";
import type { ReactionEmoji } from "@/lib/discord/messageActions";
import { EMOJI_CATEGORIES, searchEmojis } from "@/lib/emoji/data";
import { useClient } from "@/lib/store/client";

export interface PickedEmoji extends ReactionEmoji {
  /**
   * Reaction identity: the raw character for unicode emoji, the emoji name for
   * custom ones - exactly what `reactionToken` expects.
   */
  name: string;
  /** Text form for a composer: the raw char, or `<:name:id>` for custom emoji. */
  text: string;
  /** Human readable name for tooltips and screen readers. */
  label: string;
}

export interface EmojiPickerProps {
  onSelect: (emoji: PickedEmoji) => void;
  onClose: () => void;
  /** Source of the custom emoji list; falls back to the selected guild. */
  guildId?: string | null;
  className?: string;
}

const COLUMNS = 9;

interface Section {
  id: string;
  label: string;
  items: PickedEmoji[];
}

export function EmojiPicker({ onSelect, onClose, guildId, className = "" }: EmojiPickerProps) {
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const activeGuildId = guildId ?? selectedGuildId;
  const guildEmojis = useClient((state) =>
    activeGuildId ? state.guilds[activeGuildId]?.emojis : undefined,
  );

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const customs = useMemo<PickedEmoji[]>(
    () =>
      (guildEmojis ?? [])
        .filter((emoji) => emoji.id && emoji.name)
        .map((emoji) => ({
          id: emoji.id!,
          name: emoji.name!,
          animated: emoji.animated ?? false,
          text: `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`,
          label: emoji.name!,
        })),
    [guildEmojis],
  );

  const sections = useMemo<Section[]>(() => {
    const needle = query.trim().toLowerCase();
    if (needle) {
      const matchedCustoms = customs.filter((emoji) =>
        emoji.label.toLowerCase().includes(needle),
      );
      const matchedUnicode = searchEmojis(needle).map(toPicked);
      const result: Section[] = [];
      if (matchedCustoms.length) {
        result.push({ id: "custom", label: "Server emoji", items: matchedCustoms });
      }
      if (matchedUnicode.length) {
        result.push({ id: "search", label: "Results", items: matchedUnicode });
      }
      return result;
    }
    const result: Section[] = [];
    if (customs.length) result.push({ id: "custom", label: "Server emoji", items: customs });
    for (const category of EMOJI_CATEGORIES) {
      result.push({
        id: category.id,
        label: category.label,
        items: category.emojis.map(toPicked),
      });
    }
    return result;
  }, [customs, query]);

  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  // Reset the cursor when the result set changes (state adjusted during render).
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setActiveIndex(0);
  }

  useEffect(() => {
    searchInput.current?.focus();
  }, []);

  // Close on a click that starts outside the popover.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  // Keep the highlighted cell inside the scrolling grid.
  useEffect(() => {
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    cell?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, sections]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (!flat.length) return;
    const move = (delta: number) => {
      event.preventDefault();
      setActiveIndex((index) => Math.min(flat.length - 1, Math.max(0, index + delta)));
    };
    switch (event.key) {
      case "ArrowRight":
        move(1);
        break;
      case "ArrowLeft":
        move(-1);
        break;
      case "ArrowDown":
        move(COLUMNS);
        break;
      case "ArrowUp":
        move(-COLUMNS);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(flat.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        onSelect(flat[activeIndex]);
        break;
    }
  }

  let cursor = -1;

  return (
    <div
      ref={root}
      role="dialog"
      aria-label="Emoji picker"
      onKeyDown={handleKeyDown}
      className={`flex h-80 w-[21rem] flex-col overflow-hidden rounded-lg border border-line bg-raised shadow-xl ${className}`}
    >
      <div className="shrink-0 border-b border-line p-2">
        <input
          ref={searchInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji…"
          aria-label="Search emoji"
          className="w-full rounded border border-line bg-panel px-2 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      <div ref={gridRef} className="flex-1 overflow-y-auto p-2">
        {flat.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted">No emoji matches that search.</p>
        ) : (
          sections.map((section) => (
            <section key={section.id} className="mb-2">
              <h3 className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                {section.label}
              </h3>
              <div className="grid grid-cols-9 gap-0.5">
                {section.items.map((emoji) => {
                  cursor += 1;
                  const index = cursor;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={`${section.id}-${index}`}
                      type="button"
                      data-index={index}
                      tabIndex={-1}
                      title={emoji.id ? `:${emoji.label}:` : emoji.label}
                      aria-label={emoji.label}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => onSelect(emoji)}
                      className={`flex h-8 w-8 items-center justify-center rounded text-lg leading-none ${
                        active ? "bg-accent/20" : "hover:bg-panel"
                      }`}
                    >
                      {emoji.id ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={emojiUrl(emoji.id, emoji.animated, 44)}
                          alt={emoji.label}
                          className="h-5 w-5"
                        />
                      ) : (
                        emoji.text
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <p className="shrink-0 border-t border-line px-2 py-1 font-mono text-[10px] text-muted">
        ↑↓←→ move · Enter select · Esc close
      </p>
    </div>
  );
}

function toPicked(entry: { char: string; keywords: string[] }): PickedEmoji {
  return {
    id: null,
    name: entry.char,
    text: entry.char,
    label: entry.keywords[0] ?? entry.char,
  };
}
