"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { InteractionType, type APIInteraction } from "discord-api-types/v10";
import { useClient } from "@/lib/store/client";

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

function push(interaction: APIInteraction) {
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

function patch(interactionId: string, state: InteractionReplyState, note: string | null) {
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
 * Collects INTERACTION_CREATE dispatches from the gateway.
 *
 * Discord only delivers interactions over the gateway while the application has
 * NO "Interactions Endpoint URL" configured in the Developer Portal — with one
 * set, every interaction is POSTed there instead and never reaches this client.
 */
export function useInteractions(): UseInteractions {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const getGateway = useClient((state) => state.getGateway);
  const status = useClient((state) => state.status);

  useEffect(() => {
    const gateway = getGateway();
    if (!gateway) return;
    // `on` returns its own unsubscribe, so unmounting detaches the listener.
    return gateway.on("dispatch", (event, data) => {
      if (event !== "INTERACTION_CREATE") return;
      const interaction = data as APIInteraction;
      if (interaction.type === InteractionType.Ping) return;
      push(interaction);
    });
    // `status` is the signal that a gateway instance exists after a login.
  }, [getGateway, status]);

  const setReplyState = useCallback(
    (interactionId: string, state: InteractionReplyState, note: string | null = null) =>
      patch(interactionId, state, note),
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
