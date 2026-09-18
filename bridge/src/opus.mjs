/**
 * Opus, for the direction @discordjs/voice does not cover.
 *
 * Both directions are handled here rather than left to @discordjs/voice, whose
 * own encoder is found by a nested dependency with its own module resolution —
 * one more thing that can be missing on a host we do not control. The native
 * module is used when it is installed, and the WebAssembly build otherwise.
 *
 * Encoding only happens for browsers that cannot produce Opus themselves; the
 * rest send finished packets that never touch a codec on this side.
 */
import { CHANNELS, FRAME_SAMPLES, SAMPLE_RATE } from "./protocol.mjs";

/**
 * @typedef {{ decode: (packet: Buffer) => Buffer, destroy: () => void }} OpusDecoder
 * @typedef {{ encode: (pcm: Buffer) => Buffer, destroy: () => void }} OpusEncoderHandle
 * @returns {Promise<{ name: string, createDecoder: () => OpusDecoder, createEncoder: () => OpusEncoderHandle }>}
 */
export async function loadOpus() {
  try {
    // A native CommonJS addon: its exports arrive under `default` from ESM.
    const module = await import("@discordjs/opus");
    const OpusEncoder = module.OpusEncoder ?? module.default?.OpusEncoder;
    if (!OpusEncoder) throw new Error("no OpusEncoder export");
    return {
      name: "@discordjs/opus",
      createDecoder() {
        // One codec per speaker: Opus carries state from packet to packet.
        const codec = new OpusEncoder(SAMPLE_RATE, CHANNELS);
        return { decode: (packet) => codec.decode(packet), destroy() {} };
      },
      createEncoder() {
        const codec = new OpusEncoder(SAMPLE_RATE, CHANNELS);
        return { encode: (pcm) => codec.encode(pcm), destroy() {} };
      },
    };
  } catch {
    // Not installed, or no prebuilt binary for this platform.
  }

  const script = await import("opusscript");
  const OpusScript = script.default?.default ?? script.default;

  /**
   * opusscript's codecs all share one WebAssembly instance and its memory.
   * Certain malformed packets (Discord's own silence marker among them, if it
   * reaches decode()) trip an internal assertion that aborts that instance —
   * not just the one codec, every codec built from this `loadOpus()` call, for
   * the rest of the process. Once that happens every further call throws
   * "memory access out of bounds", forever, which without this guard means
   * hundreds of failing decodes a second for no reason. The guard turns that
   * into one clear error instead.
   */
  let poisoned = false;
  const guard = (fn) => {
    if (poisoned) throw new Error("the Opus codec crashed earlier; restart the worker to recover voice");
    try {
      return fn();
    } catch (cause) {
      if (isFatalWasmError(cause)) poisoned = true;
      throw cause;
    }
  };

  return {
    name: "opusscript",
    createDecoder() {
      const codec = guard(() => new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.AUDIO));
      return {
        decode: (packet) => guard(() => Buffer.from(codec.decode(packet))),
        destroy: () => guard(() => codec.delete?.()),
      };
    },
    createEncoder() {
      const codec = guard(() => new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.AUDIO));
      return {
        // opusscript wants the frame size in samples per channel.
        encode: (pcm) => guard(() => Buffer.from(codec.encode(pcm, FRAME_SAMPLES))),
        destroy: () => guard(() => codec.delete?.()),
      };
    },
  };
}

/** Emscripten's own signs that the whole module, not just one call, is dead. */
function isFatalWasmError(cause) {
  const message = String(cause?.message ?? cause);
  return (
    message.includes("memory access out of bounds") ||
    message.includes("Aborted") ||
    cause?.name === "RuntimeError"
  );
}
