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
export const AUDIO_OUT = 0x01; // browser -> bridge -> Discord, as PCM
export const AUDIO_IN = 0x02; // Discord -> bridge -> browser, as PCM
export const AUDIO_OUT_OPUS = 0x03; // browser -> bridge -> Discord, already Opus

/** Wraps decoded PCM from one speaker, tagged with the user it came from. */
export function encodeIncomingAudio(userId, pcm) {
  const frame = Buffer.allocUnsafe(9 + pcm.length);
  frame[0] = AUDIO_IN;
  frame.writeBigUInt64BE(BigInt(userId), 1);
  pcm.copy(frame, 9);
  return frame;
}

/**
 * Unwraps a frame the browser sent.
 *
 * A browser that can encode Opus itself (every current one, through WebCodecs)
 * sends finished packets, which go to Discord untouched — about 180 bytes per
 * 20 ms rather than 3840, and no transcoding anywhere. The PCM tag is the
 * fallback for browsers that cannot.
 *
 * @returns {{ kind: "opus" | "pcm", payload: Buffer } | null}
 */
export function decodeOutgoingAudio(data) {
  if (!Buffer.isBuffer(data) || data.length < 3) return null;

  if (data[0] === AUDIO_OUT_OPUS) return { kind: "opus", payload: data.subarray(1) };
  if (data[0] !== AUDIO_OUT) return null;

  // An odd tail would split a sample in half; Discord would hear the glitch.
  const body = data.subarray(1);
  return body.length % 2 === 0 ? { kind: "pcm", payload: body } : null;
}
