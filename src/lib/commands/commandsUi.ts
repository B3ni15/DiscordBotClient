"use client";

import { create } from "zustand";
import type { APIApplicationCommand } from "discord-api-types/v10";

/** What the editor is currently working on. */
export interface EditingTarget {
  /** `null` when a brand new command is being created. */
  command: APIApplicationCommand | null;
  /** `null` = global scope, a snowflake = that guild. */
  guildId: string | null;
}

interface CommandsUIState {
  /** Bumped after every successful write so the list refetches. */
  revision: number;
  editing: EditingTarget | null;
  bump: () => void;
  startCreate: (guildId: string | null) => void;
  startEdit: (command: APIApplicationCommand, guildId: string | null) => void;
  stopEditing: () => void;
}

/**
 * Shared state between the command list and the editor. They are siblings with
 * fixed props, so the selection and the refresh signal live here instead of
 * being threaded through a parent.
 */
export const useCommandsUI = create<CommandsUIState>((set) => ({
  revision: 0,
  editing: null,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
  startCreate: (guildId) => set({ editing: { command: null, guildId } }),
  startEdit: (command, guildId) => set({ editing: { command, guildId } }),
  stopEditing: () => set({ editing: null }),
}));
