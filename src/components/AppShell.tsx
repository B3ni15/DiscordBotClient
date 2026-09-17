"use client";

import { DirectMessages } from "@/components/nav/DirectMessages";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatPanel } from "./ChatPanel";
import { ConnectingOverlay } from "./ConnectingOverlay";
import { GuildRail } from "./GuildRail";
import { MemberSidebar } from "./MemberSidebar";
import { SidePanel } from "./SidePanel";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  const status = useClient((state) => state.status);
  const error = useClient((state) => state.error);
  const guildCount = useClient((state) => state.guildOrder.length);
  const dmMode = useUI((state) => state.dmMode);
  const panelOpen = useUI((state) => state.panel !== null);
  const selectChannel = useClient((state) => state.selectChannel);

  useNotifications();

  // Only cover the app on the very first handshake; a later reconnect keeps the
  // layout up and reports itself in the status bar instead.
  const starting = status !== "ready" && guildCount === 0 && !error;

  return (
    <div className="relative flex h-screen flex-col bg-ink">
      <div className="flex min-h-0 flex-1">
        <GuildRail />
        {dmMode ? (
          <DirectMessages onSelect={(channelId) => void selectChannel(channelId)} />
        ) : (
          <ChannelSidebar />
        )}
        <ChatPanel />
        <SidePanel />
        {/* The member list gives way to an open panel rather than squeezing the chat. */}
        {!dmMode && !panelOpen && <MemberSidebar />}
      </div>
      {(status !== "ready" || error) && <StatusBar />}
      {starting && <ConnectingOverlay />}
    </div>
  );
}
