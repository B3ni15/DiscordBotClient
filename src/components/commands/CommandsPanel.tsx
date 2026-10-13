"use client";

import { useState } from "react";
import { CommandEditor } from "@/components/commands/CommandEditor";
import { CommandList } from "@/components/commands/CommandList";
import { InteractionInbox } from "@/components/commands/InteractionInbox";
import {
  FullscreenSettings,
  SettingsPageTitle,
} from "@/components/ui/FullscreenSettings";
import { InfoIcon, PlusIcon, SlashIcon } from "@/components/ui/icons";
import { useCommandsUI } from "@/lib/commands/commandsUi";
import { useInteractions } from "@/lib/commands/useInteractions";
import { useUI } from "@/lib/store/ui";

type Page = "commands" | "inbox";

/**
 * Slash command management, full screen in the style of Discord's settings:
 * the commands with their editor side by side on one page, the interactions
 * that came in on the other.
 */
export function CommandsPanel() {
  const open = useUI((state) => state.panel === "commands");
  const close = useUI((state) => state.closePanel);
  const [page, setPage] = useState<Page>("commands");
  // Mounted here too, so interactions keep arriving while the other page is open.
  const { entries } = useInteractions();
  const pending = entries.filter((entry) => entry.state === "pending").length;
  const startCreate = useCommandsUI((state) => state.startCreate);

  if (!open) return null;

  return (
    <FullscreenSettings
      label="Slash commands"
      contentWidth={1180}
      groups={[
        {
          heading: "Slash Commands",
          items: [
            { id: "commands", label: "Commands", icon: <SlashIcon size={16} /> },
            {
              id: "inbox",
              label: "Incoming",
              icon: <InfoIcon size={16} />,
              badge:
                pending > 0 ? (
                  <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                    {pending}
                  </span>
                ) : undefined,
            },
          ],
        },
      ]}
      active={page}
      onSelect={setPage}
      onClose={close}
    >
      {page === "commands" ? (
        <>
          <SettingsPageTitle
            title="Commands"
            action={
              <button
                type="button"
                onClick={() => startCreate(null)}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                <PlusIcon size={14} />
                New Command
              </button>
            }
          >
            The bot&rsquo;s slash commands. Each one runs its handler in this browser and always
            answers whoever uses it.
          </SettingsPageTitle>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <CommandList />
            <div className="lg:sticky lg:top-6">
              <CommandEditor />
            </div>
          </div>
        </>
      ) : (
        <>
          <SettingsPageTitle title="Incoming">
            Every interaction the bot received in this session. Answer the ones nothing handled.
          </SettingsPageTitle>
          <div className="overflow-hidden rounded-xl bg-panel">
            <InteractionInbox />
          </div>
        </>
      )}
    </FullscreenSettings>
  );
}
