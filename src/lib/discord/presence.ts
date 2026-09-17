import { CDN_BASE } from "./constants";
import type { Presence, PresenceActivity } from "@/lib/store/client";

/** Discord's activity types; 4 is the custom status, which has no verb. */
const ACTIVITY_VERB: Record<number, string> = {
  0: "Playing",
  1: "Streaming",
  2: "Listening to",
  3: "Watching",
  5: "Competing in",
};

const CUSTOM_STATUS = 4;

/** The custom status line a user set, if any. */
export function customStatus(presence: Presence | undefined): string | null {
  const custom = presence?.activities.find((activity) => activity.type === CUSTOM_STATUS);
  if (!custom) return null;
  return custom.state?.trim() || null;
}

/** "Playing Minecraft", "Listening to Spotify" — the first real activity. */
export function activityLabel(activity: PresenceActivity): string {
  if (activity.type === CUSTOM_STATUS) return activity.state?.trim() ?? "";
  const verb = ACTIVITY_VERB[activity.type];
  return verb ? `${verb} ${activity.name}` : activity.name;
}

/**
 * The single line shown under a name in the member list: a custom status wins,
 * because that is what the person chose to say about themselves.
 */
export function activityLine(presence: Presence | undefined): string | null {
  if (!presence || presence.status === "offline") return null;
  const custom = customStatus(presence);
  if (custom) return custom;
  const activity = presence.activities.find((entry) => entry.type !== CUSTOM_STATUS);
  return activity ? activityLabel(activity) : null;
}

/** Every activity worth listing on the user card, custom status excluded. */
export function detailedActivities(presence: Presence | undefined): PresenceActivity[] {
  return (presence?.activities ?? []).filter((activity) => activity.type !== CUSTOM_STATUS);
}

/** "Desktop, Mobile" — the clients the user is signed in on. */
export function deviceLabel(presence: Presence | undefined): string | null {
  const status = presence?.clientStatus;
  if (!status) return null;
  const devices: string[] = [];
  if (status.desktop) devices.push("Desktop");
  if (status.mobile) devices.push("Mobile");
  if (status.web) devices.push("Web");
  return devices.length > 0 ? devices.join(", ") : null;
}

/**
 * Turns an activity asset key into something an `<img>` can load.
 *
 * Discord hands these out in several shapes: a bare snowflake is an asset of
 * the application itself, `spotify:` points at Spotify's CDN, and the `mp:`
 * prefix is a proxied external URL.
 */
export function activityAssetUrl(
  activity: PresenceActivity,
  which: "large" | "small",
  size = 160,
): string | null {
  const key = which === "large" ? activity.assets?.largeImage : activity.assets?.smallImage;
  if (!key) return null;

  if (key.startsWith("spotify:")) {
    return `https://i.scdn.co/image/${key.slice("spotify:".length)}`;
  }
  if (key.startsWith("mp:")) {
    return `https://media.discordapp.net/${key.slice("mp:".length)}`;
  }
  if (/^https?:\/\//.test(key)) return key;
  if (!activity.applicationId) return null;
  return `${CDN_BASE}/app-assets/${activity.applicationId}/${key}.png?size=${size}`;
}

/** The hover text Discord puts on an activity's artwork. */
export function activityAssetText(
  activity: PresenceActivity,
  which: "large" | "small",
): string | null {
  return (which === "large" ? activity.assets?.largeText : activity.assets?.smallText) ?? null;
}

/** `3:01`, or `1:02:03` once it passes an hour — the counter on a Discord activity. */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
