import type { BlockNode, InlineNode, TimestampStyle } from "./types";

const FENCE = /```(?:([a-zA-Z0-9+#._-]{1,20})\n)?([\s\S]*?)```/g;

/** Parses a full message body into block nodes. */
export function parseMarkdown(input: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  let cursor = 0;
  FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  // Fences are matched over the raw text first: their content must not be
  // touched by any other rule, and a fence may open and close on one line.
  while ((match = FENCE.exec(input))) {
    if (match.index > cursor) blocks.push(...parseLines(input.slice(cursor, match.index)));
    blocks.push({
      type: "codeBlock",
      lang: match[1] ?? null,
      code: match[2].replace(/\n$/, ""),
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < input.length) blocks.push(...parseLines(input.slice(cursor)));
  return blocks;
}

const HEADING = /^ {0,3}(#{1,3})\s+(.*)$/;
const SUBTEXT = /^ {0,3}-#\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const BLOCK_QUOTE_ALL = /^ {0,3}>>>\s?([\s\S]*)$/;
const LIST_ITEM = /^(\s*)(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/;

function parseLines(source: string): BlockNode[] {
  const lines = source.split("\n");
  const blocks: BlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const allQuote = BLOCK_QUOTE_ALL.exec(line);
    if (allQuote) {
      const rest = [allQuote[1], ...lines.slice(index + 1)].join("\n");
      blocks.push({ type: "quote", children: parseLines(rest) });
      break;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      const collected = [quote[1]];
      index += 1;
      while (index < lines.length) {
        const next = QUOTE.exec(lines[index]);
        if (!next) break;
        collected.push(next[1]);
        index += 1;
      }
      blocks.push({ type: "quote", children: parseLines(collected.join("\n")) });
      continue;
    }

    const subtext = SUBTEXT.exec(line);
    if (subtext) {
      blocks.push({ type: "subtext", children: parseInline(subtext[1]) });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2]),
      });
      index += 1;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const [list, consumed] = parseList(lines, index);
      blocks.push(list);
      index = consumed;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (
        current.trim() === "" ||
        QUOTE.test(current) ||
        SUBTEXT.test(current) ||
        HEADING.test(current) ||
        LIST_ITEM.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
  }

  return blocks;
}

function parseList(lines: string[], start: number): [BlockNode, number] {
  const first = LIST_ITEM.exec(lines[start])!;
  const baseIndent = first[1].length;
  const ordered = first[3] !== undefined;
  const items: string[][] = [];
  let index = start;

  while (index < lines.length) {
    const match = LIST_ITEM.exec(lines[index]);
    if (match && match[1].length <= baseIndent) {
      if (ordered !== (match[3] !== undefined)) break;
      items.push([match[4]]);
      index += 1;
      continue;
    }
    if (items.length === 0) break;
    const line = lines[index];
    // Deeper-indented or plain continuation lines belong to the open item and
    // are re-parsed as blocks, which is what makes nested lists work.
    if (line.trim() !== "" && line.length - line.trimStart().length > baseIndent) {
      items[items.length - 1].push(line.slice(baseIndent + 1));
      index += 1;
      continue;
    }
    break;
  }

  return [
    {
      type: "list",
      ordered,
      start: ordered ? Number(first[3]) : 1,
      items: items.map((item) => parseLines(item.join("\n"))),
    },
    index,
  ];
}

const PATTERNS = {
  escape: /^\\([^\p{L}\p{N}\s])/u,
  code: /^(``?)([\s\S]+?)\1/,
  spoiler: /^\|\|([\s\S]+?)\|\|/,
  strike: /^~~([\s\S]+?)~~/,
  boldItalic: /^\*\*\*([\s\S]+?)\*\*\*/,
  bold: /^\*\*([\s\S]+?)\*\*/,
  italicStar: /^\*([\s\S]+?)\*/,
  underlineItalic: /^___([\s\S]+?)___/,
  underline: /^__([\s\S]+?)__/,
  italicUnderscore: /^_([\s\S]+?)_/,
  user: /^<@!?(\d{15,25})>/,
  role: /^<@&(\d{15,25})>/,
  channel: /^<#(\d{15,25})>/,
  command: /^<\/([\p{L}\p{N}_ -]{1,64}):(\d{15,25})>/u,
  emoji: /^<(a)?:(\w{2,32}):(\d{15,25})>/,
  timestamp: /^<t:(-?\d{1,15})(?::([tTdDfFR]))?>/,
  bracketLink: /^<((?:https?|discord):\/\/[^\s>]+)>/,
  maskedLink: /^\[([^\]\n]*)\]\((<?)((?:https?|discord):\/\/[^\s)]+)\2\)/,
  autoLink: /^(?:https?|discord):\/\/[^\s<>()[\]]+/,
  broadcast: /^@(everyone|here)\b/,
};

/** Parses a single run of text (no block structure) into inline nodes. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  let index = 0;

  const flush = () => {
    if (buffer) {
      nodes.push({ type: "text", value: buffer });
      buffer = "";
    }
  };
  const push = (node: InlineNode, length: number) => {
    flush();
    nodes.push(node);
    index += length;
  };

  while (index < text.length) {
    const rest = text.slice(index);
    const char = rest[0];
    let match: RegExpExecArray | null;

    if (char === "\\" && (match = PATTERNS.escape.exec(rest))) {
      buffer += match[1];
      index += match[0].length;
      continue;
    }

    if (char === "`" && (match = PATTERNS.code.exec(rest))) {
      push({ type: "code", value: match[2] }, match[0].length);
      continue;
    }

    if (char === "|" && (match = PATTERNS.spoiler.exec(rest))) {
      push({ type: "spoiler", children: parseInline(match[1]) }, match[0].length);
      continue;
    }

    if (char === "~" && (match = PATTERNS.strike.exec(rest)) && isTight(match[1])) {
      push({ type: "strike", children: parseInline(match[1]) }, match[0].length);
      continue;
    }

    if (char === "*") {
      if ((match = PATTERNS.boldItalic.exec(rest)) && isTight(match[1])) {
        push(
          { type: "italic", children: [{ type: "bold", children: parseInline(match[1]) }] },
          match[0].length,
        );
        continue;
      }
      if ((match = PATTERNS.bold.exec(rest)) && isTight(match[1])) {
        push({ type: "bold", children: parseInline(match[1]) }, match[0].length);
        continue;
      }
      if ((match = PATTERNS.italicStar.exec(rest)) && isTight(match[1])) {
        push({ type: "italic", children: parseInline(match[1]) }, match[0].length);
        continue;
      }
    }

    // snake_case_words must stay plain, so underscores only delimit at word edges.
    if (char === "_" && isWordEdge(text, index)) {
      if ((match = PATTERNS.underlineItalic.exec(rest)) && isTight(match[1]) && isWordEdge(text, index + match[0].length)) {
        push(
          { type: "underline", children: [{ type: "italic", children: parseInline(match[1]) }] },
          match[0].length,
        );
        continue;
      }
      if ((match = PATTERNS.underline.exec(rest)) && isTight(match[1]) && isWordEdge(text, index + match[0].length)) {
        push({ type: "underline", children: parseInline(match[1]) }, match[0].length);
        continue;
      }
      if (
        (match = PATTERNS.italicUnderscore.exec(rest)) &&
        isTight(match[1]) &&
        isWordEdge(text, index + match[0].length)
      ) {
        push({ type: "italic", children: parseInline(match[1]) }, match[0].length);
        continue;
      }
    }

    if (char === "<") {
      if ((match = PATTERNS.user.exec(rest))) {
        push({ type: "userMention", id: match[1] }, match[0].length);
        continue;
      }
      if ((match = PATTERNS.role.exec(rest))) {
        push({ type: "roleMention", id: match[1] }, match[0].length);
        continue;
      }
      if ((match = PATTERNS.channel.exec(rest))) {
        push({ type: "channelMention", id: match[1] }, match[0].length);
        continue;
      }
      if ((match = PATTERNS.command.exec(rest))) {
        push({ type: "commandMention", name: match[1], id: match[2] }, match[0].length);
        continue;
      }
      if ((match = PATTERNS.emoji.exec(rest))) {
        push(
          { type: "emoji", animated: match[1] === "a", name: match[2], id: match[3] },
          match[0].length,
        );
        continue;
      }
      if ((match = PATTERNS.timestamp.exec(rest))) {
        push(
          {
            type: "timestamp",
            unix: Number(match[1]),
            style: (match[2] ?? "f") as TimestampStyle,
          },
          match[0].length,
        );
        continue;
      }
      if ((match = PATTERNS.bracketLink.exec(rest))) {
        push(
          { type: "link", url: match[1], children: [{ type: "text", value: match[1] }] },
          match[0].length,
        );
        continue;
      }
    }

    if (char === "[" && (match = PATTERNS.maskedLink.exec(rest))) {
      push({ type: "link", url: match[3], children: parseInline(match[1]) }, match[0].length);
      continue;
    }

    if (char === "@" && (match = PATTERNS.broadcast.exec(rest))) {
      push({ type: "broadcast", name: match[1] as "everyone" | "here" }, match[0].length);
      continue;
    }

    if ((char === "h" || char === "d") && (match = PATTERNS.autoLink.exec(rest))) {
      const url = trimUrlPunctuation(match[0]);
      push({ type: "link", url, children: [{ type: "text", value: url }] }, url.length);
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
  return nodes;
}

const WORD = /[\p{L}\p{N}]/u;

/** True when the character before `index` is not part of a word. */
function isWordEdge(text: string, index: number): boolean {
  const before = index === 0 ? "" : text[index - 1];
  return before === "" || !WORD.test(before);
}

/** Discord only emphasises text when the delimiters hug it: `2 * 3 * 4` stays plain. */
function isTight(value: string): boolean {
  return !/^\s/.test(value) && !/\s$/.test(value);
}

/** Sentence punctuation that follows a bare URL is not part of it. */
function trimUrlPunctuation(url: string): string {
  return url.replace(/[.,:;!?'"*_~]+$/, "");
}
