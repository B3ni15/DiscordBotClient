import { PassThrough } from "node:stream";
import {
  EndBehaviorType,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import { FRAME_BYTES, decodeOutgoingAudio, encodeIncomingAudio } from "./protocol.mjs";

/** How much unsent audio may pile up before frames are dropped instead of delayed. */
const MAX_QUEUED_FRAMES = 10;
/** Stop feeding a browser that is not keeping up rather than growing its socket buffer. */
const MAX_SOCKET_BACKLOG = FRAME_BYTES * 50;
/** How long to wait for Discord to finish the voice handshake. */
const READY_TIMEOUT_MS = 20_000;

/**
 * One browser connection and the Discord voice connection it drives.
 *
 * The browser keeps the bot token and the gateway socket; this worker never
 * sees either. It asks the browser to send the voice-state payloads it needs
 * (`op 4`) and is handed the answers back, which is all @discordjs/voice
 * requires to open the UDP session a page cannot open for itself.
 */
export class Session {
  #socket;
  #log;
  #opus;
  #id;

  /** The callbacks @discordjs/voice gave us to feed gateway events into. */
  #adapter = null;
  #connection = null;
  #player = null;
  /** The browser's microphone and file audio, on its way to Discord. */
  #pcm = null;
  #decoders = new Map();

  constructor(socket, { log, opus, id }) {
    this.#socket = socket;
    this.#log = log;
    this.#opus = opus;
    this.#id = id;
  }

  handleMessage(data, isBinary) {
    if (isBinary) {
      const pcm = decodeOutgoingAudio(data);
      if (pcm) this.#writeAudio(pcm);
      return;
    }

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      this.#send({ t: "error", message: "Malformed message." });
      return;
    }

    switch (message.t) {
      case "join":
        this.#join(message).catch((cause) => this.#fail(cause, "Could not join the voice channel."));
        break;
      case "update":
        this.#update(message);
        break;
      case "leave":
        this.close("left");
        this.#send({ t: "status", state: "idle" });
        break;
      // The browser's gateway answering the payloads we asked it to send.
      case "voice-state":
        this.#adapter?.onVoiceStateUpdate(message.d);
        break;
      case "voice-server":
        this.#adapter?.onVoiceServerUpdate(message.d);
        break;
      case "ping":
        this.#send({ t: "pong" });
        break;
      default:
        this.#send({ t: "error", message: `Unknown message "${message.t}".` });
    }
  }

  async #join({ guildId, channelId, selfMute = false, selfDeaf = false }) {
    if (!guildId || !channelId) {
      this.#send({ t: "error", message: "join needs a guildId and a channelId." });
      return;
    }
    // A fresh connection per join keeps a half-open previous one from lingering.
    this.close("rejoining");
    this.#send({ t: "status", state: "connecting" });

    const connection = joinVoiceChannel({
      guildId,
      channelId,
      selfMute,
      selfDeaf,
      // Sessions share this process, so each one gets its own registry group.
      group: this.#id,
      adapterCreator: (methods) => {
        this.#adapter = methods;
        return {
          sendPayload: (payload) => {
            // The browser owns the gateway socket; it sends this verbatim.
            this.#send({ t: "gateway", payload });
            return this.#socket.readyState === this.#socket.OPEN;
          },
          destroy: () => {
            this.#adapter = null;
          },
        };
      },
    });
    this.#connection = connection;

    connection.on("error", (cause) => this.#log(`voice connection error: ${cause.message}`));
    connection.on(VoiceConnectionStatus.Disconnected, () => this.#handleDisconnect(connection));
    connection.on(VoiceConnectionStatus.Destroyed, () => this.#send({ t: "status", state: "idle" }));

    await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);

    this.#startSending(connection);
    this.#startReceiving(connection);
    this.#send({ t: "status", state: "ready", guildId, channelId });
  }

  /** Mute, deafen or move without tearing the UDP session down. */
  #update({ channelId, selfMute, selfDeaf }) {
    if (!this.#connection) return;
    const current = this.#connection.joinConfig;
    this.#connection.rejoin({
      channelId: channelId ?? current.channelId,
      selfMute: selfMute ?? current.selfMute,
      selfDeaf: selfDeaf ?? current.selfDeaf,
    });
  }

  /**
   * Discord drops a voice connection on its own from time to time. The browser
   * still holds the gateway, so a rejoin usually succeeds; if it does not, the
   * connection is torn down and the browser told, rather than left half alive.
   */
  async #handleDisconnect(connection) {
    this.#send({ t: "status", state: "reconnecting" });
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      this.close("disconnected");
      this.#send({ t: "status", state: "idle" });
    }
  }

  /**
   * The browser's audio, on its way out. One long-lived stream is fed 20 ms at
   * a time, so muting and unmuting never has to build a new resource: the page
   * simply sends silence.
   */
  #startSending(connection) {
    this.#pcm = new PassThrough({ highWaterMark: FRAME_BYTES * MAX_QUEUED_FRAMES });
    this.#player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    this.#player.on("error", (cause) => this.#log(`player error: ${cause.message}`));
    this.#player.play(createAudioResource(this.#pcm, { inputType: StreamType.Raw }));
    connection.subscribe(this.#player);
  }

  #writeAudio(pcm) {
    if (!this.#pcm) return;
    // Late audio is worse than missing audio: drop rather than queue.
    if (this.#pcm.writableLength > FRAME_BYTES * MAX_QUEUED_FRAMES) return;
    this.#pcm.write(pcm);
  }

  /**
   * Everyone else's audio, on its way in. Discord hands over one Opus stream
   * per speaker; each is decoded on its own codec and forwarded tagged with the
   * user it came from, so the page can mix and meter them separately.
   */
  #startReceiving(connection) {
    const receiver = connection.receiver;

    receiver.speaking.on("start", (userId) => {
      this.#send({ t: "speaking", userId, speaking: true });
      if (receiver.subscriptions.has(userId)) return;

      const stream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 400 },
      });
      const decoder = this.#opus.createDecoder();
      this.#decoders.set(userId, decoder);

      stream.on("data", (packet) => {
        if (this.#socket.bufferedAmount > MAX_SOCKET_BACKLOG) return;
        try {
          this.#sendBinary(encodeIncomingAudio(userId, decoder.decode(packet)));
        } catch (cause) {
          this.#log(`could not decode audio from ${userId}: ${cause.message}`);
        }
      });
      const cleanup = () => {
        decoder.destroy();
        this.#decoders.delete(userId);
      };
      stream.once("end", cleanup);
      stream.once("error", cleanup);
    });

    receiver.speaking.on("end", (userId) => this.#send({ t: "speaking", userId, speaking: false }));
  }

  #fail(cause, fallback) {
    this.#log(`${fallback} ${cause?.message ?? ""}`.trim());
    this.close("failed");
    this.#send({ t: "error", message: cause?.message ? `${fallback} ${cause.message}` : fallback });
    this.#send({ t: "status", state: "idle" });
  }

  /** Tears the Discord side down; the browser socket itself stays open. */
  close(reason) {
    if (this.#connection) this.#log(`voice connection closed (${reason})`);
    this.#player?.stop(true);
    this.#pcm?.end();
    for (const decoder of this.#decoders.values()) decoder.destroy();
    this.#decoders.clear();
    try {
      this.#connection?.destroy();
    } catch {
      // Already destroyed by @discordjs/voice itself.
    }
    this.#connection = null;
    this.#player = null;
    this.#pcm = null;
  }

  #send(message) {
    if (this.#socket.readyState === this.#socket.OPEN) this.#socket.send(JSON.stringify(message));
  }

  #sendBinary(frame) {
    if (this.#socket.readyState === this.#socket.OPEN) this.#socket.send(frame, { binary: true });
  }
}
