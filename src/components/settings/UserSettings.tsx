"use client";

import { useState } from "react";
import { AccountSection } from "@/components/account/AccountSection";
import { PresenceEditor } from "@/components/nav/PresenceEditor";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { BotTag } from "@/components/ui/BotTag";
import {
  FullscreenSettings,
  SettingsDangerRow,
  SettingsPageTitle,
} from "@/components/ui/FullscreenSettings";
import {
  BellIcon,
  CopyIcon,
  DoorStrokeIcon,
  LockIcon,
  MicStrokeIcon,
  ShieldIcon,
  SmileStrokeIcon,
  UserIcon,
} from "@/components/ui/icons";
import { StatusDot } from "@/components/ui/StatusDot";
import { BridgeSettings } from "@/components/voice/BridgeSettings";
import { userAvatarUrl, userBannerUrl } from "@/lib/discord/cdn";
import { copyText } from "@/lib/discord/messageActions";
import { isVerifiedBot, userBadges } from "@/lib/discord/userFlags";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

type Section = "account" | "presence" | "notifications" | "voice" | "sync";

const GROUPS = [
  {
    heading: "User Settings",
    items: [
      { id: "account" as const, label: "My Bot", icon: <UserIcon size={16} /> },
      { id: "presence" as const, label: "Presence", icon: <SmileStrokeIcon size={16} /> },
      { id: "sync" as const, label: "Sync & Devices", icon: <ShieldIcon size={16} /> },
    ],
  },
  {
    heading: "App Settings",
    items: [
      { id: "notifications" as const, label: "Notifications", icon: <BellIcon size={16} /> },
      { id: "voice" as const, label: "Voice", icon: <MicStrokeIcon size={16} /> },
    ],
  },
];

const STATUS_LABELS: Record<string, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  identifying: "Identifying…",
  ready: "Connected",
  reconnecting: "Reconnecting…",
  closed: "Connection closed",
};

/** Discord's User Settings, full screen, opened from the gear in the rail or the user panel. */
export function UserSettings() {
  const open = useUI((state) => state.panel === "settings");
  const close = useUI((state) => state.closePanel);
  const logout = useClient((state) => state.logout);
  const [section, setSection] = useState<Section>("account");

  if (!open) return null;

  return (
    <FullscreenSettings
      label="User settings"
      groups={GROUPS}
      active={section}
      onSelect={setSection}
      onClose={close}
      footer={
        <SettingsDangerRow label="Log Out" icon={<DoorStrokeIcon size={16} />} onClick={logout} />
      }
    >
      {section === "account" && <MyBotPage />}
      {section === "presence" && (
        <>
          <SettingsPageTitle title="Presence">
            The status and activity other people see on your bot. Saved in this browser and sent
            again every time the bot connects.
          </SettingsPageTitle>
          <Embedded>
            <PresenceEditor />
          </Embedded>
        </>
      )}
      {section === "sync" && (
        <>
          <SettingsPageTitle title="Sync & Devices">
            Keep your bots, DMs and command scripts on every device. Everything is encrypted in
            this browser before it is uploaded.
          </SettingsPageTitle>
          <Embedded>
            <AccountSection />
          </Embedded>
        </>
      )}
      {section === "notifications" && (
        <>
          <SettingsPageTitle title="Notifications">
            Desktop notifications for mentions and DMs, and which servers and channels stay quiet.
          </SettingsPageTitle>
          <Embedded>
            <NotificationSettings />
          </Embedded>
        </>
      )}
      {section === "voice" && (
        <>
          <SettingsPageTitle title="Voice">
            A browser cannot open Discord&rsquo;s voice connection by itself. The voice bridge
            carries the audio for it.
          </SettingsPageTitle>
          <Embedded>
            <BridgeSettings />
          </Embedded>
        </>
      )}
    </FullscreenSettings>
  );
}

/**
 * The settings blocks were written for the narrow side panel and carry their own
 * small heading; on a full page the page title already says it, so it is hidden.
 */
function Embedded({ children }: { children: React.ReactNode }) {
  return <div className="settings-embed rounded-lg bg-panel p-5">{children}</div>;
}

function MyBotPage() {
  const user = useClient((state) => state.user);
  const status = useClient((state) => state.status);
  const error = useClient((state) => state.error);
  const presence = useClient((state) => state.selfPresence);
  const toast = useUI((state) => state.toast);

  if (!user) return null;
  const banner = userBannerUrl(user, 600);
  const accent = user.accent_color ? `#${user.accent_color.toString(16).padStart(6, "0")}` : null;
  const badges = userBadges(user);
  const verified = isVerifiedBot(user);
  const dot = status === "ready" ? (presence.status === "invisible" ? "offline" : presence.status) : "offline";

  const copy = (value: string, what: string) =>
    void copyText(value).then(
      () => toast(`${what} copied.`),
      () => toast("Could not copy to the clipboard.", "error"),
    );

  return (
    <>
      <SettingsPageTitle title="My Bot" />

      <div className="overflow-hidden rounded-xl bg-ink">
        <div
          className="h-28 bg-accent bg-cover bg-center"
          style={{
            backgroundImage: banner ? `url(${banner})` : undefined,
            backgroundColor: accent ?? undefined,
          }}
        />
        <div className="relative px-4 pb-4">
          <div className="flex items-end gap-4">
            <span className="relative -mt-10 shrink-0 rounded-full bg-ink p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={userAvatarUrl(user, 160)} alt="" className="h-20 w-20 rounded-full" />
              <StatusDot
                status={dot}
                size={18}
                ringClassName="bg-ink"
                className="absolute right-1.5 bottom-1.5"
              />
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <p className="flex items-center gap-2 text-xl font-bold text-bright">
                <span className="truncate">{user.global_name ?? user.username}</span>
                <BotTag user={user} />
              </p>
              <p className="truncate text-sm text-muted">{user.username}</p>
            </div>
            {badges.length > 0 && (
              <ul className="mb-1 flex shrink-0 gap-1 rounded-lg bg-panel px-2 py-1">
                {badges.map((badge) => (
                  <li key={badge.label} title={badge.label} aria-label={badge.label}>
                    {badge.glyph}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <dl className="mt-4 flex flex-col gap-4 rounded-lg bg-panel p-4">
            <Row label="Display name" value={user.global_name ?? "Not set — shows the username"} />
            <Row label="Username" value={user.username} />
            <Row
              label="User ID"
              value={<span className="font-mono">{user.id}</span>}
              action={
                <button
                  type="button"
                  onClick={() => copy(user.id, "User ID")}
                  className="flex items-center gap-1.5 rounded bg-raised px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-hover"
                >
                  <CopyIcon size={14} />
                  Copy
                </button>
              }
            />
            <Row
              label="Verification"
              value={
                verified ? (
                  <span className="text-online">Verified by Discord</span>
                ) : (
                  "Not verified — Discord requires it past 100 servers"
                )
              }
            />
          </dl>
        </div>
      </div>

      <h2 className="mt-10 mb-3 text-xs font-bold tracking-wide text-muted uppercase">Connection</h2>
      <div className="flex items-center gap-3 rounded-lg bg-panel px-4 py-3">
        <span
          aria-hidden
          className={`h-2.5 w-2.5 rounded-full ${
            status === "ready" ? "bg-online" : status === "closed" || error ? "bg-danger" : "bg-amber"
          }`}
        />
        <span className="flex-1 text-sm font-medium text-text">
          Gateway · {STATUS_LABELS[status] ?? status}
        </span>
      </div>
      {error && <p className="mt-2 text-sm leading-relaxed text-danger">{error}</p>}

      <h2 className="mt-10 mb-3 text-xs font-bold tracking-wide text-muted uppercase">Token</h2>
      <div className="flex gap-3 rounded-lg border border-amber/20 bg-amber/5 p-4">
        <span className="mt-0.5 text-amber">
          <LockIcon size={18} />
        </span>
        <p className="text-sm leading-relaxed text-text">
          The token is stored only in this browser and only ever sent to Discord. Log out on a
          shared computer, and reset the token in the Developer Portal if anyone else has seen it.
        </p>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  action,
}: {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-bold tracking-wide text-muted uppercase">{label}</dt>
        <dd className="mt-1 truncate text-sm text-text">{value}</dd>
      </div>
      {action}
    </div>
  );
}
