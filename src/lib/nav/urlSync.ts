/**
 * The address bar shape, mirrored from Discord's own web client:
 * `/channels/@me`, `/channels/@me/<dmChannelId>`, `/channels/<guildId>` or
 * `/channels/<guildId>/<channelId>`. Kept separate from the store so it can
 * be unit-tested without a browser.
 */

export interface RouteState {
  dmMode: boolean;
  guildId: string | null;
  channelId: string | null;
}

export function parsePath(pathname: string): RouteState {
  const segments = pathname.split("/").filter(Boolean);
  const rest = segments[0] === "channels" ? segments.slice(1) : segments;
  const [first, second] = rest;

  if (!first) return { dmMode: false, guildId: null, channelId: null };
  if (first === "@me") return { dmMode: true, guildId: null, channelId: second ?? null };
  return { dmMode: false, guildId: first, channelId: second ?? null };
}

export function buildPath(route: RouteState): string {
  if (route.dmMode) {
    return route.channelId ? `/channels/@me/${route.channelId}` : "/channels/@me";
  }
  if (route.guildId) {
    return route.channelId
      ? `/channels/${route.guildId}/${route.channelId}`
      : `/channels/${route.guildId}`;
  }
  return "/channels/@me";
}
