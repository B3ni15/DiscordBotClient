"use client";

import { useState } from "react";
import {
  connectBridge,
  disconnectBridge,
  hostedBridgeUrl,
  saveBridgeSettings,
  useBridge,
} from "@/lib/voice/bridge";

const STATUS_LABELS: Record<string, string> = {
  off: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Failed",
};

interface SelfTest {
  ready: boolean;
  summary: string;
  checks: Record<string, { ok: boolean; detail: string }>;
  runtime: { node: string; region: string | null };
}

const CHECK_LABELS: Record<string, string> = {
  udp: "Outbound UDP",
  opus: "Opus codec",
  voice: "Voice library",
  dave: "Voice encryption",
};

/**
 * The voice worker this client talks to.
 *
 * It defaults to the one this deployment hosts, so live audio needs no setup at
 * all. The address is here for the case where that is not good enough — a
 * self-hosted worker has no function time limit and a shorter path to Discord.
 */
export function BridgeSettings() {
  const stored = useBridge((state) => state.url);
  const autoConnect = useBridge((state) => state.autoConnect);
  const status = useBridge((state) => state.status);
  const error = useBridge((state) => state.error);
  const opus = useBridge((state) => state.opus);
  const hosted = useBridge((state) => state.hosted);

  // The stored address only arrives once sign-in reads it back out of
  // localStorage, so the draft follows it until the field is edited. React's
  // own pattern for this adjusts state during the render, not in an effect.
  const [draft, setDraft] = useState({ value: stored, seen: stored });
  if (draft.seen !== stored) setDraft({ value: stored, seen: stored });
  const url = draft.value;
  const setUrl = (value: string) => setDraft({ value, seen: stored });

  const [test, setTest] = useState<SelfTest | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const connected = status === "connected";

  async function runSelfTest() {
    setTesting(true);
    setTestError(null);
    try {
      const response = await fetch("/api/voice/selftest");
      if (!response.ok) throw new Error(`The self-test route answered ${response.status}.`);
      setTest((await response.json()) as SelfTest);
    } catch (cause) {
      setTest(null);
      setTestError(cause instanceof Error ? cause.message : "Could not run the self-test.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="mb-6">
      <h3 className="pb-2 text-xs font-semibold text-muted">Voice bridge</h3>
      <p className="mb-2 text-xs leading-relaxed text-muted">
        A page cannot open the UDP socket Discord’s voice servers speak over, so the microphone,
        file playback and listening run through a small worker.{" "}
        {hosted
          ? "This deployment hosts one, so there is nothing to install — calls are handed to a fresh instance every few minutes, which you hear as a brief gap."
          : "This client is pointed at a worker you run yourself."}
      </p>

      <div className="flex items-center gap-2">
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

      {opus && connected && <p className="mt-1 font-mono text-[10px] text-faint">Opus: {opus}</p>}
      {error && <p className="mt-1 text-xs leading-relaxed text-danger">{error}</p>}

      <label className="mt-3 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={autoConnect}
          onChange={(event) => saveBridgeSettings({ autoConnect: event.target.checked })}
          className="accent-accent"
        />
        Connect automatically when this client signs in
      </label>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] text-muted hover:text-text">
          Use a worker of your own
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Hosting the worker yourself removes the time limit a serverless function has, so a call
          runs uninterrupted. Start it with{" "}
          <span className="font-mono text-amber">cd bridge &amp;&amp; npm install &amp;&amp; npm start</span>{" "}
          and paste the address it prints.
        </p>
        <label className="mt-2 flex flex-col gap-1 text-[11px] text-muted">
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
        {!hosted && (
          <button
            type="button"
            onClick={() => {
              const hostedUrl = hostedBridgeUrl();
              setUrl(hostedUrl);
              saveBridgeSettings({ url: hostedUrl });
            }}
            className="mt-2 text-[11px] text-accent hover:underline"
          >
            Back to the one this deployment hosts
          </button>
        )}
      </details>

      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => void runSelfTest()}
          disabled={testing}
          className="text-[11px] text-accent hover:underline disabled:opacity-50"
        >
          {testing ? "Testing this deployment…" : "Can this deployment carry voice?"}
        </button>

        {testError && <p className="mt-1 text-xs leading-relaxed text-danger">{testError}</p>}
        {test && (
          <div className="mt-2">
            <p className={`text-xs leading-relaxed ${test.ready ? "text-online" : "text-danger"}`}>
              {test.summary}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {Object.entries(test.checks).map(([key, check]) => (
                <li key={key} className="flex gap-2 text-[10px] leading-snug">
                  <span aria-hidden className={check.ok ? "text-online" : "text-danger"}>
                    {check.ok ? "✓" : "✕"}
                  </span>
                  <span className="text-muted">
                    <span className="text-text">{CHECK_LABELS[key] ?? key}:</span> {check.detail}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 font-mono text-[10px] text-faint">
              {test.runtime.node}
              {test.runtime.region ? ` · ${test.runtime.region}` : ""}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
