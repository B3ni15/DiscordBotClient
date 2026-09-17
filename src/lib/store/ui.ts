"use client";

import { create } from "zustand";
import type { ChannelType } from "discord-api-types/v10";

/** Which of the mutually exclusive right-hand panels is open. */
export type SidePanel = "pins" | "search" | "settings" | "commands" | "soundboard" | null;

/**
 * The modal the app is showing, if any. Dialogs live in the store rather than
 * next to the thing that opened them: a context menu unmounts the moment it is
 * dismissed, and the dialog it started has to outlive it.
 */
export type Dialog =
  | { kind: "createChannel"; guildId: string; parentId?: string | null; type?: ChannelType }
  | { kind: "editChannel"; guildId: string; channelId: string }
  | { kind: "channelPermissions"; guildId: string; channelId: string; focusId?: string }
  | { kind: "deleteChannel"; guildId: string; channelId: string }
  | { kind: "createRole"; guildId: string }
  | { kind: "editRole"; guildId: string; roleId: string }
  | { kind: "roles"; guildId: string }
  | { kind: "memberRoles"; guildId: string; userId: string }
  | { kind: "nickname"; guildId: string; userId: string }
  | { kind: "moderate"; guildId: string; userId: string; action: "kick" | "ban" | "timeout" }
  /** Sets the encrypted vault up for the first time. */
  | { kind: "accountSetup" }
  /** Opens the vault on this browser. */
  | { kind: "accountUnlock" }
  /** Passkeys, recovery code and passphrase. */
  | { kind: "accountSecurity" }
  | { kind: "accountDelete" }
  /** Signs in as another bot and remembers it. */
  | { kind: "addBot" };

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

interface UIState {
  panel: SidePanel;
  /** DM mode replaces the channel list with the direct-message list. */
  dmMode: boolean;
  dialog: Dialog | null;
  toasts: Toast[];
  /** Text the composer should pick up, e.g. a mention from a context menu. */
  pendingInsert: { text: string; id: number } | null;
  togglePanel: (panel: Exclude<SidePanel, null>) => void;
  closePanel: () => void;
  setDmMode: (dmMode: boolean) => void;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
  /** Transient feedback for actions that have no dialog of their own. */
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  /** Appends text to the message box; the composer clears it once it lands. */
  insertIntoComposer: (text: string) => void;
  clearInsert: () => void;
}

let nextToastId = 1;
let nextInsertId = 1;

export const useUI = create<UIState>((set) => ({
  panel: null,
  dmMode: false,
  dialog: null,
  toasts: [],
  pendingInsert: null,
  togglePanel: (panel) => set((state) => ({ panel: state.panel === panel ? null : panel })),
  closePanel: () => set({ panel: null }),
  setDmMode: (dmMode) => set({ dmMode }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  toast: (text, tone = "info") => {
    const id = nextToastId++;
    set((state) => ({ toasts: [...state.toasts, { id, text, tone }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  insertIntoComposer: (text) => set({ pendingInsert: { text, id: nextInsertId++ } }),
  clearInsert: () => set({ pendingInsert: null }),
}));
