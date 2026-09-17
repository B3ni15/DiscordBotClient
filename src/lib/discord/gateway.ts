import { GATEWAY_URL, GatewayIntent, INTENT_LADDER, hasIntent } from "./constants";
import { identifyProperties, type GatewayPresencePayload } from "./selfPresence";

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

/** What the bot asks Discord to do with its own voice connection (op 4). */
export interface VoiceStateRequest {
  guildId: string;
  /** The channel to sit in, or null to leave voice in this guild. */
  channelId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
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
  /** Presence to publish; sent with IDENTIFY and re-sent whenever it changes. */
  #presence: GatewayPresencePayload | null = null;
  /** Identify as a phone, which is what makes Discord show the mobile icon. */
  #mobile = false;
  /** The voice channel the bot should be in; replayed after a fresh identify. */
  #voice: VoiceStateRequest | null = null;
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
    this.#voice = null;
    this.#stopHeartbeat();
    this.#socket?.close(1000);
    this.#socket = null;
    this.#sessionId = null;
    this.#lastSequence = null;
    this.#setStatus("closed");
  }

  /**
   * Sets the presence published for this bot. A presence sent over the socket
   * does not survive a reconnect, so it is kept and re-sent with every IDENTIFY.
   */
  setPresence(presence: GatewayPresencePayload) {
    this.#presence = presence;
    this.#send({ op: GatewayOpcode.PresenceUpdate, d: presence });
  }

  /**
   * Joins, moves between or leaves voice channels (op 4).
   *
   * A gateway session owns the voice state it created, so Discord drops the bot
   * out of the channel whenever the session is replaced. The last request is
   * kept and replayed on the next READY, which puts the bot back where it was
   * after a reconnect that could not be resumed.
   */
  setVoiceState(request: VoiceStateRequest) {
    this.#voice = request.channelId ? request : null;
    this.#sendVoiceState(request);
  }

  /** The voice channel the bot is meant to be in, as last requested. */
  get voiceState(): VoiceStateRequest | null {
    return this.#voice;
  }

  #sendVoiceState(request: VoiceStateRequest) {
    this.#send({
      op: GatewayOpcode.VoiceStateUpdate,
      d: {
        guild_id: request.guildId,
        channel_id: request.channelId,
        self_mute: request.selfMute,
        self_deaf: request.selfDeaf,
      },
    });
  }

  /**
   * Desktop or mobile. Discord reads this from the identify properties alone,
   * so the change only takes effect on a fresh session: the socket is dropped
   * and re-identified rather than resumed.
   */
  setMobile(mobile: boolean) {
    if (this.#mobile === mobile) return;
    this.#mobile = mobile;
    if (this.status === "idle" || this.status === "closed") return;
    this.#sessionId = null;
    this.#lastSequence = null;
    this.#socket?.close(4000);
  }

  get mobile(): boolean {
    return this.#mobile;
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
          // A new session starts with no voice state at all, so the one the
          // user asked for is sent again rather than silently lost.
          if (this.#voice?.channelId) this.#sendVoiceState(this.#voice);
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
        properties: identifyProperties(this.#mobile),
        ...(this.#presence ? { presence: this.#presence } : {}),
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
