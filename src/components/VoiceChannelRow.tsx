"use client";

import type { APIChannel, APIGuildMember } from "discord-api-types/v10";
import { channelMenuItems, memberMenuItems } from "@/components/context/menus";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { displayName, memberColorHex } from "@/lib/discord/roles";
import { useClient, type VoiceState } from "@/lib/store/client";
import { openMenuFor } from "@/lib/store/contextMenu";

const STAGE = 13;
const EMPTY_VOICE: Record<string, VoiceState> = {};

/** Mic with a slash: the member's microphone is off. */
function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 9a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V23h2v-3.06A9 9 0 0 0 21 11h-2z"
      />
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Headphones with a slash: the member hears nothing, so they hear nobody. */
function DeafIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h2v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h2a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z"
      />
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden className="shrink-0">
      <path fill="currentColor" d="M3 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm15 3.5 4-2.5v10l-4-2.5v-5z" />
    </svg>
  );
}

export interface VoiceChannelRowProps {
  channel: APIChannel;
  guildId: string | null;
}

/**
 * A voice channel and whoever is sitting in it.
 *
 * A bot token cannot open a voice connection from the browser, so the row never
 * pretends to be joinable. It does open the channel's built-in voice text chat,
 * which the bot reads and posts to like any other channel.
 */
export function VoiceChannelRow({ channel, guildId }: VoiceChannelRowProps) {
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectChannel = useClient((state) => state.selectChannel);
  const voiceStates = useClient((state) =>
    guildId ? (state.voiceStatesByGuild[guildId] ?? EMPTY_VOICE) : EMPTY_VOICE,
  );
  const members = useClient((state) => (guildId ? state.membersByGuild[guildId] : undefined));
  const guild = useClient((state) => (guildId ? state.guilds[guildId] : undefined));

  const active = channel.id === selectedChannelId;
  const name = ("name" in channel ? channel.name : null) ?? channel.id;
  const limit = "user_limit" in channel ? (channel.user_limit ?? 0) : 0;
  const isStage = channel.type === STAGE;

  const occupants = Object.values(voiceStates).filter((state) => state.channelId === channel.id);
  const roles = guild?.roles ?? [];

  return (
    <li
      onContextMenu={(event) => openMenuFor(event, "Channel", channelMenuItems(channel, guildId))}
      className="group/voice"
    >
      {/*
        A plain title rather than a floating tooltip: the sidebar scrolls, so an
        absolutely positioned bubble gets clipped at its edge.
      */}
      <button
        type="button"
        onClick={() => void selectChannel(channel.id)}
        aria-current={active ? "true" : undefined}
        title={
          isStage
            ? `${name} — a bot client cannot go on stage. Opens the stage's text chat.`
            : `${name} — voice cannot be joined from a bot client. Opens the channel's text chat.`
        }
        className={`flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1.5 text-left text-[15px] transition-colors duration-100 ${
          active ? "bg-raised font-medium text-bright" : "text-muted hover:bg-hover hover:text-text"
        }`}
      >
        <span aria-hidden className="shrink-0 text-base leading-none text-faint">
          {isStage ? "📡" : "🔊"}
        </span>
        <span className="truncate">{name}</span>
        {limit > 0 && (
          <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">
            {occupants.length}/{limit}
          </span>
        )}
      </button>

      {occupants.length > 0 && (
        <ul className="mt-0.5 mb-1 flex animate-fade-in flex-col gap-0.5 pl-6">
          {occupants.map((state) => (
            <Occupant
              key={state.userId}
              state={state}
              member={state.member ?? members?.[state.userId]}
              roles={roles}
              guildId={guildId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Occupant({
  state,
  member,
  roles,
  guildId,
}: {
  state: VoiceState;
  member: APIGuildMember | undefined;
  roles: Parameters<typeof memberColorHex>[1];
  guildId: string | null;
}) {
  const user = member?.user;
  const name = member ? displayName(member) : state.userId;
  const color = member ? memberColorHex(member, roles) : null;

  const muted = state.selfMute || state.serverMute;
  const deafened = state.selfDeaf || state.serverDeaf;
  // A moderator silencing someone reads differently from them muting themselves.
  const byServer = state.serverMute || state.serverDeaf;

  return (
    <li
      onContextMenu={(event) => {
        if (guildId) openMenuFor(event, name, memberMenuItems(guildId, state.userId));
      }}
      className="flex items-center gap-2 rounded px-2 py-0.5 transition-colors hover:bg-hover"
    >
      {user ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={userAvatarUrl(user, 32)}
          alt=""
          className={`h-6 w-6 shrink-0 rounded-full ${muted || deafened ? "opacity-50" : ""}`}
        />
      ) : (
        <span className="h-6 w-6 shrink-0 rounded-full bg-raised" aria-hidden />
      )}

      <span
        className={`min-w-0 flex-1 truncate text-sm ${muted || deafened ? "text-faint" : "text-muted"}`}
        style={color && !muted && !deafened ? { color } : undefined}
      >
        {name}
      </span>

      <span className="flex shrink-0 items-center gap-1">
        {state.selfStream && (
          <span className="rounded bg-danger px-1 py-px text-[9px] leading-none font-bold text-white">
            LIVE
          </span>
        )}
        {state.selfVideo && (
          <span className="text-muted" title="Camera on">
            <VideoIcon />
            <span className="sr-only">Camera on</span>
          </span>
        )}
        {deafened && (
          <span
            className={byServer ? "text-danger" : "text-muted"}
            title={state.serverDeaf ? "Deafened by a moderator" : "Deafened"}
          >
            <DeafIcon />
            <span className="sr-only">{state.serverDeaf ? "Deafened by a moderator" : "Deafened"}</span>
          </span>
        )}
        {muted && !deafened && (
          <span
            className={byServer ? "text-danger" : "text-muted"}
            title={state.serverMute ? "Muted by a moderator" : "Muted"}
          >
            <MicOffIcon />
            <span className="sr-only">{state.serverMute ? "Muted by a moderator" : "Muted"}</span>
          </span>
        )}
      </span>
    </li>
  );
}
