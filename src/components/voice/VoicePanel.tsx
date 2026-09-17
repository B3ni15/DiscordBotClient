"use client";

import { useState } from "react";
import { PermissionFlagsBits } from "discord-api-types/v10";
import { Tooltip } from "@/components/ui/Tooltip";
import { voiceApi } from "@/lib/discord/voiceApi";
import { useGuildPowers } from "@/lib/discord/useGuildPowers";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";
import { DeafIcon, DisconnectIcon, HeadphonesIcon, MicIcon, MicOffIcon, SoundboardIcon } from "./icons";
import { StreamControls } from "./StreamControls";

const STAGE = 13;

/**
 * The "Voice Connected" strip, shown above the user panel whenever the bot is
 * sitting in a voice channel.
 *
 * What it can do is exactly what the gateway offers: joining, leaving, muting
 * and deafening. There is no microphone behind it — a page has no way to open
 * the UDP socket Discord's voice servers speak Opus over — so sound goes out
 * through the soundboard, which Discord mixes server-side.
 */
export function VoicePanel() {
  const voice = useClient((state) => state.selfVoice);
  const channel = useClient((state) => (voice ? state.channelsById[voice.channelId] : undefined));
  const guild = useClient((state) => (voice ? state.guilds[voice.guildId] : undefined));
  const selfId = useClient((state) => state.user?.id);
  const serverState = useClient((state) =>
    voice && selfId ? state.voiceStatesByGuild[voice.guildId]?.[selfId] : undefined,
  );
  const leaveVoice = useClient((state) => state.leaveVoice);
  const setSelfMute = useClient((state) => state.setSelfMute);
  const setSelfDeaf = useClient((state) => state.setSelfDeaf);
  const getRest = useClient((state) => state.getRest);
  const togglePanel = useUI((state) => state.togglePanel);
  const toast = useUI((state) => state.toast);
  const powers = useGuildPowers(voice?.guildId ?? null);

  const [stageBusy, setStageBusy] = useState(false);

  if (!voice) return null;

  const name = channel && "name" in channel ? (channel.name ?? voice.channelId) : voice.channelId;
  const isStage = channel?.type === STAGE;
  // A stage puts everyone in the audience first; speaking needs the suppress
  // flag lifted, which only Mute Members can do for yourself.
  const suppressed = isStage && serverState?.suppress !== false;
  const canUnsuppress = powers.can(PermissionFlagsBits.MuteMembers);

  async function goOnStage() {
    if (!voice) return;
    setStageBusy(true);
    try {
      await voiceApi.setSelfStageState(getRest(), voice.guildId, voice.channelId, {
        suppress: false,
      });
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not go on stage.", "error");
    } finally {
      setStageBusy(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-black/20 bg-panel-alt px-2 py-2">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${voice.connecting ? "bg-amber" : "bg-online"}`}
        />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-semibold text-online">
            {voice.connecting ? "Connecting…" : "Voice connected"}
          </span>
          <span className="block truncate text-[11px] text-muted" title={`${name}${guild ? ` / ${guild.name}` : ""}`}>
            {name}
            {guild ? ` / ${guild.name}` : ""}
          </span>
        </span>
        <Tooltip label="Leave voice">
          <button
            type="button"
            onClick={leaveVoice}
            aria-label="Leave voice"
            className="grid h-8 w-8 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-hover hover:text-danger"
          >
            <DisconnectIcon />
          </button>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1">
        <VoiceToggle
          active={voice.selfMute}
          onClick={() => setSelfMute(!voice.selfMute)}
          label={voice.selfMute ? "Unmute" : "Mute"}
          icon={voice.selfMute ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
        />
        <VoiceToggle
          active={voice.selfDeaf}
          onClick={() => setSelfDeaf(!voice.selfDeaf)}
          label={voice.selfDeaf ? "Undeafen" : "Deafen"}
          icon={voice.selfDeaf ? <DeafIcon size={16} /> : <HeadphonesIcon size={16} />}
        />
        <button
          type="button"
          onClick={() => togglePanel("soundboard")}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded bg-raised text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-bright"
        >
          <SoundboardIcon size={14} />
          Soundboard
        </button>
      </div>

      {suppressed && (
        <button
          type="button"
          disabled={!canUnsuppress || stageBusy}
          onClick={() => void goOnStage()}
          title={canUnsuppress ? undefined : "The bot is missing the Mute Members permission."}
          className="mt-1.5 w-full rounded bg-raised px-2 py-1 text-[11px] text-muted transition-colors hover:bg-hover hover:text-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stageBusy ? "Going on stage…" : "Go on stage"}
        </button>
      )}

      {/* Microphone, file playback and listening, when a bridge is running. */}
      <StreamControls />
    </div>
  );
}

function VoiceToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded transition-colors ${
          active ? "bg-danger/20 text-danger hover:bg-danger/30" : "text-muted hover:bg-hover hover:text-bright"
        }`}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
