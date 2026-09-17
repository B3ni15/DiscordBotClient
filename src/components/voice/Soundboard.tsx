"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionFlagsBits } from "discord-api-types/v10";
import { soundboardSoundUrl } from "@/lib/discord/cdn";
import { useGuildPowers } from "@/lib/discord/useGuildPowers";
import {
  audioDuration,
  fileToDataUri,
  soundFileProblem,
  voiceApi,
  SOUND_MAX_SECONDS,
  type SoundboardSound,
} from "@/lib/discord/voiceApi";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";
import { SoundboardIcon } from "./icons";

export interface SoundboardProps {
  onClose?: () => void;
}

interface Loaded {
  /** The guild these sounds were fetched for; a stale answer is ignored. */
  key: string;
  guildSounds: SoundboardSound[];
  defaultSounds: SoundboardSound[];
  error: string | null;
}

/**
 * The soundboard: the one way this client can put audio into a voice channel.
 *
 * Discord mixes soundboard sounds on its own voice servers, so playing one is a
 * plain REST call — no voice UDP socket, which a browser could not open anyway.
 * The bot has to be sitting in the channel and not have muted itself, exactly
 * as Discord requires of a person.
 */
export function Soundboard({ onClose }: SoundboardProps) {
  const voice = useClient((state) => state.selfVoice);
  const selfId = useClient((state) => state.user?.id);
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const channel = useClient((state) => (voice ? state.channelsById[voice.channelId] : undefined));
  const getRest = useClient((state) => state.getRest);
  const token = useClient((state) => state.token);
  const toast = useUI((state) => state.toast);

  // Sounds belong to the server the bot is talking in; with no voice connection
  // the open server's own sounds are shown, so they can still be managed.
  const guildId = voice?.guildId ?? selectedGuildId;
  const powers = useGuildPowers(guildId);

  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  const key = `${guildId ?? ""}:${token ? "1" : "0"}:${nonce}`;

  useEffect(() => {
    if (!guildId || !token) return;
    let cancelled = false;
    void (async () => {
      const rest = getRest();
      // The server's own sounds matter most, so a failure to read Discord's
      // defaults (older bots, odd permissions) never hides them.
      const [own, defaults] = await Promise.allSettled([
        voiceApi.guildSounds(rest, guildId),
        voiceApi.defaultSounds(rest),
      ]);
      if (cancelled) return;
      setLoaded({
        key,
        guildSounds: own.status === "fulfilled" ? own.value : [],
        defaultSounds: defaults.status === "fulfilled" ? defaults.value : [],
        error:
          own.status === "rejected"
            ? own.reason instanceof Error
              ? own.reason.message
              : "Could not load this server's sounds."
            : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, token, getRest, key]);

  useEffect(() => {
    // Leaving the panel should not leave a preview playing behind it.
    return () => preview.current?.pause();
  }, []);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  const current = loaded?.key === key ? loaded : null;
  const canSpeak = powers.canIn(channel, PermissionFlagsBits.Speak);
  const canUseSoundboard = powers.canIn(channel, PermissionFlagsBits.UseSoundboard);
  const canCreate = powers.can(PermissionFlagsBits.CreateGuildExpressions);
  const canManageExpressions = powers.can(PermissionFlagsBits.ManageGuildExpressions);

  /** Discord lets an author delete their own sound with Create Expressions alone. */
  const canDelete = (sound: SoundboardSound) =>
    canManageExpressions || (canCreate && sound.user?.id === selfId);

  /** Why the bot cannot play anything right now, or null when it can. */
  const blocked = !voice
    ? "Join a voice channel first — the bot has to be in it to play a sound."
    : voice.selfDeaf
      ? "Discord refuses sounds from a deafened member. Undeafen the bot first."
      : voice.selfMute
        ? "Discord refuses sounds from a muted member. Unmute the bot first."
        : !powers.ready
          ? null
          : !canSpeak
            ? "The bot is missing the Speak permission in this channel."
            : !canUseSoundboard
              ? "The bot is missing the Use Soundboard permission in this channel."
              : null;

  async function play(sound: SoundboardSound) {
    if (!voice) return;
    setPlaying(sound.sound_id);
    try {
      await voiceApi.sendSound(getRest(), voice.channelId, sound.sound_id, sound.guild_id);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not play the sound.", "error");
    } finally {
      setPlaying(null);
    }
  }

  /** Plays the sound in this browser only, so it can be checked before sending. */
  function playLocally(sound: SoundboardSound) {
    preview.current?.pause();
    const audio = new Audio(soundboardSoundUrl(sound.sound_id));
    audio.volume = Math.min(1, Math.max(0, sound.volume ?? 1));
    preview.current = audio;
    void audio.play().catch(() => toast("This browser could not play the sound.", "error"));
  }

  async function remove(sound: SoundboardSound) {
    if (!guildId) return;
    try {
      await voiceApi.deleteSound(getRest(), guildId, sound.sound_id, "Deleted from DisBotClient");
      toast(`Deleted “${sound.name}”.`);
      refresh();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not delete the sound.", "error");
    }
  }

  return (
    <aside aria-label="Soundboard" className="flex h-full min-h-0 w-full flex-col bg-panel">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-muted">
          <SoundboardIcon size={14} />
          Soundboard
        </h2>
        <div className="flex items-center gap-3">
          <button type="button" onClick={refresh} className="text-xs text-accent hover:underline">
            Refresh
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="text-muted hover:text-text"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!guildId ? (
          <p className="text-xs leading-relaxed text-muted">
            Open a server to see its sounds.
          </p>
        ) : (
          <>
            {blocked && <p className="mb-3 text-xs leading-relaxed text-amber">{blocked}</p>}
            {current?.error && (
              <p className="mb-3 text-xs leading-relaxed text-danger">{current.error}</p>
            )}

            <SoundSection
              title="This server"
              sounds={current?.guildSounds ?? []}
              loading={current === null}
              empty="No sounds on this server yet — upload an MP3 below."
              playing={playing}
              disabled={blocked !== null}
              onPlay={(sound) => void play(sound)}
              onPreview={playLocally}
              onDelete={(sound) => void remove(sound)}
              canDelete={canDelete}
            />

            <SoundSection
              title="Discord defaults"
              sounds={current?.defaultSounds ?? []}
              loading={current === null}
              empty="Discord returned no default sounds."
              playing={playing}
              disabled={blocked !== null}
              onPlay={(sound) => void play(sound)}
              onPreview={playLocally}
            />

            <UploadForm
              guildId={guildId}
              canCreate={canCreate}
              ready={powers.ready}
              onUploaded={refresh}
            />
          </>
        )}
      </div>
    </aside>
  );
}

function SoundSection({
  title,
  sounds,
  loading,
  empty,
  playing,
  disabled,
  onPlay,
  onPreview,
  onDelete,
  canDelete,
}: {
  title: string;
  sounds: SoundboardSound[];
  loading: boolean;
  empty: string;
  playing: string | null;
  disabled: boolean;
  onPlay: (sound: SoundboardSound) => void;
  onPreview: (sound: SoundboardSound) => void;
  onDelete?: (sound: SoundboardSound) => void;
  /** Which of these sounds this bot may delete; defaults to none. */
  canDelete?: (sound: SoundboardSound) => boolean;
}) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">{title}</h3>
      {loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : sounds.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sounds.map((sound) => (
            <li key={sound.sound_id} className="group/sound flex items-center gap-1">
              <button
                type="button"
                disabled={disabled || playing === sound.sound_id}
                onClick={() => onPlay(sound)}
                title={disabled ? "The bot cannot play sounds right now." : `Play “${sound.name}” in voice`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span aria-hidden className="shrink-0 text-base leading-none">
                  {sound.emoji_name ?? "🔊"}
                </span>
                <span className="truncate">{sound.name}</span>
                {playing === sound.sound_id && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted">playing…</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onPreview(sound)}
                aria-label={`Preview ${sound.name} in this browser`}
                title="Preview here, without sending it to Discord"
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-xs text-faint opacity-0 transition-opacity group-hover/sound:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-bright"
              >
                ▶
              </button>
              {onDelete && canDelete?.(sound) && (
                <button
                  type="button"
                  onClick={() => onDelete(sound)}
                  aria-label={`Delete ${sound.name}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded text-xs text-faint opacity-0 transition-opacity group-hover/sound:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-danger"
                >
                  🗑
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Turns a picked MP3 or OGG into one of the server's soundboard sounds. */
function UploadForm({
  guildId,
  canCreate,
  ready,
  onUploaded,
}: {
  guildId: string;
  canCreate: boolean;
  ready: boolean;
  onUploaded: () => void;
}) {
  const getRest = useClient((state) => state.getRest);
  const toast = useUI((state) => state.toast);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  async function pick(picked: File | null) {
    setFile(picked);
    setProblem(null);
    if (!picked) return;
    if (!name) setName(picked.name.replace(/\.[^.]+$/, "").slice(0, 32));
    setProblem(soundFileProblem(picked, await audioDuration(picked)));
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      await voiceApi.createSound(
        getRest(),
        guildId,
        {
          name: name.trim() || file.name.slice(0, 32),
          sound: await fileToDataUri(file),
          ...(emoji.trim() ? { emoji_name: emoji.trim() } : {}),
        },
        "Uploaded from DisBotClient",
      );
      toast("Sound uploaded.");
      setFile(null);
      setName("");
      setEmoji("");
      setProblem(null);
      if (input.current) input.current.value = "";
      onUploaded();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not upload the sound.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-line pt-3">
      <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
        Upload a sound
      </h3>
      <p className="mb-2 text-[11px] leading-relaxed text-faint">
        MP3 or OGG, up to {SOUND_MAX_SECONDS} seconds and 512 KB — Discord’s own limits for a
        soundboard sound.
      </p>

      {!canCreate && ready && (
        <p className="mb-2 text-xs leading-relaxed text-amber">
          The bot is missing the Create Expressions permission, so it cannot add sounds here.
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept="audio/mpeg,audio/ogg,.mp3,.ogg"
        disabled={!canCreate}
        onChange={(event) => void pick(event.target.files?.[0] ?? null)}
        className="w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-raised file:px-2 file:py-1 file:text-xs file:text-text hover:file:bg-hover disabled:opacity-50"
      />

      {file && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Name
            <input
              value={name}
              maxLength={32}
              onChange={(event) => setName(event.target.value)}
              className="rounded bg-ink px-2 py-1 text-sm text-text outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Emoji (optional)
            <input
              value={emoji}
              maxLength={8}
              placeholder="🎺"
              onChange={(event) => setEmoji(event.target.value)}
              className="rounded bg-ink px-2 py-1 text-sm text-text outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          {problem && <p className="text-xs leading-relaxed text-danger">{problem}</p>}
          <button
            type="button"
            disabled={busy || !canCreate || problem !== null}
            onClick={() => void upload()}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload to this server"}
          </button>
        </div>
      )}
    </section>
  );
}
