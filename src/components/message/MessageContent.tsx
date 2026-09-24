"use client";

import { MessageType, type APIMessage } from "discord-api-types/v10";
import { userAvatarUrl } from "@/lib/discord/cdn";
import { Markdown } from "@/lib/markdown";
import { useClient } from "@/lib/store/client";
import { Attachments } from "./Attachments";
import { contentIsOnlyEmbedLinks } from "./embedMedia";
import { EmbedCard } from "./EmbedCard";
import { PollCard, PollResultNotice } from "./PollCard";

export interface MessageContentProps {
  message: APIMessage;
}

/** Full body of one message: reply preview, markdown, poll, embeds and attachments. */
export function MessageContent({ message }: MessageContentProps) {
  const guildId = useMessageGuildId(message);

  // Its reference and embed only exist to feed this one line.
  if (message.type === MessageType.PollResult) return <PollResultNotice message={message} />;

  const edited = message.edited_timestamp;
  /*
   * A message that is only a link to an image shows the image and not the link:
   * the embed below already is the content. The text stays until the embed
   * arrives, which for a fresh message is one MESSAGE_UPDATE later.
   */
  const linkOnly = contentIsOnlyEmbedLinks(message.content, message.embeds);

  const editedMarker = edited ? (
    <time
      suppressHydrationWarning
      dateTime={edited}
      title={`Edited ${new Date(edited).toLocaleString("en-US")}`}
      className="ml-1 align-baseline text-[10px] text-muted"
    >
      (edited)
    </time>
  ) : null;

  return (
    <div className="min-w-0">
      {message.message_reference && (
        <ReplyPreview message={message} guildId={guildId} />
      )}

      {message.content && !linkOnly ? (
        <Markdown
          content={message.content}
          guildId={guildId}
          trailing={editedMarker}
          className="text-sm leading-relaxed break-words"
        />
      ) : (
        editedMarker
      )}

      {message.poll && <PollCard message={message} poll={message.poll} />}

      {message.attachments?.length > 0 && <Attachments attachments={message.attachments} />}

      {message.embeds?.map((embed, index) => (
        <EmbedCard key={index} embed={embed} guildId={guildId} />
      ))}
    </div>
  );
}

/** Messages from REST carry no guild_id, so the channel cache fills it in. */
function useMessageGuildId(message: APIMessage): string | null {
  // The gateway adds guild_id; the type does not declare it.
  const attached = (message as APIMessage & { guild_id?: string }).guild_id;
  return useClient((state) => {
    if (attached) return attached;
    const channel = state.channelsById[message.channel_id];
    return channel && "guild_id" in channel ? (channel.guild_id ?? null) : null;
  });
}

function ReplyPreview({ message, guildId }: { message: APIMessage; guildId: string | null }) {
  const referenced = message.referenced_message;

  if (!referenced) {
    return (
      <p className="mb-0.5 flex items-center gap-1 text-xs text-muted">
        <span aria-hidden>↰</span>
        Original message is unavailable.
      </p>
    );
  }

  const nick = (referenced as APIMessage & { member?: { nick?: string | null } }).member?.nick;
  const name = nick ?? referenced.author.global_name ?? referenced.author.username;
  const preview = previewText(referenced);

  return (
    <div className="mb-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
      <span aria-hidden>↰</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={userAvatarUrl(referenced.author, 32)} alt="" className="h-4 w-4 rounded-full" />
      <span className="shrink-0 font-medium text-text/80">{name}</span>
      <span className="min-w-0 truncate">
        {preview ? (
          <Markdown content={preview} guildId={guildId} inline />
        ) : referenced.poll ? (
          <span className="italic">📊 {referenced.poll.question.text ?? "Poll"}</span>
        ) : (
          <span className="italic">attachment or embed</span>
        )}
      </span>
    </div>
  );
}

/** One-line quote of the replied-to message. */
function previewText(message: APIMessage): string {
  return message.content.replace(/\s*\n+\s*/g, " ").slice(0, 160).trim();
}
