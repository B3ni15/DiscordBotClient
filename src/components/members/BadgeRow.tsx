"use client";

import { useState } from "react";
import type { UserBadge } from "@/lib/discord/userFlags";

/**
 * Discord shows badges as a row of small icons and names them on hover, so the
 * profile stays compact. The tooltip is positioned by hand rather than reused
 * from the shared one because the card clips at its own edges.
 */
export function BadgeRow({ badges }: { badges: UserBadge[] }) {
  const [active, setActive] = useState<string | null>(null);

  if (badges.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {badges.map((badge, index) => {
        const open = active === badge.label;
        // The card is narrow and clips at its edges, so the bubble hangs from
        // whichever side keeps it inside rather than always centring.
        const anchor =
          badges.length === 1
            ? "left-0"
            : index < badges.length / 2
              ? "left-0"
              : "right-0";
        return (
          <li key={badge.label} className="relative">
            <button
              type="button"
              // A badge is not an action; it exists so the name is reachable by
              // keyboard as well as by pointer.
              aria-label={`${badge.label}. ${badge.description}`}
              onPointerEnter={() => setActive(badge.label)}
              onPointerLeave={() => setActive((current) => (current === badge.label ? null : current))}
              onFocus={() => setActive(badge.label)}
              onBlur={() => setActive((current) => (current === badge.label ? null : current))}
              onClick={() => setActive((current) => (current === badge.label ? null : badge.label))}
              className="grid h-[22px] w-[22px] place-items-center rounded transition-transform hover:scale-110"
            >
              {badge.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={badge.iconUrl}
                  alt=""
                  className="h-[22px] w-[22px] object-contain"
                  onError={(event) => {
                    // Fall back to the glyph if Discord rotates the artwork.
                    event.currentTarget.style.display = "none";
                    event.currentTarget.nextElementSibling?.classList.remove("hidden");
                  }}
                />
              ) : null}
              <span
                aria-hidden
                className={`text-base leading-none ${badge.iconUrl ? "hidden" : ""}`}
              >
                {badge.glyph}
              </span>
            </button>

            {open && (
              <span
                role="tooltip"
                className={`pointer-events-none absolute top-full z-50 mt-2 w-max max-w-48 animate-pop-in rounded-md bg-floating px-2.5 py-1.5 shadow-lg ${anchor}`}
              >
                <span className="block text-xs font-semibold text-bright">{badge.label}</span>
                <span className="block text-[11px] leading-snug text-muted">
                  {badge.description}
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
