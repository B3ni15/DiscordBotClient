import type { APIEmbed } from "discord-api-types/v10";

/** Discord's embed limits. */
export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  /** Sum of every text field above, across the embed. */
  total: 6000,
} as const;

export const DEFAULT_EMBED_COLOR = "#5865f2";

export interface EmbedFieldDraft {
  /** Stable key for React lists; never sent to Discord. */
  key: string;
  name: string;
  value: string;
  inline: boolean;
}

/** The embed builder's form, with every field as a plain string. */
export interface EmbedDraft {
  useColor: boolean;
  color: string;
  authorName: string;
  authorUrl: string;
  authorIcon: string;
  title: string;
  url: string;
  description: string;
  fields: EmbedFieldDraft[];
  image: string;
  thumbnail: string;
  footerText: string;
  footerIcon: string;
  timestamp: boolean;
}

let fieldKey = 0;

export function newField(): EmbedFieldDraft {
  return { key: `field-${++fieldKey}`, name: "", value: "", inline: false };
}

export function emptyEmbedDraft(): EmbedDraft {
  return {
    useColor: true,
    color: DEFAULT_EMBED_COLOR,
    authorName: "",
    authorUrl: "",
    authorIcon: "",
    title: "",
    url: "",
    description: "",
    fields: [],
    image: "",
    thumbnail: "",
    footerText: "",
    footerIcon: "",
    timestamp: false,
  };
}

/** Characters Discord counts towards the 6000 total. */
export function embedLength(draft: EmbedDraft): number {
  return (
    draft.title.trim().length +
    draft.description.trim().length +
    draft.authorName.trim().length +
    draft.footerText.trim().length +
    draft.fields.reduce((sum, field) => sum + field.name.trim().length + field.value.trim().length, 0)
  );
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Nothing filled in yet; such an embed is not sendable. */
export function isEmbedEmpty(draft: EmbedDraft): boolean {
  return !(
    draft.title.trim() ||
    draft.description.trim() ||
    draft.authorName.trim() ||
    draft.footerText.trim() ||
    draft.image.trim() ||
    draft.thumbnail.trim() ||
    draft.fields.length > 0
  );
}

/** First problem with the draft, or `null` when Discord will accept it. */
export function validateEmbed(draft: EmbedDraft): string | null {
  if (isEmbedEmpty(draft)) return "The embed is empty — give it at least a title or a description.";
  if (embedLength(draft) > EMBED_LIMITS.total) {
    return `All the text together may be at most ${EMBED_LIMITS.total} characters.`;
  }
  if (draft.fields.length > EMBED_LIMITS.fields) return `At most ${EMBED_LIMITS.fields} fields.`;
  for (const [index, field] of draft.fields.entries()) {
    if (!field.name.trim() || !field.value.trim()) {
      return `Field ${index + 1} needs both a name and a value.`;
    }
  }
  if (draft.url.trim() && !draft.title.trim()) return "A title link needs a title to sit on.";
  if ((draft.authorUrl.trim() || draft.authorIcon.trim()) && !draft.authorName.trim()) {
    return "The author's link and icon need an author name.";
  }
  if (draft.footerIcon.trim() && !draft.footerText.trim()) return "A footer icon needs footer text.";
  const urls: Array<[string, string]> = [
    ["Title link", draft.url],
    ["Author link", draft.authorUrl],
    ["Author icon", draft.authorIcon],
    ["Image", draft.image],
    ["Thumbnail", draft.thumbnail],
    ["Footer icon", draft.footerIcon],
  ];
  for (const [label, value] of urls) {
    if (value.trim() && !isUrl(value.trim())) return `${label} must be an http(s) link.`;
  }
  if (draft.useColor && !/^#[0-9a-f]{6}$/i.test(draft.color)) return "The colour must look like #5865f2.";
  return null;
}

/** The draft as Discord's embed object, leaving out everything left blank. */
export function draftToEmbed(draft: EmbedDraft, now = new Date()): APIEmbed {
  const embed: APIEmbed = {};
  const text = (value: string) => value.trim() || undefined;
  if (draft.useColor) embed.color = parseInt(draft.color.slice(1), 16);
  if (text(draft.authorName)) {
    embed.author = {
      name: draft.authorName.trim(),
      url: text(draft.authorUrl),
      icon_url: text(draft.authorIcon),
    };
  }
  if (text(draft.title)) embed.title = draft.title.trim();
  if (text(draft.title) && text(draft.url)) embed.url = draft.url.trim();
  if (text(draft.description)) embed.description = draft.description.trim();
  if (draft.fields.length > 0) {
    embed.fields = draft.fields.map((field) => ({
      name: field.name.trim(),
      value: field.value.trim(),
      inline: field.inline,
    }));
  }
  if (text(draft.image)) embed.image = { url: draft.image.trim() };
  if (text(draft.thumbnail)) embed.thumbnail = { url: draft.thumbnail.trim() };
  if (text(draft.footerText)) {
    embed.footer = { text: draft.footerText.trim(), icon_url: text(draft.footerIcon) };
  }
  if (draft.timestamp) embed.timestamp = now.toISOString();
  // Undefined keys would survive into the JSON view as noise.
  return JSON.parse(JSON.stringify(embed)) as APIEmbed;
}

/** Loads an embed object (pasted JSON, for one) back into the form. */
export function embedToDraft(embed: APIEmbed): EmbedDraft {
  return {
    useColor: typeof embed.color === "number",
    color:
      typeof embed.color === "number"
        ? `#${embed.color.toString(16).padStart(6, "0")}`
        : DEFAULT_EMBED_COLOR,
    authorName: embed.author?.name ?? "",
    authorUrl: embed.author?.url ?? "",
    authorIcon: embed.author?.icon_url ?? "",
    title: embed.title ?? "",
    url: embed.url ?? "",
    description: embed.description ?? "",
    fields: (embed.fields ?? []).map((field) => ({
      ...newField(),
      name: field.name ?? "",
      value: field.value ?? "",
      inline: Boolean(field.inline),
    })),
    image: embed.image?.url ?? "",
    thumbnail: embed.thumbnail?.url ?? "",
    footerText: embed.footer?.text ?? "",
    footerIcon: embed.footer?.icon_url ?? "",
    timestamp: Boolean(embed.timestamp),
  };
}
