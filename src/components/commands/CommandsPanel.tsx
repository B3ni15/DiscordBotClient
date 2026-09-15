"use client";

import { useState } from "react";
import { CommandEditor } from "@/components/commands/CommandEditor";
import { CommandList } from "@/components/commands/CommandList";
import { InteractionInbox } from "@/components/commands/InteractionInbox";
import { useInteractions } from "@/lib/commands/useInteractions";

export interface CommandsPanelProps {
  className?: string;
  onClose?: () => void;
}

type Tab = "commands" | "inbox";

/** Slash command management: the registry on one tab, live interactions on the other. */
export function CommandsPanel({ className, onClose }: CommandsPanelProps) {
  const [tab, setTab] = useState<Tab>("commands");
  // Mounted here too, so interactions keep arriving while the other tab is open.
  const { entries } = useInteractions();
  const pending = entries.filter((entry) => entry.state === "pending").length;

  const tabClass = (value: Tab) =>
    `flex-1 border-b-2 px-3 py-2 text-xs transition-colors ${
      tab === value
        ? "border-accent text-text"
        : "border-transparent text-muted hover:text-text"
    }`;

  return (
    <aside
      aria-label="Slash commands"
      className={`flex min-h-0 w-80 shrink-0 flex-col border-l border-line bg-panel ${className ?? ""}`}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h2 className="text-xs font-semibold text-muted">Slash commands</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="text-muted hover:text-text"
          >
            ✕
          </button>
        )}
      </header>

      <div role="tablist" className="flex shrink-0 border-b border-line">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "commands"}
          onClick={() => setTab("commands")}
          className={tabClass("commands")}
        >
          Commands
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "inbox"}
          onClick={() => setTab("inbox")}
          className={tabClass("inbox")}
        >
          Incoming
          {pending > 0 && (
            <span className="ml-1.5 rounded bg-amber/20 px-1 font-mono text-[10px] text-amber">
              {pending}
            </span>
          )}
        </button>
      </div>

      {tab === "commands" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <CommandList />
          <CommandEditor />
        </div>
      ) : (
        <InteractionInbox className="flex-1" />
      )}
    </aside>
  );
}
