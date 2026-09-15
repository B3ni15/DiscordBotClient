"use client";

import { create } from "zustand";

/** Which of the mutually exclusive right-hand panels is open. */
export type SidePanel = "pins" | "search" | "settings" | null;

interface UIState {
  panel: SidePanel;
  /** DM mode replaces the channel list with the direct-message list. */
  dmMode: boolean;
  togglePanel: (panel: Exclude<SidePanel, null>) => void;
  closePanel: () => void;
  setDmMode: (dmMode: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  panel: null,
  dmMode: false,
  togglePanel: (panel) => set((state) => ({ panel: state.panel === panel ? null : panel })),
  closePanel: () => set({ panel: null }),
  setDmMode: (dmMode) => set({ dmMode }),
}));
