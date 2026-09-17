"use client";

/**
 * The page's half of a real voice connection.
 *
 * Everything audible is assembled here with the Web Audio API: the microphone
 * and any file being played are mixed into one stream, cut into the 20 ms
 * blocks Discord's Opus encoder wants and handed to the bridge, while audio
 * coming back from the bridge is queued per speaker and played out.
 *
 * Keeping the mixing in the browser means the bridge never needs ffmpeg or any
 * media handling of its own: whatever this browser can decode, the bot can play.
 */

const SAMPLE_RATE = 48_000;
const CAPTURE_MODULE = "/voice/capture-worklet.js";
const PLAYBACK_MODULE = "/voice/playback-worklet.js";

export interface EngineHandlers {
  /** One 20 ms block of interleaved 16-bit stereo, ready for the bridge. */
  onFrame: (pcm: Int16Array) => void;
  /** The file being played reached its end on its own. */
  onFileEnded?: () => void;
}

export interface MicOptions {
  deviceId?: string;
  /** Discord's own defaults; all three are worth having when speakers are open. */
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export class VoiceAudioEngine {
  #handlers: EngineHandlers;
  #context: AudioContext | null = null;

  #mixBus: GainNode | null = null;
  #micGain: GainNode | null = null;
  #fileGain: GainNode | null = null;
  /** Plays the file out of this browser's speakers as well, when asked. */
  #monitorGain: GainNode | null = null;
  #outputGain: GainNode | null = null;

  #capture: AudioWorkletNode | null = null;
  #playback: AudioWorkletNode | null = null;

  #micStream: MediaStream | null = null;
  #micSource: MediaStreamAudioSourceNode | null = null;
  #file: AudioBufferSourceNode | null = null;

  constructor(handlers: EngineHandlers) {
    this.#handlers = handlers;
  }

  get running(): boolean {
    return this.#context !== null;
  }

  /**
   * Builds the graph. Must be called from a user gesture: browsers refuse to
   * start an AudioContext without one.
   */
  async start(): Promise<void> {
    if (this.#context) return;

    const context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" });
    this.#context = context;
    await context.audioWorklet.addModule(CAPTURE_MODULE);
    await context.audioWorklet.addModule(PLAYBACK_MODULE);
    if (context.state === "suspended") await context.resume();

    this.#mixBus = context.createGain();
    this.#micGain = context.createGain();
    this.#fileGain = context.createGain();
    this.#monitorGain = context.createGain();
    this.#outputGain = context.createGain();
    this.#monitorGain.gain.value = 0;

    this.#micGain.connect(this.#mixBus);
    this.#fileGain.connect(this.#mixBus);
    this.#fileGain.connect(this.#monitorGain);
    this.#monitorGain.connect(context.destination);

    this.#capture = new AudioWorkletNode(context, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    this.#capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) =>
      this.#handlers.onFrame(new Int16Array(event.data));
    this.#mixBus.connect(this.#capture);

    // A node only runs while it reaches the destination, and the capture node's
    // own output must stay inaudible — hence a gain of zero rather than no path.
    const silence = context.createGain();
    silence.gain.value = 0;
    this.#capture.connect(silence).connect(context.destination);

    this.#playback = new AudioWorkletNode(context, "pcm-playback", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.#playback.connect(this.#outputGain).connect(context.destination);
  }

  /** Opens or closes the microphone; the graph keeps running either way. */
  async setMicrophone(enabled: boolean, options: MicOptions = {}): Promise<void> {
    if (!this.#context || !this.#micGain) throw new Error("The audio engine is not running.");

    this.#micSource?.disconnect();
    this.#micSource = null;
    for (const track of this.#micStream?.getTracks() ?? []) track.stop();
    this.#micStream = null;
    if (!enabled) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        echoCancellation: options.echoCancellation ?? true,
        noiseSuppression: options.noiseSuppression ?? true,
        autoGainControl: options.autoGainControl ?? true,
      },
    });
    this.#micStream = stream;
    this.#micSource = this.#context.createMediaStreamSource(stream);
    this.#micSource.connect(this.#micGain);
  }

  get microphoneOpen(): boolean {
    return this.#micStream !== null;
  }

  /** The microphones this browser will admit to having, once permission exists. */
  static async inputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "audioinput");
  }

  /**
   * Decodes a file here and plays it into the mix. Anything this browser can
   * decode works — MP3, OGG, WAV, FLAC, M4A — with no length limit of the kind
   * the soundboard has.
   */
  async playFile(file: File, options: { loop?: boolean } = {}): Promise<number> {
    if (!this.#context || !this.#fileGain) throw new Error("The audio engine is not running.");

    const buffer = await this.#context.decodeAudioData(await file.arrayBuffer());
    this.stopFile();

    const source = this.#context.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.connect(this.#fileGain);
    source.onended = () => {
      if (this.#file === source) {
        this.#file = null;
        this.#handlers.onFileEnded?.();
      }
    };
    source.start();
    this.#file = source;
    return buffer.duration;
  }

  stopFile() {
    if (!this.#file) return;
    const source = this.#file;
    // Cleared first so the handler does not report this as the file ending.
    this.#file = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    source.disconnect();
  }

  get filePlaying(): boolean {
    return this.#file !== null;
  }

  /** Audio from one speaker in the channel, as decoded PCM. */
  pushIncoming(userId: string, pcm: Int16Array) {
    this.#playback?.port.postMessage({ type: "audio", userId, pcm: pcm.buffer }, [pcm.buffer]);
  }

  /** Throws away anything buffered, e.g. after leaving a channel. */
  clearIncoming() {
    this.#playback?.port.postMessage({ type: "clear" });
  }

  /** 0 mutes the microphone without closing it, which is what self-mute wants. */
  setMicVolume(volume: number) {
    if (this.#micGain) this.#micGain.gain.value = clamp(volume);
  }

  setFileVolume(volume: number) {
    if (this.#fileGain) this.#fileGain.gain.value = clamp(volume);
  }

  /** Whether files being played are also heard in this browser. */
  setMonitor(monitor: boolean) {
    if (this.#monitorGain) this.#monitorGain.gain.value = monitor ? 1 : 0;
  }

  setOutputVolume(volume: number) {
    if (this.#outputGain) this.#outputGain.gain.value = clamp(volume, 2);
  }

  async stop(): Promise<void> {
    this.stopFile();
    await this.setMicrophone(false).catch(() => {});
    this.#capture?.port.postMessage({ type: "stop" });
    this.#capture?.disconnect();
    this.#playback?.disconnect();
    const context = this.#context;
    this.#context = null;
    this.#capture = null;
    this.#playback = null;
    this.#mixBus = null;
    this.#micGain = null;
    this.#fileGain = null;
    this.#monitorGain = null;
    this.#outputGain = null;
    await context?.close().catch(() => {});
  }
}

function clamp(value: number, max = 1): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}
