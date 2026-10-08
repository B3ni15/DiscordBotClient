"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { APIInteraction } from "discord-api-types/v10";

/** Only the newest entries are kept; this is a live view, not an archive. */
export const MAX_INTERACTIONS = 50;

/** Discord discards an interaction that is not acknowledged within three seconds. */
export const INTERACTION_DEADLINE_MS = 3000;

const DISCORD_EPOCH = 1420070400000;

export type InteractionReplyState = "pending" | "deferred" | "answered" | "failed";

export interface InboxEntry {
  interaction: APIInteraction;
  /** Epoch ms the interaction was created, derived from its snowflake. */
  createdAt: number;
  state: InteractionReplyState;
  /** What this client last sent, or the error that stopped it. */
  note: string | null;
}

/**
 * Module-level so the inbox survives tab switches and unmounts inside the panel.
 * Components read it through `useSyncExternalStore`, which is SSR-safe.
 */
let entries: InboxEntry[] = [];
const EMPTY: InboxEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return entries;
}

function getServerSnapshot() {
  return EMPTY;
}

/** Epoch ms encoded in a Discord snowflake. */
export function snowflakeTimestamp(id: string): number {
  try {
    return Number(BigInt(id) >> 22n) + DISCORD_EPOCH;
  } catch {
    return Date.now();
  }
}

/** Files an interaction that arrived over the gateway; duplicates are ignored. */
export function recordInteraction(interaction: APIInteraction) {
  // Two mounted hooks would otherwise record the same dispatch twice.
  if (entries.some((entry) => entry.interaction.id === interaction.id)) return;
  const entry: InboxEntry = {
    interaction,
    createdAt: snowflakeTimestamp(interaction.id),
    state: "pending",
    note: null,
  };
  entries = [entry, ...entries].slice(0, MAX_INTERACTIONS);
  emit();
}

/** Records how one interaction was answered, by a person or by a script. */
export function patchInteraction(
  interactionId: string,
  state: InteractionReplyState,
  note: string | null,
) {
  let changed = false;
  entries = entries.map((entry) => {
    if (entry.interaction.id !== interactionId) return entry;
    changed = true;
    return { ...entry, state, note };
  });
  if (changed) emit();
}

export interface UseInteractions {
  entries: InboxEntry[];
  /** Records how this client answered one interaction. */
  setReplyState: (
    interactionId: string,
    state: InteractionReplyState,
    note?: string | null,
  ) => void;
  remove: (interactionId: string) => void;
  clear: () => void;
}

/**
 * The interaction inbox. Dispatches are collected by `useCommandRunner`, which
 * stays mounted for the whole session, so nothing is missed while the panel is
 * closed.
 *
 * Discord only delivers interactions over the gateway while the application has
 * NO "Interactions Endpoint URL" configured in the Developer Portal — with one
 * set, every interaction is POSTed there instead and never reaches this client.
 */
export function useInteractions(): UseInteractions {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setReplyState = useCallback(
    (interactionId: string, state: InteractionReplyState, note: string | null = null) =>
      patchInteraction(interactionId, state, note),
    [],
  );

  const remove = useCallback((interactionId: string) => {
    const next = entries.filter((entry) => entry.interaction.id !== interactionId);
    if (next.length === entries.length) return;
    entries = next;
    emit();
  }, []);

  const clear = useCallback(() => {
    if (entries.length === 0) return;
    entries = [];
    emit();
  }, []);

  return { entries: list, setReplyState, remove, clear };
}
