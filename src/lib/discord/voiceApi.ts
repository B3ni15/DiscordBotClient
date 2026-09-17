import type { APIUser } from "discord-api-types/v10";
import type { RestClient } from "./rest";

/**
 * A soundboard sound, as Discord's soundboard endpoints return it.
 *
 * Default sounds (the ones every server has) carry a numeric `sound_id` and no
 * `guild_id`; a server's own sounds carry a snowflake and the guild they live in.
 */
export interface SoundboardSound {
  sound_id: string;
  name: string;
  /** 0 – 1, the level Discord plays the sound at. */
  volume: number;
  emoji_id: string | null;
  emoji_name: string | null;
  guild_id?: string;
  /** False while the server has lost the boost level the sound needs. */
  available?: boolean;
  user?: APIUser;
}

export interface SoundBody {
  name?: string;
  /** Only on create: the audio itself, as a `data:audio/mpeg;base64,…` URI. */
  sound?: string;
  volume?: number | null;
  emoji_id?: string | null;
  emoji_name?: string | null;
}

/** Discord's limits for an uploaded sound; the upload form checks them first. */
export const SOUND_MAX_BYTES = 512_000;
export const SOUND_MAX_SECONDS = 5.2;
export const SOUND_MIME_TYPES = ["audio/mpeg", "audio/mp3", "audio/ogg"];

/**
 * Voice: where the bot sits, what a moderator may do to somebody else's voice
 * state, and the soundboard.
 *
 * Joining and leaving is not here — that goes over the gateway (op 4), not the
 * REST API, and lives on the client store.
 */
export const voiceApi = {
  // Soundboard -------------------------------------------------------------

  /** The sounds every server has, free of charge. */
  defaultSounds: (rest: RestClient) => rest.get<SoundboardSound[]>("/soundboard-default-sounds"),

  guildSounds: (rest: RestClient, guildId: string) =>
    rest
      .get<{ items: SoundboardSound[] }>(`/guilds/${guildId}/soundboard-sounds`)
      .then((payload) => payload.items ?? []),

  createSound: (rest: RestClient, guildId: string, body: SoundBody, reason?: string) =>
    rest.post<SoundboardSound>(`/guilds/${guildId}/soundboard-sounds`, { body, reason }),

  editSound: (
    rest: RestClient,
    guildId: string,
    soundId: string,
    body: SoundBody,
    reason?: string,
  ) =>
    rest.patch<SoundboardSound>(`/guilds/${guildId}/soundboard-sounds/${soundId}`, {
      body,
      reason,
    }),

  deleteSound: (rest: RestClient, guildId: string, soundId: string, reason?: string) =>
    rest.delete<void>(`/guilds/${guildId}/soundboard-sounds/${soundId}`, { reason }),

  /**
   * Plays a sound into the voice channel the bot is sitting in.
   *
   * This is the one way a browser can make the bot produce sound: the audio is
   * mixed by Discord's own voice servers, so no UDP socket is needed on this
   * side. `sourceGuildId` is required for a sound borrowed from another server.
   */
  sendSound: (rest: RestClient, channelId: string, soundId: string, sourceGuildId?: string) =>
    rest.post<void>(`/channels/${channelId}/send-soundboard-sound`, {
      body: { sound_id: soundId, ...(sourceGuildId ? { source_guild_id: sourceGuildId } : {}) },
    }),

  // Someone else's voice state ---------------------------------------------

  /** Silences a member for everyone; needs Mute Members. */
  setServerMute: (
    rest: RestClient,
    guildId: string,
    userId: string,
    mute: boolean,
    reason?: string,
  ) => rest.patch<void>(`/guilds/${guildId}/members/${userId}`, { body: { mute }, reason }),

  /** Cuts a member off from hearing the channel; needs Deafen Members. */
  setServerDeaf: (
    rest: RestClient,
    guildId: string,
    userId: string,
    deaf: boolean,
    reason?: string,
  ) => rest.patch<void>(`/guilds/${guildId}/members/${userId}`, { body: { deaf }, reason }),

  /** Moves a member to another voice channel, or kicks them out with `null`. */
  moveMember: (
    rest: RestClient,
    guildId: string,
    userId: string,
    channelId: string | null,
    reason?: string,
  ) =>
    rest.patch<void>(`/guilds/${guildId}/members/${userId}`, {
      body: { channel_id: channelId },
      reason,
    }),

  // Stage channels ---------------------------------------------------------

  /**
   * The bot's own voice state inside a stage channel. `suppress: false` moves it
   * from the audience onto the stage, which needs Mute Members — without it
   * Discord only accepts a request to speak.
   */
  setSelfStageState: (
    rest: RestClient,
    guildId: string,
    channelId: string,
    body: { suppress?: boolean; request_to_speak_timestamp?: string | null },
  ) => rest.patch<void>(`/guilds/${guildId}/voice-states/@me`, { body: { channel_id: channelId, ...body } }),
};

/** Reads a picked file into the `data:` URI Discord wants for a new sound. */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Length of an audio file in seconds, measured by the browser itself, so a file
 * Discord would reject is caught before it is uploaded. Resolves to null when
 * the browser cannot decode the file at all.
 */
export function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/** Why Discord would refuse this file, or null when it looks acceptable. */
export function soundFileProblem(file: File, duration: number | null): string | null {
  if (file.size > SOUND_MAX_BYTES) {
    return `Discord caps sounds at 512 KB; this file is ${Math.round(file.size / 1024)} KB.`;
  }
  if (duration !== null && duration > SOUND_MAX_SECONDS) {
    return `Discord caps sounds at ${SOUND_MAX_SECONDS} seconds; this file is ${duration.toFixed(1)}s.`;
  }
  if (file.type && !SOUND_MIME_TYPES.includes(file.type)) {
    return "Discord only accepts MP3 and OGG sounds.";
  }
  return null;
}
