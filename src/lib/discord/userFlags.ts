/** Bits of a user's `public_flags` that this client cares about by name. */
export const UserFlag = {
  Staff: 1 << 0,
  Partner: 1 << 1,
  HypeSquadEvents: 1 << 2,
  BugHunterLevel1: 1 << 3,
  HypeSquadBravery: 1 << 6,
  HypeSquadBrilliance: 1 << 7,
  HypeSquadBalance: 1 << 8,
  EarlySupporter: 1 << 9,
  TeamPseudoUser: 1 << 10,
  BugHunterLevel2: 1 << 14,
  /** The application passed Discord's verification, which every bot in 100+ servers must. */
  VerifiedBot: 1 << 16,
  EarlyVerifiedBotDeveloper: 1 << 17,
  ModeratorProgramsAlumni: 1 << 18,
  /** Uses only the HTTP interactions endpoint, so it is never on the gateway. */
  HttpInteractionsBot: 1 << 19,
  ActiveDeveloper: 1 << 22,
} as const;

interface FlagDefinition {
  bit: number;
  label: string;
  glyph: string;
  /** Shown on the profile so a badge is not just a symbol. */
  description: string;
  /** Discord's own badge artwork, under `/badge-icons/`. */
  icon?: string;
}

/** Public account badges, in the order Discord shows them. */
const USER_FLAGS: FlagDefinition[] = [
  { bit: UserFlag.Staff, label: "Discord Staff",
    icon: "5e74e9b61934fc1f67c65515d1f7e60d", glyph: "🛡", description: "Works at Discord." },
  {
    bit: UserFlag.Partner,
    label: "Partnered Server Owner",
    icon: "3f9748e53446a137a052f3454e2de41e",
    glyph: "🤝",
    description: "Owns a server in Discord's partner programme.",
  },
  {
    bit: UserFlag.HypeSquadEvents,
    label: "HypeSquad Events",
    icon: "bf01d1073931f921909045f3a39fd264",
    glyph: "🎉",
    description: "Member of the HypeSquad events team.",
  },
  {
    bit: UserFlag.BugHunterLevel1,
    label: "Bug Hunter",
    icon: "2717692c7dca7289b35297368a940dd0",
    glyph: "🐛",
    description: "Found and reported bugs to Discord.",
  },
  {
    bit: UserFlag.HypeSquadBravery,
    label: "HypeSquad Bravery",
    icon: "8a88d63823d8a71cd5e390baa45efa02",
    glyph: "🟣",
    description: "Chose the House of Bravery.",
  },
  {
    bit: UserFlag.HypeSquadBrilliance,
    label: "HypeSquad Brilliance",
    icon: "011940fd013da3f7fb926e4a1cd2e618",
    glyph: "🟠",
    description: "Chose the House of Brilliance.",
  },
  {
    bit: UserFlag.HypeSquadBalance,
    label: "HypeSquad Balance",
    icon: "3aa41de486fa12454c3761e8e223442e",
    glyph: "🔵",
    description: "Chose the House of Balance.",
  },
  {
    bit: UserFlag.EarlySupporter,
    label: "Early Nitro Supporter",
    icon: "7060786766c9c840eb3019e725d2b358",
    glyph: "💎",
    description: "Subscribed to Nitro before October 2018.",
  },
  {
    bit: UserFlag.TeamPseudoUser,
    label: "Team account",
    glyph: "👥",
    description: "A team, not a person.",
  },
  {
    bit: UserFlag.BugHunterLevel2,
    label: "Bug Hunter Level 2",
    icon: "848f79194d4be5ff5f81505cbd0ce1e6",
    glyph: "🐞",
    description: "Reported a great many bugs to Discord.",
  },
  {
    bit: UserFlag.VerifiedBot,
    label: "Verified Bot",
    glyph: "✅",
    description: "Discord verified this application; required past 100 servers.",
  },
  {
    bit: UserFlag.EarlyVerifiedBotDeveloper,
    label: "Early Verified Bot Developer",
    icon: "6df5892e0f35b051f8b61eace34f4967",
    glyph: "🧑‍💻",
    description: "Verified a bot before August 2020.",
  },
  {
    bit: UserFlag.ModeratorProgramsAlumni,
    label: "Moderator Programs Alumni",
    icon: "fee1624003e2fee35cb398e125dc479b",
    glyph: "🎓",
    description: "Certified Discord moderator.",
  },
  {
    bit: UserFlag.HttpInteractionsBot,
    label: "HTTP interactions only",
    glyph: "🌐",
    description: "Receives interactions over HTTP rather than the gateway.",
  },
  {
    bit: UserFlag.ActiveDeveloper,
    label: "Active Developer",
    icon: "6bdc42827a38498929a4920da12695d9",
    glyph: "⚡",
    description: "Owns an app that ran a command recently.",
  },
];

export interface UserBadge {
  label: string;
  glyph: string;
  description: string;
  /** Full CDN URL of Discord's own artwork, when there is one. */
  iconUrl: string | null;
}

/** Badges that do not come from `public_flags` but are still knowable. */
export const EXTRA_BADGES = {
  serverBooster: {
    label: "Server Booster",
    glyph: "💜",
    description: "Boosting this server.",
    iconUrl: "https://cdn.discordapp.com/badge-icons/ec92202290b48d0879b7413d2dde3bab.png",
  },
} as const;

/** A minimal user shape: enough to read the badges off anything Discord sends. */
export interface FlaggedUser {
  bot?: boolean;
  public_flags?: number | null;
  flags?: number | null;
}

/**
 * `public_flags` is what Discord exposes on other people's accounts; `flags` is
 * the same set on your own. Either one answers the badge question.
 */
export function userFlagBits(user: FlaggedUser | null | undefined): number {
  return user?.public_flags ?? user?.flags ?? 0;
}

export function hasUserFlag(user: FlaggedUser | null | undefined, flag: number): boolean {
  return (userFlagBits(user) & flag) === flag;
}

/** True for an application Discord has verified. Non-bots are never verified. */
export function isVerifiedBot(user: FlaggedUser | null | undefined): boolean {
  return user?.bot === true && hasUserFlag(user, UserFlag.VerifiedBot);
}

/** The badges encoded in a user's flags. */
export function userBadges(user: FlaggedUser | null | undefined): UserBadge[] {
  const bits = userFlagBits(user);
  if (!bits) return [];
  return USER_FLAGS.filter((flag) => (bits & flag.bit) === flag.bit).map(
    ({ label, glyph, description, icon }) => ({
      label,
      glyph,
      description,
      iconUrl: icon ? `https://cdn.discordapp.com/badge-icons/${icon}.png` : null,
    }),
  );
}

/** `#rrggbb` for the profile accent colour, when the account has one set. */
export function accentColorHex(color: number | null | undefined): string | null {
  if (color === null || color === undefined) return null;
  return `#${color.toString(16).padStart(6, "0")}`;
}
