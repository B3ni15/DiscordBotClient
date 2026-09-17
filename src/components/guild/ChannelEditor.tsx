"use client";

import { useMemo, useState } from "react";
import { ChannelType, OverwriteType, PermissionFlagsBits } from "discord-api-types/v10";
import type { APIChannel } from "discord-api-types/v10";
import { Field, Modal, ModalActions, Switch, inputClass } from "@/components/ui/Modal";
import { guildApi, type ChannelBody } from "@/lib/discord/guildApi";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

/** The channel kinds this client can create, in Discord's own order. */
const CREATABLE: Array<{ type: ChannelType; label: string; glyph: string; blurb: string }> = [
  { type: ChannelType.GuildText, label: "Text", glyph: "#", blurb: "Send messages, images and files." },
  { type: ChannelType.GuildVoice, label: "Voice", glyph: "🔊", blurb: "Hang out together with voice and video." },
  {
    type: ChannelType.GuildAnnouncement,
    label: "Announcement",
    glyph: "📢",
    blurb: "Posts can be published to following servers.",
  },
  { type: ChannelType.GuildStageVoice, label: "Stage", glyph: "📡", blurb: "An audience listens to the speakers." },
  { type: ChannelType.GuildForum, label: "Forum", glyph: "🗂", blurb: "Conversations live in their own posts." },
  { type: ChannelType.GuildCategory, label: "Category", glyph: "📁", blurb: "Groups channels together." },
];

const SLOWMODE_STEPS = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];

const TEXT_LIKE = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);
const VOICE_LIKE = new Set<ChannelType>([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

export interface ChannelEditorProps {
  guildId: string;
  /** Set to edit an existing channel; left out to create one. */
  channelId?: string;
  /** Category the new channel should land in. */
  parentId?: string | null;
  /** Pre-selected kind for a new channel. */
  initialType?: ChannelType;
  onClose: () => void;
}

/** Creates a channel or edits one, with the fields Discord offers per kind. */
export function ChannelEditor({
  guildId,
  channelId,
  parentId = null,
  initialType = ChannelType.GuildText,
  onClose,
}: ChannelEditorProps) {
  const channel = useClient((state) => (channelId ? state.channelsById[channelId] : undefined));
  const channelIds = useClient((state) => state.channelsByGuild[guildId]);
  const channelsById = useClient((state) => state.channelsById);
  const getRest = useClient((state) => state.getRest);
  const upsertChannel = useClient((state) => state.upsertChannel);
  const selectChannel = useClient((state) => state.selectChannel);
  const toast = useUI((state) => state.toast);

  const editing = channel !== undefined;
  const [type, setType] = useState<ChannelType>(channel?.type ?? initialType);
  const [name, setName] = useState(channel && "name" in channel ? (channel.name ?? "") : "");
  const [topic, setTopic] = useState(
    channel && "topic" in channel ? (channel.topic ?? "") : "",
  );
  const [nsfw, setNsfw] = useState(channel && "nsfw" in channel ? (channel.nsfw ?? false) : false);
  const [slowmode, setSlowmode] = useState(
    channel && "rate_limit_per_user" in channel ? (channel.rate_limit_per_user ?? 0) : 0,
  );
  const [userLimit, setUserLimit] = useState(
    channel && "user_limit" in channel ? (channel.user_limit ?? 0) : 0,
  );
  const [bitrate, setBitrate] = useState(
    channel && "bitrate" in channel ? (channel.bitrate ?? 64000) : 64000,
  );
  const [parent, setParent] = useState<string | null>(
    channel && "parent_id" in channel ? (channel.parent_id ?? null) : parentId,
  );
  const [privateChannel, setPrivateChannel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(
    () =>
      (channelIds ?? [])
        .map((id) => channelsById[id])
        .filter(
          (entry): entry is APIChannel =>
            entry !== undefined && entry.type === ChannelType.GuildCategory,
        ),
    [channelIds, channelsById],
  );

  const isCategory = type === ChannelType.GuildCategory;
  const isTextLike = TEXT_LIKE.has(type);
  const isVoiceLike = VOICE_LIKE.has(type);

  async function submit() {
    const trimmed = normalizeName(name, type);
    if (!trimmed) {
      setError("A channel needs a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const body: ChannelBody = { name: trimmed, parent_id: parent };
        if (isTextLike) {
          body.topic = topic.trim() || null;
          body.nsfw = nsfw;
          body.rate_limit_per_user = slowmode;
        }
        if (isVoiceLike) {
          body.user_limit = userLimit;
          body.bitrate = bitrate;
        }
        if (isCategory) {
          delete body.parent_id;
        }
        const saved = await guildApi.editChannel(
          getRest(),
          channel.id,
          body,
          "Edited from DiscordBotClient",
        );
        upsertChannel(saved);
        toast(`Saved #${trimmed}.`);
      } else {
        const body: ChannelBody = { name: trimmed, type };
        if (!isCategory && parent) body.parent_id = parent;
        if (isTextLike && topic.trim()) body.topic = topic.trim();
        if (isTextLike && slowmode) body.rate_limit_per_user = slowmode;
        if (isTextLike && nsfw) body.nsfw = true;
        if (isVoiceLike && userLimit) body.user_limit = userLimit;
        if (privateChannel) {
          // A private channel is just @everyone denied View Channel.
          body.permission_overwrites = [
            {
              id: guildId,
              type: OverwriteType.Role,
              deny: PermissionFlagsBits.ViewChannel.toString(),
              allow: "0",
            },
          ];
        }
        const created = await guildApi.createChannel(
          getRest(),
          guildId,
          body,
          "Created from DiscordBotClient",
        );
        upsertChannel(created);
        toast(`Created ${isCategory ? "" : "#"}${trimmed}.`);
        // Jump straight into a new channel that can hold messages.
        if (!isCategory && !VOICE_LIKE.has(created.type)) void selectChannel(created.id);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discord refused the change.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? `Edit ${nameOf(channel)}` : "Create channel"}
      subtitle={
        editing
          ? undefined
          : parent
            ? `Inside ${nameOf(channelsById[parent])}`
            : "At the top level of the server"
      }
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          onConfirm={() => void submit()}
          confirmLabel={editing ? "Save changes" : "Create channel"}
          busy={busy}
        />
      }
    >
      {!editing && (
        <Field label="Channel type">
          <ul className="flex flex-col gap-1">
            {CREATABLE.map((entry) => (
              <li key={entry.type}>
                <button
                  type="button"
                  onClick={() => setType(entry.type)}
                  className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-colors ${
                    type === entry.type ? "bg-raised" : "bg-ink hover:bg-hover"
                  }`}
                >
                  <span aria-hidden className="w-5 text-center text-base text-muted">
                    {entry.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-bright">{entry.label}</span>
                    <span className="block text-[11px] text-muted">{entry.blurb}</span>
                  </span>
                  {type === entry.type && (
                    <span aria-hidden className="text-accent">
                      ●
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}

      <Field
        label="Channel name"
        htmlFor="channel-name"
        hint={
          isTextLike && !editing
            ? "Spaces and capitals become dashes and lowercase, the way Discord stores them."
            : undefined
        }
      >
        <input
          id="channel-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder={isCategory ? "New Category" : isVoiceLike ? "General" : "new-channel"}
          className={inputClass}
        />
      </Field>

      {!isCategory && categories.length > 0 && (
        <Field label="Category" htmlFor="channel-parent">
          <select
            id="channel-parent"
            value={parent ?? ""}
            onChange={(event) => setParent(event.target.value || null)}
            className={inputClass}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {nameOf(category)}
              </option>
            ))}
          </select>
        </Field>
      )}

      {isTextLike && (
        <Field label="Topic" htmlFor="channel-topic">
          <textarea
            id="channel-topic"
            value={topic}
            maxLength={1024}
            rows={3}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="What is this channel about?"
            className={`${inputClass} resize-y`}
          />
        </Field>
      )}

      {isTextLike && (
        <Field
          label="Slowmode"
          htmlFor="channel-slowmode"
          hint="Members without Manage Messages wait this long between messages."
        >
          <select
            id="channel-slowmode"
            value={slowmode}
            onChange={(event) => setSlowmode(Number(event.target.value))}
            className={inputClass}
          >
            {SLOWMODE_STEPS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {formatSeconds(seconds)}
              </option>
            ))}
          </select>
        </Field>
      )}

      {isVoiceLike && (
        <Field
          label="User limit"
          htmlFor="channel-limit"
          hint="0 means no limit."
        >
          <input
            id="channel-limit"
            type="number"
            min={0}
            max={99}
            value={userLimit}
            onChange={(event) => setUserLimit(Math.max(0, Math.min(99, Number(event.target.value))))}
            className={inputClass}
          />
        </Field>
      )}

      {isVoiceLike && editing && (
        <Field label="Bitrate" htmlFor="channel-bitrate" hint="8000 – 96000 on an unboosted server.">
          <input
            id="channel-bitrate"
            type="number"
            min={8000}
            max={384000}
            step={1000}
            value={bitrate}
            onChange={(event) => setBitrate(Number(event.target.value))}
            className={inputClass}
          />
        </Field>
      )}

      {isTextLike && (
        <Switch
          checked={nsfw}
          onChange={setNsfw}
          label="Age-restricted channel"
          description="Members confirm their age before they can open it."
        />
      )}

      {!editing && !isCategory && (
        <Switch
          checked={privateChannel}
          onChange={setPrivateChannel}
          label="Private channel"
          description="Only members and roles you allow can see it."
        />
      )}

      {error && (
        <p role="alert" className="text-sm leading-relaxed text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}

/** Discord stores text channel names lowercased with dashes for spaces. */
function normalizeName(name: string, type: ChannelType): string {
  const trimmed = name.trim();
  if (!TEXT_LIKE.has(type)) return trimmed;
  return trimmed.toLowerCase().replace(/\s+/g, "-").replace(/-{2,}/g, "-");
}

function nameOf(channel: APIChannel | undefined): string {
  if (!channel) return "channel";
  return ("name" in channel ? channel.name : null) ?? channel.id;
}

function formatSeconds(seconds: number): string {
  if (seconds === 0) return "Off";
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
}
