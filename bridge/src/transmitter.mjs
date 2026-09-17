/**
 * Puts Opus packets on the wire, one every 20 ms.
 *
 * Discord plays what arrives on time: packets have to leave at a steady cadence,
 * with a little slack for the network, and the stream has to be closed off with
 * silence when it stops. An audio player is the wrong tool for that — it is
 * built for files, treats a momentary gap as the end of the audio, and reports
 * success whether or not anything reached the socket. This does the timing
 * itself and counts what actually went out, which is the number that answers
 * "why can nobody hear the bot?".
 */

/** Discord's frame length, and the interval packets must leave at. */
export const FRAME_MS = 20;
/** Packets held back before sending starts, to ride out network jitter. */
export const JITTER_PACKETS = 3;
/** Beyond this the audio is stale; the oldest is dropped to bound the delay. */
export const MAX_QUEUED_PACKETS = 25;
/**
 * Opus silence. Discord expects a few of these when a stream stops, which
 * resets the decoders at the other end — without them the last moment of audio
 * can repeat or click for everyone listening.
 */
export const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);
export const SILENCE_FRAMES = 5;

export class Transmitter {
  #connection;
  #queue = [];
  #timer = null;
  /** When the next packet is due, tracked so the clock cannot drift. */
  #nextTickAt = 0;
  /** False while the jitter buffer is still filling. */
  #flowing = false;
  #silenceLeft = 0;
  #counts = { sent: 0, refused: 0, dropped: 0, underruns: 0 };

  /** @param connection - A @discordjs/voice VoiceConnection, or anything shaped like one. */
  constructor(connection) {
    this.#connection = connection;
  }

  start() {
    this.stop();
    this.#nextTickAt = Date.now() + FRAME_MS;
    const tick = () => {
      this.#sendOne();
      this.#nextTickAt += FRAME_MS;
      // Scheduled against the clock rather than after the work, so the cadence
      // cannot drift away from the 20 ms Discord expects.
      this.#timer = setTimeout(tick, Math.max(0, this.#nextTickAt - Date.now()));
    };
    this.#timer = setTimeout(tick, FRAME_MS);
  }

  stop() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#queue = [];
    this.#flowing = false;
    this.#silenceLeft = 0;
  }

  push(packet) {
    // Copied on the way in. The packet usually arrives as a view into a socket
    // buffer, and Node pools those: by the time this leaves the queue, 20 ms to
    // half a second later, the bytes behind it may belong to another message.
    // That corruption is invisible here and inaudible-but-present at the other
    // end, so it is not worth saving the copy.
    const owned = Buffer.from(packet);

    while (this.#queue.length >= MAX_QUEUED_PACKETS) {
      this.#queue.shift();
      this.#counts.dropped += 1;
    }
    this.#queue.push(owned);
  }

  get queued() {
    return this.#queue.length;
  }

  /** The counters since the last call, which resets them. */
  takeCounts() {
    const counts = this.#counts;
    this.#counts = { sent: 0, refused: 0, dropped: 0, underruns: 0 };
    return counts;
  }

  #sendOne() {
    // Audio first, and only once a few packets have gathered: starting on the
    // very first one means every hiccup in the network becomes a gap.
    if (this.#flowing || this.#queue.length >= JITTER_PACKETS) {
      this.#flowing = true;
      const packet = this.#queue.shift();
      if (packet) {
        this.#silenceLeft = SILENCE_FRAMES;
        // A truthy answer means the packet reached the socket; anything else
        // means the connection was not in a state to carry it.
        if (this.#connection.playOpusPacket(packet)) this.#counts.sent += 1;
        else this.#counts.refused += 1;
        return;
      }
      this.#flowing = false;
      this.#counts.underruns += 1;
    }

    // Nothing to send. If audio just stopped, the tail of silence still owes
    // Discord its frames — it plays out even though the queue is empty, which
    // is the whole point of it.
    if (this.#silenceLeft === 0) return;
    this.#silenceLeft -= 1;
    this.#connection.playOpusPacket(SILENCE_FRAME);
    if (this.#silenceLeft === 0) this.#connection.setSpeaking(false);
  }
}
