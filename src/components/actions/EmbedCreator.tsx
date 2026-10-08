"use client";

import { useState } from "react";
import type { APIEmbed } from "discord-api-types/v10";
import { EmbedCard } from "@/components/message/EmbedCard";
import { Field, Modal, ModalActions, Switch, inputClass } from "@/components/ui/Modal";
import {
  EMBED_LIMITS,
  draftToEmbed,
  embedLength,
  embedToDraft,
  emptyEmbedDraft,
  isEmbedEmpty,
  newField,
  validateEmbed,
  type EmbedDraft,
  type EmbedFieldDraft,
} from "@/lib/embeds/draft";
import { Markdown } from "@/lib/markdown";

const CONTENT_MAX = 2000;

export interface EmbedCreatorProps {
  title?: string;
  subtitle?: string;
  confirmLabel: string;
  /** Adds a message text box: the embed is sent as part of a message. */
  withContent?: boolean;
  /** Scopes mentions in the preview. */
  guildId?: string | null;
  onConfirm: (result: { content: string; embed: APIEmbed }) => Promise<void> | void;
  onClose: () => void;
}

type Tab = "editor" | "json";

/** Discord-style embed builder: the form on the left, a live preview on the right. */
export function EmbedCreator({
  title = "Create an embed",
  subtitle,
  confirmLabel,
  withContent = false,
  guildId = null,
  onConfirm,
  onClose,
}: EmbedCreatorProps) {
  const [draft, setDraft] = useState<EmbedDraft>(emptyEmbedDraft);
  const [content, setContent] = useState("");
  const [tab, setTab] = useState<Tab>("editor");
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fixed when the dialog opens, so the preview does not read the clock on every render.
  const [openedAt] = useState(() => new Date());

  const embed = draftToEmbed(draft, openedAt);
  const problem = validateEmbed(draft);
  const length = embedLength(draft);
  const empty = isEmbedEmpty(draft);

  function patch(change: Partial<EmbedDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  function patchField(key: string, change: Partial<EmbedFieldDraft>) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.key === key ? { ...field, ...change } : field)),
    }));
  }

  function moveField(index: number, delta: number) {
    setDraft((current) => {
      const next = [...current.fields];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, fields: next };
    });
  }

  function openJson() {
    setJson(JSON.stringify(embed, null, 2));
    setJsonError(null);
    setTab("json");
  }

  /** Accepts a bare embed, or a whole message with an `embeds` array. */
  function loadJson() {
    try {
      const parsed: unknown = JSON.parse(json);
      if (typeof parsed !== "object" || parsed === null) throw new Error("Expected an object.");
      const message = parsed as { embeds?: APIEmbed[]; content?: string };
      const source = Array.isArray(message.embeds) ? message.embeds[0] : (parsed as APIEmbed);
      if (!source || typeof source !== "object") throw new Error("No embed found in that JSON.");
      setDraft(embedToDraft(source));
      if (withContent && typeof message.content === "string") setContent(message.content);
      setJsonError(null);
      setTab("editor");
    } catch (cause) {
      setJsonError(cause instanceof Error ? cause.message : "That is not valid JSON.");
    }
  }

  async function confirm() {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The timestamp is taken at send time, not when the dialog opened.
      await onConfirm({ content: content.trim(), embed: draftToEmbed(draft) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The embed could not be sent.");
      setBusy(false);
    }
  }

  const tabClass = (value: Tab) =>
    `border-b-2 px-3 py-1.5 text-xs transition-colors ${
      tab === value ? "border-accent text-bright" : "border-transparent text-muted hover:text-text"
    }`;

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size="xl"
      footer={
        <>
          {error && (
            <p role="alert" className="mr-auto text-xs text-danger">
              {error}
            </p>
          )}
          <ModalActions
            onCancel={onClose}
            onConfirm={() => void confirm()}
            confirmLabel={confirmLabel}
            busy={busy}
            disabled={Boolean(problem)}
          />
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <div role="tablist" className="mb-3 flex border-b border-line">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "editor"}
              onClick={() => setTab("editor")}
              className={tabClass("editor")}
            >
              Editor
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "json"}
              onClick={openJson}
              className={tabClass("json")}
            >
              JSON
            </button>
          </div>

          {tab === "json" ? (
            <div>
              <Field
                label="Embed JSON"
                htmlFor="embed-json"
                hint="Paste an embed object, or a message with an embeds array, then load it into the editor."
              >
                <textarea
                  id="embed-json"
                  value={json}
                  onChange={(event) => setJson(event.target.value)}
                  rows={16}
                  spellCheck={false}
                  className={`${inputClass} font-mono text-xs`}
                />
              </Field>
              {jsonError && (
                <p role="alert" className="mb-2 text-xs text-danger">
                  {jsonError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={loadJson}
                  className="rounded bg-accent/15 px-3 py-1.5 text-xs text-accent hover:bg-accent/25"
                >
                  Load into editor
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(json).catch(() => {})}
                  className="rounded border border-line px-3 py-1.5 text-xs hover:bg-raised"
                >
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <div>
              {withContent && (
                <Field label="Message text" htmlFor="embed-content" hint="Optional, shown above the embed.">
                  <textarea
                    id="embed-content"
                    value={content}
                    maxLength={CONTENT_MAX}
                    onChange={(event) => setContent(event.target.value)}
                    rows={2}
                    className={inputClass}
                  />
                </Field>
              )}

              <Field label="Colour">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={draft.color}
                    disabled={!draft.useColor}
                    onChange={(event) => patch({ color: event.target.value })}
                    aria-label="Embed colour"
                    className="h-8 w-12 shrink-0 cursor-pointer rounded bg-transparent disabled:opacity-40"
                  />
                  <input
                    value={draft.color}
                    disabled={!draft.useColor}
                    onChange={(event) => patch({ color: event.target.value })}
                    maxLength={7}
                    aria-label="Embed colour as hex"
                    className={`${inputClass} font-mono disabled:opacity-40`}
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={draft.useColor}
                      onChange={(event) => patch({ useColor: event.target.checked })}
                    />
                    Stripe
                  </label>
                </div>
              </Field>

              <Field label="Author">
                <div className="flex flex-col gap-2">
                  <input
                    value={draft.authorName}
                    maxLength={EMBED_LIMITS.author}
                    onChange={(event) => patch({ authorName: event.target.value })}
                    placeholder="Name"
                    aria-label="Author name"
                    className={inputClass}
                  />
                  <div className="flex gap-2">
                    <input
                      value={draft.authorUrl}
                      onChange={(event) => patch({ authorUrl: event.target.value })}
                      placeholder="Link (https://…)"
                      aria-label="Author link"
                      className={inputClass}
                    />
                    <input
                      value={draft.authorIcon}
                      onChange={(event) => patch({ authorIcon: event.target.value })}
                      placeholder="Icon URL"
                      aria-label="Author icon URL"
                      className={inputClass}
                    />
                  </div>
                </div>
              </Field>

              <Field label="Title" htmlFor="embed-title">
                <div className="flex flex-col gap-2">
                  <input
                    id="embed-title"
                    value={draft.title}
                    maxLength={EMBED_LIMITS.title}
                    onChange={(event) => patch({ title: event.target.value })}
                    placeholder="Title"
                    className={inputClass}
                  />
                  <input
                    value={draft.url}
                    onChange={(event) => patch({ url: event.target.value })}
                    placeholder="Title link (https://…)"
                    aria-label="Title link"
                    className={inputClass}
                  />
                </div>
              </Field>

              <Field
                label="Description"
                htmlFor="embed-description"
                hint={`${draft.description.length}/${EMBED_LIMITS.description} — Markdown works here.`}
              >
                <textarea
                  id="embed-description"
                  value={draft.description}
                  maxLength={EMBED_LIMITS.description}
                  onChange={(event) => patch({ description: event.target.value })}
                  rows={4}
                  className={inputClass}
                />
              </Field>

              <div className="mb-4">
                <div className="mb-1.5 flex items-center">
                  <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
                    Fields ({draft.fields.length}/{EMBED_LIMITS.fields})
                  </span>
                  <button
                    type="button"
                    disabled={draft.fields.length >= EMBED_LIMITS.fields}
                    onClick={() => patch({ fields: [...draft.fields, newField()] })}
                    className="ml-auto rounded bg-accent/15 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/25 disabled:opacity-50"
                  >
                    + Field
                  </button>
                </div>
                <ul className="flex flex-col gap-2">
                  {draft.fields.map((field, index) => (
                    <li key={field.key} className="rounded border border-line p-2">
                      <div className="mb-1.5 flex items-center gap-1">
                        <span className="font-mono text-[10px] text-muted">#{index + 1}</span>
                        <label className="ml-2 flex items-center gap-1 text-[11px] text-muted">
                          <input
                            type="checkbox"
                            checked={field.inline}
                            onChange={(event) => patchField(field.key, { inline: event.target.checked })}
                          />
                          Inline
                        </label>
                        <button
                          type="button"
                          onClick={() => moveField(index, -1)}
                          disabled={index === 0}
                          aria-label="Move field up"
                          className="ml-auto rounded border border-line px-1.5 text-[11px] hover:bg-raised disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveField(index, 1)}
                          disabled={index === draft.fields.length - 1}
                          aria-label="Move field down"
                          className="rounded border border-line px-1.5 text-[11px] hover:bg-raised disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patch({ fields: draft.fields.filter((entry) => entry.key !== field.key) })
                          }
                          aria-label="Remove field"
                          className="rounded border border-line px-1.5 text-[11px] text-danger hover:bg-danger/10"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        value={field.name}
                        maxLength={EMBED_LIMITS.fieldName}
                        onChange={(event) => patchField(field.key, { name: event.target.value })}
                        placeholder="Field name"
                        aria-label={`Field ${index + 1} name`}
                        className={`${inputClass} mb-1.5`}
                      />
                      <textarea
                        value={field.value}
                        maxLength={EMBED_LIMITS.fieldValue}
                        onChange={(event) => patchField(field.key, { value: event.target.value })}
                        placeholder="Field value"
                        aria-label={`Field ${index + 1} value`}
                        rows={2}
                        className={inputClass}
                      />
                    </li>
                  ))}
                </ul>
              </div>

              <Field label="Images">
                <div className="flex flex-col gap-2">
                  <input
                    value={draft.image}
                    onChange={(event) => patch({ image: event.target.value })}
                    placeholder="Large image URL"
                    aria-label="Image URL"
                    className={inputClass}
                  />
                  <input
                    value={draft.thumbnail}
                    onChange={(event) => patch({ thumbnail: event.target.value })}
                    placeholder="Thumbnail URL"
                    aria-label="Thumbnail URL"
                    className={inputClass}
                  />
                </div>
              </Field>

              <Field label="Footer">
                <div className="flex flex-col gap-2">
                  <input
                    value={draft.footerText}
                    maxLength={EMBED_LIMITS.footer}
                    onChange={(event) => patch({ footerText: event.target.value })}
                    placeholder="Footer text"
                    aria-label="Footer text"
                    className={inputClass}
                  />
                  <input
                    value={draft.footerIcon}
                    onChange={(event) => patch({ footerIcon: event.target.value })}
                    placeholder="Footer icon URL"
                    aria-label="Footer icon URL"
                    className={inputClass}
                  />
                </div>
              </Field>

              <Switch
                checked={draft.timestamp}
                onChange={(timestamp) => patch({ timestamp })}
                label="Timestamp"
                description="Shows when the message was sent, in each reader's own time zone."
              />
            </div>
          )}
        </div>

        {/* Stays in view while the form scrolls past it. */}
        <div className="min-w-0 md:sticky md:top-0 md:self-start">
          <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">Preview</p>
          <div className="rounded bg-chat p-3">
            {withContent && content.trim() && (
              <Markdown content={content} guildId={guildId} className="mb-1 text-sm text-text" />
            )}
            {empty ? (
              <p className="text-xs text-faint">The embed will appear here as you fill it in.</p>
            ) : (
              <EmbedCard embed={embed} guildId={guildId} />
            )}
          </div>
          <p className={`mt-2 font-mono text-[11px] ${length > EMBED_LIMITS.total ? "text-danger" : "text-faint"}`}>
            {length}/{EMBED_LIMITS.total} characters
          </p>
          {problem && !empty && <p className="mt-1 text-xs text-amber">{problem}</p>}
        </div>
      </div>
    </Modal>
  );
}
