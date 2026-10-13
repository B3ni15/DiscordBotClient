"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { APIApplicationCommand } from "discord-api-types/v10";
import { useCommandsUI } from "@/lib/commands/commandsUi";
import {
  getAllScripts,
  getServerScripts,
  removeScript,
  subscribeScripts,
} from "@/lib/commands/scriptStore";
import { useApplicationId } from "@/lib/commands/useApplicationId";
import { commandApi } from "@/lib/discord/commandApi";
import { useClient } from "@/lib/store/client";
import { PencilIcon, PlusIcon, SlashIcon, TrashStrokeIcon } from "@/components/ui/icons";
import { SkeletonRows } from "@/components/ui/Skeleton";

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
  const botId = useClient((state) => state.user?.id ?? null);
  const scripts = useSyncExternalStore(subscribeScripts, getAllScripts, getServerScripts);

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
      // The script goes with the last command of its name, in any scope.
      const others = [...(current?.global ?? []), ...(current?.guild ?? [])].filter(
        (entry) => entry.id !== command.id && entry.name === command.name,
      );
      if (botId && others.length === 0) removeScript(botId, command.name);
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
    const script = botId
      ? scripts.find((entry) => entry.botId === botId && entry.name === command.name)
      : undefined;
    const confirming = confirmingId === command.id;
    return (
      <li key={command.id}>
        <div
          className={`group/cmd relative flex items-start gap-3 rounded-lg border px-3 py-3 transition-colors ${
            isEditing
              ? "border-accent/70 bg-accent/10"
              : "border-transparent bg-panel hover:border-line hover:bg-hover"
          }`}
        >
          <button
            type="button"
            onClick={() => startEdit(command, scope)}
            aria-label={`Edit /${command.name}`}
            className="absolute inset-0 rounded-lg"
          />
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-raised text-muted">
            <SlashIcon size={18} />
          </span>
          <div className="pointer-events-none min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <span className="truncate font-mono text-[15px] font-semibold text-bright">
                /{command.name}
              </span>
              {script ? (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    script.enabled ? "bg-online/15 text-online" : "bg-raised text-muted"
                  }`}
                >
                  {script.enabled ? "Live" : "Off"}
                </span>
              ) : (
                <span className="shrink-0 rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-bold text-amber uppercase">
                  No handler
                </span>
              )}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted">
              {command.description || "(no description)"}
            </p>
            <p className="mt-1.5 text-[11px] text-faint">
              {optionCount} {optionCount === 1 ? "option" : "options"}
            </p>
          </div>
          <div className="relative flex shrink-0 gap-1 opacity-0 transition-opacity group-hover/cmd:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={() => startEdit(command, scope)}
              aria-label={`Edit /${command.name}`}
              title="Edit"
              className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-bright"
            >
              <PencilIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setConfirmingId(command.id);
              }}
              aria-label={`Delete /${command.name}`}
              title="Delete"
              className="grid h-8 w-8 place-items-center rounded-md text-danger transition-colors hover:bg-danger/15"
            >
              <TrashStrokeIcon size={15} />
            </button>
          </div>
        </div>

        {confirming && (
          <div className="mt-1 flex animate-fade-in items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2">
            <span className="flex-1 text-sm text-danger">Delete /{command.name} from Discord?</span>
            <button
              type="button"
              onClick={() => setConfirmingId(null)}
              className="rounded px-3 py-1 text-sm text-text hover:underline"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void remove(command, scope)}
              disabled={busyId === command.id}
              className="rounded bg-danger px-3 py-1 text-sm font-medium text-white hover:brightness-90 disabled:opacity-60"
            >
              {busyId === command.id ? "Deleting…" : "Delete"}
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
      <section className="mb-8">
        <div className="flex items-center gap-2 pb-1">
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            {title} — {commands.length}
          </h3>
          <button
            type="button"
            onClick={() => startCreate(scope)}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
          >
            <PlusIcon size={12} />
            New
          </button>
        </div>
        <p className="pb-3 text-xs leading-relaxed text-faint">{hint}</p>
        {commands.length === 0 ? (
          <button
            type="button"
            onClick={() => startCreate(scope)}
            className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-line px-4 py-6 text-center transition-colors hover:border-muted hover:bg-panel"
          >
            <span className="text-sm font-medium text-text">No commands here yet</span>
            <span className="text-xs text-muted">Create one — it answers as soon as it is saved.</span>
          </button>
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
      <div className={`text-sm text-muted ${className ?? ""}`}>
        Sign in with a bot token to manage slash commands.
      </div>
    );
  }

  return (
    <div className={className}>
      {actionError && (
        <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {actionError}
        </p>
      )}
      {current?.error && (
        <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {current.error}
        </p>
      )}
      {loading && <SkeletonRows rows={4} avatar className="mb-4" />}

      {renderSection(
        "Everywhere",
        "In every server the bot is in and in DMs with it.",
        current?.global ?? [],
        null,
      )}

      {guild
        ? renderSection(
            `${guildName}`,
            "Only in this server; changes go live immediately.",
            current?.guild ?? [],
            guild,
          )
        : (
            <p className="rounded-lg bg-panel px-4 py-3 text-sm text-muted">
              Open a server to see and create commands that only exist there.
            </p>
          )}
    </div>
  );
}
