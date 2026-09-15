"use client";

import { useEffect, useState } from "react";
import { resolveApplicationId } from "@/lib/discord/commandApi";
import { useClient } from "@/lib/store/client";

/**
 * The application id used by every command route. For a bot it equals the bot
 * user's id; `/oauth2/applications/@me` is only hit when the user is not loaded.
 */
export function useApplicationId(): string | null {
  const userId = useClient((state) => state.user?.id ?? null);
  const token = useClient((state) => state.token);
  const getRest = useClient((state) => state.getRest);
  const [fetched, setFetched] = useState<string | null>(null);

  useEffect(() => {
    if (userId || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const id = await resolveApplicationId(getRest());
        if (!cancelled) setFetched(id);
      } catch {
        // Leaving it null makes the panels show their "not signed in" state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, token, getRest]);

  return userId ?? fetched;
}
