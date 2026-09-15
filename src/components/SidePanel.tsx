"use client";

import { PinnedPanel } from "@/components/nav/PinnedPanel";
import { SearchPanel } from "@/components/nav/SearchPanel";
import { Settings } from "@/components/nav/Settings";
import { useUI } from "@/lib/store/ui";

/** Hosts the right-hand panels; only one is open at a time. */
export function SidePanel() {
  const panel = useUI((state) => state.panel);
  const closePanel = useUI((state) => state.closePanel);

  if (!panel) return null;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
      {panel === "pins" && <PinnedPanel onClose={closePanel} />}
      {panel === "search" && <SearchPanel onClose={closePanel} />}
      {panel === "settings" && <Settings onClose={closePanel} />}
    </aside>
  );
}
