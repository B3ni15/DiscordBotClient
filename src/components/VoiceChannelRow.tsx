"use client";

import { PermissionFlagsBits } from "discord-api-types/v10";
import type { APIChannel, APIGuildMember } from "discord-api-types/v10";
import { channelMenuItems, memberMenuItems } from "@/components/context/menus";
import { DeafIcon, DisconnectIcon, MicIcon, MicOffIcon, VideoIcon } from "@/components/voice/icons";
import { useGuildPowers } from "@/lib/discord/useGuildPowers";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { displayName, memberColorHex } from "@/lib/discord/roles";
import { useClient, type VoiceState } from "@/lib/store/client";
import { useBridge } from "@/lib/voice/bridge";
import { openMenuFor } from "@/lib/store/contextMenu";

const STAGE = 13;
const EMPTY_VOICE: Record<string, VoiceState> = {};

export interface VoiceChannelRowProps {
  channel: APIChannel;
  guildId: string | null;
}

/**
 * A voice channel, whoever is sitting in it, and the way in.
 *
 * Clicking the name opens the channel's built-in voice text chat, as it always
 * did; the button beside it puts the bot into the channel (a gateway op 4) or
 * takes it back out. No audio flows over that connection — a page cannot open
 * Discord's voice UDP socket — so the bot sits there silently until the
 * soundboard is used.
 */
export function VoiceChannelRow({ channel, guildId }: VoiceChannelRowProps) {
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const selectChannel = useClient((state) => state.selectChannel);
  const voiceStates = useClient((state) =>
    guildId ? (state.voiceStatesByGuild[guildId] ?? EMPTY_VOICE) : EMPTY_VOICE,
  );
  const members = useClient((state) => (guildId ? state.membersByGuild[guildId] : undefined));
  const guild = useClient((state) => (guildId ? state.guilds[guildId] : undefined));
  const selfVoice = useClient((state) => state.selfVoice);
  const joinVoice = useClient((state) => state.joinVoice);
  const leaveVoice = useClient((state) => state.leaveVoice);
  const powers = useGuildPowers(guildId);

  const active = channel.id === selectedChannelId;
  const name = ("name" in channel ? channel.name : null) ?? channel.id;
  const limit = "user_limit" in channel ? (channel.user_limit ?? 0) : 0;
  const isStage = channel.type === STAGE;

  const occupants = Object.values(voiceStates).filter((state) => state.channelId === channel.id);
  const roles = guild?.roles ?? [];

  const connected = selfVoice?.channelId === channel.id;
  const canConnect = powers.canIn(channel, PermissionFlagsBits.Connect);
  // Discord ignores the limit for anyone who may move members around.
  const full =
    limit > 0 &&
    occupants.length >= limit &&
    !powers.can(PermissionFlagsBits.MoveMembers) &&
    !connected;

  const joinReason = !guildId
    ? "No server selected."
    : !powers.ready
      ? "Still working out what the bot may do here."
      : !canConnect
        ? "The bot is missing the Connect permission for this channel."
        : full
          ? "This channel is full."
          : null;

  return (
    <li
      onContextMenu={(event) => openMenuFor(event, "Channel", channelMenuItems(channel, guildId))}
      className="group/voice"
    >
      <div className="flex items-center gap-0.5">
        {/*
          A plain title rather than a floating tooltip: the sidebar scrolls, so an
          absolutely positioned bubble gets clipped at its edge.
        */}
        <button
          type="button"
          onClick={() => void selectChannel(channel.id)}
          aria-current={active ? "true" : undefined}
          title={`${name} — opens the ${isStage ? "stage" : "channel"}'s text chat.`}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-[15px] transition-colors duration-100 ${
            active ? "bg-raised font-medium text-bright" : "text-muted hover:bg-hover hover:text-text"
          } ${connected ? "text-bright" : ""}`}
        >
          <span
            aria-hidden
            className={`shrink-0 text-base leading-none ${connected ? "text-online" : "text-faint"}`}
          >
            {isStage ? "📡" : "🔊"}
          </span>
          <span className="truncate">{name}</span>
          {limit > 0 && (
            <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">
              {occupants.length}/{limit}
            </span>
          )}
        </button>

        {/* `title` again, for the same reason the row above uses one. */}
        <button
          type="button"
          disabled={!connected && joinReason !== null}
          onClick={() => (connected ? leaveVoice() : guildId && joinVoice(guildId, channel.id))}
          aria-label={connected ? `Leave ${name}` : `Join ${name}`}
          title={
            connected
              ? "Take the bot out of this channel"
              : (joinReason ?? `Put the bot in ${name}${isStage ? " (as audience)" : ""}`)
          }
          className={`grid h-7 w-7 shrink-0 place-items-center rounded transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
            connected
              ? "text-danger hover:bg-hover"
              : "text-faint opacity-0 group-hover/voice:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-bright"
          }`}
        >
          {connected ? <DisconnectIcon size={14} /> : <MicIcon size={14} />}
        </button>
      </div>

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
  const selfId = useClient((client) => client.user?.id);
  // Only the bridge can tell who is actually talking: it is the side that
  // receives the audio. Nobody sends the bot its own voice back, so for the bot
  // the measure is the level of what this browser is sending.
  const talking = useBridge((bridge) =>
    state.userId === selfId ? bridge.selfSpeaking : bridge.speaking.includes(state.userId),
  );

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
          className={`h-6 w-6 shrink-0 rounded-full ${muted || deafened ? "opacity-50" : ""} ${
            talking ? "ring-2 ring-online" : ""
          }`}
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
