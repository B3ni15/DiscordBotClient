/**
 * Everyone else's audio, on its way out of the speakers.
 *
 * The bridge decodes each speaker's Opus separately, so this processor keeps
 * one queue per user and sums them. Each queue holds back a few blocks before
 * it starts playing, which is what keeps a jittery network from clicking, and
 * drops the oldest audio when it runs too far ahead of the clock.
 */

const CHANNELS = 2;
/** Blocks of 128 samples to collect before a new speaker starts playing. */
const JITTER_BLOCKS = 12;
/** Anything beyond this is stale; the speaker is ahead of the clock. */
const MAX_BLOCKS = 200;

class PcmPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** userId -> { chunks: Float32Array[] (interleaved), offset, playing } */
    this.queues = new Map();

    this.port.onmessage = (event) => {
      const message = event.data;
      if (message?.type === "audio") this.#enqueue(message.userId, new Int16Array(message.pcm));
      else if (message?.type === "drop") this.queues.delete(message.userId);
      else if (message?.type === "clear") this.queues.clear();
    };
  }

  #enqueue(userId, pcm) {
    let queue = this.queues.get(userId);
    if (!queue) {
      queue = { chunks: [], offset: 0, playing: false, blocks: 0 };
      this.queues.set(userId, queue);
    }

    const samples = new Float32Array(pcm.length);
    for (let index = 0; index < pcm.length; index++) samples[index] = pcm[index] / 32768;
    queue.chunks.push(samples);
    queue.blocks += samples.length / (CHANNELS * 128);

    if (queue.blocks > MAX_BLOCKS) {
      // Falling behind: drop the oldest audio rather than drift further.
      while (queue.blocks > JITTER_BLOCKS && queue.chunks.length > 1) {
        const dropped = queue.chunks.shift();
        queue.blocks -= dropped.length / (CHANNELS * 128);
        queue.offset = 0;
      }
    }
    if (!queue.playing && queue.blocks >= JITTER_BLOCKS) queue.playing = true;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] ?? output[0];
    left.fill(0);
    if (right !== left) right.fill(0);

    for (const [userId, queue] of this.queues) {
      if (!queue.playing) continue;

      for (let index = 0; index < left.length; index++) {
        const chunk = queue.chunks[0];
        if (!chunk) {
          // Ran dry: wait for the jitter buffer to fill again before resuming.
          queue.playing = false;
          break;
        }
        left[index] += chunk[queue.offset];
        right[index] += chunk[queue.offset + 1];
        queue.offset += CHANNELS;

        if (queue.offset >= chunk.length) {
          queue.chunks.shift();
          queue.blocks -= chunk.length / (CHANNELS * 128);
          queue.offset = 0;
        }
      }

      if (queue.chunks.length === 0 && !queue.playing) this.queues.delete(userId);
    }

    return true;
  }
}

registerProcessor("pcm-playback", PcmPlaybackProcessor);
