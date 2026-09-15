/** Discord timestamp styles: <t:unix:X>. */
export type TimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "underline"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "spoiler"; children: InlineNode[] }
  | { type: "link"; url: string; children: InlineNode[] }
  | { type: "userMention"; id: string }
  | { type: "roleMention"; id: string }
  | { type: "channelMention"; id: string }
  | { type: "commandMention"; name: string; id: string }
  | { type: "broadcast"; name: "everyone" | "here" }
  | { type: "timestamp"; unix: number; style: TimestampStyle }
  | { type: "emoji"; name: string; id: string; animated: boolean };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; level: 1 | 2 | 3; children: InlineNode[] }
  | { type: "subtext"; children: InlineNode[] }
  | { type: "quote"; children: BlockNode[] }
  | { type: "codeBlock"; lang: string | null; code: string }
  | { type: "list"; ordered: boolean; start: number; items: BlockNode[][] };
