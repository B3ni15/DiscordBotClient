import {
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import { FRAME_BYTES, decodeOutgoingAudio, encodeIncomingAudio, isSilenceMarker } from "./protocol.mjs";
import { Transmitter } from "./transmitter.mjs";

/** How often the page is told what this side is actually seeing. */
const STATS_INTERVAL_MS = 2_000;
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
  /** The 20 ms clock that puts this browser's audio on the wire. */
  #transmitter = null;
  /** Only built for browsers that send PCM because they cannot encode Opus. */
  #encoder = null;
  /** Half-filled PCM, when a browser's frames do not line up with 20 ms. */
  #pending = null;
  #decoders = new Map();
  /** So a broken codec is reported once rather than once per failed packet. */
  #warnedDecodeFailure = false;
  #statsTimer = null;
  /** What this side has seen since the last report, for the page to display. */
  #counts = { framesIn: 0, packetsIn: 0 };

  constructor(socket, { log, opus, id }) {
    this.#socket = socket;
    this.#log = log;
    this.#opus = opus;
    this.#id = id;
    this.#startStats();
  }

  handleMessage(data, isBinary) {
    if (isBinary) {
      const frame = decodeOutgoingAudio(data);
      if (frame) this.#writeAudio(frame);
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
   * The browser's audio, on its way out: straight to the voice connection on a
   * clock of its own. `Transmitter` explains why that is not an audio player.
   */
  #startSending(connection) {
    this.#transmitter = new Transmitter(connection);
    this.#transmitter.start();
  }

  /** @param {{ kind: "opus" | "pcm", payload: Buffer }} frame */
  #writeAudio(frame) {
    // Counted before anything else: audio arriving with nowhere to go is
    // exactly the case the page needs to be able to see.
    this.#counts.framesIn += 1;
    const transmitter = this.#transmitter;
    if (!transmitter) return;

    if (frame.kind === "opus") {
      transmitter.push(frame.payload);
      return;
    }

    for (const block of this.#blocks(frame.payload)) {
      try {
        this.#encoder ??= this.#opus.createEncoder();
        transmitter.push(this.#encoder.encode(block));
      } catch (cause) {
        this.#log(`could not encode audio: ${cause.message}`);
        return;
      }
    }
  }

  /**
   * Cuts PCM into the exact 20 ms blocks Opus encodes, keeping whatever is left
   * over for the next frame. A browser that sends 20 ms at a time — all of
   * them, in practice — never leaves a remainder.
   */
  *#blocks(pcm) {
    let buffer = this.#pending ? Buffer.concat([this.#pending, pcm]) : pcm;
    let offset = 0;
    while (buffer.length - offset >= FRAME_BYTES) {
      yield buffer.subarray(offset, offset + FRAME_BYTES);
      offset += FRAME_BYTES;
    }
    this.#pending = offset < buffer.length ? Buffer.from(buffer.subarray(offset)) : null;
  }

  /**
   * A heartbeat of what this side has actually seen. Without it a page has no
   * way to tell "my audio never arrived" from "it arrived and went nowhere".
   */
  #startStats() {
    clearInterval(this.#statsTimer);
    this.#statsTimer = setInterval(() => {
      const counts = this.#counts;
      this.#counts = { framesIn: 0, packetsIn: 0 };
      const sending = this.#transmitter?.takeCounts();
      this.#send({
        t: "stats",
        overMs: STATS_INTERVAL_MS,
        ...counts,
        packetsOut: sending?.sent ?? 0,
        refused: sending?.refused ?? 0,
        dropped: sending?.dropped ?? 0,
        underruns: sending?.underruns ?? 0,
        connection: this.#connection?.state.status ?? "none",
        queued: this.#transmitter?.queued ?? 0,
      });
    }, STATS_INTERVAL_MS);
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

      let decoder;
      try {
        decoder = this.#opus.createDecoder();
      } catch (cause) {
        // A second (or third...) concurrent decoder is exactly what a busier
        // channel needs, so a codec that cannot be built for it must not take
        // the whole connection down with it.
        this.#log(`could not create a decoder for ${userId}: ${cause.message}`);
        stream.destroy();
        return;
      }
      this.#decoders.set(userId, decoder);

      stream.on("data", (packet) => {
        if (this.#socket.bufferedAmount > MAX_SOCKET_BACKLOG) return;
        // Not audio, and opusscript's decoder does not survive being handed
        // this — the whole codec can go down over a single one.
        if (isSilenceMarker(packet)) return;
        try {
          this.#sendBinary(encodeIncomingAudio(userId, decoder.decode(packet)));
          this.#counts.packetsIn += 1;
        } catch (cause) {
          this.#log(`could not decode audio from ${userId}: ${cause.message}`);
          if (!this.#warnedDecodeFailure) {
            this.#warnedDecodeFailure = true;
            this.#send({
              t: "error",
              message: "Could not hear the channel: the voice worker's Opus codec failed.",
            });
          }
          // A decoder that just threw is not one to keep feeding: on a shared
          // WASM build one bad packet can take the whole codec down, and every
          // further call then throws the same way, forever, for every speaker.
          // Better to drop this one stream than spend the rest of the call
          // retrying a codec that is never coming back.
          stream.destroy();
        }
      });
      const cleanup = () => {
        try {
          decoder.destroy();
        } catch {
          // The codec may already be past helping; nothing more to do with it.
        }
        this.#decoders.delete(userId);
      };
      stream.once("end", cleanup);
      stream.once("error", cleanup);
      stream.once("close", cleanup);
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
    this.#transmitter?.stop();
    this.#transmitter = null;
    this.#encoder?.destroy();
    this.#encoder = null;
    this.#pending = null;
    for (const decoder of this.#decoders.values()) decoder.destroy();
    this.#decoders.clear();
    try {
      this.#connection?.destroy();
    } catch {
      // Already destroyed by @discordjs/voice itself.
    }
    this.#connection = null;
  }

  /** Called when the browser goes away for good. */
  dispose() {
    clearInterval(this.#statsTimer);
    this.#statsTimer = null;
    this.close("browser disconnected");
  }

  #send(message) {
    if (this.#socket.readyState === this.#socket.OPEN) this.#socket.send(JSON.stringify(message));
  }

  #sendBinary(frame) {
    if (this.#socket.readyState === this.#socket.OPEN) this.#socket.send(frame, { binary: true });
  }
}
