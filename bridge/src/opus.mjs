/**
 * Opus, for the direction @discordjs/voice does not cover.
 *
 * Sending is handled inside @discordjs/voice, which finds an Opus library by
 * itself. Receiving hands us raw Opus packets, so the decoder is ours: the
 * native module when it is installed, and the WebAssembly build otherwise.
 */
import { CHANNELS, SAMPLE_RATE } from "./protocol.mjs";

/**
 * @returns {Promise<{ name: string, createDecoder: () => { decode: (packet: Buffer) => Buffer, destroy: () => void } }>}
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
    };
  } catch {
    // Not installed, or no prebuilt binary for this platform.
  }

  const script = await import("opusscript");
  const OpusScript = script.default?.default ?? script.default;
  return {
    name: "opusscript",
    createDecoder() {
      const codec = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.AUDIO);
      return {
        decode: (packet) => Buffer.from(codec.decode(packet)),
        destroy: () => codec.delete?.(),
      };
    },
  };
}
