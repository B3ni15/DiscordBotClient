"use client";

import { useEffect } from "react";
import { DirectMessages } from "@/components/nav/DirectMessages";
import { GuildDialogs } from "@/components/guild/GuildDialogs";
import { ServerSettings } from "@/components/guild/ServerSettings";
import { CommandsPanel } from "@/components/commands/CommandsPanel";
import { UserSettings } from "@/components/settings/UserSettings";
import { channelMenuItems, guildMenuItems } from "@/components/context/menus";
import { ContextMenuHost } from "@/components/ui/ContextMenu";
import { useCommandRunner } from "@/lib/commands/useCommandRunner";
import { useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { useUrlSync } from "@/lib/nav/useUrlSync";
import { useClient } from "@/lib/store/client";
import { openMenuFor } from "@/lib/store/contextMenu";
import { useUI } from "@/lib/store/ui";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatPanel } from "./ChatPanel";
import { ConnectingOverlay } from "./ConnectingOverlay";
import { GuildRail } from "./GuildRail";
import { MemberSidebar } from "./MemberSidebar";
import { SIDE_PANELS, SidePanel } from "./SidePanel";
import { StatusBar } from "./StatusBar";

/** Where the browser's own menu is more useful than ours. */
const NATIVE_MENU_TARGETS = 'input, textarea, [contenteditable="true"], a, img, video';

export function AppShell() {
  const status = useClient((state) => state.status);
  const error = useClient((state) => state.error);
  const guildCount = useClient((state) => state.guildOrder.length);
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const dmMode = useUI((state) => state.dmMode);
  // Settings and commands cover the app; only a side panel takes the member list's place.
  const panelOpen = useUI((state) => state.panel !== null && SIDE_PANELS.has(state.panel));
  const membersHidden = useUI((state) => state.membersHidden);
  const selectChannel = useClient((state) => state.selectChannel);

  useNotifications();
  useUrlSync();
  // Files interactions in the inbox and runs the bot's command scripts.
  useCommandRunner();
  // Learns what the bot may do in the open server, which every menu asks about.
  useGuildPowers(selectedGuildId);

  // A file dropped beside the chat would otherwise make the browser open it
  // and navigate away from the client.
  useEffect(() => {
    function swallow(event: DragEvent) {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    }
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  // Only cover the app on the very first handshake; a later reconnect keeps the
  // layout up and reports itself in the status bar instead.
  const starting = status !== "ready" && guildCount === 0 && !error;

  /**
   * The app's own menu takes over from the browser's wherever the click has no
   * more specific handler of its own — the server's menu inside a server, the
   * channel's in a direct message. Text fields and media keep the browser menu,
   * which is the only way to reach paste, spellcheck and "save image".
   */
  function handleContextMenu(event: React.MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(NATIVE_MENU_TARGETS)) return;
    const state = useClient.getState();
    if (!dmMode && selectedGuildId) {
      openMenuFor(event, "Server", guildMenuItems(selectedGuildId));
      return;
    }
    const channel = selectedChannelId ? state.channelsById[selectedChannelId] : undefined;
    if (channel) openMenuFor(event, "Channel", channelMenuItems(channel, null));
  }

  return (
    <div
      onContextMenu={handleContextMenu}
      className="relative flex h-screen flex-col overflow-hidden bg-ink"
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <GuildRail />
        {dmMode ? (
          <DirectMessages onSelect={(channelId) => void selectChannel(channelId)} />
        ) : (
          <ChannelSidebar />
        )}
        <ChatPanel />
        <SidePanel />
        {/* The member list gives way to an open panel rather than squeezing the chat. */}
        {!dmMode && !panelOpen && !membersHidden && <MemberSidebar />}
      </div>
      {(status !== "ready" || error) && <StatusBar />}
      {starting && <ConnectingOverlay />}
      <ServerSettings />
      <UserSettings />
      <CommandsPanel />
      <ContextMenuHost />
      <GuildDialogs />
    </div>
  );
}
