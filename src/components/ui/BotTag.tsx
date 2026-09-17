import { isVerifiedBot, type FlaggedUser } from "@/lib/discord/userFlags";

export interface BotTagProps {
  user: FlaggedUser | null | undefined;
  /** Smaller variant for dense lists. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Discord's tag next to an application's name. A verified app carries a
 * checkmark inside the tag, the way the real client marks one, and the title
 * spells it out for anyone who does not know the symbol.
 */
export function BotTag({ user, size = "md", className }: BotTagProps) {
  if (!user?.bot) return null;
  const verified = isVerifiedBot(user);
  const label = verified ? "Verified bot" : "Bot";

  return (
    <span
      title={
        verified
          ? "Verified bot — Discord verified this application"
          : "Bot — this application is not verified by Discord"
      }
      className={`inline-flex shrink-0 items-center gap-0.5 rounded bg-accent font-medium text-white ${
        size === "sm" ? "px-1 py-px text-[9px]" : "px-1 py-px text-[10px]"
      } leading-none ${className ?? ""}`}
    >
      {verified && (
        <svg
          viewBox="0 0 16 16"
          width={size === "sm" ? 8 : 9}
          height={size === "sm" ? 8 : 9}
          aria-hidden
          className="shrink-0"
        >
          <path
            d="M2 8.5 6 12.5 14 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      BOT
      <span className="sr-only"> — {label}</span>
    </span>
  );
}
