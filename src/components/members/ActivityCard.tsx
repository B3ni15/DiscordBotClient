"use client";

import { useEffect, useState } from "react";
import {
  activityAssetText,
  activityAssetUrl,
  activityLabel,
  formatElapsed,
} from "@/lib/discord/presence";
import type { PresenceActivity } from "@/lib/store/client";

/** Ticks once a second so the counter under an activity keeps moving. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * One activity, laid out the way Discord's profile does it: the artwork on the
 * left with the small icon tucked into its corner, the name and the two detail
 * lines beside it, and the elapsed time underneath.
 */
export function ActivityCard({ activity }: { activity: PresenceActivity }) {
  const large = activityAssetUrl(activity, "large");
  const small = activityAssetUrl(activity, "small");
  const largeText = activityAssetText(activity, "large");
  const smallText = activityAssetText(activity, "small");

  const hasTimer = Boolean(activity.startedAt || activity.endsAt);
  const now = useNow(hasTimer);

  let timer: string | null = null;
  if (activity.endsAt) {
    timer = `${formatElapsed(activity.endsAt - now)} left`;
  } else if (activity.startedAt) {
    timer = `${formatElapsed(now - activity.startedAt)} elapsed`;
  }

  return (
    <li className="flex gap-3">
      {large ? (
        <span className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={large}
            alt={largeText ?? ""}
            title={largeText ?? undefined}
            className="h-[60px] w-[60px] rounded-lg bg-panel object-cover"
          />
          {small && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={small}
              alt={smallText ?? ""}
              title={smallText ?? undefined}
              className="absolute -right-1.5 -bottom-1.5 h-6 w-6 rounded-full border-[3px] border-ink bg-ink object-cover"
            />
          )}
        </span>
      ) : (
        <span
          aria-hidden
          className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded-lg bg-panel text-2xl"
        >
          🎮
        </span>
      )}

      <span className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
        <span className="truncate text-sm font-semibold text-bright" title={activity.name}>
          {activity.name}
        </span>
        {activity.details && (
          <span className="truncate text-xs text-text" title={activity.details}>
            {activity.details}
          </span>
        )}
        {activity.state && activity.state !== activity.details && (
          <span className="truncate text-xs text-text" title={activity.state}>
            {activity.state}
          </span>
        )}
        {timer && <span className="truncate text-xs text-muted">{timer}</span>}
        {!activity.details && !activity.state && !timer && (
          <span className="truncate text-xs text-muted">{activityLabel(activity)}</span>
        )}
      </span>
    </li>
  );
}
