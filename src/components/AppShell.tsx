"use client";

import { useClient } from "@/lib/store/client";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatPanel } from "./ChatPanel";
import { GuildRail } from "./GuildRail";
import { MemberSidebar } from "./MemberSidebar";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  const status = useClient((state) => state.status);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1">
        <GuildRail />
        <ChannelSidebar />
        <ChatPanel />
        <MemberSidebar />
      </div>
      {status !== "ready" && <StatusBar />}
    </div>
  );
}
