"use client";

import { useRef, useState } from "react";
import {
  connectBridge,
  playFile,
  setMicVolume,
  setMicrophone,
  setMonitor,
  setOutputVolume,
  stopFile,
  useBridge,
} from "@/lib/voice/bridge";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";
import { MicIcon, MicOffIcon } from "./icons";

const VOICE_LABELS: Record<string, string> = {
  idle: "Audio not connected",
  connecting: "Opening the audio connection…",
  ready: "Live audio",
  reconnecting: "Reconnecting the audio…",
};

/** What the strip says while a hosted worker hands the call to a new instance. */
const RESUMING_LABEL = "Moving the call to a fresh worker…";

/**
 * Microphone, file playback and listening — the half of voice that needs the
 * bridge, folded into the voice strip.
 *
 * Without a bridge configured this is a single line explaining why the bot is
 * sitting there silently; with one, it is the live controls.
 */
export function StreamControls() {
  const status = useBridge((state) => state.status);
  const voice = useBridge((state) => state.voice);
  const url = useBridge((state) => state.url);
  const micEnabled = useBridge((state) => state.micEnabled);
  const micVolume = useBridge((state) => state.micVolume);
  const outputVolume = useBridge((state) => state.outputVolume);
  const monitor = useBridge((state) => state.monitor);
  const nowPlaying = useBridge((state) => state.nowPlaying);
  const resuming = useBridge((state) => state.resuming);
  const speaking = useBridge((state) => state.selfSpeaking);
  const level = useBridge((state) => state.selfLevel);
  const others = useBridge((state) => state.speaking);
  const selfVoice = useClient((state) => state.selfVoice);
  const togglePanel = useUI((state) => state.togglePanel);
  const toast = useUI((state) => state.toast);

  const [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  if (status !== "connected") {
    return (
      <div className="mt-1.5 px-1">
        <p className="text-[10px] leading-snug text-faint">
          No live audio yet: the microphone, file playback and listening all run through the voice
          bridge.
        </p>
        <button
          type="button"
          onClick={() => (url ? void connectBridge() : togglePanel("settings"))}
          className="mt-1 text-[11px] text-accent hover:underline"
        >
          {status === "connecting" ? "Connecting to the bridge…" : "Connect the bridge"}
        </button>
      </div>
    );
  }

  const live = voice === "ready";

  async function toggleMic() {
    setBusy(true);
    try {
      await setMicrophone(!micEnabled);
    } catch (cause) {
      toast(
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "This browser refused access to the microphone."
          : cause instanceof Error
            ? cause.message
            : "Could not open the microphone.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(file: File | null) {
    if (!file) return;
    try {
      await playFile(file, { loop });
    } catch {
      toast("This browser could not decode that audio file.", "error");
    }
  }

  return (
    <div className="mt-2 border-t border-black/20 pt-2">
      <p className="mb-1.5 flex items-center gap-2 px-1 text-[11px]">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${live ? "bg-online" : "bg-amber"}`}
        />
        <span className={live ? "text-online" : "text-muted"}>
          {resuming ? RESUMING_LABEL : (VOICE_LABELS[voice] ?? voice)}
        </span>
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void toggleMic()}
          disabled={busy || !selfVoice}
          aria-pressed={micEnabled}
          title={micEnabled ? "Close the microphone" : "Open the microphone"}
          className={`relative flex h-7 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            micEnabled
              ? "bg-online/20 text-online hover:bg-online/30"
              : "bg-raised text-muted hover:bg-hover hover:text-bright"
          } ${speaking ? "ring-1 ring-online" : ""}`}
        >
          {/*
            The level of what is actually being sent, behind the label: the
            quickest possible answer to "is anything coming out of me?".
          */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-online/25 transition-[width] duration-75"
            style={{ width: `${Math.min(100, Math.round(level * 180))}%` }}
          />
          <span className="relative flex items-center gap-1.5">
            {micEnabled ? <MicIcon size={13} /> : <MicOffIcon size={13} />}
            {micEnabled ? "Mic on" : "Mic off"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={!selfVoice}
          title="Play an audio file into the channel"
          className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded bg-raised text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          ▶ Play file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          hidden
          onChange={(event) => {
            void pickFile(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
      </div>

      {micEnabled && selfVoice?.selfMute && (
        <p className="mt-1 px-1 text-[10px] leading-snug text-amber">
          The bot is muted, so nobody hears the microphone.
        </p>
      )}

      {nowPlaying && (
        <div className="mt-1.5 flex items-center gap-2 rounded bg-raised px-2 py-1">
          <span aria-hidden className="text-[11px] text-online">
            ♪
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-text" title={nowPlaying.name}>
            {nowPlaying.name}
          </span>
          <button
            type="button"
            onClick={stopFile}
            className="shrink-0 text-[11px] text-muted hover:text-danger"
          >
            Stop
          </button>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={loop}
            onChange={(event) => setLoop(event.target.checked)}
            className="accent-accent"
          />
          Loop
        </label>
        <label className="flex items-center gap-1" title="Also play the file out of this browser">
          <input
            type="checkbox"
            checked={monitor}
            onChange={(event) => setMonitor(event.target.checked)}
            className="accent-accent"
          />
          Hear it here
        </label>
      </div>

      <Slider
        label="Mic"
        value={micVolume}
        max={1}
        onChange={(value) => setMicVolume(value)}
      />
      <Slider
        label="Them"
        value={outputVolume}
        max={2}
        onChange={(value) => setOutputVolume(value)}
      />

      <p className="mt-1 px-1 text-[10px] leading-snug">
        <span className={speaking ? "font-medium text-online" : "text-faint"}>
          {speaking ? "You are talking." : "You are quiet."}
        </span>{" "}
        <span className="text-faint">
          {others.length > 0
            ? `Hearing ${others.length} ${others.length === 1 ? "person" : "people"}.`
            : "Nobody else is talking."}
        </span>
      </p>

      <FlowReadout />
    </div>
  );
}

/**
 * Where the audio actually gets to, counted at both ends.
 *
 * "Nobody can hear me" has several very different causes — audio that never
 * left this browser, audio that left and never arrived, audio that arrived and
 * was never handed to Discord — and they are indistinguishable from the outside.
 * These four numbers tell them apart at a glance.
 */
function FlowReadout() {
  const flow = useBridge((state) => state.flow);
  const encoding = useBridge((state) => state.encoding);
  if (!flow) return null;

  const problem =
    flow.sent === 0
      ? "Nothing is leaving this browser — is the microphone on, or a file playing?"
      : flow.received === 0
        ? "Audio is leaving this browser but not reaching the bridge."
        : flow.delivered === 0
          ? flow.refused > 0
            ? `The bridge cannot send: its voice connection is ${flow.connection}.`
            : "The bridge is receiving audio but not putting it on the wire."
          : null;

  return (
    <div className="mt-1.5 rounded bg-raised/60 px-2 py-1">
      <dl className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
        <Count label="sent" value={flow.sent} />
        <Count label="bridge" value={flow.received} />
        <Count label="discord" value={flow.delivered} />
        <Count label="heard" value={flow.incoming} muted />
      </dl>
      <p className="mt-0.5 text-center font-mono text-[9px] text-faint">
        {encoding === "opus" ? "opus from this browser" : "pcm, encoded by the bridge"}
        {flow.dropped > 0 ? ` · ${flow.dropped}/s dropped` : ""}
        {flow.underruns > 0 ? ` · ${flow.underruns}/s starved` : ""}
        {flow.connection !== "ready" ? ` · link ${flow.connection}` : ""}
      </p>
      {problem && <p className="mt-1 text-[10px] leading-snug text-amber">{problem}</p>}
    </div>
  );
}

function Count({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <dd className={value > 0 ? (muted ? "text-muted" : "text-online") : "text-danger"}>
        {value}
        <span className="text-faint">/s</span>
      </dd>
      <dt className="text-[9px] text-faint">{label}</dt>
    </div>
  );
}

function Slider({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mt-1 flex items-center gap-2 px-1 text-[10px] text-faint">
      <span className="w-8 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 flex-1 accent-accent"
        aria-label={`${label} volume`}
      />
      <span className="w-8 shrink-0 text-right font-mono">{Math.round(value * 100)}%</span>
    </label>
  );
}
