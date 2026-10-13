import { MessageType } from "discord-api-types/v10";
import type {
  APIAttachment,
  APIChannel,
  APIEmbed,
  APIGuildMember,
  APIMessage,
  APIRole,
  APIUser,
} from "discord-api-types/v10";
import { emojiUrl, memberAvatarUrl, userAvatarUrl } from "@/lib/discord/cdn";
import { memberColorHex, roleColorHex } from "@/lib/discord/roles";
import { formatFullTimestamp, formatTimestamp, parseMarkdown, safeUrl } from "@/lib/markdown";
import type { BlockNode, InlineNode, TimestampStyle } from "@/lib/markdown";

/**
 * Output formats, the same set DiscordChatExporter offers.
 */
export type ExportFormat = "html-dark" | "html-light" | "txt" | "json" | "csv";

export const FORMATS: { id: ExportFormat; label: string; extension: string; hint: string }[] = [
  { id: "html-dark", label: "HTML (Dark)", extension: "html", hint: "Looks like Discord, dark theme." },
  { id: "html-light", label: "HTML (Light)", extension: "html", hint: "Looks like Discord, light theme." },
  { id: "txt", label: "Plain text", extension: "txt", hint: "Readable anywhere, no formatting." },
  { id: "json", label: "JSON", extension: "json", hint: "Every field, for scripts and archives." },
  { id: "csv", label: "CSV", extension: "csv", hint: "One row per message, for spreadsheets." },
];

/** Everything a renderer needs besides the messages themselves. */
export interface ExportContext {
  guild: { id: string; name: string; iconUrl: string | null };
  channel: APIChannel;
  channelName: string;
  /** The category, or the parent channel for a thread. */
  parentName: string | null;
  topic: string | null;
  after: Date | null;
  before: Date | null;
  exportedAt: Date;
  roles: Map<string, APIRole>;
  /** Known members; null marks someone looked up and not found. */
  members: Map<string, APIGuildMember | null>;
  /** Name of any channel in the guild, for `<#id>` mentions. */
  lookupChannel: (id: string) => string | null;
  /** What the export should point at for a remote file: a local copy or the URL itself. */
  asset: (url: string) => string;
}

export function renderExport(
  format: ExportFormat,
  messages: APIMessage[],
  ctx: ExportContext,
): string {
  switch (format) {
    case "html-dark":
      return renderHtml(messages, ctx, "dark");
    case "html-light":
      return renderHtml(messages, ctx, "light");
    case "txt":
      return renderText(messages, ctx);
    case "json":
      return renderJson(messages, ctx);
    case "csv":
      return renderCsv(messages, ctx);
  }
}

// Shared --------------------------------------------------------------------

const DATE_TIME: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
};

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", DATE_TIME);
}

interface Author {
  id: string;
  name: string;
  username: string;
  color: string | null;
  avatar: string;
  bot: boolean;
}

function authorOf(user: APIUser, ctx: ExportContext): Author {
  const member = ctx.members.get(user.id) ?? null;
  return {
    id: user.id,
    name: member?.nick ?? user.global_name ?? user.username,
    username: user.discriminator && user.discriminator !== "0"
      ? `${user.username}#${user.discriminator}`
      : user.username,
    color: member ? memberColorHex(member, ctx.roles) : null,
    avatar:
      (member?.avatar ? memberAvatarUrl(ctx.guild.id, user.id, member.avatar, 128) : null) ??
      userAvatarUrl(user, 128),
    bot: user.bot === true,
  };
}

function userName(id: string, mentions: APIUser[], ctx: ExportContext): string | null {
  const member = ctx.members.get(id);
  if (member) return member.nick ?? member.user?.global_name ?? member.user?.username ?? null;
  const mentioned = mentions.find((user) => user.id === id);
  return mentioned ? (mentioned.global_name ?? mentioned.username) : null;
}

/**
 * "In 3 days" is only true at the moment it is read, and an export is read
 * later; relative timestamps are written out as dates instead.
 */
function absoluteStyle(style: string | undefined): Exclude<TimestampStyle, "R"> {
  return !style || style === "R" ? "f" : (style as Exclude<TimestampStyle, "R">);
}

/** Message text with mentions, emoji and timestamps spelled out. */
function plainContent(content: string, mentions: APIUser[], ctx: ExportContext): string {
  return content
    .replace(/<@!?(\d{15,25})>/g, (_, id: string) => `@${userName(id, mentions, ctx) ?? "Unknown"}`)
    .replace(/<@&(\d{15,25})>/g, (_, id: string) => `@${ctx.roles.get(id)?.name ?? "deleted-role"}`)
    .replace(/<#(\d{15,25})>/g, (_, id: string) => `#${ctx.lookupChannel(id) ?? "deleted-channel"}`)
    .replace(/<\/([^:>]{1,64}):\d{15,25}>/g, "/$1")
    .replace(/<a?:(\w{2,32}):\d{15,25}>/g, ":$1:")
    .replace(/<t:(-?\d{1,13})(?::([tTdDfFR]))?>/g, (_, unix: string, style?: string) =>
      formatTimestamp(Number(unix), absoluteStyle(style)),
    );
}

const SYSTEM_TYPES = new Set<MessageType>([
  MessageType.RecipientAdd,
  MessageType.RecipientRemove,
  MessageType.ChannelNameChange,
  MessageType.ChannelPinnedMessage,
  MessageType.UserJoin,
  MessageType.GuildBoost,
  MessageType.GuildBoostTier1,
  MessageType.GuildBoostTier2,
  MessageType.GuildBoostTier3,
  MessageType.ChannelFollowAdd,
  MessageType.ThreadCreated,
]);

/** The line Discord prints in place of content for system messages. */
function systemText(message: APIMessage, ctx: ExportContext): string | null {
  if (!SYSTEM_TYPES.has(message.type)) return null;
  const who = authorOf(message.author, ctx).name;
  switch (message.type) {
    case MessageType.RecipientAdd:
      return `${who} added ${message.mentions[0]?.username ?? "someone"} to the group.`;
    case MessageType.RecipientRemove:
      return `${who} removed ${message.mentions[0]?.username ?? "someone"} from the group.`;
    case MessageType.ChannelNameChange:
      return `${who} changed the channel name: ${message.content}`;
    case MessageType.ChannelPinnedMessage:
      return `${who} pinned a message to this channel.`;
    case MessageType.UserJoin:
      return `${who} joined the server.`;
    case MessageType.GuildBoost:
      return `${who} just boosted the server!`;
    case MessageType.GuildBoostTier1:
    case MessageType.GuildBoostTier2:
    case MessageType.GuildBoostTier3:
      return `${who} just boosted the server! It reached a new level.`;
    case MessageType.ChannelFollowAdd:
      return `${who} added ${message.content} to this channel.`;
    case MessageType.ThreadCreated:
      return `${who} started a thread: ${message.content}`;
    default:
      return null;
  }
}

function fileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function stickerUrl(sticker: { id: string; format_type: number }): string | null {
  // 3 is Lottie, which is JSON and not a picture.
  if (sticker.format_type === 3) return null;
  const extension = sticker.format_type === 4 ? "gif" : "png";
  return `https://media.discordapp.net/stickers/${sticker.id}.${extension}`;
}

function reactionEmojiUrl(emoji: { id: string | null; animated?: boolean }): string | null {
  return emoji.id ? emojiUrl(emoji.id, emoji.animated === true, 48) : null;
}

/** Messages of a forward carry their content in a snapshot instead. */
function snapshotOf(message: APIMessage) {
  const snapshot = message.message_snapshots?.[0]?.message;
  return snapshot ?? null;
}

// Plain text ------------------------------------------------------------------

const RULE = "=".repeat(62);

function renderText(messages: APIMessage[], ctx: ExportContext): string {
  const lines: string[] = [RULE, `Guild: ${ctx.guild.name}`];
  lines.push(`Channel: ${ctx.parentName ? `${ctx.parentName} / ` : ""}${ctx.channelName}`);
  if (ctx.topic) lines.push(`Topic: ${plainContent(ctx.topic, [], ctx)}`);
  if (ctx.after) lines.push(`After: ${formatDate(ctx.after)}`);
  if (ctx.before) lines.push(`Before: ${formatDate(ctx.before)}`);
  lines.push(RULE, "");

  for (const message of messages) {
    const author = authorOf(message.author, ctx);
    lines.push(`[${formatDate(message.timestamp)}] ${author.name}${message.pinned ? " (pinned)" : ""}`);

    const system = systemText(message, ctx);
    const snapshot = snapshotOf(message);
    if (system) lines.push(system);
    else if (message.content) lines.push(plainContent(message.content, message.mentions, ctx));
    if (snapshot) {
      lines.push("{Forwarded}");
      if (snapshot.content) lines.push(plainContent(snapshot.content, message.mentions, ctx));
      for (const attachment of snapshot.attachments ?? []) lines.push(ctx.asset(attachment.url));
    }

    if (message.attachments.length) {
      lines.push("{Attachments}");
      for (const attachment of message.attachments) lines.push(ctx.asset(attachment.url));
    }

    for (const embed of message.embeds) {
      lines.push("{Embed}");
      if (embed.author?.name) lines.push(embed.author.name);
      if (embed.url) lines.push(embed.url);
      if (embed.title) lines.push(plainContent(embed.title, message.mentions, ctx));
      if (embed.description) lines.push(plainContent(embed.description, message.mentions, ctx));
      for (const field of embed.fields ?? []) {
        lines.push(plainContent(field.name, message.mentions, ctx), plainContent(field.value, message.mentions, ctx));
      }
      if (embed.thumbnail?.url) lines.push(ctx.asset(embed.thumbnail.url));
      if (embed.image?.url) lines.push(ctx.asset(embed.image.url));
      if (embed.footer?.text) lines.push(embed.footer.text);
    }

    if (message.sticker_items?.length) {
      lines.push("{Stickers}");
      for (const sticker of message.sticker_items) {
        const url = stickerUrl(sticker);
        lines.push(url ? ctx.asset(url) : sticker.name);
      }
    }

    if (message.poll) {
      lines.push("{Poll}", message.poll.question.text ?? "");
      for (const answer of message.poll.answers) {
        const votes = message.poll.results?.answer_counts.find((c) => c.id === answer.answer_id);
        lines.push(`- ${answer.poll_media.text ?? ""} (${votes?.count ?? 0})`);
      }
    }

    if (message.reactions?.length) {
      lines.push("{Reactions}");
      lines.push(
        message.reactions
          .map((reaction) => {
            const emoji = reaction.emoji.id ? `:${reaction.emoji.name}:` : (reaction.emoji.name ?? "");
            return `${emoji} (${reaction.count})`;
          })
          .join(" "),
      );
    }

    lines.push("");
  }

  lines.push(RULE, `Exported ${messages.length} message(s)`, RULE, "");
  return lines.join("\n");
}

// CSV -------------------------------------------------------------------------

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function renderCsv(messages: APIMessage[], ctx: ExportContext): string {
  const rows = [["AuthorID", "Author", "Date", "Content", "Attachments", "Reactions"]];
  for (const message of messages) {
    const author = authorOf(message.author, ctx);
    rows.push([
      author.id,
      author.username,
      new Date(message.timestamp).toISOString(),
      systemText(message, ctx) ?? plainContent(message.content, message.mentions, ctx),
      message.attachments.map((attachment) => ctx.asset(attachment.url)).join(","),
      (message.reactions ?? [])
        .map((reaction) => `${reaction.emoji.name ?? ""} (${reaction.count})`)
        .join(","),
    ]);
  }
  // A BOM makes Excel read the file as UTF-8 instead of the system code page.
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// JSON ------------------------------------------------------------------------

function jsonUser(user: APIUser, ctx: ExportContext) {
  const author = authorOf(user, ctx);
  const member = ctx.members.get(user.id) ?? null;
  return {
    id: user.id,
    name: user.username,
    discriminator: user.discriminator,
    nickname: author.name,
    color: author.color,
    isBot: author.bot,
    roles: member
      ? member.roles
          .map((id) => ctx.roles.get(id))
          .filter((role): role is APIRole => role !== undefined)
          .sort((a, b) => b.position - a.position)
          .map((role) => ({ id: role.id, name: role.name, color: roleColorHex(role.color), position: role.position }))
      : [],
    avatarUrl: ctx.asset(author.avatar),
  };
}

function jsonAttachment(attachment: APIAttachment, ctx: ExportContext) {
  return {
    id: attachment.id,
    url: ctx.asset(attachment.url),
    fileName: attachment.filename,
    fileSizeBytes: attachment.size,
    contentType: attachment.content_type ?? null,
  };
}

function jsonEmbed(embed: APIEmbed, ctx: ExportContext) {
  return {
    ...embed,
    thumbnail: embed.thumbnail ? { ...embed.thumbnail, url: ctx.asset(embed.thumbnail.url) } : undefined,
    image: embed.image ? { ...embed.image, url: ctx.asset(embed.image.url) } : undefined,
  };
}

function renderJson(messages: APIMessage[], ctx: ExportContext): string {
  const document = {
    guild: {
      id: ctx.guild.id,
      name: ctx.guild.name,
      iconUrl: ctx.guild.iconUrl ? ctx.asset(ctx.guild.iconUrl) : null,
    },
    channel: {
      id: ctx.channel.id,
      type: ctx.channel.type,
      categoryId: "parent_id" in ctx.channel ? (ctx.channel.parent_id ?? null) : null,
      category: ctx.parentName,
      name: ctx.channelName,
      topic: ctx.topic,
    },
    dateRange: {
      after: ctx.after?.toISOString() ?? null,
      before: ctx.before?.toISOString() ?? null,
    },
    exportedAt: ctx.exportedAt.toISOString(),
    messages: messages.map((message) => ({
      id: message.id,
      type: message.type,
      timestamp: message.timestamp,
      timestampEdited: message.edited_timestamp,
      isPinned: message.pinned,
      content: systemText(message, ctx) ?? plainContent(message.content, message.mentions, ctx),
      rawContent: message.content,
      author: jsonUser(message.author, ctx),
      attachments: message.attachments.map((attachment) => jsonAttachment(attachment, ctx)),
      embeds: message.embeds.map((embed) => jsonEmbed(embed, ctx)),
      stickers: (message.sticker_items ?? []).map((sticker) => {
        const url = stickerUrl(sticker);
        return { id: sticker.id, name: sticker.name, format: sticker.format_type, sourceUrl: url ? ctx.asset(url) : null };
      }),
      reactions: (message.reactions ?? []).map((reaction) => {
        const url = reactionEmojiUrl(reaction.emoji);
        return {
          emoji: {
            id: reaction.emoji.id,
            name: reaction.emoji.name,
            isAnimated: reaction.emoji.animated === true,
            imageUrl: url ? ctx.asset(url) : null,
          },
          count: reaction.count,
        };
      }),
      mentions: message.mentions.map((user) => ({
        id: user.id,
        name: user.username,
        nickname: userName(user.id, message.mentions, ctx),
        isBot: user.bot === true,
      })),
      reference: message.message_reference
        ? {
            messageId: message.message_reference.message_id ?? null,
            channelId: message.message_reference.channel_id ?? null,
            guildId: message.message_reference.guild_id ?? null,
          }
        : undefined,
      poll: message.poll ?? undefined,
      forwarded: snapshotOf(message) ?? undefined,
    })),
    messageCount: messages.length,
  };
  return JSON.stringify(document, null, 2);
}

// HTML ------------------------------------------------------------------------

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

class HtmlMarkdown {
  constructor(
    private readonly ctx: ExportContext,
    /** Users the text mentions, which name them when no member is known. */
    private readonly mentions: APIUser[] = [],
  ) {}

  blocks(content: string): string {
    return parseMarkdown(content)
      .map((block) => this.block(block))
      .join("");
  }

  private block(block: BlockNode): string {
    switch (block.type) {
      case "paragraph":
        return `<div class="md-p">${this.inline(block.children)}</div>`;
      case "heading":
        return `<div class="md-h${block.level}">${this.inline(block.children)}</div>`;
      case "subtext":
        return `<div class="md-sub">${this.inline(block.children)}</div>`;
      case "quote":
        return `<blockquote class="md-quote">${block.children.map((child) => this.block(child)).join("")}</blockquote>`;
      case "codeBlock":
        return `<pre class="md-pre">${block.lang ? `<span class="md-lang">${esc(block.lang)}</span>` : ""}<code>${esc(block.code)}</code></pre>`;
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
        const items = block.items
          .map((item) => `<li>${item.map((child) => this.block(child)).join("")}</li>`)
          .join("");
        return `<${tag} class="md-list"${start}>${items}</${tag}>`;
      }
    }
  }

  inline(nodes: InlineNode[]): string {
    return nodes.map((node) => this.node(node)).join("");
  }

  private node(node: InlineNode): string {
    const { ctx, mentions } = this;
    switch (node.type) {
      case "text":
        return esc(node.value).replace(/\n/g, "<br>");
      case "code":
        return `<code class="md-code">${esc(node.value)}</code>`;
      case "bold":
        return `<strong>${this.inline(node.children)}</strong>`;
      case "italic":
        return `<em>${this.inline(node.children)}</em>`;
      case "underline":
        return `<u>${this.inline(node.children)}</u>`;
      case "strike":
        return `<s>${this.inline(node.children)}</s>`;
      case "spoiler":
        return `<span class="spoiler" onclick="this.classList.add('shown')">${this.inline(node.children)}</span>`;
      case "link": {
        const href = safeUrl(node.url);
        const label = this.inline(node.children);
        return href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${label}</a>` : label;
      }
      case "userMention":
        return `<span class="mention">@${esc(userName(node.id, mentions, ctx) ?? "Unknown")}</span>`;
      case "roleMention": {
        const role = ctx.roles.get(node.id);
        const color = role ? roleColorHex(role.color) : null;
        const style = color ? ` style="color:${color};background:${color}1a"` : "";
        return `<span class="mention"${style}>@${esc(role?.name ?? "deleted-role")}</span>`;
      }
      case "channelMention":
        return `<span class="mention">#${esc(ctx.lookupChannel(node.id) ?? "deleted-channel")}</span>`;
      case "commandMention":
        return `<span class="mention">/${esc(node.name)}</span>`;
      case "broadcast":
        return `<span class="mention">@${node.name}</span>`;
      case "timestamp":
        return `<span class="md-time" title="${esc(formatFullTimestamp(node.unix))}">${esc(formatTimestamp(node.unix, absoluteStyle(node.style)))}</span>`;
      case "emoji": {
        const src = ctx.asset(emojiUrl(node.id, node.animated, 96));
        return `<img class="emoji" src="${esc(src)}" alt=":${esc(node.name)}:" title=":${esc(node.name)}:" loading="lazy">`;
      }
    }
  }
}

/** Discord folds a run of messages from one author into a group within 7 minutes. */
function startsGroup(previous: APIMessage | undefined, message: APIMessage): boolean {
  if (!previous) return true;
  if (previous.author.id !== message.author.id) return true;
  if (message.message_reference && message.type === MessageType.Reply) return true;
  if (SYSTEM_TYPES.has(previous.type)) return true;
  return Date.parse(message.timestamp) - Date.parse(previous.timestamp) > 7 * 60_000;
}

function htmlAttachment(attachment: APIAttachment, ctx: ExportContext): string {
  const src = esc(ctx.asset(attachment.url));
  const type = attachment.content_type ?? "";
  const spoiler = attachment.filename.startsWith("SPOILER_");
  const wrap = (inner: string) =>
    spoiler
      ? `<div class="attachment spoiler-media" onclick="this.classList.add('shown')">${inner}</div>`
      : `<div class="attachment">${inner}</div>`;

  if (type.startsWith("image/")) {
    return wrap(`<a href="${src}" target="_blank" rel="noopener"><img class="media" src="${src}" alt="${esc(attachment.description ?? attachment.filename)}" loading="lazy"></a>`);
  }
  if (type.startsWith("video/")) {
    return wrap(`<video class="media" controls preload="metadata" src="${src}"></video>`);
  }
  if (type.startsWith("audio/")) {
    return wrap(`<div class="file"><div class="file-name">${esc(attachment.filename)}</div><audio controls preload="metadata" src="${src}"></audio></div>`);
  }
  return wrap(
    `<div class="file"><span class="file-icon">📄</span><div><a class="file-name" href="${src}" target="_blank" rel="noopener">${esc(attachment.filename)}</a><div class="file-size">${fileSize(attachment.size)}</div></div></div>`,
  );
}

function htmlEmbed(embed: APIEmbed, md: HtmlMarkdown, ctx: ExportContext): string {
  // Link previews of a bare image or GIF show just the media.
  if ((embed.type === "image" || embed.type === "gifv") && (embed.thumbnail?.url || embed.image?.url)) {
    const url = embed.image?.url ?? embed.thumbnail!.url;
    return `<div class="attachment"><a href="${esc(embed.url ?? url)}" target="_blank" rel="noopener"><img class="media" src="${esc(ctx.asset(url))}" alt="" loading="lazy"></a></div>`;
  }

  const color = embed.color !== undefined ? `#${embed.color.toString(16).padStart(6, "0")}` : null;
  const parts: string[] = [];

  if (embed.provider?.name) parts.push(`<div class="embed-provider">${esc(embed.provider.name)}</div>`);
  if (embed.author?.name) {
    const icon = embed.author.icon_url
      ? `<img class="embed-author-icon" src="${esc(ctx.asset(embed.author.icon_url))}" alt="">`
      : "";
    const name = embed.author.url
      ? `<a href="${esc(embed.author.url)}" target="_blank" rel="noopener">${esc(embed.author.name)}</a>`
      : esc(embed.author.name);
    parts.push(`<div class="embed-author">${icon}${name}</div>`);
  }
  if (embed.title) {
    const title = md.inline(parseInlineSafe(embed.title));
    parts.push(
      `<div class="embed-title">${embed.url ? `<a href="${esc(embed.url)}" target="_blank" rel="noopener">${title}</a>` : title}</div>`,
    );
  }
  if (embed.description) parts.push(`<div class="embed-description">${md.blocks(embed.description)}</div>`);
  if (embed.fields?.length) {
    const fields = embed.fields
      .map(
        (field) =>
          `<div class="embed-field${field.inline ? " inline" : ""}"><div class="embed-field-name">${md.inline(parseInlineSafe(field.name))}</div><div class="embed-field-value">${md.blocks(field.value)}</div></div>`,
      )
      .join("");
    parts.push(`<div class="embed-fields">${fields}</div>`);
  }
  if (embed.image?.url) {
    parts.push(`<a href="${esc(embed.image.url)}" target="_blank" rel="noopener"><img class="embed-image" src="${esc(ctx.asset(embed.image.url))}" alt="" loading="lazy"></a>`);
  }
  if (embed.footer?.text || embed.timestamp) {
    const icon = embed.footer?.icon_url
      ? `<img class="embed-footer-icon" src="${esc(ctx.asset(embed.footer.icon_url))}" alt="">`
      : "";
    const text = [embed.footer?.text, embed.timestamp ? formatDate(embed.timestamp) : null]
      .filter(Boolean)
      .map((value) => esc(value!))
      .join(" • ");
    parts.push(`<div class="embed-footer">${icon}${text}</div>`);
  }

  const thumbnail =
    embed.thumbnail?.url && embed.type !== "video"
      ? `<img class="embed-thumbnail" src="${esc(ctx.asset(embed.thumbnail.url))}" alt="" loading="lazy">`
      : "";
  const video =
    embed.type === "video" && embed.thumbnail?.url
      ? `<a href="${esc(embed.url ?? embed.thumbnail.url)}" target="_blank" rel="noopener"><img class="embed-image" src="${esc(ctx.asset(embed.thumbnail.url))}" alt="" loading="lazy"></a>`
      : "";

  return `<div class="embed"${color ? ` style="border-color:${color}"` : ""}><div class="embed-body"><div class="embed-main">${parts.join("")}${video}</div>${thumbnail}</div></div>`;
}

/** Embed titles and field names are a single line of inline markdown. */
function parseInlineSafe(text: string): InlineNode[] {
  const [first] = parseMarkdown(text.replace(/\n/g, " "));
  if (first && (first.type === "paragraph" || first.type === "heading" || first.type === "subtext")) {
    return first.children;
  }
  return [{ type: "text", value: text }];
}

function htmlReply(message: APIMessage, ctx: ExportContext): string {
  if (message.type !== MessageType.Reply && message.type !== MessageType.ThreadStarterMessage) return "";
  const referenced = message.referenced_message;
  if (!referenced) {
    return `<div class="reply"><span class="reply-missing">Original message was deleted</span></div>`;
  }
  const author = authorOf(referenced.author, ctx);
  const preview = plainContent(referenced.content, referenced.mentions, ctx).replace(/\s+/g, " ").slice(0, 120);
  const style = author.color ? ` style="color:${author.color}"` : "";
  return `<div class="reply"><img class="reply-avatar" src="${esc(ctx.asset(author.avatar))}" alt=""><span class="reply-author"${style}>${esc(author.name)}</span><a class="reply-content" href="#m-${referenced.id}">${esc(preview || (referenced.attachments.length ? "Click to see attachment" : "Click to see message"))}</a></div>`;
}

function htmlMessageBody(message: APIMessage, ctx: ExportContext): string {
  const md = new HtmlMarkdown(ctx, message.mentions);
  const parts: string[] = [];

  if (message.content) {
    const edited = message.edited_timestamp
      ? ` <span class="edited" title="${esc(formatDate(message.edited_timestamp))}">(edited)</span>`
      : "";
    parts.push(`<div class="content">${md.blocks(message.content)}${edited}</div>`);
  }

  const snapshot = snapshotOf(message);
  if (snapshot) {
    const inner: string[] = [];
    if (snapshot.content) inner.push(`<div class="content">${md.blocks(snapshot.content)}</div>`);
    for (const attachment of snapshot.attachments ?? []) inner.push(htmlAttachment(attachment, ctx));
    for (const embed of snapshot.embeds ?? []) inner.push(htmlEmbed(embed, md, ctx));
    parts.push(`<div class="forward"><div class="forward-label">↪ Forwarded</div>${inner.join("")}</div>`);
  }

  for (const attachment of message.attachments) parts.push(htmlAttachment(attachment, ctx));
  for (const embed of message.embeds) parts.push(htmlEmbed(embed, md, ctx));

  for (const sticker of message.sticker_items ?? []) {
    const url = stickerUrl(sticker);
    parts.push(
      url
        ? `<div class="sticker"><img src="${esc(ctx.asset(url))}" alt="${esc(sticker.name)}" title="${esc(sticker.name)}"></div>`
        : `<div class="sticker-name">[Sticker: ${esc(sticker.name)}]</div>`,
    );
  }

  if (message.poll) {
    const total = message.poll.results?.answer_counts.reduce((sum, c) => sum + c.count, 0) ?? 0;
    const answers = message.poll.answers
      .map((answer) => {
        const count = message.poll!.results?.answer_counts.find((c) => c.id === answer.answer_id)?.count ?? 0;
        const share = total ? Math.round((count / total) * 100) : 0;
        const emoji = answer.poll_media.emoji?.name ? `${esc(answer.poll_media.emoji.name)} ` : "";
        return `<div class="poll-answer"><div class="poll-bar" style="width:${share}%"></div><span>${emoji}${esc(answer.poll_media.text ?? "")}</span><span class="poll-count">${count} · ${share}%</span></div>`;
      })
      .join("");
    parts.push(`<div class="poll"><div class="poll-question">${esc(message.poll.question.text ?? "")}</div>${answers}<div class="poll-total">${total} vote${total === 1 ? "" : "s"}</div></div>`);
  }

  if (message.reactions?.length) {
    const reactions = message.reactions
      .map((reaction) => {
        const url = reactionEmojiUrl(reaction.emoji);
        const emoji = url
          ? `<img class="emoji" src="${esc(ctx.asset(url))}" alt=":${esc(reaction.emoji.name ?? "")}:" title=":${esc(reaction.emoji.name ?? "")}:">`
          : esc(reaction.emoji.name ?? "");
        return `<span class="reaction">${emoji}<span class="reaction-count">${reaction.count}</span></span>`;
      })
      .join("");
    parts.push(`<div class="reactions">${reactions}</div>`);
  }

  return parts.join("");
}

function renderHtml(messages: APIMessage[], ctx: ExportContext, theme: "dark" | "light"): string {
  const body: string[] = [];
  let previous: APIMessage | undefined;

  for (const message of messages) {
    const time = formatDate(message.timestamp);
    const system = systemText(message, ctx);
    const pinned = message.pinned ? " pinned" : "";

    if (system) {
      body.push(
        `<div class="message system${pinned}" id="m-${message.id}"><div class="row"><div class="gutter"><span class="system-icon">→</span></div><div class="main"><span class="system-text">${esc(system)}</span> <span class="time" title="${esc(time)}">${esc(time)}</span></div></div></div>`,
      );
      previous = message;
      continue;
    }

    if (startsGroup(previous, message)) {
      const author = authorOf(message.author, ctx);
      const style = author.color ? ` style="color:${author.color}"` : "";
      const tag = author.bot ? `<span class="bot-tag">${message.webhook_id ? "WEBHOOK" : "BOT"}</span>` : "";
      body.push(
        `<div class="message first${pinned}" id="m-${message.id}">${htmlReply(message, ctx)}<div class="row"><div class="gutter"><img class="avatar" src="${esc(ctx.asset(author.avatar))}" alt="" loading="lazy"></div><div class="main"><div class="header"><span class="author"${style} title="${esc(author.username)}">${esc(author.name)}</span>${tag}<span class="time" title="${esc(time)}">${esc(time)}</span></div>${htmlMessageBody(message, ctx)}</div></div></div>`,
      );
    } else {
      const short = new Date(message.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      body.push(
        `<div class="message${pinned}" id="m-${message.id}"><div class="row"><div class="gutter"><span class="short-time" title="${esc(time)}">${esc(short)}</span></div><div class="main">${htmlMessageBody(message, ctx)}</div></div></div>`,
      );
    }
    previous = message;
  }

  const range = [
    ctx.after ? `After ${formatDate(ctx.after)}` : null,
    ctx.before ? `Before ${formatDate(ctx.before)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const icon = ctx.guild.iconUrl
    ? `<img class="guild-icon" src="${esc(ctx.asset(ctx.guild.iconUrl))}" alt="">`
    : `<div class="guild-icon guild-acronym">${esc(ctx.guild.name.slice(0, 2))}</div>`;
  const title = `${ctx.guild.name} - ${ctx.channelName}`;

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${HTML_STYLE}</style>
</head>
<body>
<header class="preamble">
${icon}
<div class="preamble-text">
<div class="preamble-guild">${esc(ctx.guild.name)}</div>
<div class="preamble-channel">${ctx.parentName ? `${esc(ctx.parentName)} / ` : ""}#${esc(ctx.channelName)}</div>
${ctx.topic ? `<div class="preamble-topic">${new HtmlMarkdown(ctx).blocks(ctx.topic)}</div>` : ""}
${range ? `<div class="preamble-range">${esc(range)}</div>` : ""}
</div>
</header>
<main class="chatlog">
${body.join("\n")}
</main>
<footer class="postamble">Exported ${messages.length.toLocaleString("en-US")} message${messages.length === 1 ? "" : "s"} on ${esc(formatDate(ctx.exportedAt))}</footer>
</body>
</html>
`;
}

const HTML_STYLE = `
:root{--bg:#313338;--panel:#2b2d31;--embed:#2b2d31;--text:#dbdee1;--bright:#f2f3f5;--muted:#949ba4;--faint:#80848e;--line:#3f4147;--hover:#2e3035;--link:#00a8fc;--mention:rgba(88,101,242,.3);--mention-text:#c9cdfb;--code:#1e1f22;--pin:rgba(250,168,26,.08);--accent:#5865f2}
[data-theme=light]{--bg:#ffffff;--panel:#f2f3f5;--embed:#f2f3f5;--text:#313338;--bright:#060607;--muted:#5c5e66;--faint:#80848e;--line:#e3e5e8;--hover:#f7f7f8;--link:#006ce7;--mention:rgba(88,101,242,.15);--mention-text:#505cdc;--code:#ebedef;--pin:rgba(250,168,26,.12)}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:16px/1.375 "gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
.preamble{display:flex;gap:16px;align-items:center;padding:16px;border-bottom:1px solid var(--line)}
.guild-icon{width:64px;height:64px;border-radius:50%;flex-shrink:0;object-fit:cover}
.guild-acronym{display:grid;place-items:center;background:var(--accent);color:#fff;font-weight:600;font-size:20px}
.preamble-guild{font-size:20px;font-weight:700;color:var(--bright)}
.preamble-channel{font-size:16px;font-weight:600;color:var(--bright)}
.preamble-topic,.preamble-range{font-size:14px;color:var(--muted);margin-top:4px}
.chatlog{padding:8px 0 16px}
.message{padding:2px 16px 2px 0}
.message.first{margin-top:16px}
.message:hover{background:var(--hover)}
.message.pinned{background:var(--pin)}
.row{display:flex}
.gutter{width:72px;flex-shrink:0;display:flex;justify-content:center}
.main{min-width:0;flex:1}
.avatar{width:40px;height:40px;border-radius:50%;margin-top:2px}
.header{display:flex;align-items:baseline;gap:6px}
.author{font-weight:500;color:var(--bright)}
.bot-tag{background:var(--accent);color:#fff;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;line-height:15px}
.time{font-size:12px;color:var(--muted)}
.short-time{font-size:11px;color:var(--muted);visibility:hidden;line-height:22px}
.message:hover .short-time{visibility:visible}
.content{overflow-wrap:anywhere}
.edited{font-size:10px;color:var(--muted)}
.message.system{margin-top:8px}.system .gutter{color:#23a55a}.system-icon{line-height:22px}
.system .main{color:var(--muted);font-size:15px}
.reply{display:flex;align-items:center;gap:4px;margin-left:72px;position:relative;font-size:14px;color:var(--muted);white-space:nowrap;overflow:hidden}
.reply::before{content:"";position:absolute;left:-36px;top:50%;width:30px;height:10px;border-left:2px solid var(--line);border-top:2px solid var(--line);border-top-left-radius:6px}
.reply-avatar{width:16px;height:16px;border-radius:50%}
.reply-author{font-weight:500;color:var(--bright)}
.reply-content{color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.reply-missing{font-style:italic}
.md-p{white-space:normal}
.md-h1{font-size:24px;font-weight:700;margin:8px 0 4px}.md-h2{font-size:20px;font-weight:700;margin:8px 0 4px}.md-h3{font-size:16px;font-weight:700;margin:8px 0 4px}
.md-sub{font-size:13px;color:var(--muted)}
.md-quote{margin:2px 0;padding-left:12px;border-left:4px solid var(--faint)}
.md-pre{position:relative;background:var(--code);border:1px solid var(--line);border-radius:4px;padding:8px;margin:4px 0;overflow-x:auto;font:14px/1.2 Consolas,"Courier New",monospace;white-space:pre}
.md-lang{display:block;font-size:10px;color:var(--muted);margin-bottom:4px}
.md-code{background:var(--code);border-radius:3px;padding:0 3px;font:85% Consolas,"Courier New",monospace}
.md-list{margin:2px 0;padding-left:24px}
.md-time{background:var(--code);border-radius:3px;padding:0 2px}
.mention{background:var(--mention);color:var(--mention-text);border-radius:3px;padding:0 2px;font-weight:500}
.emoji{width:22px;height:22px;vertical-align:-5px;object-fit:contain}
.spoiler{background:#1e1f22;color:transparent;border-radius:3px;cursor:pointer}
.spoiler *{visibility:hidden}.spoiler.shown{background:var(--code);color:inherit}.spoiler.shown *{visibility:visible}
.attachment{margin-top:4px;max-width:520px}
.spoiler-media{filter:blur(44px);cursor:pointer;overflow:hidden;border-radius:8px}.spoiler-media.shown{filter:none}
.media{max-width:100%;max-height:350px;border-radius:8px;display:block}
.file{display:flex;gap:8px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px;max-width:432px}
.file-icon{font-size:28px}.file-name{font-weight:500;word-break:break-all}.file-size{font-size:12px;color:var(--muted)}
.embed{margin-top:4px;max-width:520px;background:var(--embed);border-left:4px solid var(--line);border-radius:4px;padding:8px 16px 16px 12px}
.embed-body{display:flex;gap:16px}.embed-main{min-width:0;flex:1}
.embed-provider{font-size:12px;color:var(--muted);margin-top:8px}
.embed-author{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--bright);margin-top:8px}
.embed-author a{color:var(--bright)}
.embed-author-icon{width:24px;height:24px;border-radius:50%}
.embed-title{font-weight:600;color:var(--bright);margin-top:8px}
.embed-description{font-size:14px;margin-top:8px}
.embed-fields{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.embed-field{flex:1 1 100%;min-width:0;font-size:14px}.embed-field.inline{flex:1 1 30%}
.embed-field-name{font-weight:600;color:var(--bright);margin-bottom:2px}
.embed-thumbnail{width:80px;height:80px;object-fit:contain;border-radius:4px;margin-top:8px;flex-shrink:0}
.embed-image{max-width:100%;max-height:300px;border-radius:4px;margin-top:16px;display:block}
.embed-footer{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-top:8px}
.embed-footer-icon{width:20px;height:20px;border-radius:50%}
.forward{margin-top:4px;border-left:4px solid var(--line);padding-left:12px}
.forward-label{font-size:13px;color:var(--muted);font-style:italic}
.sticker img{width:160px;height:160px;object-fit:contain}.sticker-name{color:var(--muted);font-style:italic}
.poll{margin-top:4px;max-width:440px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px}
.poll-question{font-weight:600;color:var(--bright);margin-bottom:8px}
.poll-answer{position:relative;display:flex;justify-content:space-between;gap:8px;padding:8px 12px;margin-bottom:6px;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.poll-answer span{position:relative}
.poll-bar{position:absolute;inset:0 auto 0 0;background:var(--mention)}
.poll-count,.poll-total{font-size:12px;color:var(--muted)}
.reactions{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.reaction{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:2px 6px;font-size:14px}
.reaction .emoji{width:16px;height:16px;vertical-align:middle}
.reaction-count{font-size:14px;font-weight:600;color:var(--muted)}
.postamble{padding:16px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
`;
