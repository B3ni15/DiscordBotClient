"use client";

import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

/**
 * The strip at the bottom of the sidebar: who the client is signed in as, how
 * the gateway connection is doing, and the way out.
 */
const STATUS_TEXT: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  invisible: "Invisible",
};

export function UserPanel() {
  const user = useClient((state) => state.user);
  const status = useClient((state) => state.status);
  const logout = useClient((state) => state.logout);
  const togglePanel = useUI((state) => state.togglePanel);
  const selfPresence = useClient((state) => state.selfPresence);

  const connected = status === "ready";
  const connecting = status === "connecting" || status === "identifying" || status === "reconnecting";

  /*
   * The dot must show the presence the bot was told to publish. Discord never
   * echoes your own presence back to you, so this is the only source for it —
   * reading "online" off the socket being up made every status look ignored.
   */
  const chosen = selfPresence.status === "invisible" ? "offline" : selfPresence.status;
  const presence = connected ? chosen : connecting ? "idle" : "offline";
  const activity = selfPresence.activityName.trim();
  const subtitle = !connected
    ? connecting
      ? "Connecting…"
      : "Offline"
    : activity && selfPresence.activityType !== null
      ? activity
      : (STATUS_TEXT[selfPresence.status] ?? "Online");

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 bg-panel-alt px-2">
      {user ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1">
          <span className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={userAvatarUrl(user, 64)} alt="" className="h-8 w-8 rounded-full" />
            <StatusDot
              status={presence}
              size={10}
              ringClassName="bg-panel-alt"
              className="absolute -right-1 -bottom-1"
            />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-bright">
              {user.global_name ?? user.username}
            </span>
            <span
              title={subtitle}
              className={`block truncate text-xs ${connecting ? "text-amber" : "text-muted"}`}
            >
              {subtitle}
            </span>
          </span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1">
          <span className="skeleton h-8 w-8 rounded-full" aria-hidden />
          <span className="skeleton h-3 w-24" aria-hidden />
        </div>
      )}

      <Tooltip label="Settings">
        <button
          type="button"
          onClick={() => togglePanel("settings")}
          aria-label="Settings"
          className="grid h-8 w-8 place-items-center rounded text-base text-muted transition-colors hover:bg-hover hover:text-bright"
        >
          <span aria-hidden>⚙</span>
        </button>
      </Tooltip>
      <Tooltip label="Sign out">
        <button
          type="button"
          onClick={logout}
          aria-label="Sign out"
          className="grid h-8 w-8 place-items-center rounded text-base text-muted transition-colors hover:bg-hover hover:text-danger"
        >
          <span aria-hidden>⏻</span>
        </button>
      </Tooltip>
    </div>
  );
}
