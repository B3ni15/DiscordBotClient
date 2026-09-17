/**
 * Microphone and file audio on its way to Discord.
 *
 * Web Audio hands work over 128 samples at a time; Discord wants 20 ms — 960
 * samples per channel. This processor accumulates whatever it is given until a
 * full block exists, converts it to the interleaved 16-bit stereo Discord's
 * Opus encoder expects, and hands the buffer to the page, which forwards it to
 * the bridge.
 *
 * It keeps running while nothing is connected, emitting silence, so the stream
 * to Discord never stalls: muting is silence, not a gap.
 */

const FRAME_SAMPLES = 960;
const CHANNELS = 2;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Int16Array(FRAME_SAMPLES * CHANNELS);
    this.filled = 0;
    this.running = true;
    this.port.onmessage = (event) => {
      if (event.data?.type === "stop") this.running = false;
    };
  }

  process(inputs) {
    if (!this.running) return false;

    const input = inputs[0] ?? [];
    const left = input[0] ?? null;
    // A mono source is heard from both sides rather than only the left one.
    const right = input[1] ?? left;
    const available = left ? left.length : 128;

    for (let index = 0; index < available; index++) {
      const offset = this.filled * CHANNELS;
      this.frame[offset] = toPcm16(left ? left[index] : 0);
      this.frame[offset + 1] = toPcm16(right ? right[index] : 0);
      this.filled += 1;

      if (this.filled === FRAME_SAMPLES) {
        // Transferred rather than copied, then replaced: the page owns it now.
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(FRAME_SAMPLES * CHANNELS);
        this.filled = 0;
      }
    }

    return true;
  }
}

/** Float sample to signed 16-bit, clipped rather than wrapped. */
function toPcm16(sample) {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped * 32767);
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
