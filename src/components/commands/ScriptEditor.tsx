"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionType,
  type APIEmbed,
  type APIInteraction,
} from "discord-api-types/v10";
import { EmbedCreator } from "@/components/actions/EmbedCreator";
import { runCommandScript, SCRIPT_TIMEOUT_MS } from "@/lib/commands/runner";
import { clearRuns, useScriptRuns, type ScriptRun } from "@/lib/commands/scriptRuns";
import { SCRIPT_MAX_BYTES, scriptBytes } from "@/lib/commands/scriptStore";
import type { DraftOption } from "@/lib/commands/validation";
import { useClient } from "@/lib/store/client";
import { CloseIcon, EmbedIcon, PlayIcon } from "@/components/ui/icons";
import type { CodeEditorHandle } from "./CodeEditor";

/** Monaco only exists in the browser, and is only worth loading once a handler is open. */
const CodeEditor = dynamic(() => import("./CodeEditor").then((module) => module.CodeEditor), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-48 place-items-center text-xs text-muted">Loading the editor…</div>,
});

const INPUT =
  "rounded-md bg-ink px-3 py-2 text-sm text-text outline-none transition-shadow placeholder:text-faint focus:shadow-[0_0_0_1px_var(--accent)]";
const GHOST_BUTTON =
  "flex items-center gap-1.5 rounded-md bg-raised px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-hover";

export const EXAMPLE_SCRIPT = `// Runs every time someone uses this command.
const name = user.global_name ?? user.username;

await reply({
  content: \`Hello, \${name}! 👋\`,
  ephemeral: false,
});
`;

/** The most used helpers, shown in the editor's help; the full reference is at /docs/commands. */
const REFERENCE: Array<[string, string]> = [
  ["reply(message) / defer() / followUp() / editReply()", "Answer the command. A string or { content, embeds, components, ephemeral }."],
  ["options.getString('name')", "Option values; also getInteger, getUser, getMember, getChannel, getRole, getAttachment…"],
  ["user / member / guildId / channelId", "Who used the command, and where."],
  ["channels.create / edit / delete / setPermission", "Channels and categories, with permission overwrites."],
  ["roles.create / edit / delete / add / remove", "Roles, and giving or taking them from members."],
  ["messages.send / edit / delete / bulkDelete / react / pin", "Messages in any channel the bot can see."],
  ["members.kick / ban / timeout / setNickname / move", "Moderation."],
  ["webhooks.create / send / edit / delete", "Webhooks, including posting under another name."],
  ["guild / threads / emojis / events / invites / users", "The server itself, threads, emojis, scheduled events, invites, DMs."],
  ["discord.get / post / patch / put / delete", "Any other Discord API route."],
];

export interface ScriptEditorProps {
  /** The command's name in the form, used for test runs. */
  commandName: string;
  /** The name runs are recorded under: the saved command's, or the draft's. */
  runName: string;
  code: string;
  onCodeChange: (code: string) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** The command's options, to prefill the test run's values. */
  options: DraftOption[];
}

/** The JavaScript handler of one slash command, with a test runner and console. */
export function ScriptEditor({
  commandName,
  runName,
  code,
  onCodeChange,
  enabled,
  onEnabledChange,
  options,
}: ScriptEditorProps) {
  const botUser = useClient((state) => state.user);
  const getRest = useClient((state) => state.getRest);
  const selectedGuildId = useClient((state) => state.selectedGuildId);
  const selectedChannelId = useClient((state) => state.selectedChannelId);
  const channelsById = useClient((state) => state.channelsById);
  const runs = useScriptRuns();

  const root = useRef<HTMLDivElement>(null);
  const editor = useRef<CodeEditorHandle | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testValues, setTestValues] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const bytes = scriptBytes(code);
  const tooBig = bytes > SCRIPT_MAX_BYTES;
  const mine = botUser
    ? runs.filter((run) => run.botId === botUser.id && run.name === runName).slice(0, 5)
    : [];

  /** Inserts at the cursor, or appends when the editor is not ready yet. */
  function insert(text: string) {
    if (editor.current) {
      editor.current.insert(text);
      return;
    }
    onCodeChange(code + text);
  }

  /** Ctrl/⌘+S saves the whole command, like the form's own button. */
  function save() {
    root.current?.closest("form")?.requestSubmit();
  }

  // The large editor closes with Escape when the focus is outside the code.
  useEffect(() => {
    // The embed dialog on top of it takes its own Escape.
    if (!expanded || embedOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if ((event.target as Element | null)?.closest?.(".monaco-editor")) return;
      event.stopPropagation();
      setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [expanded, embedOpen]);

  function insertEmbed(embed: APIEmbed) {
    const body = JSON.stringify(embed, null, 2).replace(/\n/g, "\n    ");
    const prefix = code && !code.endsWith("\n") ? "\n" : "";
    insert(`${prefix}await reply({\n  embeds: [\n    ${body},\n  ],\n});\n`);
    setEmbedOpen(false);
  }

  function defaultTestValues(): string {
    const values: Record<string, unknown> = {};
    for (const option of options) {
      if (!option.name.trim()) continue;
      const name = option.name.trim();
      switch (option.type) {
        case ApplicationCommandOptionType.String:
          values[name] = option.choices[0]?.value ?? "text";
          break;
        case ApplicationCommandOptionType.Integer:
          values[name] = Number(option.choices[0]?.value ?? 1);
          break;
        case ApplicationCommandOptionType.Number:
          values[name] = Number(option.choices[0]?.value ?? 1.5);
          break;
        case ApplicationCommandOptionType.Boolean:
          values[name] = true;
          break;
        case ApplicationCommandOptionType.User:
        case ApplicationCommandOptionType.Mentionable:
          values[name] = botUser?.id ?? "0";
          break;
        case ApplicationCommandOptionType.Channel:
          values[name] = selectedChannelId ?? "0";
          break;
        case ApplicationCommandOptionType.Role:
          values[name] = selectedGuildId ?? "0";
          break;
      }
    }
    return JSON.stringify(values, null, 2);
  }

  async function testRun() {
    if (!botUser || testing) return;
    let values: Record<string, unknown> = {};
    try {
      const parsed: unknown = testValues.trim() ? JSON.parse(testValues) : {};
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Expected an object such as { \"target\": \"…\" }.");
      }
      values = parsed as Record<string, unknown>;
    } catch (cause) {
      setTestOpen(true);
      setTestError(cause instanceof Error ? cause.message : "The option values are not valid JSON.");
      return;
    }
    setTestError(null);
    setTesting(true);
    try {
      const channel = selectedChannelId ? channelsById[selectedChannelId] : undefined;
      const typeOf = new Map(options.map((option) => [option.name.trim(), option.type]));
      const interaction = {
        id: "0",
        application_id: botUser.id,
        type: InteractionType.ApplicationCommand,
        token: "test",
        version: 1,
        locale: "en-US",
        app_permissions: "0",
        entitlements: [],
        authorizing_integration_owners: {},
        guild_id: selectedGuildId ?? undefined,
        channel_id: selectedChannelId ?? undefined,
        channel,
        ...(selectedGuildId
          ? {
              member: {
                user: botUser,
                roles: [],
                joined_at: new Date().toISOString(),
                deaf: false,
                mute: false,
                flags: 0,
                permissions: "0",
              },
            }
          : { user: botUser }),
        data: {
          id: "0",
          name: commandName.trim() || runName,
          type: ApplicationCommandType.ChatInput,
          options: Object.entries(values).map(([name, value]) => ({
            name,
            type: typeOf.get(name) ?? ApplicationCommandOptionType.String,
            value,
          })),
          resolved: {
            users: { [botUser.id]: botUser },
            ...(channel ? { channels: { [channel.id]: channel } } : {}),
          },
        },
      } as unknown as APIInteraction;
      await runCommandScript({
        rest: getRest(),
        botId: botUser.id,
        name: runName,
        code,
        interaction,
        test: true,
      });
    } finally {
      setTesting(false);
    }
  }

  const fileName = `${commandName.trim() || "command"}.js`;

  return (
    <div ref={root} className="flex flex-col gap-2.5 border-t border-line/60 pt-4">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-bold tracking-wide text-muted uppercase">Handler</h4>
        <span className="rounded bg-amber/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber">JS</span>
        <span className={`ml-auto font-mono text-[11px] ${tooBig ? "text-danger" : "text-faint"}`}>
          {(bytes / 1000).toFixed(1)} / {SCRIPT_MAX_BYTES / 1000} kB
        </span>
      </div>
      <p className="-mt-1 text-xs leading-relaxed text-faint">
        Runs in this browser every time someone uses the command, while the client is open as
        this bot. Saved per bot and synced when sync is on.
      </p>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-panel-alt px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-text">Run automatically</span>
          <span className="block text-xs text-muted">
            When off, the command answers that it is switched off.
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="relative h-6 w-10 shrink-0 rounded-full bg-muted/40 transition-colors peer-checked:bg-online peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-1 after:left-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
        />
      </label>

      <div className="overflow-hidden rounded-lg border border-black/30 bg-floating">
        <EditorTitleBar fileName={fileName}>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-auto rounded px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
            title="Open in a large editor"
          >
            ⤢ Expand
          </button>
        </EditorTitleBar>
        {expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="grid h-48 w-full place-items-center text-xs text-muted hover:text-text"
          >
            Editing in the large editor — click to bring it back here.
          </button>
        ) : (
          <CodeEditor
            path={`inline/${fileName}`}
            value={code}
            onChange={onCodeChange}
            onSave={save}
            onHandle={(handle) => {
              editor.current = handle;
            }}
            className="h-80 resize-y overflow-hidden"
          />
        )}
      </div>
      {tooBig && (
        <p className="text-[11px] text-danger">
          The script is too large to save; keep it under {SCRIPT_MAX_BYTES / 1000} kB.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {!code.trim() && (
          <button type="button" onClick={() => onCodeChange(EXAMPLE_SCRIPT)} className={GHOST_BUTTON}>
            Use example
          </button>
        )}
        <button type="button" onClick={() => setEmbedOpen(true)} className={GHOST_BUTTON}>
          <EmbedIcon size={14} />
          Insert embed
        </button>
        <button
          type="button"
          onClick={() => {
            if (!testOpen && !testValues) setTestValues(defaultTestValues());
            setTestOpen((open) => !open);
          }}
          aria-expanded={testOpen}
          className={GHOST_BUTTON}
        >
          Test values
        </button>
        <button
          type="button"
          onClick={() => void testRun()}
          disabled={testing || !code.trim() || !botUser}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-online/15 px-3 py-1.5 text-xs font-semibold text-online transition-colors hover:bg-online/25 disabled:opacity-50"
        >
          <PlayIcon size={12} />
          {testing ? "Running…" : "Test run"}
        </button>
      </div>

      {testOpen && (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Option values for the test run (JSON)
            <textarea
              value={testValues}
              onChange={(event) => setTestValues(event.target.value)}
              rows={4}
              spellCheck={false}
              className={`${INPUT} font-mono text-xs`}
            />
          </label>
          {testError && <p className="text-[11px] text-danger">{testError}</p>}
          <p className="text-[11px] leading-relaxed text-muted">
            A test run pretends the bot itself used the command in the open channel. Replies are only
            written to the console; <span className="font-mono">send()</span> and{" "}
            <span className="font-mono">discord.*</span> calls really happen.
          </p>
        </div>
      )}

      <details className="rounded-lg bg-panel-alt px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-text">
          What a script can use
        </summary>
        <dl className="mt-1.5 flex flex-col gap-1">
          {REFERENCE.map(([name, description]) => (
            <div key={name}>
              <dt className="font-mono text-[11px] text-text">{name}</dt>
              <dd className="text-[11px] leading-relaxed text-muted">{description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          The editor autocompletes all of these — type a name and a dot. Scripts run in a sandboxed
          worker that never sees the bot token, and are stopped after {SCRIPT_TIMEOUT_MS / 1000} s.
        </p>
        <Link
          href="/docs/commands"
          target="_blank"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
        >
          Full reference with examples ↗
        </Link>
      </details>

      <ScriptConsole runs={mine} onClear={() => botUser && clearRuns(botUser.id, runName)} />

      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Editing ${fileName}`}
            className="fixed inset-0 z-[90] flex flex-col bg-floating"
          >
            <EditorTitleBar fileName={fileName} large>
              <span className={`ml-3 font-mono text-[11px] ${tooBig ? "text-danger" : "text-faint"}`}>
                {(bytes / 1000).toFixed(1)} / {SCRIPT_MAX_BYTES / 1000} kB
              </span>
              <span className="ml-auto hidden text-[11px] text-faint sm:inline">
                Ctrl+S saves · Ctrl+Space suggests · Esc outside the code closes
              </span>
              <Link
                href="/docs/commands"
                target="_blank"
                className="ml-3 rounded-md px-2.5 py-1 text-xs font-medium text-link hover:bg-hover"
              >
                Docs ↗
              </Link>
              <button type="button" onClick={() => setEmbedOpen(true)} className={`ml-1.5 ${GHOST_BUTTON}`}>
                <EmbedIcon size={14} />
                Insert embed
              </button>
              <button
                type="button"
                onClick={() => void testRun()}
                disabled={testing || !code.trim() || !botUser}
                className="ml-1.5 flex items-center gap-1.5 rounded-md bg-online/15 px-3 py-1.5 text-xs font-semibold text-online transition-colors hover:bg-online/25 disabled:opacity-50"
              >
                <PlayIcon size={12} />
                {testing ? "Running…" : "Test run"}
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close the large editor"
                className="ml-1.5 grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-text"
              >
                <CloseIcon size={16} />
              </button>
            </EditorTitleBar>
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <CodeEditor
                path={`large/${fileName}`}
                value={code}
                onChange={onCodeChange}
                onSave={save}
                autoFocus
                onHandle={(handle) => {
                  editor.current = handle;
                }}
                className="min-h-0 flex-1"
              />
              <aside className="flex max-h-[40vh] min-h-0 flex-col gap-2 overflow-y-auto border-t border-white/5 bg-ink p-3 lg:max-h-none lg:w-[380px] lg:border-t-0 lg:border-l">
                <ScriptConsole runs={mine} onClear={() => botUser && clearRuns(botUser.id, runName)} />
              </aside>
            </div>
          </div>,
          document.body,
        )}

      {embedOpen && (
        <EmbedCreator
          title="Insert an embed"
          subtitle="Adds a reply({ embeds }) call at the cursor."
          confirmLabel="Insert"
          onClose={() => setEmbedOpen(false)}
          onConfirm={({ embed }) => insertEmbed(embed)}
        />
      )}
    </div>
  );
}

/** The editor's tab strip: three dots and the file name, plus whatever buttons it is given. */
function EditorTitleBar({
  fileName,
  large = false,
  children,
}: {
  fileName: string;
  large?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-1.5 border-b border-white/5 px-3 ${large ? "h-12" : "py-1.5"}`}>
      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-danger/70" />
      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-amber/70" />
      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-online/70" />
      <span className="ml-2 font-mono text-[11px] text-faint">{fileName}</span>
      {children}
    </div>
  );
}

const LEVEL_CLASS: Record<string, string> = {
  log: "text-text",
  info: "text-link",
  warn: "text-amber",
  error: "text-danger",
  system: "text-muted",
};

const STATUS_LABEL: Record<ScriptRun["status"], string> = {
  running: "running…",
  ok: "ok",
  error: "failed",
  timeout: "timed out",
};

/** The last few runs of this command's script, newest first. */
function ScriptConsole({ runs, onClear }: { runs: ScriptRun[]; onClear: () => void }) {
  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-muted">
        No runs yet. Use “Test run”, or the command itself in Discord, to see output here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline">
        <h4 className="text-xs font-bold tracking-wide text-muted uppercase">Console</h4>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-md px-2 py-0.5 text-xs text-muted transition-colors hover:bg-hover hover:text-text"
        >
          Clear
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {runs.map((run) => (
          <li key={run.id} className="rounded-lg border border-black/30 bg-floating px-3 py-2">
            <p className="flex items-baseline gap-2 text-[10px] text-muted">
              <span className="font-mono">{new Date(run.startedAt).toLocaleTimeString("en-US")}</span>
              <span>{run.test ? "test run" : (run.userName ?? "someone")}</span>
              <span
                className={`ml-auto font-mono ${
                  run.status === "ok"
                    ? "text-online"
                    : run.status === "running"
                      ? "text-amber"
                      : "text-danger"
                }`}
              >
                {STATUS_LABEL[run.status]}
              </span>
            </p>
            {run.logs.length > 0 && (
              <pre className="mt-1 max-h-48 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                {run.logs.map((line, index) => (
                  <span key={index} className={`block ${LEVEL_CLASS[line.level]}`}>
                    {line.level === "system" ? `» ${line.text}` : line.text}
                  </span>
                ))}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
