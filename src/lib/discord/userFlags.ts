/** Public account badges, as bits of `public_flags`. */
const USER_FLAGS: Array<{ bit: number; label: string; glyph: string }> = [
  { bit: 1 << 0, label: "Discord Staff", glyph: "🛡" },
  { bit: 1 << 1, label: "Partnered Server Owner", glyph: "🤝" },
  { bit: 1 << 2, label: "HypeSquad Events", glyph: "🎉" },
  { bit: 1 << 3, label: "Bug Hunter Level 1", glyph: "🐛" },
  { bit: 1 << 6, label: "HypeSquad Bravery", glyph: "🟣" },
  { bit: 1 << 7, label: "HypeSquad Brilliance", glyph: "🟠" },
  { bit: 1 << 8, label: "HypeSquad Balance", glyph: "🔵" },
  { bit: 1 << 9, label: "Early Nitro Supporter", glyph: "💎" },
  { bit: 1 << 10, label: "Team user", glyph: "👥" },
  { bit: 1 << 14, label: "Bug Hunter Level 2", glyph: "🐞" },
  { bit: 1 << 16, label: "Verified Bot", glyph: "✅" },
  { bit: 1 << 17, label: "Early Verified Bot Developer", glyph: "🧑‍💻" },
  { bit: 1 << 18, label: "Moderator Programs Alumni", glyph: "🎓" },
  { bit: 1 << 19, label: "HTTP interactions bot", glyph: "🌐" },
  { bit: 1 << 22, label: "Active Developer", glyph: "⚡" },
];

export interface UserBadge {
  label: string;
  glyph: string;
}

/** The badges encoded in a user's `public_flags`. */
export function userBadges(flags: number | undefined | null): UserBadge[] {
  if (!flags) return [];
  return USER_FLAGS.filter((flag) => (flags & flag.bit) === flag.bit).map(
    ({ label, glyph }) => ({ label, glyph }),
  );
}

/** `#rrggbb` for the profile accent colour, when the account has one set. */
export function accentColorHex(color: number | null | undefined): string | null {
  if (color === null || color === undefined) return null;
  return `#${color.toString(16).padStart(6, "0")}`;
}
