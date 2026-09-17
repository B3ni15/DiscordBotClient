/**
 * The wire between the browser and this worker.
 *
 * Control messages are JSON text frames; audio travels as binary frames with a
 * one-byte tag, so a 20 ms block of sound costs no base64 and no JSON parse.
 *
 * All audio in both directions is 48 kHz, 2 channel, signed 16-bit little
 * endian PCM — the format Discord's Opus encoder expects, and the one the Web
 * Audio API can produce and consume without resampling.
 */

export const SAMPLE_RATE = 48_000;
export const CHANNELS = 2;
/** Discord works in 20 ms blocks: 960 samples per channel. */
export const FRAME_SAMPLES = 960;
export const FRAME_BYTES = FRAME_SAMPLES * CHANNELS * 2;

/** Binary tags. */
export const AUDIO_OUT = 0x01; // browser -> bridge -> Discord
export const AUDIO_IN = 0x02; // Discord -> bridge -> browser

/** Wraps decoded PCM from one speaker, tagged with the user it came from. */
export function encodeIncomingAudio(userId, pcm) {
  const frame = Buffer.allocUnsafe(9 + pcm.length);
  frame[0] = AUDIO_IN;
  frame.writeBigUInt64BE(BigInt(userId), 1);
  pcm.copy(frame, 9);
  return frame;
}

/** The PCM out of a browser audio frame, or null when it is not one. */
export function decodeOutgoingAudio(data) {
  if (!Buffer.isBuffer(data) || data.length < 3 || data[0] !== AUDIO_OUT) return null;
  // An odd tail would split a sample in half; Discord would hear the glitch.
  const body = data.subarray(1);
  return body.length % 2 === 0 ? body : null;
}
