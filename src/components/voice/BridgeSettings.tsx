"use client";

import { useState } from "react";
import {
  connectBridge,
  disconnectBridge,
  saveBridgeSettings,
  useBridge,
} from "@/lib/voice/bridge";

const STATUS_LABELS: Record<string, string> = {
  off: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Failed",
};

/**
 * Where the voice bridge is, and whether to reach for it automatically.
 *
 * The address it wants is the one the worker prints when it starts, secret and
 * all, so setting this up is a single paste.
 */
export function BridgeSettings() {
  const stored = useBridge((state) => state.url);
  const autoConnect = useBridge((state) => state.autoConnect);
  const status = useBridge((state) => state.status);
  const error = useBridge((state) => state.error);
  const opus = useBridge((state) => state.opus);

  // The stored address only arrives once sign-in reads it back out of
  // localStorage, so the draft follows it until the field is edited. React's
  // own pattern for this adjusts state during the render, not in an effect.
  const [draft, setDraft] = useState({ value: stored, seen: stored });
  if (draft.seen !== stored) setDraft({ value: stored, seen: stored });
  const url = draft.value;
  const setUrl = (value: string) => setDraft({ value, seen: stored });

  const connected = status === "connected";

  return (
    <section className="mb-6">
      <h3 className="pb-2 text-xs font-semibold text-muted">Voice bridge</h3>
      <p className="mb-2 text-xs leading-relaxed text-muted">
        A page cannot open the UDP socket Discord’s voice servers speak over, so live audio needs a
        small worker running next to this browser. Start it with{" "}
        <span className="font-mono text-amber">cd bridge &amp;&amp; npm install &amp;&amp; npm start</span>{" "}
        and paste the address it prints here.
      </p>

      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Bridge address
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onBlur={() => saveBridgeSettings({ url: url.trim() })}
          placeholder="ws://127.0.0.1:8787?secret=…"
          spellCheck={false}
          className="rounded bg-ink px-2 py-1 font-mono text-xs text-text outline-none focus:ring-1 focus:ring-accent"
        />
      </label>

      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={autoConnect}
          onChange={(event) => saveBridgeSettings({ autoConnect: event.target.checked })}
          className="accent-accent"
        />
        Connect automatically when this client signs in
      </label>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            saveBridgeSettings({ url: url.trim() });
            if (connected) void disconnectBridge();
            else void connectBridge(url.trim());
          }}
          disabled={!url.trim() && !connected}
          className="rounded border border-line px-3 py-1.5 text-xs text-text transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          {connected ? "Disconnect" : "Connect"}
        </button>
        <span className="flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-accent" : status === "error" ? "bg-danger" : "bg-amber"
            }`}
          />
          <span className={connected ? "text-text" : "text-muted"}>
            {STATUS_LABELS[status] ?? status}
          </span>
        </span>
      </div>

      {opus && connected && (
        <p className="mt-1 font-mono text-[10px] text-faint">Opus: {opus}</p>
      )}
      {error && <p className="mt-1 text-xs leading-relaxed text-danger">{error}</p>}
    </section>
  );
}
