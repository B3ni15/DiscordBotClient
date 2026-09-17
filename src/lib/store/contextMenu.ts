"use client";

import type { ComponentType } from "react";
import { create } from "zustand";

/** One entry of a context menu. Submenus hold their own list of the same. */
export type MenuItem =
  | {
      type: "item";
      id: string;
      label: string;
      icon?: string;
      /** Right-aligned hint, the way Discord shows a shortcut. */
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Why the item is disabled; shown as a tooltip. */
      reason?: string;
      onSelect: () => void;
      /** Keep the menu open after the item runs (used by role toggles). */
      keepOpen?: boolean;
    }
  | {
      type: "toggle";
      id: string;
      label: string;
      checked: boolean;
      color?: string | null;
      disabled?: boolean;
      reason?: string;
      onSelect: () => void;
    }
  | {
      type: "submenu";
      id: string;
      label: string;
      icon?: string;
      disabled?: boolean;
      reason?: string;
      items?: MenuItem[];
      /**
       * A submenu that renders its own UI instead of a fixed item list. Used
       * where the panel needs live state of its own, such as the searchable
       * role list on a member.
       */
      content?: ComponentType<{ close: () => void }>;
    }
  | { type: "separator"; id: string }
  | { type: "heading"; id: string; label: string };

export interface MenuState {
  /** Viewport coordinates of the click that opened the menu. */
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  /** Bumped on every open so the menu remounts and re-runs its placement. */
  key: number;
}

interface ContextMenuStore {
  menu: MenuState | null;
  open: (x: number, y: number, label: string, items: MenuItem[]) => void;
  close: () => void;
}

let nextKey = 1;

export const useContextMenu = create<ContextMenuStore>((set) => ({
  menu: null,
  open: (x, y, label, items) => set({ menu: { x, y, label, items, key: nextKey++ } }),
  close: () => set({ menu: null }),
}));

/**
 * Opens the app's own menu for a right-click and keeps the browser's out of the
 * way. Nested targets stop propagation so the innermost menu wins, exactly like
 * Discord: right-clicking a message never opens the channel's menu.
 */
export function openMenuFor(
  event: React.MouseEvent,
  label: string,
  items: MenuItem[],
): void {
  event.preventDefault();
  event.stopPropagation();
  if (items.length === 0) return;
  useContextMenu.getState().open(event.clientX, event.clientY, label, items);
}

export function separator(id: string): MenuItem {
  return { type: "separator", id };
}
