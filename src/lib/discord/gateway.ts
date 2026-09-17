import { GATEWAY_URL, GatewayIntent, INTENT_LADDER, hasIntent } from "./constants";

export const GatewayOpcode = {
  Dispatch: 0,
  Heartbeat: 1,
  Identify: 2,
  PresenceUpdate: 3,
  VoiceStateUpdate: 4,
  Resume: 6,
  Reconnect: 7,
  RequestGuildMembers: 8,
  InvalidSession: 9,
  Hello: 10,
  HeartbeatAck: 11,
} as const;

export interface GatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

export type GatewayStatus =
  | "idle"
  | "connecting"
  | "identifying"
  | "ready"
  | "reconnecting"
  | "closed";

export interface GatewayEvents {
  status: (status: GatewayStatus) => void;
  dispatch: (event: string, data: unknown) => void;
  /** The intents the gateway actually accepted; changes as the ladder is walked. */
  intents: (intents: number) => void;
  /** Fatal: the socket will not reconnect on its own. */
  error: (error: Error) => void;
}

/** Close codes that mean reconnecting is pointless without user action. */
const FATAL_CLOSE_CODES: Record<number, string> = {
  4004: "Invalid token.",
  4010: "Invalid shard.",
  4011: "This bot is in too many servers and needs sharding.",
  4012: "Unsupported gateway version.",
  4013: "Invalid intents value.",
};

/**
 * Discord gateway client for the browser.
 *
 * Handles the hello/identify/heartbeat cycle, resumes after a dropped socket and
 * walks `INTENT_LADDER` when Discord rejects the requested intents (close code
 * 4014), dropping one privileged intent at a time so a bot that has only some of
 * them enabled keeps the rest.
 */
export class GatewayClient {
  #token: string;
  #socket: WebSocket | null = null;
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  #heartbeatInterval = 0;
  #lastSequence: number | null = null;
  #sessionId: string | null = null;
  #resumeUrl: string | null = null;
  #ackPending = false;
  #intentStep = 0;
  #reconnectAttempts = 0;
  #closedByUser = false;
  #listeners: { [K in keyof GatewayEvents]: Set<GatewayEvents[K]> } = {
    status: new Set(),
    dispatch: new Set(),
    intents: new Set(),
    error: new Set(),
  };

  status: GatewayStatus = "idle";

  /** The intents of the current attempt; only meaningful once the socket is ready. */
  get intents(): number {
    return INTENT_LADDER[this.#intentStep] ?? INTENT_LADDER[INTENT_LADDER.length - 1];
  }

  /** True while the connection carries the privileged presence intent. */
  get presenceEnabled(): boolean {
    return hasIntent(this.intents, GatewayIntent.GuildPresences);
  }

  constructor(token: string) {
    this.#token = token;
  }

  on<K extends keyof GatewayEvents>(event: K, listener: GatewayEvents[K]): () => void {
    this.#listeners[event].add(listener);
    return () => this.#listeners[event].delete(listener);
  }

  connect() {
    this.#closedByUser = false;
    this.#open(this.#sessionId ? (this.#resumeUrl ?? GATEWAY_URL) : GATEWAY_URL);
  }

  disconnect() {
    this.#closedByUser = true;
    this.#stopHeartbeat();
    this.#socket?.close(1000);
    this.#socket = null;
    this.#sessionId = null;
    this.#lastSequence = null;
    this.#setStatus("closed");
  }

  /** Ask for the member list of a guild; answers arrive as GUILD_MEMBERS_CHUNK. */
  requestGuildMembers(
    guildId: string,
    options: { query?: string; limit?: number; presences?: boolean } = {},
  ) {
    this.#send({
      op: GatewayOpcode.RequestGuildMembers,
      d: {
        guild_id: guildId,
        query: options.query ?? "",
        limit: options.limit ?? 0,
        presences: options.presences ?? false,
      },
    });
  }

  #open(url: string) {
    this.#setStatus(this.#sessionId ? "reconnecting" : "connecting");
    const socket = new WebSocket(url.includes("?") ? url : `${url}/?v=10&encoding=json`);
    this.#socket = socket;

    socket.onmessage = (event) => this.#handlePayload(JSON.parse(event.data as string));
    socket.onclose = (event) => this.#handleClose(event);
    socket.onerror = () => {
      // The close handler decides whether to retry; onerror carries no detail.
    };
  }

  #handlePayload(payload: GatewayPayload) {
    if (typeof payload.s === "number") this.#lastSequence = payload.s;

    switch (payload.op) {
      case GatewayOpcode.Hello: {
        this.#heartbeatInterval = (payload.d as { heartbeat_interval: number }).heartbeat_interval;
        this.#startHeartbeat();
        if (this.#sessionId && this.#lastSequence !== null) this.#resume();
        else this.#identify();
        break;
      }
      case GatewayOpcode.HeartbeatAck:
        this.#ackPending = false;
        break;
      case GatewayOpcode.Heartbeat:
        this.#sendHeartbeat();
        break;
      case GatewayOpcode.Reconnect:
        this.#socket?.close(4000);
        break;
      case GatewayOpcode.InvalidSession: {
        // d === true means the session may still be resumed.
        if (payload.d !== true) {
          this.#sessionId = null;
          this.#lastSequence = null;
        }
        this.#socket?.close(4000);
        break;
      }
      case GatewayOpcode.Dispatch: {
        const event = payload.t as string;
        if (event === "READY") {
          const data = payload.d as { session_id: string; resume_gateway_url: string };
          this.#sessionId = data.session_id;
          this.#resumeUrl = data.resume_gateway_url;
          this.#reconnectAttempts = 0;
          this.#emit("intents", this.intents);
          this.#setStatus("ready");
        } else if (event === "RESUMED") {
          this.#reconnectAttempts = 0;
          this.#setStatus("ready");
        }
        this.#emit("dispatch", event, payload.d);
        break;
      }
    }
  }

  #handleClose(event: CloseEvent) {
    this.#stopHeartbeat();
    this.#socket = null;
    if (this.#closedByUser) return;

    if (event.code === 4014) {
      // A privileged intent is not enabled for this bot: step down the ladder,
      // which drops one privileged intent at a time and keeps the others.
      if (this.#intentStep < INTENT_LADDER.length - 1) {
        this.#intentStep += 1;
        this.#sessionId = null;
        this.#lastSequence = null;
        this.#emit("intents", this.intents);
        this.#scheduleReconnect(0);
        return;
      }
      this.#fail("Discord rejected the requested intents. Enable them on the Developer Portal.");
      return;
    }

    const fatal = FATAL_CLOSE_CODES[event.code];
    if (fatal) {
      this.#fail(fatal);
      return;
    }

    // Codes 4007/4009 invalidate the session; anything else may resume.
    if (event.code === 4007 || event.code === 4009) {
      this.#sessionId = null;
      this.#lastSequence = null;
    }
    this.#scheduleReconnect(Math.min(2 ** this.#reconnectAttempts++ * 1000, 30_000));
  }

  #scheduleReconnect(delay: number) {
    this.#setStatus("reconnecting");
    setTimeout(() => {
      if (!this.#closedByUser) this.#open(this.#sessionId ? (this.#resumeUrl ?? GATEWAY_URL) : GATEWAY_URL);
    }, delay);
  }

  #fail(message: string) {
    this.#closedByUser = true;
    this.#setStatus("closed");
    this.#emit("error", new Error(message));
  }

  #identify() {
    this.#setStatus("identifying");
    this.#send({
      op: GatewayOpcode.Identify,
      d: {
        token: this.#token,
        intents: this.intents,
        properties: { os: "browser", browser: "disbotclient", device: "disbotclient" },
      },
    });
  }

  #resume() {
    this.#setStatus("reconnecting");
    this.#send({
      op: GatewayOpcode.Resume,
      d: { token: this.#token, session_id: this.#sessionId, seq: this.#lastSequence },
    });
  }

  #startHeartbeat() {
    this.#stopHeartbeat();
    // Jitter the first beat as the gateway docs require.
    setTimeout(() => {
      if (this.#socket?.readyState !== WebSocket.OPEN) return;
      this.#sendHeartbeat();
      this.#heartbeatTimer = setInterval(() => this.#sendHeartbeat(), this.#heartbeatInterval);
    }, this.#heartbeatInterval * Math.random());
  }

  #stopHeartbeat() {
    if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
    this.#ackPending = false;
  }

  #sendHeartbeat() {
    if (this.#ackPending) {
      // The gateway stopped answering - the socket is a zombie, force a reconnect.
      this.#socket?.close(4000);
      return;
    }
    this.#ackPending = true;
    this.#send({ op: GatewayOpcode.Heartbeat, d: this.#lastSequence });
  }

  #send(payload: GatewayPayload) {
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(payload));
  }

  #setStatus(status: GatewayStatus) {
    this.status = status;
    this.#emit("status", status);
  }

  #emit<K extends keyof GatewayEvents>(event: K, ...args: Parameters<GatewayEvents[K]>) {
    for (const listener of this.#listeners[event]) {
      (listener as (...a: unknown[]) => void)(...args);
    }
  }
}
