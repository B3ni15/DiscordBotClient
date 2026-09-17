"use client";

import { create } from "zustand";
import { VoiceAudioEngine, type Encoding } from "./audioEngine";

/**
 * The client half of the voice bridge.
 *
 * The bridge is a small worker that exists for one reason: a page cannot open
 * the UDP socket Discord's voice servers exchange Opus frames over. Everything
 * else stays here — the bot token, the gateway connection and all the audio
 * handling — and the worker is handed only the voice handshake payloads it has
 * to relay, plus the sound itself.
 *
 * By default that worker is this same deployment, at `/api/voice/bridge`, so
 * nothing has to be installed or started to talk. A deployment's functions run
 * for a limited time, so the hosted worker warns the page before its instance
 * expires and the call is resumed on a new one; pointing the address below at a
 * self-hosted `bridge/` removes that limit.
 *
 * So the bot really does speak and really does hear; what crosses the wire to
 * the worker is plain PCM, and the worker sends `op 4` back through this page's
 * own gateway rather than opening one of its own.
 */

const SETTINGS_KEY = "disbotclient:voiceBridge";
/** Binary tags, matching `bridge/src/protocol.mjs`. */
const AUDIO_OUT = 0x01;
const AUDIO_IN = 0x02;
const AUDIO_OUT_OPUS = 0x03;
/** Beyond this the network is the bottleneck; dropping beats growing a queue. */
const MAX_SOCKET_BACKLOG = 200_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000];
/** Our own close code for "this worker is about to expire, come straight back". */
const EXPIRED_CLOSE_CODE = 4002;
/** How long Discord is given to forget the old voice session before rejoining. */
const RESUME_GAP_MS = 400;

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
  /** True while the worker in use is this deployment rather than a self-hosted one. */
  hosted: boolean;
  /** Set while a call is being moved onto a fresh worker instance. */
  resuming: boolean;
  micEnabled: boolean;
  micVolume: number;
  outputVolume: number;
  /** Whether a file being played is also heard in this browser. */
  monitor: boolean;
  /** User ids currently talking, as the worker hears them. */
  speaking: string[];
  /** Whether this browser encodes the audio or the worker has to. */
  encoding: Encoding;
  /**
   * What each side has actually seen lately. The point of showing it is that
   * "nobody can hear me" has two very different causes, and this tells them
   * apart: audio that never left the browser, or audio that left and went
   * nowhere.
   */
  flow: {
    /** Packets a second this page sent. */
    sent: number;
    /** Packets a second the worker received. */
    received: number;
    /** Packets a second the worker handed to Discord. */
    delivered: number;
    /** Packets a second arriving from the channel. */
    incoming: number;
    /** Dropped on either side, a second. */
    dropped: number;
    /** What the worker's audio player is doing. */
    player: string;
  } | null;
  nowPlaying: { name: string; loop: boolean } | null;
}

export const useBridge = create<BridgeState>(() => ({
  url: "",
  autoConnect: false,
  status: "off",
  voice: "idle",
  error: null,
  opus: null,
  hosted: true,
  resuming: false,
  micEnabled: false,
  micVolume: 1,
  outputVolume: 1,
  monitor: false,
  speaking: [],
  encoding: "pcm",
  flow: null,
  nowPlaying: null,
}));

let socket: WebSocket | null = null;
let engine: VoiceAudioEngine | null = null;
/** Set while the page, rather than the network, closed the socket. */
let closedByUser = false;
let reconnectAttempt = 0;
let sendGatewayPayload: ((payload: unknown) => void) | null = null;
/** Where the client store's idea of the current call is read from. */
let readActiveCall: (() => ActiveCall | null) | null = null;
/** The call to put back together if the worker's instance goes away. */
let lastJoin: { guildId: string; channelId: string; selfMute: boolean; selfDeaf: boolean } | null =
  null;
/** Whether the microphone was open before the worker went away. */
let micWasOpen = false;
/** Counted since the last report from the worker, to show both ends at once. */
let sentPackets = 0;
let sentDropped = 0;

/**
 * How the worker reaches Discord's gateway: it cannot, so it asks this page to
 * send the payload on the socket it already has. The client store registers the
 * sender when it signs in.
 */
export function setGatewaySender(sender: ((payload: unknown) => void) | null) {
  sendGatewayPayload = sender;
}

/** A call this bot is already in, as the client store knows it. */
export interface ActiveCall {
  guildId: string;
  channelId: string;
  selfMute: boolean;
  selfDeaf: boolean;
}

/**
 * Lets the worker pick up a call that was already running.
 *
 * Joining a channel works without the bridge, so the bot can easily be sitting
 * in one by the time the worker connects — after a page reload, or when the
 * bridge is started mid-call. Without this the bot would sit there hearing and
 * saying nothing, with nothing to explain why.
 */
export function setActiveCallProvider(provider: (() => ActiveCall | null) | null) {
  readActiveCall = provider;
}

export function bridgeConnected(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}

/**
 * While a call is being moved to a fresh worker instance the bot briefly leaves
 * the channel, because Discord only hands out a new voice server when it
 * (re-)joins one. The client store reads this so the UI does not flicker.
 */
export function resumingVoice(): boolean {
  return useBridge.getState().resuming;
}

/** This deployment's own worker: no setup, and no address to paste anywhere. */
export function hostedBridgeUrl(): string {
  if (typeof location === "undefined") return "";
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/voice/bridge`;
}

// Settings -------------------------------------------------------------------

export function loadBridgeSettings() {
  // Nothing stored yet means the hosted worker, connected automatically: voice
  // should work on a fresh browser without anyone configuring anything.
  useBridge.setState({ url: hostedBridgeUrl(), autoConnect: true, hosted: true });
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored) as Partial<BridgeState>;
    const url = typeof parsed.url === "string" && parsed.url ? parsed.url : hostedBridgeUrl();
    useBridge.setState({
      url,
      hosted: url === hostedBridgeUrl(),
      autoConnect: parsed.autoConnect !== false,
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
  if (settings.url !== undefined) {
    useBridge.setState({ hosted: settings.url === hostedBridgeUrl() });
  }
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

  // The audio graph is deliberately not built here: browsers only allow an
  // AudioContext to start from a user gesture, and connecting happens on its
  // own at sign-in. Joining a channel or opening the microphone builds it, and
  // both of those are clicks.

  try {
    socket = new WebSocket(target);
  } catch {
    useBridge.setState({ status: "error", error: "That bridge address is not a valid URL." });
    return;
  }
  socket.binaryType = "arraybuffer";

  let everOpened = false;
  socket.onopen = () => {
    everOpened = true;
    reconnectAttempt = 0;
    useBridge.setState({ status: "connected", error: null });
    // A call that was interrupted by an expiring worker picks up here, as does
    // one that was already running before this worker was reached at all.
    lastJoin ??= readActiveCall?.() ?? null;
    if (lastJoin) void resumeCall();
  };
  socket.onmessage = (event) => handleMessage(event.data);
  socket.onerror = () => {
    // onclose carries the detail; this only marks that it was not a clean end.
    useBridge.setState({ error: "Could not reach the voice bridge. Is it running?" });
  };
  socket.onclose = (event) => {
    socket = null;
    micWasOpen = useBridge.getState().micEnabled;
    useBridge.setState({ status: "off", voice: "idle", speaking: [] });
    engine?.clearIncoming();
    if (closedByUser) return;

    if (event.code === 4001) {
      useBridge.setState({ status: "error", error: "The bridge rejected the secret in the URL." });
      return;
    }
    // A handshake that never completed usually means the address answered with
    // an ordinary HTTP error, which the WebSocket API hides; it is worth asking.
    if (!everOpened) void explainFailure(target);
    // A worker that warned it was expiring is expected back at once; anything
    // else backs off.
    const delay = event.code === EXPIRED_CLOSE_CODE ? 0 : RECONNECT_DELAYS_MS[reconnectAttempt];
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
  lastJoin = null;
  micWasOpen = false;
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
  lastJoin = {
    guildId,
    channelId,
    selfMute: options.selfMute ?? false,
    selfDeaf: options.selfDeaf ?? false,
  };
  useBridge.setState({ voice: "connecting" });
  send({ t: "join", ...lastJoin });
}

/**
 * Puts a call back together on a fresh worker instance.
 *
 * Discord only hands out a voice server when a member joins a channel, so
 * re-entering it is the only way to get one: the bot leaves and immediately
 * comes back. The gap is a moment long, and `resuming` keeps the UI from
 * reporting it as having left.
 */
async function resumeCall(): Promise<void> {
  const join = lastJoin;
  if (!join) return;

  useBridge.setState({ resuming: true, voice: "connecting" });
  sendGatewayPayload?.({
    op: 4,
    d: {
      guild_id: join.guildId,
      channel_id: null,
      self_mute: join.selfMute,
      self_deaf: join.selfDeaf,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, RESUME_GAP_MS));

  // The user may have hung up while this was waiting.
  if (!lastJoin || socket?.readyState !== WebSocket.OPEN) {
    useBridge.setState({ resuming: false });
    return;
  }
  send({ t: "join", ...lastJoin });
  useBridge.setState({ resuming: false });
  if (micWasOpen) await setMicrophone(true).catch(() => {});
}

/** Mute, deafen or move without rebuilding the voice connection. */
export function bridgeUpdate(options: {
  channelId?: string;
  selfMute?: boolean;
  selfDeaf?: boolean;
}) {
  send({ t: "update", ...options });
  // Remembered too, so a resumed call comes back muted if it was muted.
  if (lastJoin) lastJoin = { ...lastJoin, ...stripUndefined(options) };
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
  lastJoin = null;
  micWasOpen = false;
  send({ t: "leave" });
  engine?.clearIncoming();
  engine?.stopFile();
  // The microphone is released rather than left open: a browser that keeps
  // showing a recording indicator outside a call is alarming, and rightly so.
  void engine?.setMicrophone(false).catch(() => {});
  useBridge.setState({ voice: "idle", speaking: [], nowPlaying: null, micEnabled: false, flow: null });
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

/**
 * Asks the bridge address over plain HTTP why it refused to be a WebSocket.
 * The route answers refusals in words, so this turns "lost the voice bridge"
 * into something the user can act on.
 */
async function explainFailure(target: string) {
  try {
    const response = await fetch(target.replace(/^ws/, "http"), { method: "GET" });
    const body = (await response.text()).trim();
    if (!response.ok && body) useBridge.setState({ error: body.slice(0, 300) });
  } catch {
    // Unreachable entirely, which the existing message already covers.
  }
}

async function ensureEngine(): Promise<VoiceAudioEngine> {
  if (engine?.running) return engine;
  const audio = new VoiceAudioEngine({
    onPacket: sendOpusPacket,
    onFrame: sendPcmFrame,
    onFileEnded: () => useBridge.setState({ nowPlaying: null }),
    onEncodingChange: (encoding) => useBridge.setState({ encoding }),
  });
  await audio.start();
  const { micVolume, outputVolume, monitor } = useBridge.getState();
  audio.setMicVolume(micVolume);
  audio.setOutputVolume(outputVolume);
  audio.setMonitor(monitor);
  useBridge.setState({ encoding: audio.encoding });
  engine = audio;
  return audio;
}

function applyMicVolume(muted: boolean) {
  engine?.setMicVolume(muted ? 0 : useBridge.getState().micVolume);
}

/** An Opus packet this browser encoded: Discord receives it exactly as it is. */
function sendOpusPacket(packet: Uint8Array) {
  sendTagged(AUDIO_OUT_OPUS, packet);
}

/** The same 20 ms as PCM, for a browser that has no encoder of its own. */
function sendPcmFrame(pcm: Int16Array) {
  sendTagged(AUDIO_OUT, new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

function sendTagged(tag: number, body: Uint8Array) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  if (useBridge.getState().voice !== "ready") return;
  // Late audio is worse than missing audio, so a backed-up socket drops frames.
  if (socket.bufferedAmount > MAX_SOCKET_BACKLOG) {
    sentDropped += 1;
    return;
  }

  const frame = new Uint8Array(1 + body.byteLength);
  frame[0] = tag;
  frame.set(body, 1);
  socket.send(frame);
  sentPackets += 1;
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
      useBridge.setState({
        opus: typeof message.opus === "string" ? message.opus : null,
        hosted: message.hosted === true,
      });
      break;
    case "expiring":
      // The worker's instance is about to reach its time limit. Going first
      // means the gap is a reconnect of our choosing rather than a cut-off.
      socket?.close(EXPIRED_CLOSE_CODE, "worker expiring");
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
    case "stats": {
      const perSecond = (value: unknown) =>
        Math.round((Number(value) || 0) / ((Number(message.overMs) || 1_000) / 1_000));
      useBridge.setState({
        flow: {
          sent: Math.round(sentPackets / ((Number(message.overMs) || 1_000) / 1_000)),
          received: perSecond(message.framesIn),
          delivered: perSecond(message.packetsOut),
          incoming: perSecond(message.packetsIn),
          dropped: perSecond(message.dropped) + Math.round(sentDropped),
          player: String(message.player ?? "none"),
        },
      });
      sentPackets = 0;
      sentDropped = 0;
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

/** Keeps a remembered call from being overwritten with `undefined`s. */
function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function clamp(value: number, max = 1): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}
