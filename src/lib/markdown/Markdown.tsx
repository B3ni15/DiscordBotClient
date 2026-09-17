"use client";

import { Fragment, useState, type ReactNode } from "react";
import {
  BroadcastMention,
  ChannelMention,
  CommandMention,
  CustomEmoji,
  MarkdownProvider,
  RoleMention,
  Timestamp,
  UserMention,
} from "./mentions";
import { parseInline, parseMarkdown } from "./parse";
import type { BlockNode, InlineNode } from "./types";

export interface MarkdownProps {
  content: string;
  /** Scopes member and role lookups for mentions. */
  guildId?: string | null;
  /** Renders a single line without block structure (titles, field names, previews). */
  inline?: boolean;
  /** Appended to the end of the last block, e.g. the "edited" marker. */
  trailing?: ReactNode;
  className?: string;
}

export function Markdown({
  content,
  guildId = null,
  inline = false,
  trailing,
  className,
}: MarkdownProps) {
  const body = inline ? (
    <span className={className}>
      {renderInline(parseInline(content.replace(/\n/g, " ")))}
      {trailing}
    </span>
  ) : (
    <div className={className}>{renderBlocks(parseMarkdown(content), trailing)}</div>
  );

  return <MarkdownProvider guildId={guildId}>{body}</MarkdownProvider>;
}

function renderBlocks(blocks: BlockNode[], trailing?: ReactNode): ReactNode {
  const last = blocks.length - 1;
  const rendered = blocks.map((block, index) =>
    renderBlock(block, index, index === last ? trailing : undefined),
  );
  // A message that is only an embed or attachment still has to place the marker.
  if (trailing && (blocks.length === 0 || !canHoldTrailing(blocks[last]))) {
    rendered.push(<Fragment key="trailing">{trailing}</Fragment>);
  }
  return rendered;
}

function canHoldTrailing(block: BlockNode): boolean {
  return block.type === "paragraph" || block.type === "subtext" || block.type === "heading";
}

const HEADING_CLASS = {
  1: "mt-1 mb-0.5 text-lg font-bold",
  2: "mt-1 mb-0.5 text-base font-bold",
  3: "mt-1 mb-0.5 text-sm font-bold",
} as const;

function renderBlock(block: BlockNode, key: number, trailing?: ReactNode): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={key} className="whitespace-pre-wrap break-words">
          {renderInline(block.children)}
          {trailing}
        </p>
      );
    case "heading": {
      const Tag = (["h3", "h4", "h5"] as const)[block.level - 1];
      return (
        <Tag key={key} className={`${HEADING_CLASS[block.level]} break-words`}>
          {renderInline(block.children)}
          {trailing}
        </Tag>
      );
    }
    case "subtext":
      return (
        <p key={key} className="text-xs break-words text-muted">
          {renderInline(block.children)}
          {trailing}
        </p>
      );
    case "quote":
      return (
        <blockquote key={key} className="my-0.5 rounded-sm border-l-4 border-faint pl-3">
          {renderBlocks(block.children)}
          {trailing}
        </blockquote>
      );
    case "codeBlock":
      return (
        <div key={key} className="my-1 overflow-hidden rounded border border-ink bg-panel">
          {block.lang && (
            <div className="border-b border-line px-2 py-0.5 font-mono text-[10px] text-muted">
              {block.lang}
            </div>
          )}
          <pre className="overflow-x-auto p-2">
            <code className="font-mono text-xs whitespace-pre">{block.code}</code>
          </pre>
          {trailing}
        </div>
      );
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index} className="break-words">
          {renderBlocks(item)}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} start={block.start} className="my-0.5 list-decimal pl-6">
          {items}
        </ol>
      ) : (
        <ul key={key} className="my-0.5 list-disc pl-6">
          {items}
        </ul>
      );
    }
  }
}

function renderInline(nodes: InlineNode[]): ReactNode {
  return nodes.map((node, key) => {
    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.value}</Fragment>;
      case "code":
        return (
          <code key={key} className="rounded bg-ink px-1 py-px font-mono text-[0.85em] text-bright">
            {node.value}
          </code>
        );
      case "bold":
        return <strong key={key}>{renderInline(node.children)}</strong>;
      case "italic":
        return <em key={key}>{renderInline(node.children)}</em>;
      case "underline":
        return (
          <span key={key} className="underline">
            {renderInline(node.children)}
          </span>
        );
      case "strike":
        return <s key={key}>{renderInline(node.children)}</s>;
      case "spoiler":
        return <Spoiler key={key}>{renderInline(node.children)}</Spoiler>;
      case "link": {
        const href = safeUrl(node.url);
        if (!href) return <Fragment key={key}>{renderInline(node.children)}</Fragment>;
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="break-words text-link hover:underline"
          >
            {renderInline(node.children)}
          </a>
        );
      }
      case "userMention":
        return <UserMention key={key} id={node.id} />;
      case "roleMention":
        return <RoleMention key={key} id={node.id} />;
      case "channelMention":
        return <ChannelMention key={key} id={node.id} />;
      case "commandMention":
        return <CommandMention key={key} name={node.name} id={node.id} />;
      case "broadcast":
        return <BroadcastMention key={key} name={node.name} />;
      case "timestamp":
        return <Timestamp key={key} unix={node.unix} style={node.style} />;
      case "emoji":
        return <CustomEmoji key={key} name={node.name} id={node.id} animated={node.animated} />;
    }
  });
}

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) return <span className="rounded bg-raised px-0.5">{children}</span>;
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      aria-label="Reveal spoiler"
      className="rounded bg-ink px-0.5 text-transparent select-none transition-colors hover:bg-line"
    >
      {children}
    </button>
  );
}

/** Only these schemes may reach an href; anything else renders as plain text. */
const SAFE_SCHEMES = new Set(["http:", "https:", "discord:", "mailto:"]);

export function safeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return SAFE_SCHEMES.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
