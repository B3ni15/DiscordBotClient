"use client";

import { useState, type FormEvent } from "react";
import type { APIApplicationCommand } from "discord-api-types/v10";
import { EXAMPLE_SCRIPT, ScriptEditor } from "@/components/commands/ScriptEditor";
import { useCommandsUI } from "@/lib/commands/commandsUi";
import {
  SCRIPT_MAX_BYTES,
  getScript,
  removeScript,
  saveScript,
  scriptBytes,
} from "@/lib/commands/scriptStore";
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
  validateHandler,
  EVERYWHERE,
  type CommandDraft,
  type DraftOption,
  type EditableOptionType,
} from "@/lib/commands/validation";
import { commandApi } from "@/lib/discord/commandApi";
import { useClient } from "@/lib/store/client";
import { ChevronDownIcon, CloseIcon, PlusIcon, SlashIcon } from "@/components/ui/icons";
import { useUI } from "@/lib/store/ui";

export interface CommandEditorProps {
  className?: string;
}

const INPUT =
  "rounded-md bg-ink px-3 py-2 text-sm font-normal text-text outline-none transition-shadow placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]";

/** Create / edit form for one chat-input command. */
export function CommandEditor({ className }: CommandEditorProps) {
  const editing = useCommandsUI((state) => state.editing);
  const startCreate = useCommandsUI((state) => state.startCreate);

  if (!editing) {
    return (
      <div
        className={`flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center ${className ?? ""}`}
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <SlashIcon size={28} />
        </span>
        <h3 className="mt-4 text-base font-semibold text-bright">No command selected</h3>
        <p className="mt-1 max-w-xs text-sm text-muted">
          Pick a command to edit it, or create a new one. Every command needs a handler that
          answers, so it never leaves anyone hanging.
        </p>
        <button
          type="button"
          onClick={() => startCreate(null)}
          className="mt-5 flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          <PlusIcon size={14} />
          New Command
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
  const botId = useClient((state) => state.user?.id ?? null);

  // Read once: the form is remounted for every command it edits.
  const [initialScript] = useState(() =>
    botId && command ? getScript(botId, command.name) : undefined,
  );
  // A new command starts with a working handler; an existing one shows its own.
  const [code, setCode] = useState(initialScript?.code ?? (command ? "" : EXAMPLE_SCRIPT));
  const [scriptEnabled, setScriptEnabled] = useState(initialScript?.enabled ?? true);
  const [draft, setDraft] = useState<CommandDraft>(() =>
    command
      ? draftFromOptions(command.name, command.description, command.options)
      : emptyDraft(),
  );
  // "New Command" passes no scope, so a new command works everywhere unless a
  // server's own "New" asked for that server.
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
    const handlerProblem = validateHandler(code);
    if (handlerProblem) {
      setError(handlerProblem);
      return;
    }
    if (!scriptEnabled && !command) {
      setError("A new command has to start switched on, or it would do nothing.");
      return;
    }
    if (scriptBytes(code) > SCRIPT_MAX_BYTES) {
      setError(`The handler is too large; keep it under ${SCRIPT_MAX_BYTES / 1000} kB.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = target ? draftToBody(draft) : { ...draftToBody(draft), ...EVERYWHERE };
      if (command) {
        await commandApi.edit(getRest(), applicationId, command.id, body, target);
      } else {
        await commandApi.create(getRest(), applicationId, body, target);
      }
      if (botId) {
        const name = body.name;
        // A renamed command takes its script along.
        const renamed = Boolean(command && command.name !== name);
        if (renamed) removeScript(botId, command!.name);
        const unchanged =
          !renamed &&
          (initialScript?.code ?? "") === code &&
          (initialScript?.enabled ?? true) === scriptEnabled;
        // Re-saving an untouched script would only bump its date and re-sync it.
        // Validation above guarantees there is a handler to save.
        if (!unchanged) saveScript(botId, name, code, scriptEnabled);
      }
      bump();
      setSuccess(
        target
          ? "Saved. Server commands are live right away."
          : "Saved. It works in every server and in DMs; new global commands can take a few minutes to appear.",
      );
      if (!command) {
        // The form closes on create, so the confirmation goes where it stays visible.
        useUI.getState().toast(`/${body.name} created — it answers right away.`);
        stopEditing();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save the command.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col gap-4 rounded-xl bg-panel p-5 ${className ?? ""}`}
    >
      <div className="flex items-center gap-3 border-b border-line/60 pb-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent">
          <SlashIcon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-bright">
            {command ? `/${command.name}` : "New Command"}
          </h3>
          <p className="truncate text-xs text-muted">
            {command ? `ID ${command.id}` : "Name it, describe it, and write what it answers."}
          </p>
        </div>
        <button
          type="button"
          onClick={stopEditing}
          aria-label="Close editor"
          className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-bright"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
        Scope
        <select
          value={target ?? ""}
          onChange={(event) => setTarget(event.target.value || null)}
          disabled={Boolean(command)}
          className={`${INPUT} disabled:opacity-60`}
        >
          <option value="">Everywhere (every server and DMs)</option>
          {guildOrder.map((id) => (
            <option key={id} value={id}>
              {guilds[id]?.name ?? id}
            </option>
          ))}
        </select>
      </label>
      <p className="-mt-2 text-xs leading-relaxed text-faint">
        {target
          ? "Server commands go live immediately in the chosen server."
          : "Works in every server the bot is in and in DMs with the bot. New global commands can take a few minutes to show up."}
        {command && " The scope of an existing command cannot be changed — delete and recreate it."}
      </p>

      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
        Name
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="e.g. ping"
          maxLength={NAME_MAX}
          className={`${INPUT} font-mono`}
        />
        {nameError ? (
          <span className="text-[11px] font-normal text-danger">{nameError}</span>
        ) : (
          <span className="text-[11px] font-normal text-muted">
            1–{NAME_MAX} characters, lowercase, letters/digits/- /_ only.
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
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
          <span className="text-[11px] font-normal text-danger">{descriptionError}</span>
        ) : (
          <span className="font-mono text-[11px] font-normal text-muted">
            {draft.description.length}/{DESCRIPTION_MAX}
          </span>
        )}
      </label>

      <div className="mt-2 flex items-center gap-2 border-t border-line/60 pt-4">
        <h4 className="text-xs font-bold tracking-wide text-muted uppercase">
          Options — {draft.options.length}
        </h4>
        <button
          type="button"
          disabled={draft.options.length >= OPTIONS_MAX}
          onClick={() =>
            setDraft((current) => ({ ...current, options: [...current.options, newDraftOption()] }))
          }
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
        >
          <PlusIcon size={12} />
          Add Option
        </button>
      </div>

      {draft.options.length === 0 && (
        <p className="-mt-2 text-xs text-faint">No options — the command takes no arguments.</p>
      )}

      <ul className="flex flex-col gap-2">
        {draft.options.map((option, index) => (
          <li key={option.key} className="rounded-lg border border-line/60 bg-panel-alt p-3">
            <div className="flex items-center gap-1 pb-1.5">
              <span className="font-mono text-[10px] text-muted">#{index + 1}</span>
              <button
                type="button"
                onClick={() => moveOption(index, -1)}
                disabled={index === 0}
                aria-label="Move option up"
                className="ml-auto grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-bright disabled:opacity-30"
              >
                <ChevronDownIcon size={14} className="rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => moveOption(index, 1)}
                disabled={index === draft.options.length - 1}
                aria-label="Move option down"
                className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-bright disabled:opacity-30"
              >
                <ChevronDownIcon size={14} />
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
                className="grid h-7 w-7 place-items-center rounded-md text-danger transition-colors hover:bg-danger/15"
              >
                <CloseIcon size={12} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
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

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
                Name
                <input
                  value={option.name}
                  onChange={(event) => patchOption(option.key, { name: event.target.value })}
                  maxLength={NAME_MAX}
                  placeholder="e.g. target"
                  className={`${INPUT} font-mono`}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
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
                      className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
                    >
                      <PlusIcon size={11} />
                      Choice
                    </button>
                  </div>
                  {option.choices.length === 0 && (
                    <span className="text-[11px] font-normal text-muted">
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
                        className="grid h-7 w-7 place-items-center rounded-md text-danger transition-colors hover:bg-danger/15"
                      >
                        <CloseIcon size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ScriptEditor
        commandName={draft.name}
        runName={command?.name ?? draft.name.trim()}
        code={code}
        onCodeChange={setCode}
        enabled={scriptEnabled}
        onEnabledChange={setScriptEnabled}
        options={draft.options}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm leading-relaxed text-danger">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg bg-online/10 px-3 py-2 text-sm leading-relaxed text-online">{success}</p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-end gap-2 rounded-b-xl bg-panel-alt px-5 py-3">
        <button
          type="button"
          onClick={stopEditing}
          className="rounded-md px-4 py-2 text-sm font-medium text-text hover:underline"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? "Saving…" : command ? "Save Changes" : "Create Command"}
        </button>
      </div>
    </form>
  );
}
