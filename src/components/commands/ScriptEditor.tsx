"use client";

import { useRef, useState } from "react";
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
import { EmbedIcon, PlayIcon } from "@/components/ui/icons";

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

/** What a script can use, shown in the editor's help. */
const REFERENCE: Array<[string, string]> = [
  ["reply(message)", "Answer the command. A string or { content, embeds, components, ephemeral }."],
  ["defer({ ephemeral })", "“Thinking…” — buys 15 minutes. A later reply() fills it in."],
  ["followUp(message)", "Another message after the first reply."],
  ["editReply(message) / deleteReply()", "Change or remove the first reply."],
  ["options.getString('name')", "Option values; also getInteger, getNumber, getBoolean, getUser, getMember, getChannel, getRole, getAttachment, getSubcommand."],
  ["user / member", "Who used the command (member is null in DMs)."],
  ["guildId / channelId / interaction", "Where it happened, and the raw interaction."],
  ["send(channelId, message)", "Post a regular message into any channel the bot can write in."],
  ["discord.get(path, query)", "Any Discord API route: also post, patch, put, delete — e.g. discord.get('/guilds/' + guildId)."],
  ["new EmbedBuilder()", "setTitle, setDescription, setColor('#5865f2'), addFields, setImage, setFooter, setTimestamp…"],
  ["sleep(ms) / console.log()", "Wait; write to the console below."],
  ["return 'text'", "Shorthand for reply('text') when nothing was sent yet."],
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

  const textarea = useRef<HTMLTextAreaElement>(null);
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

  /** Replaces the selection with `text`, keeping the caret after it. */
  function insert(text: string) {
    const element = textarea.current;
    const start = element?.selectionStart ?? code.length;
    const end = element?.selectionEnd ?? code.length;
    const next = code.slice(0, start) + text + code.slice(end);
    onCodeChange(next);
    requestAnimationFrame(() => {
      if (!element) return;
      element.focus();
      element.selectionStart = element.selectionEnd = start + text.length;
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Tab indents instead of leaving the editor; Escape still gets you out.
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      insert("  ");
    }
  }

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

  return (
    <div className="flex flex-col gap-2.5 border-t border-line/60 pt-4">
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
        <div className="flex items-center gap-1.5 border-b border-white/5 px-3 py-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-amber/70" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-online/70" />
          <span className="ml-2 font-mono text-[11px] text-faint">
            {(commandName.trim() || "command")}.js
          </span>
        </div>
        <textarea
          ref={textarea}
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={14}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Write what the command answers, e.g. await reply('Pong!') — or start from the example."
          aria-label="Command handler code"
          className="block min-h-48 w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[13px] leading-relaxed whitespace-pre text-text outline-none placeholder:font-sans placeholder:text-faint focus-visible:outline-none"
        />
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
          Scripts run in a sandboxed worker that never sees the bot token, and are stopped after{" "}
          {SCRIPT_TIMEOUT_MS / 1000} s. One still running after 2 s is deferred automatically so
          Discord does not give up on it.
        </p>
      </details>

      <ScriptConsole runs={mine} onClear={() => botUser && clearRuns(botUser.id, runName)} />

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
