"use client";

import {
  setChannelMuted,
  setGuildMuted,
  useNotificationSettings,
} from "@/lib/notifications/settings";

export interface MuteButtonProps {
  /** Mute a single channel. Ignored when `guildId` is given. */
  channelId?: string;
  /** Mute a whole guild. */
  guildId?: string;
  className?: string;
}

/** Toggles notification muting for one channel or one guild. */
export function MuteButton({ channelId, guildId, className }: MuteButtonProps) {
  const settings = useNotificationSettings();
  if (!channelId && !guildId) return null;

  const muted = channelId
    ? settings.mutedChannelIds.includes(channelId)
    : settings.mutedGuildIds.includes(guildId!);
  const target = channelId ? "channel" : "server";
  const label = muted ? `Unmute ${target}` : `Mute ${target}`;

  const toggle = () => {
    if (channelId) setChannelMuted(channelId, !muted);
    else setGuildMuted(guildId!, !muted);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={muted}
      className={`rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-raised ${
        muted ? "text-amber" : "text-muted hover:text-text"
      } ${className ?? ""}`}
    >
      {muted ? "🔕" : "🔔"}
    </button>
  );
}
