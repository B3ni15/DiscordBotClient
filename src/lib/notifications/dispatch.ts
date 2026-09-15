/**
 * Shared subscription to the gateway dispatch stream.
 *
 * The gateway instance is created on login and replaced on every reconnect-by-
 * login, so subscribers cannot hold on to it directly. This module keeps a
 * single listener attached to whatever `getGateway()` currently returns and
 * re-attaches whenever the client store swaps the instance.
 */

import type { GatewayClient } from "@/lib/discord/gateway";
import { useClient } from "@/lib/store/client";

export type DispatchListener = (event: string, data: unknown) => void;

const listeners = new Set<DispatchListener>();
let attached: GatewayClient | null = null;
let detachGateway: (() => void) | null = null;
let detachStore: (() => void) | null = null;

/** Subscribe to every gateway dispatch; returns an unsubscribe function. */
export function subscribeDispatch(listener: DispatchListener): () => void {
  listeners.add(listener);
  if (!detachStore) {
    // Any store change may mean a fresh gateway (login / logout).
    detachStore = useClient.subscribe(syncGateway);
  }
  syncGateway();

  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    detachGateway?.();
    detachGateway = null;
    attached = null;
    detachStore?.();
    detachStore = null;
  };
}

function syncGateway() {
  const gateway = useClient.getState().getGateway();
  if (gateway === attached) return;
  detachGateway?.();
  detachGateway = null;
  attached = gateway;
  if (!gateway) return;
  detachGateway = gateway.on("dispatch", (event, data) => {
    // Copy so a listener unsubscribing mid-emit cannot break the iteration.
    for (const listener of [...listeners]) listener(event, data);
  });
}
