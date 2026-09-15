"use client";

import { useState, type FormEvent } from "react";
import type { APIApplicationCommand } from "discord-api-types/v10";
import { useCommandsUI } from "@/lib/commands/commandsUi";
import { useApplicationId } from "@/lib/commands/useApplicationId";
import {
  CHOICES_MAX,
  DESCRIPTION_MAX,
  EDITABLE_OPTION_TYPES,
  NAME_MAX,
  OPTIONS_MAX,
  OPTION_TYPE_LABELS,
  draftFromOptions,
  draftToBody,
  emptyDraft,
  newDraftOption,
  supportsChoices,
  validateCommandName,
  validateDescription,
  validateDraft,
  type CommandDraft,
  type DraftOption,
  type EditableOptionType,
} from "@/lib/commands/validation";
import { commandApi } from "@/lib/discord/commandApi";
import { useClient } from "@/lib/store/client";

export interface CommandEditorProps {
  /** Default scope for a new command. Falls back to the selected guild. */
  guildId?: string | null;
  className?: string;
}

const INPUT =
  "rounded border border-line bg-raised px-2 py-1.5 text-sm text-text placeholder:text-muted";

/** Create / edit form for one chat-input command. */
export function CommandEditor({ guildId, className }: CommandEditorProps) {
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const editing = useCommandsUI((state) => state.editing);
  const startCreate = useCommandsUI((state) => state.startCreate);

  const fallbackGuild = guildId ?? selectedGuildId ?? null;

  if (!editing) {
    return (
      <div className={`border-t border-line px-4 py-3 ${className ?? ""}`}>
        <p className="text-xs leading-relaxed text-muted">
          Pick a command above to edit it, or create a new one.
        </p>
        <button
          type="button"
          onClick={() => startCreate(fallbackGuild)}
          className="mt-2 rounded bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
        >
          New command
        </button>
      </div>
    );
  }

  // Remounting on a new target resets the draft without touching state in an effect.
  const formKey = `${editing.guildId ?? "global"}:${editing.command?.id ?? "new"}`;
  return (
    <CommandForm
      key={formKey}
      command={editing.command}
      scope={editing.guildId}
      className={className}
    />
  );
}

interface CommandFormProps {
  command: APIApplicationCommand | null;
  scope: string | null;
  className?: string;
}

function CommandForm({ command, scope, className }: CommandFormProps) {
  const guilds = useClient((state) => state.guilds);
  const guildOrder = useClient((state) => state.guildOrder);
  const getRest = useClient((state) => state.getRest);
  const applicationId = useApplicationId();
  const bump = useCommandsUI((state) => state.bump);
  const stopEditing = useCommandsUI((state) => state.stopEditing);

  const [draft, setDraft] = useState<CommandDraft>(() =>
    command
      ? draftFromOptions(command.name, command.description, command.options)
      : emptyDraft(),
  );
  const [target, setTarget] = useState<string | null>(scope);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const nameError = draft.name ? validateCommandName(draft.name) : null;
  const descriptionError = draft.description ? validateDescription(draft.description) : null;

  function patchOption(key: string, patch: Partial<DraftOption>) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) =>
        option.key === key ? { ...option, ...patch } : option,
      ),
    }));
  }

  function moveOption(index: number, delta: number) {
    setDraft((current) => {
      const next = [...current.options];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, options: next };
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setSuccess(null);
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    if (!applicationId) {
      setError("The application id is not available yet.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = draftToBody(draft);
      if (command) {
        await commandApi.edit(getRest(), applicationId, command.id, body, target);
      } else {
        await commandApi.create(getRest(), applicationId, body, target);
      }
      bump();
      setSuccess(
        target
          ? "Saved. Server commands are live right away."
          : "Saved. Global commands can take up to an hour to propagate.",
      );
      if (!command) stopEditing();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save the command.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col gap-2 border-t border-line px-4 py-3 ${className ?? ""}`}
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold text-muted">
          {command ? "Edit command" : "New command"}
        </h3>
        {command && <span className="ml-auto font-mono text-[10px] text-muted">{command.id}</span>}
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Scope
        <select
          value={target ?? ""}
          onChange={(event) => setTarget(event.target.value || null)}
          disabled={Boolean(command)}
          className={`${INPUT} disabled:opacity-60`}
        >
          <option value="">Global (every server)</option>
          {guildOrder.map((id) => (
            <option key={id} value={id}>
              {guilds[id]?.name ?? id}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] leading-relaxed text-muted">
        {target
          ? "Server commands go live immediately in the chosen server."
          : "Global commands can take up to an hour to appear in Discord."}
        {command && " The scope of an existing command cannot be changed — delete and recreate it."}
      </p>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="e.g. ping"
          maxLength={NAME_MAX}
          className={`${INPUT} font-mono`}
        />
        {nameError ? (
          <span className="text-[11px] text-danger">{nameError}</span>
        ) : (
          <span className="text-[11px] text-muted">
            1–{NAME_MAX} characters, lowercase, letters/digits/- /_ only.
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Description
        <input
          value={draft.description}
          onChange={(event) =>
            setDraft((current) => ({ ...current, description: event.target.value }))
          }
          placeholder="What does this command do?"
          maxLength={DESCRIPTION_MAX}
          className={INPUT}
        />
        {descriptionError ? (
          <span className="text-[11px] text-danger">{descriptionError}</span>
        ) : (
          <span className="font-mono text-[11px] text-muted">
            {draft.description.length}/{DESCRIPTION_MAX}
          </span>
        )}
      </label>

      <div className="mt-1 flex items-baseline gap-2">
        <h4 className="text-xs font-semibold text-muted">Options</h4>
        <button
          type="button"
          disabled={draft.options.length >= OPTIONS_MAX}
          onClick={() =>
            setDraft((current) => ({ ...current, options: [...current.options, newDraftOption()] }))
          }
          className="ml-auto rounded bg-accent/15 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          + Option
        </button>
      </div>

      {draft.options.length === 0 && (
        <p className="text-[11px] text-muted">No options — the command takes no arguments.</p>
      )}

      <ul className="flex flex-col gap-2">
        {draft.options.map((option, index) => (
          <li key={option.key} className="rounded border border-line bg-raised/40 p-2">
            <div className="flex items-center gap-1 pb-1.5">
              <span className="font-mono text-[10px] text-muted">#{index + 1}</span>
              <button
                type="button"
                onClick={() => moveOption(index, -1)}
                disabled={index === 0}
                aria-label="Move option up"
                className="ml-auto rounded border border-line px-1.5 text-[11px] hover:bg-panel disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveOption(index, 1)}
                disabled={index === draft.options.length - 1}
                aria-label="Move option down"
                className="rounded border border-line px-1.5 text-[11px] hover:bg-panel disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    options: current.options.filter((entry) => entry.key !== option.key),
                  }))
                }
                aria-label="Remove option"
                className="rounded border border-line px-1.5 text-[11px] text-danger hover:bg-danger/10"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1 text-[11px] text-muted">
                Type
                <select
                  value={option.type}
                  onChange={(event) =>
                    patchOption(option.key, {
                      type: Number(event.target.value) as EditableOptionType,
                      choices: supportsChoices(Number(event.target.value)) ? option.choices : [],
                    })
                  }
                  className={INPUT}
                >
                  {EDITABLE_OPTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {OPTION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-muted">
                Name
                <input
                  value={option.name}
                  onChange={(event) => patchOption(option.key, { name: event.target.value })}
                  maxLength={NAME_MAX}
                  placeholder="e.g. target"
                  className={`${INPUT} font-mono`}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-muted">
                Description
                <input
                  value={option.description}
                  onChange={(event) => patchOption(option.key, { description: event.target.value })}
                  maxLength={DESCRIPTION_MAX}
                  placeholder="What is this option for?"
                  className={INPUT}
                />
              </label>

              <label className="flex items-center gap-2 text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={option.required}
                  onChange={(event) => patchOption(option.key, { required: event.target.checked })}
                />
                Required
              </label>

              {supportsChoices(option.type) && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] text-muted">Choices</span>
                    <button
                      type="button"
                      disabled={option.choices.length >= CHOICES_MAX}
                      onClick={() =>
                        patchOption(option.key, {
                          choices: [...option.choices, { name: "", value: "" }],
                        })
                      }
                      className="ml-auto rounded border border-line px-1.5 text-[11px] hover:bg-panel disabled:opacity-40"
                    >
                      + Choice
                    </button>
                  </div>
                  {option.choices.length === 0 && (
                    <span className="text-[11px] text-muted">
                      No choices — any value is accepted.
                    </span>
                  )}
                  {option.choices.map((choice, choiceIndex) => (
                    <div key={choiceIndex} className="flex items-center gap-1">
                      <input
                        value={choice.name}
                        onChange={(event) =>
                          patchOption(option.key, {
                            choices: option.choices.map((entry, i) =>
                              i === choiceIndex ? { ...entry, name: event.target.value } : entry,
                            ),
                          })
                        }
                        placeholder="Label"
                        aria-label="Choice label"
                        className={`${INPUT} min-w-0 flex-1`}
                      />
                      <input
                        value={choice.value}
                        onChange={(event) =>
                          patchOption(option.key, {
                            choices: option.choices.map((entry, i) =>
                              i === choiceIndex ? { ...entry, value: event.target.value } : entry,
                            ),
                          })
                        }
                        placeholder="Value"
                        aria-label="Choice value"
                        className={`${INPUT} min-w-0 flex-1 font-mono`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          patchOption(option.key, {
                            choices: option.choices.filter((_, i) => i !== choiceIndex),
                          })
                        }
                        aria-label="Remove choice"
                        className="rounded border border-line px-1.5 text-[11px] text-danger hover:bg-danger/10"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-xs leading-relaxed text-danger">
          {error}
        </p>
      )}
      {success && <p className="text-xs leading-relaxed text-amber">{success}</p>}

      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded bg-accent/15 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? "Saving…" : command ? "Save changes" : "Create command"}
        </button>
        <button
          type="button"
          onClick={stopEditing}
          className="rounded border border-line px-3 py-1.5 text-sm hover:bg-panel"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
