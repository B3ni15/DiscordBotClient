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

const INPUT =
  "rounded border border-line bg-raised px-2 py-1.5 text-sm text-text placeholder:text-muted";

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
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <h4 className="text-xs font-semibold text-muted">Handler (JavaScript)</h4>
        <span className={`ml-auto font-mono text-[10px] ${tooBig ? "text-danger" : "text-muted"}`}>
          {(bytes / 1000).toFixed(1)}/{SCRIPT_MAX_BYTES / 1000} kB
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        This code runs in this browser every time someone uses the command, as long as the client
        is open and signed in as this bot. It is saved per bot, and synced through your account
        when sync is on.
      </p>

      <label className="flex items-center gap-2 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        Run automatically — when off, the command only shows up under Incoming
      </label>

      <textarea
        ref={textarea}
        value={code}
        onChange={(event) => onCodeChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={14}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={EXAMPLE_SCRIPT}
        aria-label="Command handler code"
        className={`${INPUT} min-h-40 resize-y font-mono text-xs leading-relaxed whitespace-pre`}
      />
      {tooBig && (
        <p className="text-[11px] text-danger">
          The script is too large to save; keep it under {SCRIPT_MAX_BYTES / 1000} kB.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {!code.trim() && (
          <button
            type="button"
            onClick={() => onCodeChange(EXAMPLE_SCRIPT)}
            className="rounded border border-line px-2 py-1 text-[11px] hover:bg-panel"
          >
            Use example
          </button>
        )}
        <button
          type="button"
          onClick={() => setEmbedOpen(true)}
          className="rounded border border-line px-2 py-1 text-[11px] hover:bg-panel"
        >
          🧩 Insert embed
        </button>
        <button
          type="button"
          onClick={() => {
            if (!testOpen && !testValues) setTestValues(defaultTestValues());
            setTestOpen((open) => !open);
          }}
          aria-expanded={testOpen}
          className="rounded border border-line px-2 py-1 text-[11px] hover:bg-panel"
        >
          Test values
        </button>
        <button
          type="button"
          onClick={() => void testRun()}
          disabled={testing || !code.trim() || !botUser}
          className="ml-auto rounded bg-accent/15 px-2 py-1 text-[11px] text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          {testing ? "Running…" : "▶ Test run"}
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

      <details className="rounded border border-line bg-raised/40 px-2 py-1.5">
        <summary className="cursor-pointer text-[11px] text-muted">Available in scripts</summary>
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
      <p className="text-[11px] text-muted">
        No runs yet. Use “Test run”, or the command itself in Discord, to see output here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline">
        <h4 className="text-xs font-semibold text-muted">Console</h4>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded border border-line px-2 py-0.5 text-[11px] hover:bg-panel"
        >
          Clear
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {runs.map((run) => (
          <li key={run.id} className="rounded border border-line bg-ink/60 px-2 py-1.5">
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
