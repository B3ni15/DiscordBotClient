"use client";

import { useState } from "react";
import { showNotification } from "@/lib/notifications/serviceWorker";
import {
  requestNotificationPermission,
  useNotificationPermission,
  type PermissionState,
} from "@/lib/notifications/permission";
import {
  MODE_LABELS,
  patchSettings,
  setChannelMuted,
  setGuildMuted,
  useNotificationSettings,
  type NotificationMode,
} from "@/lib/notifications/settings";
import { useClient } from "@/lib/store/client";

export interface NotificationSettingsProps {
  className?: string;
}

const MODES: NotificationMode[] = ["all", "mentions", "none"];

const PERMISSION_LABELS: Record<PermissionState, string> = {
  granted: "Granted",
  denied: "Blocked by the browser",
  default: "Not requested yet",
  unsupported: "Not supported in this browser",
};

/** Panel for the browser-notification preferences. */
export function NotificationSettings({ className }: NotificationSettingsProps) {
  const settings = useNotificationSettings();
  const permission = useNotificationPermission();
  const channelsById = useClient((state) => state.channelsById);
  const guilds = useClient((state) => state.guilds);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function sendTest() {
    const permission =
      Notification.permission === "default"
        ? await requestNotificationPermission()
        : Notification.permission;
    if (permission !== "granted") {
      setTestResult("Notifications are not allowed for this site.");
      return;
    }
    const shown = await showNotification("disbotclient", {
      body: "Notifications are working.",
      icon: "/icons/icon-192.png",
      tag: "disbotclient:test",
      url: "/channels/@me",
    });
    setTestResult(shown ? "Sent — it should be on screen now." : "This browser refused to show it.");
  }

  return (
    <section className={className}>
      <h3 className="pb-2 text-xs font-semibold text-muted">Notifications</h3>

      <div className="rounded border border-line bg-raised px-3 py-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Notifications</span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => {
              const enabled = event.target.checked;
              patchSettings({ enabled });
              // Turning them on is the gesture the browser wants for its prompt.
              if (enabled && permission === "default") void requestNotificationPermission();
            }}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>

        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span>Sound</span>
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(event) => patchSettings({ sound: event.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>

        <div className="mt-3">
          <p className="pb-1 text-xs text-muted">Notify me about</p>
          <div className="flex gap-1">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => patchSettings({ mode })}
                aria-pressed={settings.mode === mode}
                className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${
                  settings.mode === mode
                    ? "border-accent text-accent"
                    : "border-line text-muted hover:text-text"
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded border border-line bg-raised px-3 py-3">
        <p className="flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              permission === "granted"
                ? "bg-accent"
                : permission === "denied" || permission === "unsupported"
                  ? "bg-danger"
                  : "bg-amber"
            }`}
          />
          <span className={permission === "granted" ? "text-text" : "text-muted"}>
            Permission: {PERMISSION_LABELS[permission]}
          </span>
        </p>
        {permission === "default" && (
          <button
            type="button"
            onClick={() => void requestNotificationPermission()}
            className="mt-2 w-full rounded border border-line px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
          >
            Request permission
          </button>
        )}
        {permission === "denied" && (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The browser blocked notifications for this site. Allow them again in the site settings
            of your browser.
          </p>
        )}
        {permission !== "unsupported" && permission !== "denied" && (
          <button
            type="button"
            onClick={() => void sendTest()}
            className="mt-2 w-full rounded border border-line px-3 py-1.5 text-xs transition-colors hover:bg-hover"
          >
            Send a test notification
          </button>
        )}
        {testResult && <p className="mt-1.5 text-xs text-muted">{testResult}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Notifications come while the client is open, in the background too. On an iPhone or
          iPad, add the site to the Home Screen first — iOS only notifies installed apps.
          Messages that arrive while the client is closed are counted when it opens again.
        </p>
      </div>

      <div className="mt-3">
        <p className="pb-1 text-xs font-semibold text-muted">Muted channels</p>
        {settings.mutedChannelIds.length === 0 ? (
          <p className="text-xs text-muted">No muted channels.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {settings.mutedChannelIds.map((channelId) => {
              const channel = channelsById[channelId] as { name?: string | null } | undefined;
              return (
                <MutedRow
                  key={channelId}
                  id={channelId}
                  label={channel?.name ? `#${channel.name}` : null}
                  onRemove={() => setChannelMuted(channelId, false)}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-3">
        <p className="pb-1 text-xs font-semibold text-muted">Muted servers</p>
        {settings.mutedGuildIds.length === 0 ? (
          <p className="text-xs text-muted">No muted servers.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {settings.mutedGuildIds.map((guildId) => (
              <MutedRow
                key={guildId}
                id={guildId}
                label={guilds[guildId]?.name ?? null}
                onRemove={() => setGuildMuted(guildId, false)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MutedRow({
  id,
  label,
  onRemove,
}: {
  id: string;
  label: string | null;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded border border-line bg-raised px-2 py-1">
      <span className="min-w-0 truncate text-xs">
        {label ?? <span className="font-mono text-muted">{id}</span>}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Unmute ${label ?? id}`}
        title="Unmute"
        className="shrink-0 text-muted transition-colors hover:text-text"
      >
        ✕
      </button>
    </li>
  );
}
