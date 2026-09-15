"use client";

import { useEffect, useState } from "react";
import type { APIApplicationCommand } from "discord-api-types/v10";
import { useCommandsUI } from "@/lib/commands/commandsUi";
import { useApplicationId } from "@/lib/commands/useApplicationId";
import { commandApi } from "@/lib/discord/commandApi";
import { useClient } from "@/lib/store/client";

export interface CommandListProps {
  /** Guild whose local commands are listed. Defaults to the selected guild. */
  guildId?: string | null;
  className?: string;
}

interface Loaded {
  /** Identifies the request this result belongs to, so stale answers are ignored. */
  key: string;
  global: APIApplicationCommand[];
  guild: APIApplicationCommand[];
  error: string | null;
}

/** The bot's registered slash commands, split by scope. */
export function CommandList({ guildId, className }: CommandListProps) {
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const guilds = useClient((state) => state.guilds);
  const getRest = useClient((state) => state.getRest);
  const token = useClient((state) => state.token);
  const applicationId = useApplicationId();

  const revision = useCommandsUI((state) => state.revision);
  const bump = useCommandsUI((state) => state.bump);
  const startCreate = useCommandsUI((state) => state.startCreate);
  const startEdit = useCommandsUI((state) => state.startEdit);
  const editing = useCommandsUI((state) => state.editing);

  const guild = guildId ?? selectedGuildId ?? null;
  const guildName = guild ? (guilds[guild]?.name ?? guild) : null;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const key = `${applicationId ?? ""}:${guild ?? ""}:${revision}`;

  useEffect(() => {
    if (!applicationId || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const rest = getRest();
        const [global, local] = await Promise.all([
          commandApi.list(rest, applicationId),
          guild ? commandApi.list(rest, applicationId, guild) : Promise.resolve([]),
        ]);
        if (!cancelled) setLoaded({ key, global, guild: local, error: null });
      } catch (cause) {
        if (cancelled) return;
        setLoaded({
          key,
          global: [],
          guild: [],
          error: cause instanceof Error ? cause.message : "Failed to load commands.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applicationId, token, guild, getRest, key]);

  const current = loaded?.key === key ? loaded : null;
  const loading = Boolean(applicationId && token) && current === null;

  async function remove(command: APIApplicationCommand, scope: string | null) {
    if (!applicationId) return;
    setBusyId(command.id);
    setActionError(null);
    try {
      await commandApi.remove(getRest(), applicationId, command.id, scope);
      setConfirmingId(null);
      bump();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Failed to delete the command.");
    } finally {
      setBusyId(null);
    }
  }

  function renderCommand(command: APIApplicationCommand, scope: string | null) {
    const isEditing = editing?.command?.id === command.id;
    const optionCount = command.options?.length ?? 0;
    return (
      <li
        key={command.id}
        className={`rounded border px-3 py-2 ${
          isEditing ? "border-accent/60 bg-raised" : "border-line bg-raised/40"
        }`}
      >
        <div className="flex items-baseline gap-2">
          <span className="truncate font-mono text-sm text-text">/{command.name}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
            {optionCount} {optionCount === 1 ? "option" : "options"}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
          {command.description || "(no description)"}
        </p>
        <p className="mt-1 truncate font-mono text-[10px] text-muted">{command.id}</p>

        {confirmingId === command.id ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-danger">Delete this command?</span>
            <button
              type="button"
              onClick={() => void remove(command, scope)}
              disabled={busyId === command.id}
              className="ml-auto rounded bg-danger/20 px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger/30 disabled:opacity-60"
            >
              {busyId === command.id ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingId(null)}
              className="rounded border border-line px-2 py-1 text-[11px] hover:bg-panel"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => startEdit(command, scope)}
              className="rounded border border-line px-2 py-1 text-[11px] hover:bg-panel"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setConfirmingId(command.id);
              }}
              className="rounded border border-line px-2 py-1 text-[11px] text-danger hover:bg-danger/10"
            >
              Delete
            </button>
          </div>
        )}
      </li>
    );
  }

  function renderSection(
    title: string,
    hint: string,
    commands: APIApplicationCommand[],
    scope: string | null,
  ) {
    return (
      <section className="mb-5">
        <div className="flex items-baseline gap-2 pb-1">
          <h3 className="text-xs font-semibold text-muted">{title}</h3>
          <button
            type="button"
            onClick={() => startCreate(scope)}
            className="ml-auto rounded bg-accent/15 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/25"
          >
            + New
          </button>
        </div>
        <p className="pb-2 text-[11px] leading-relaxed text-muted">{hint}</p>
        {commands.length === 0 ? (
          <p className="text-xs text-muted">No commands in this scope.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {commands.map((command) => renderCommand(command, scope))}
          </ul>
        )}
      </section>
    );
  }

  if (!token) {
    return (
      <div className={`px-4 py-4 text-xs text-muted ${className ?? ""}`}>
        Sign in with a bot token to manage slash commands.
      </div>
    );
  }

  return (
    <div className={`min-h-0 overflow-y-auto px-4 py-3 ${className ?? ""}`}>
      {actionError && (
        <p role="alert" className="mb-2 text-xs leading-relaxed text-danger">
          {actionError}
        </p>
      )}
      {current?.error && (
        <p role="alert" className="mb-2 text-xs leading-relaxed text-danger">
          {current.error}
        </p>
      )}
      {loading && <p className="mb-2 text-xs text-muted">Loading commands…</p>}

      {renderSection(
        "Global commands",
        "Available in every server. Changes can take up to an hour to show up.",
        current?.global ?? [],
        null,
      )}

      {guild
        ? renderSection(
            `Server commands — ${guildName}`,
            "Only in this server, but they go live immediately.",
            current?.guild ?? [],
            guild,
          )
        : (
            <p className="text-xs leading-relaxed text-muted">
              Pick a server to see and create server-specific commands.
            </p>
          )}
    </div>
  );
}
