import type { RestClient } from "./rest";

/**
 * Paces the requests that touch DM channels.
 *
 * Opening DM channels in bulk is exactly what spam bots do, and Discord's
 * anti-spam answers it by quarantining the bot (it can no longer open DMs,
 * and may be flagged as spam) long before the plain REST rate limit says no.
 * So DM work never goes as fast as the rate limit would allow: every request
 * waits for its slot, with jitter so the traffic does not look scripted, a
 * longer pause after every batch, and a slower pace for the rest of the
 * session once Discord has answered with a 429 at all.
 */
export interface PacerOptions {
  /** Base spacing between two requests. */
  intervalMs: number;
  /** Random extra spacing, 0 to this, added to every gap. */
  jitterMs: number;
  /** After this many requests, take a longer break. */
  batch: number;
  cooldownMs: number;
  /** The spacing never grows past this, however often Discord pushes back. */
  maxIntervalMs: number;
}

export type PacerState = "running" | "cooling" | "backing-off";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal!.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class RequestPacer {
  #options: PacerOptions;
  #interval: number;
  #nextSlot = 0;
  #sinceCooldown = 0;
  /** Serialises callers: two scans never interleave their requests. */
  #queue: Promise<void> = Promise.resolve();
  #seenHits = new WeakMap<RestClient, number>();

  constructor(options: PacerOptions) {
    this.#options = options;
    this.#interval = options.intervalMs;
  }

  /**
   * Runs one request in its turn. `onWait` hears why it is waiting, so a UI
   * can say "cooling down" instead of looking stuck.
   */
  run<T>(
    rest: RestClient,
    request: () => Promise<T>,
    { signal, onWait }: { signal?: AbortSignal; onWait?: (state: PacerState, ms: number) => void } = {},
  ): Promise<T> {
    const turn = this.#queue.then(async () => {
      signal?.throwIfAborted();

      if (this.#sinceCooldown >= this.#options.batch) {
        this.#sinceCooldown = 0;
        onWait?.("cooling", this.#options.cooldownMs);
        await sleep(this.#options.cooldownMs, signal);
      }

      const wait = this.#nextSlot - Date.now();
      if (wait > 0) await sleep(wait, signal);

      try {
        return await request();
      } finally {
        this.#sinceCooldown += 1;
        const jitter = Math.random() * this.#options.jitterMs;
        // Any 429 since the last look, from this request or any other, means
        // Discord is pushing back: halve the pace for good, and rest first.
        if (rest.rateLimitHits > (this.#seenHits.get(rest) ?? 0)) {
          this.#seenHits.set(rest, rest.rateLimitHits);
          this.#interval = Math.min(this.#interval * 2, this.#options.maxIntervalMs);
          onWait?.("backing-off", this.#options.cooldownMs);
          this.#nextSlot = Date.now() + this.#options.cooldownMs;
        } else {
          this.#nextSlot = Date.now() + this.#interval + jitter;
        }
      }
    });
    // A failed or aborted request must not jam the queue for the next caller.
    this.#queue = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  }
}

/**
 * Opening a DM channel (POST /users/@me/channels) is the request Discord's
 * anti-spam watches: about one every two seconds, a minute's break after
 * every 40.
 */
export const dmOpenPacer = new RequestPacer({
  intervalMs: 1500,
  jitterMs: 1000,
  batch: 40,
  cooldownMs: 60_000,
  maxIntervalMs: 15_000,
});

/** Reading DM channels the bot already has open is cheaper, but still paced. */
export const dmReadPacer = new RequestPacer({
  intervalMs: 350,
  jitterMs: 250,
  batch: 50,
  cooldownMs: 10_000,
  maxIntervalMs: 5_000,
});
