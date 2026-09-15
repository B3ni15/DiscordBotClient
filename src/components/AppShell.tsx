"use client";

import { DirectMessages } from "@/components/nav/DirectMessages";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatPanel } from "./ChatPanel";
import { GuildRail } from "./GuildRail";
import { MemberSidebar } from "./MemberSidebar";
import { SidePanel } from "./SidePanel";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  const status = useClient((state) => state.status);
  const dmMode = useUI((state) => state.dmMode);
  const panelOpen = useUI((state) => state.panel !== null);
  const selectChannel = useClient((state) => state.selectChannel);

  useNotifications();

  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1">
        <GuildRail />
        {dmMode ? (
          <div className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
            <DirectMessages onSelect={(channelId) => void selectChannel(channelId)} />
          </div>
        ) : (
          <ChannelSidebar />
        )}
        <ChatPanel />
        <SidePanel />
        {/* The member list gives way to an open panel rather than squeezing the chat. */}
        {!dmMode && !panelOpen && <MemberSidebar />}
      </div>
      {status !== "ready" && <StatusBar />}
    </div>
  );
}
