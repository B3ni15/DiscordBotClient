"use client";

import { PinnedPanel } from "@/components/nav/PinnedPanel";
import { SearchPanel } from "@/components/nav/SearchPanel";
import { Soundboard } from "@/components/voice/Soundboard";
import { useUI } from "@/lib/store/ui";

/** The panels that open as a column beside the chat; the others cover the app. */
export const SIDE_PANELS = new Set(["pins", "search", "soundboard"]);

/** Hosts the right-hand panels; only one is open at a time. */
export function SidePanel() {
  const panel = useUI((state) => state.panel);
  const closePanel = useUI((state) => state.closePanel);

  if (!panel || !SIDE_PANELS.has(panel)) return null;

  return (
    <aside className="flex h-full max-h-full w-80 min-h-0 shrink-0 animate-panel-in flex-col overflow-hidden bg-panel shadow-[-1px_0_0_rgba(0,0,0,0.2)]">
      {panel === "pins" && <PinnedPanel onClose={closePanel} />}
      {panel === "search" && <SearchPanel onClose={closePanel} />}
      {panel === "soundboard" && <Soundboard onClose={closePanel} />}
    </aside>
  );
}
