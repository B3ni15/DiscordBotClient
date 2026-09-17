"use client";

import { create } from "zustand";
import { VoiceAudioEngine } from "./audioEngine";

/**
 * The client half of the voice bridge.
 *
 * The bridge is a small worker the user runs next to the browser (see
 * `bridge/` in this repository). It exists for one reason: a page cannot open
 * the UDP socket Discord's voice servers exchange Opus frames over. Everything
 * else stays here — the bot token, the gateway connection and all the audio
 * handling — and the worker is handed only the voice handshake payloads it has
 * to relay, plus the sound itself.
 *
 * So the bot really does speak and really does hear; what crosses the wire to
 * the worker is plain PCM, and the worker sends `op 4` back through this page's
 * own gateway rather than opening one of its own.
 */

const SETTINGS_KEY = "disbotclient:voiceBridge";
/** Binary tags, matching `bridge/src/protocol.mjs`. */
const AUDIO_OUT = 0x01;
const AUDIO_IN = 0x02;
/** Beyond this the network is the bottleneck; dropping beats growing a queue. */
const MAX_SOCKET_BACKLOG = 200_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000];

export type BridgeStatus = "off" | "connecting" | "connected" | "error";
/** What the worker reports about the Discord voice connection itself. */
export type BridgeVoiceState = "idle" | "connecting" | "ready" | "reconnecting";

export interface BridgeState {
  /** Where the worker listens, secret included; empty until configured. */
  url: string;
  /** Connect as soon as the client signs in. */
  autoConnect: boolean;
  status: BridgeStatus;
  voice: BridgeVoiceState;
  error: string | null;
  /** Which Opus library the worker found; useful when a native build is missing. */
  opus: string | null;
  micEnabled: boolean;
  micVolume: number;
  outputVolume: number;
  /** Whether a file being played is also heard in this browser. */
  monitor: boolean;
  /** User ids currently talking, as the worker hears them. */
  speaking: string[];
  nowPlaying: { name: string; loop: boolean } | null;
}

export const useBridge = create<BridgeState>(() => ({
  url: "",
  autoConnect: false,
  status: "off",
  voice: "idle",
  error: null,
  opus: null,
  micEnabled: false,
  micVolume: 1,
  outputVolume: 1,
  monitor: false,
  speaking: [],
  nowPlaying: null,
}));

let socket: WebSocket | null = null;
let engine: VoiceAudioEngine | null = null;
/** Set while the page, rather than the network, closed the socket. */
let closedByUser = false;
let reconnectAttempt = 0;
let sendGatewayPayload: ((payload: unknown) => void) | null = null;

/**
 * How the worker reaches Discord's gateway: it cannot, so it asks this page to
 * send the payload on the socket it already has. The client store registers the
 * sender when it signs in.
 */
export function setGatewaySender(sender: ((payload: unknown) => void) | null) {
  sendGatewayPayload = sender;
}

export function bridgeConnected(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}

// Settings -------------------------------------------------------------------

export function loadBridgeSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored) as Partial<BridgeState>;
    useBridge.setState({
      url: typeof parsed.url === "string" ? parsed.url : "",
      autoConnect: parsed.autoConnect === true,
      micVolume: clamp(parsed.micVolume ?? 1),
      outputVolume: clamp(parsed.outputVolume ?? 1, 2),
      monitor: parsed.monitor === true,
    });
  } catch {
    // A corrupted entry is not worth failing sign-in over.
  }
}

export function saveBridgeSettings(settings: Partial<BridgeState>) {
  useBridge.setState(settings);
  const { url, autoConnect, micVolume, outputVolume, monitor } = useBridge.getState();
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ url, autoConnect, micVolume, outputVolume, monitor }),
    );
  } catch {
    // Private browsing; the settings simply do not persist.
  }
}

// Connection -----------------------------------------------------------------

export async function connectBridge(url?: string): Promise<void> {
  const target = (url ?? useBridge.getState().url).trim();
  if (!target) {
    useBridge.setState({ status: "error", error: "No bridge address configured." });
    return;
  }
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  closedByUser = false;
  useBridge.setState({ status: "connecting", error: null });

  // Started here, while the click that called this is still fresh: a browser
  // refuses to open an AudioContext without a user gesture behind it.
  try {
    await ensureEngine();
  } catch (cause) {
    useBridge.setState({
      status: "error",
      error: cause instanceof Error ? cause.message : "Could not start audio in this browser.",
    });
    return;
  }

  try {
    socket = new WebSocket(target);
  } catch {
    useBridge.setState({ status: "error", error: "That bridge address is not a valid URL." });
    return;
  }
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    reconnectAttempt = 0;
    useBridge.setState({ status: "connected", error: null });
  };
  socket.onmessage = (event) => handleMessage(event.data);
  socket.onerror = () => {
    // onclose carries the detail; this only marks that it was not a clean end.
    useBridge.setState({ error: "Could not reach the voice bridge. Is it running?" });
  };
  socket.onclose = (event) => {
    socket = null;
    useBridge.setState({ status: "off", voice: "idle", speaking: [] });
    engine?.clearIncoming();
    if (closedByUser) return;

    if (event.code === 4001) {
      useBridge.setState({ status: "error", error: "The bridge rejected the secret in the URL." });
      return;
    }
    const delay = RECONNECT_DELAYS_MS[reconnectAttempt];
    if (delay === undefined) {
      useBridge.setState({ status: "error", error: "Lost the voice bridge." });
      return;
    }
    reconnectAttempt += 1;
    useBridge.setState({ status: "connecting" });
    setTimeout(() => {
      if (!closedByUser) void connectBridge(target);
    }, delay);
  };
}

export async function disconnectBridge(): Promise<void> {
  closedByUser = true;
  socket?.close(1000);
  socket = null;
  useBridge.setState({ status: "off", voice: "idle", speaking: [], nowPlaying: null, micEnabled: false });
  await engine?.stop();
  engine = null;
}

// Calls ----------------------------------------------------------------------

export function bridgeJoin(
  guildId: string,
  channelId: string,
  options: { selfMute?: boolean; selfDeaf?: boolean } = {},
) {
  void ensureEngine();
  useBridge.setState({ voice: "connecting" });
  send({
    t: "join",
    guildId,
    channelId,
    selfMute: options.selfMute ?? false,
    selfDeaf: options.selfDeaf ?? false,
  });
}

/** Mute, deafen or move without rebuilding the voice connection. */
export function bridgeUpdate(options: {
  channelId?: string;
  selfMute?: boolean;
  selfDeaf?: boolean;
}) {
  send({ t: "update", ...options });
  // Muting keeps the microphone open and sends silence, so unmuting is instant.
  if (options.selfMute !== undefined) applyMicVolume(options.selfMute);
  // Deafening is a flag to Discord, but it should also mean this browser goes
  // quiet, so what the bot "hears" matches what it tells the channel.
  if (options.selfDeaf !== undefined) {
    engine?.setOutputVolume(options.selfDeaf ? 0 : useBridge.getState().outputVolume);
    if (options.selfDeaf) engine?.clearIncoming();
  }
}

export function bridgeLeave() {
  send({ t: "leave" });
  engine?.clearIncoming();
  engine?.stopFile();
  // The microphone is released rather than left open: a browser that keeps
  // showing a recording indicator outside a call is alarming, and rightly so.
  void engine?.setMicrophone(false).catch(() => {});
  useBridge.setState({ voice: "idle", speaking: [], nowPlaying: null, micEnabled: false });
}

/** The bot's own voice state, straight off this page's gateway. */
export function feedVoiceState(data: unknown) {
  send({ t: "voice-state", d: data });
}

/** The voice server Discord picked for the call. */
export function feedVoiceServer(data: unknown) {
  send({ t: "voice-server", d: data });
}

// Audio ----------------------------------------------------------------------

export async function setMicrophone(enabled: boolean, deviceId?: string): Promise<void> {
  const audio = await ensureEngine();
  await audio.setMicrophone(enabled, { deviceId });
  useBridge.setState({ micEnabled: enabled });
}

export function setMicVolume(volume: number) {
  saveBridgeSettings({ micVolume: clamp(volume) });
  applyMicVolume(false);
}

export function setOutputVolume(volume: number) {
  const value = clamp(volume, 2);
  saveBridgeSettings({ outputVolume: value });
  engine?.setOutputVolume(value);
}

export function setMonitor(monitor: boolean) {
  saveBridgeSettings({ monitor });
  engine?.setMonitor(monitor);
}

/**
 * Plays a local audio file into the channel. The browser decodes it, so any
 * format it can play works and there is no length limit — unlike the soundboard,
 * which Discord caps at a few seconds.
 */
export async function playFile(file: File, options: { loop?: boolean } = {}): Promise<void> {
  const audio = await ensureEngine();
  await audio.playFile(file, options);
  useBridge.setState({ nowPlaying: { name: file.name, loop: options.loop ?? false } });
}

export function stopFile() {
  engine?.stopFile();
  useBridge.setState({ nowPlaying: null });
}

// Internals ------------------------------------------------------------------

async function ensureEngine(): Promise<VoiceAudioEngine> {
  if (engine?.running) return engine;
  const audio = new VoiceAudioEngine({
    onFrame: sendAudio,
    onFileEnded: () => useBridge.setState({ nowPlaying: null }),
  });
  await audio.start();
  const { micVolume, outputVolume, monitor } = useBridge.getState();
  audio.setMicVolume(micVolume);
  audio.setOutputVolume(outputVolume);
  audio.setMonitor(monitor);
  engine = audio;
  return audio;
}

function applyMicVolume(muted: boolean) {
  engine?.setMicVolume(muted ? 0 : useBridge.getState().micVolume);
}

function sendAudio(pcm: Int16Array) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  if (useBridge.getState().voice !== "ready") return;
  // Late audio is worse than missing audio, so a backed-up socket drops frames.
  if (socket.bufferedAmount > MAX_SOCKET_BACKLOG) return;

  const frame = new Uint8Array(1 + pcm.byteLength);
  frame[0] = AUDIO_OUT;
  frame.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 1);
  socket.send(frame);
}

function handleMessage(data: string | ArrayBuffer) {
  if (data instanceof ArrayBuffer) {
    handleIncomingAudio(data);
    return;
  }

  let message: Record<string, unknown>;
  try {
    message = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }

  switch (message.t) {
    case "hello":
      useBridge.setState({ opus: typeof message.opus === "string" ? message.opus : null });
      break;
    case "gateway":
      // The worker has no gateway of its own; this page sends the payload.
      sendGatewayPayload?.(message.payload);
      break;
    case "status": {
      const state = message.state as BridgeVoiceState;
      useBridge.setState({ voice: state, ...(state === "idle" ? { speaking: [] } : {}) });
      if (state === "idle") engine?.clearIncoming();
      break;
    }
    case "speaking": {
      const userId = String(message.userId);
      useBridge.setState((current) => ({
        speaking: message.speaking
          ? current.speaking.includes(userId)
            ? current.speaking
            : [...current.speaking, userId]
          : current.speaking.filter((id) => id !== userId),
      }));
      break;
    }
    case "error":
      useBridge.setState({ error: String(message.message ?? "The voice bridge reported an error.") });
      break;
  }
}

function handleIncomingAudio(data: ArrayBuffer) {
  if (data.byteLength < 10) return;
  const view = new DataView(data);
  if (view.getUint8(0) !== AUDIO_IN) return;
  const userId = view.getBigUint64(1).toString();
  // Copied rather than viewed: the samples start on an odd byte offset.
  const pcm = new Int16Array(data.slice(9));
  engine?.pushIncoming(userId, pcm);
}

function send(message: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function clamp(value: number, max = 1): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}
