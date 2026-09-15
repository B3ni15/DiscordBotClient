"use client";

import { useState } from "react";
import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import { Markdown, safeUrl } from "@/lib/markdown";
import { Lightbox } from "./Lightbox";

export interface EmbedCardProps {
  embed: APIEmbed;
  /** Scopes mention resolution inside the embed's markdown. */
  guildId?: string | null;
}

export function EmbedCard({ embed, guildId = null }: EmbedCardProps) {
  const [zoomed, setZoomed] = useState(false);
  const stripe = typeof embed.color === "number" ? `#${embed.color.toString(16).padStart(6, "0")}` : null;
  const titleHref = embed.url ? safeUrl(embed.url) : null;
  const image = embed.image?.url ? safeUrl(embed.image.url) : null;
  const thumbnail = embed.thumbnail?.url ? safeUrl(embed.thumbnail.url) : null;

  return (
    <div
      className="my-1 max-w-xl overflow-hidden rounded border border-line border-l-4 bg-panel"
      style={stripe ? { borderLeftColor: stripe } : undefined}
    >
      <div className="flex gap-3 p-3">
        <div className="min-w-0 flex-1 text-sm">
          {embed.author?.name && <EmbedAuthor author={embed.author} />}

          {embed.title && (
            <p className="mt-1 font-semibold break-words">
              {titleHref ? (
                <a
                  href={titleHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent hover:underline"
                >
                  <Markdown content={embed.title} guildId={guildId} inline />
                </a>
              ) : (
                <Markdown content={embed.title} guildId={guildId} inline />
              )}
            </p>
          )}

          {embed.description && (
            <Markdown
              content={embed.description}
              guildId={guildId}
              className="mt-1 text-sm leading-relaxed text-text/90"
            />
          )}

          {embed.fields && embed.fields.length > 0 && (
            <EmbedFields fields={embed.fields} guildId={guildId} />
          )}
        </div>

        {thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded object-cover"
          />
        )}
      </div>

      {image && (
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label="Open embedded image full size"
          className="block w-full px-3 pb-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            loading="lazy"
            className="max-h-80 w-full rounded object-contain"
          />
        </button>
      )}

      {(embed.footer?.text || embed.timestamp) && (
        <div className="flex items-center gap-2 px-3 pb-3 text-[11px] text-muted">
          {embed.footer?.icon_url && safeUrl(embed.footer.icon_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={safeUrl(embed.footer.icon_url)!}
              alt=""
              loading="lazy"
              className="h-4 w-4 rounded-full"
            />
          )}
          {embed.footer?.text && <span className="break-words">{embed.footer.text}</span>}
          {embed.footer?.text && embed.timestamp && <span aria-hidden>•</span>}
          {embed.timestamp && (
            <time suppressHydrationWarning dateTime={embed.timestamp} className="font-mono">
              {new Date(embed.timestamp).toLocaleString("en-US")}
            </time>
          )}
        </div>
      )}

      {zoomed && image && (
        <Lightbox src={image} alt="" name={embed.title ?? undefined} onClose={() => setZoomed(false)} />
      )}
    </div>
  );
}

function EmbedAuthor({ author }: { author: NonNullable<APIEmbed["author"]> }) {
  const icon = author.icon_url ? safeUrl(author.icon_url) : null;
  const href = author.url ? safeUrl(author.url) : null;
  const label = <span className="text-xs font-semibold break-words">{author.name}</span>;

  return (
    <div className="flex items-center gap-2">
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" loading="lazy" className="h-5 w-5 rounded-full" />
      )}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className="hover:underline">
          {label}
        </a>
      ) : (
        label
      )}
    </div>
  );
}

function EmbedFields({
  fields,
  guildId,
}: {
  fields: APIEmbedField[];
  guildId: string | null;
}) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
      {fields.map((field, index) => (
        <div key={index} className={field.inline ? "col-span-1 min-w-0" : "col-span-3 min-w-0"}>
          <p className="text-xs font-semibold break-words">
            <Markdown content={field.name} guildId={guildId} inline />
          </p>
          <Markdown
            content={field.value}
            guildId={guildId}
            className="text-xs leading-relaxed break-words text-text/90"
          />
        </div>
      ))}
    </div>
  );
}
