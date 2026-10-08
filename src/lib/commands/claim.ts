/**
 * Makes sure one interaction is handled by one tab.
 *
 * Every open tab keeps its own gateway connection, so each of them receives
 * every INTERACTION_CREATE. Without this, a script would run once per tab and
 * its side effects (a message sent, a role given) would happen several times.
 * The first tab to claim an interaction id runs it; the claim is checked and
 * written under a Web Lock, so two tabs cannot both win.
 */

const CLAIMED_KEY = "disbotclient:claimed-interactions";
/** Enough to outlast Discord's replays; older ids cannot be answered anyway. */
const KEEP = 200;

function claimNow(interactionId: string): boolean {
  let claimed: string[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CLAIMED_KEY) ?? "[]");
    if (Array.isArray(parsed)) claimed = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // A broken list is as good as an empty one.
  }
  if (claimed.includes(interactionId)) return false;
  try {
    localStorage.setItem(CLAIMED_KEY, JSON.stringify([...claimed, interactionId].slice(-KEEP)));
  } catch {
    // Storage full or blocked: this tab handles it, as if it were the only one.
  }
  return true;
}

/** True when this tab is the one that should handle the interaction. */
export async function claimInteraction(interactionId: string): Promise<boolean> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return claimNow(interactionId);
  try {
    return await locks.request("disbotclient:claim-interaction", () => claimNow(interactionId));
  } catch {
    return claimNow(interactionId);
  }
}
