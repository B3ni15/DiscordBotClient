import { EmbedType } from "discord-api-types/v10";
import type { APIEmbed } from "discord-api-types/v10";
import { safeUrl } from "@/lib/markdown";

export interface EmbedMedia {
  kind: "image" | "video";
  src: string;
  /** Still frame shown while a looping video loads. */
  poster?: string;
  width?: number;
  height?: number;
}

/**
 * The media of an embed that is nothing but media — a pasted image, a GIF, a
 * Tenor link. Discord renders these as the picture alone, with none of the card
 * around it, and so does this client.
 *
 * Returns null for every embed that carries text of its own: those are cards,
 * and the image is only part of them.
 */
export function bareMedia(embed: APIEmbed): EmbedMedia | null {
  if (embed.type !== EmbedType.Image && embed.type !== EmbedType.GIFV) return null;
  // An image embed that somehow carries text is a card after all.
  if (
    embed.title ||
    embed.description ||
    embed.author?.name ||
    embed.footer?.text ||
    (embed.fields?.length ?? 0) > 0
  ) {
    return null;
  }

  // A GIFV (Tenor, Giphy) is served as a silent looping mp4, not as a GIF.
  if (embed.type === EmbedType.GIFV && embed.video?.url) {
    const src = safeUrl(embed.video.url);
    if (src) {
      return {
        kind: "video",
        src,
        poster: embed.thumbnail?.url ? (safeUrl(embed.thumbnail.url) ?? undefined) : undefined,
        width: embed.video.width,
        height: embed.video.height,
      };
    }
  }

  const media = embed.image ?? embed.thumbnail;
  const src = media?.url ? safeUrl(media.url) : null;
  if (!src) return null;
  return { kind: "image", src, width: media?.width, height: media?.height };
}

/**
 * Whether the message text is nothing but the links the embeds below it already
 * show. Discord drops that text: the picture is the message, and repeating its
 * URL above it is noise.
 */
export function contentIsOnlyEmbedLinks(content: string, embeds: APIEmbed[] | undefined): boolean {
  const trimmed = content.trim();
  if (!trimmed || !embeds?.length) return false;

  const sources = new Set<string>();
  for (const embed of embeds) {
    if (!bareMedia(embed)) return false; // A card embed keeps its link visible.
    if (embed.url) sources.add(normalize(embed.url));
  }
  if (sources.size === 0) return false;

  const tokens = trimmed.split(/\s+/);
  // Spoilered or otherwise decorated links are left alone; only bare ones go.
  return tokens.every((token) => sources.has(normalize(token)));
}

/** Discord echoes a link back with the same query and fragment; ignore both. */
function normalize(url: string): string {
  return url.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}
