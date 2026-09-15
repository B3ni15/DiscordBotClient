"use client";

import { useState } from "react";
import type { APIAttachment } from "discord-api-types/v10";
import { Lightbox } from "./Lightbox";

export interface AttachmentsProps {
  attachments: APIAttachment[];
}

export function Attachments({ attachments }: AttachmentsProps) {
  const [preview, setPreview] = useState<APIAttachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-2">
      {attachments.map((attachment) => (
        <AttachmentItem
          key={attachment.id}
          attachment={attachment}
          onPreview={() => setPreview(attachment)}
        />
      ))}
      {preview && (
        <Lightbox
          src={preview.url}
          alt={preview.description ?? preview.filename}
          name={preview.filename}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function AttachmentItem({
  attachment,
  onPreview,
}: {
  attachment: APIAttachment;
  onPreview: () => void;
}) {
  // Discord marks spoilered uploads by prefixing the file name.
  const spoiler = attachment.filename.startsWith("SPOILER_");
  const [revealed, setRevealed] = useState(!spoiler);
  const kind = attachmentKind(attachment);

  if (!revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="w-fit rounded border border-line bg-raised px-3 py-2 text-xs text-muted hover:bg-panel"
      >
        Spoiler – kattints a megtekintéshez ({attachment.filename.replace(/^SPOILER_/, "")})
      </button>
    );
  }

  if (kind === "image") {
    return (
      <button
        type="button"
        onClick={onPreview}
        className="block w-fit max-w-md overflow-hidden rounded border border-line"
        aria-label={`${attachment.filename} megnyitása nagyban`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.description ?? attachment.filename}
          width={attachment.width ?? undefined}
          height={attachment.height ?? undefined}
          loading="lazy"
          className="max-h-80 w-auto max-w-full object-contain"
        />
      </button>
    );
  }

  if (kind === "video") {
    return (
      <video
        controls
        preload="metadata"
        src={attachment.url}
        className="max-h-80 w-fit max-w-md rounded border border-line"
      >
        A böngésződ nem tudja lejátszani ezt a videót.
      </video>
    );
  }

  if (kind === "audio") {
    return (
      <div className="w-fit max-w-md rounded border border-line bg-panel p-2">
        <p className="mb-1 truncate font-mono text-[11px] text-muted">{attachment.filename}</p>
        <audio controls preload="metadata" src={attachment.url} className="w-64 max-w-full">
          A böngésződ nem tudja lejátszani ezt a hangfájlt.
        </audio>
      </div>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer noopener"
      download={attachment.filename}
      className="flex w-fit max-w-md items-center gap-3 rounded border border-line bg-panel px-3 py-2 hover:border-accent"
    >
      <span aria-hidden className="text-lg text-muted">
        ⬇
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-accent">{attachment.filename}</span>
        <span className="block font-mono text-[11px] text-muted">
          {formatBytes(attachment.size)}
        </span>
      </span>
    </a>
  );
}

type AttachmentKind = "image" | "video" | "audio" | "file";

const EXTENSIONS: Record<string, AttachmentKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  mp3: "audio",
  ogg: "audio",
  wav: "audio",
  flac: "audio",
  m4a: "audio",
};

function attachmentKind(attachment: APIAttachment): AttachmentKind {
  const type = attachment.content_type ?? "";
  if (type.startsWith("image/") && !type.includes("svg")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  const extension = attachment.filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSIONS[extension] ?? "file";
}

const UNITS = ["B", "KB", "MB", "GB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 || unit === 0 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded.toLocaleString("hu-HU")} ${UNITS[unit]}`;
}
