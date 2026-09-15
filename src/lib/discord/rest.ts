import { API_BASE } from "./constants";

export class DiscordHTTPError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "DiscordHTTPError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RequestOptions {
  method?: Method;
  /** JSON body. Ignored when `form` is given. */
  body?: unknown;
  /** Multipart body, for attachments. */
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
  /** Discord shows this in the audit log. */
  reason?: string;
  signal?: AbortSignal;
}

interface Bucket {
  /** Chain of pending requests; each waits for the previous one. */
  queue: Promise<unknown>;
  remaining: number;
  /** Epoch ms when `remaining` resets. */
  resetAt: number;
}

/**
 * Minimal Discord REST client that runs in the browser.
 *
 * Discord serves permissive CORS headers on /api, so a bot token can talk to it
 * directly from a page - no proxy involved. Rate limits are respected per
 * "major parameter" route (Discord's bucket scheme) plus a global lock.
 */
export class RestClient {
  #token: string;
  #buckets = new Map<string, Bucket>();
  /** Set while a global rate limit is in effect; every request awaits it. */
  #globalLock: Promise<void> | null = null;

  constructor(token: string) {
    this.#token = token;
  }

  setToken(token: string) {
    this.#token = token;
  }

  get<T>(path: string, options?: Omit<RequestOptions, "method" | "body" | "form">) {
    return this.request<T>(path, { ...options, method: "GET" });
  }
  post<T>(path: string, options?: Omit<RequestOptions, "method">) {
    return this.request<T>(path, { ...options, method: "POST" });
  }
  patch<T>(path: string, options?: Omit<RequestOptions, "method">) {
    return this.request<T>(path, { ...options, method: "PATCH" });
  }
  put<T>(path: string, options?: Omit<RequestOptions, "method">) {
    return this.request<T>(path, { ...options, method: "PUT" });
  }
  delete<T>(path: string, options?: Omit<RequestOptions, "method">) {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const key = bucketKey(options.method ?? "GET", path);
    const bucket = this.#buckets.get(key) ?? { queue: Promise.resolve(), remaining: 1, resetAt: 0 };
    this.#buckets.set(key, bucket);

    // Serialise per bucket: each request starts only after the previous settled.
    const result = bucket.queue
      .catch(() => {})
      .then(() => this.#execute<T>(path, options, bucket));
    bucket.queue = result.catch(() => {});
    return result;
  }

  async #execute<T>(path: string, options: RequestOptions, bucket: Bucket): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (this.#globalLock) await this.#globalLock;

      // Bucket is exhausted until it resets.
      if (bucket.remaining <= 0 && bucket.resetAt > Date.now()) {
        await sleep(bucket.resetAt - Date.now());
      }

      const url = new URL(
        API_BASE + path,
        typeof window === "undefined" ? "http://localhost" : window.location.origin,
      );
      for (const [name, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined) url.searchParams.set(name, String(value));
      }

      const headers: Record<string, string> = { Authorization: `Bot ${this.#token}` };
      if (options.reason) headers["X-Audit-Log-Reason"] = encodeURIComponent(options.reason);

      let body: BodyInit | undefined;
      if (options.form) {
        body = options.form;
      } else if (options.body !== undefined) {
        body = JSON.stringify(options.body);
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body,
        signal: options.signal,
      });

      this.#readRateLimitHeaders(response, bucket);

      if (response.status === 429) {
        const payload = (await response.json().catch(() => ({}))) as {
          retry_after?: number;
          global?: boolean;
        };
        const retryAfterMs = (payload.retry_after ?? 1) * 1000;
        if (payload.global) {
          this.#globalLock = sleep(retryAfterMs).then(() => {
            this.#globalLock = null;
          });
          await this.#globalLock;
        } else {
          await sleep(retryAfterMs);
        }
        continue;
      }

      // Discord 5xx responses are usually transient.
      if (response.status >= 500 && attempt < 3) {
        await sleep(2 ** attempt * 500);
        continue;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string; code?: number }
          | null;
        throw new DiscordHTTPError(
          response.status,
          payload?.code,
          formatDiscordError(
            response.status,
            payload?.code,
            payload?.message ?? `${response.status} ${response.statusText}`,
          ),
          payload,
        );
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
  }

  #readRateLimitHeaders(response: Response, bucket: Bucket) {
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const resetAfter = response.headers.get("X-RateLimit-Reset-After");
    if (remaining !== null) bucket.remaining = Number(remaining);
    if (resetAfter !== null) bucket.resetAt = Date.now() + Number(resetAfter) * 1000;
  }
}

/**
 * Requests sharing a bucket key are queued together. Discord scopes limits by
 * route template plus the first "major parameter" (channel, guild or webhook id),
 * so ids in those positions stay in the key and all other ids are collapsed.
 */
function bucketKey(method: Method, path: string): string {
  const major = /^\/(channels|guilds|webhooks)\/(\d+)/.exec(path);
  const template = path.replace(/\d{15,}/g, ":id");
  return `${method}:${template}:${major ? `${major[1]}/${major[2]}` : ""}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function formatDiscordError(status: number, code: number | undefined, message: string) {
  if (status === 403 && code === 50013) {
    return "Missing channel permission: grant the bot Send Messages (and Send Messages in Threads if this is a thread).";
  }
  if (status === 403 && code === 50001) {
    return "Missing channel access: grant the bot View Channel for this channel.";
  }
  return code === undefined ? `${status}: ${message}` : `${status} (Discord code ${code}): ${message}`;
}
