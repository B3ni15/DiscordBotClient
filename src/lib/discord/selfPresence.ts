/**
 * The presence this client publishes for its own bot.
 *
 * Kept in localStorage so the bot comes back wearing the same status after a
 * reload, and re-sent on every gateway READY because a presence set over the
 * socket does not survive a reconnect.
 */

export const PRESENCE_STORAGE_KEY = "disbotclient:presence";

export type SelfStatus = "online" | "idle" | "dnd" | "invisible";

/** Discord's activity types, minus the ones a bot may not use. */
export const ACTIVITY_TYPES = [
  { value: 0, label: "Playing", hint: "Playing Minecraft" },
  { value: 1, label: "Streaming", hint: "Needs a Twitch or YouTube link" },
  { value: 2, label: "Listening to", hint: "Listening to Spotify" },
  { value: 3, label: "Watching", hint: "Watching the server" },
  { value: 5, label: "Competing in", hint: "Competing in a tournament" },
  { value: 4, label: "Custom", hint: "Just the text, with no verb in front" },
] as const;

export const STATUS_OPTIONS: Array<{ value: SelfStatus; label: string; note: string }> = [
  { value: "online", label: "Online", note: "The usual green dot." },
  { value: "idle", label: "Idle", note: "The yellow crescent." },
  { value: "dnd", label: "Do Not Disturb", note: "Red; suppresses notifications for you." },
  { value: "invisible", label: "Invisible", note: "Shows as offline while staying connected." },
];

export interface SelfPresence {
  status: SelfStatus;
  /** Null when the bot should show no activity at all. */
  activityType: number | null;
  activityName: string;
  /** Twitch or YouTube link; only type 1 turns purple, and only with a valid one. */
  streamUrl: string;
  /** Marks the session idle-by-inactivity rather than by choice. */
  afk: boolean;
  /**
   * Show the green phone icon instead of the desktop dot. Discord derives this
   * from the identify properties, so switching it needs a fresh connection.
   */
  mobile: boolean;
}

export const DEFAULT_SELF_PRESENCE: SelfPresence = {
  status: "online",
  activityType: null,
  activityName: "",
  streamUrl: "",
  afk: false,
  mobile: false,
};

interface GatewayActivity {
  name: string;
  type: number;
  url?: string;
  state?: string;
}

export interface GatewayPresencePayload {
  since: number | null;
  activities: GatewayActivity[];
  status: string;
  afk: boolean;
}

/** Shapes the stored settings into the op 3 payload the gateway expects. */
export function toGatewayPresence(presence: SelfPresence): GatewayPresencePayload {
  const activities: GatewayActivity[] = [];
  const name = presence.activityName.trim();

  if (presence.activityType !== null && name) {
    if (presence.activityType === 4) {
      // A custom status carries its text in `state`; `name` is ignored by clients.
      activities.push({ name: "Custom Status", type: 4, state: name });
    } else {
      const activity: GatewayActivity = { name, type: presence.activityType };
      const url = presence.streamUrl.trim();
      if (presence.activityType === 1 && url) activity.url = url;
      activities.push(activity);
    }
  }

  return {
    // Discord wants a timestamp with an idle presence and null otherwise.
    since: presence.status === "idle" ? Date.now() : null,
    activities,
    status: presence.status,
    afk: presence.afk,
  };
}

/** Identify properties decide whether Discord shows the phone icon. */
export function identifyProperties(mobile: boolean) {
  return mobile
    ? { os: "android", browser: "Discord Android", device: "Discord Android" }
    : { os: "browser", browser: "disbotclient", device: "disbotclient" };
}

export function loadSelfPresence(): SelfPresence {
  try {
    const raw = localStorage.getItem(PRESENCE_STORAGE_KEY);
    if (!raw) return DEFAULT_SELF_PRESENCE;
    const parsed = JSON.parse(raw) as Partial<SelfPresence>;
    return {
      ...DEFAULT_SELF_PRESENCE,
      ...parsed,
      // Guard against anything hand-edited into storage.
      status: STATUS_OPTIONS.some((option) => option.value === parsed.status)
        ? (parsed.status as SelfStatus)
        : DEFAULT_SELF_PRESENCE.status,
    };
  } catch {
    return DEFAULT_SELF_PRESENCE;
  }
}

export function saveSelfPresence(presence: SelfPresence) {
  try {
    localStorage.setItem(PRESENCE_STORAGE_KEY, JSON.stringify(presence));
  } catch {
    // A browser with storage disabled just loses it on reload.
  }
}
