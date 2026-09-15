import { CDN_BASE } from "./constants";

export function userAvatarUrl(
  user: { id: string; avatar: string | null; discriminator?: string },
  size = 64,
) {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "webp";
    return `${CDN_BASE}/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
  }
  // Modern (non-legacy) accounts pick a default from the id instead of the discriminator.
  const index =
    user.discriminator && user.discriminator !== "0"
      ? Number(user.discriminator) % 5
      : Number((BigInt(user.id) >> BigInt(22)) % BigInt(6));
  return `${CDN_BASE}/embed/avatars/${index}.png`;
}

export function guildIconUrl(guild: { id: string; icon: string | null }, size = 128) {
  if (!guild.icon) return null;
  const ext = guild.icon.startsWith("a_") ? "gif" : "webp";
  return `${CDN_BASE}/icons/${guild.id}/${guild.icon}.${ext}?size=${size}`;
}

export function emojiUrl(id: string, animated = false, size = 44) {
  return `${CDN_BASE}/emojis/${id}.${animated ? "gif" : "webp"}?size=${size}`;
}

/** Initials shown while a guild has no icon. */
export function guildAcronym(name: string) {
  return name
    .replace(/'s /g, " ")
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 3);
}
