"use client";

import { useEffect, useState } from "react";
import {
  InteractionType,
  type APIApplicationCommandInteractionDataOption,
  type APIInteraction,
} from "discord-api-types/v10";
import {
  INTERACTION_DEADLINE_MS,
  MAX_INTERACTIONS,
  useInteractions,
  type InboxEntry,
} from "@/lib/commands/useInteractions";
import { commandApi } from "@/lib/discord/commandApi";
import { useClient } from "@/lib/store/client";

export interface InteractionInboxProps {
  className?: string;
}

const INTERACTION_TYPE_LABELS: Record<number, string> = {
  [InteractionType.ApplicationCommand]: "Slash command",
  [InteractionType.MessageComponent]: "Component",
  [InteractionType.ApplicationCommandAutocomplete]: "Autocomplete",
  [InteractionType.ModalSubmit]: "Modal",
};

/** Flattens sub-command nesting into `name=value` pairs. */
function flattenOptions(
  options: APIApplicationCommandInteractionDataOption[] | undefined,
  prefix = "",
): { name: string; value: string }[] {
  if (!options) return [];
  return options.flatMap((option) => {
    if (option.type === 1 || option.type === 2) {
      return flattenOptions(option.options, `${prefix}${option.name} `);
    }
    return [{ name: `${prefix}${option.name}`, value: String(option.value) }];
  });
}

function describe(interaction: APIInteraction) {
  const user = interaction.member?.user ?? interaction.user ?? null;
  const data = "data" in interaction ? interaction.data : undefined;
  const name =
    data && typeof data === "object" && "name" in data && typeof data.name === "string"
      ? data.name
      : null;
  const options =
    data && typeof data === "object" && "options" in data
      ? flattenOptions(data.options as APIApplicationCommandInteractionDataOption[] | undefined)
      : [];
  const channel = interaction.channel;
  const channelName =
    channel && "name" in channel && channel.name ? `#${channel.name}` : (interaction.channel_id ?? "—");
  return {
    userName: user ? (user.global_name ?? user.username) : "Unknown user",
    userId: user?.id ?? null,
    commandName: name,
    options,
    channelName,
  };
}

/** Module scope keeps the clock read out of the component's render path. */
function isExpired(entry: InboxEntry): boolean {
  return Date.now() - entry.createdAt > INTERACTION_DEADLINE_MS;
}

/** Interactions that arrived over the gateway, with a free-text reply box. */
export function InteractionInbox({ className }: InteractionInboxProps) {
  const { entries, setReplyState, remove, clear } = useInteractions();
  const getRest = useClient((state) => state.getRest);
  const status = useClient((state) => state.status);

  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const hasPending = entries.some((entry) => entry.state === "pending");

  useEffect(() => {
    if (!hasPending) return;
    // Keeps the three-second countdown honest without re-rendering forever.
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [hasPending]);

  async function send(entry: InboxEntry) {
    const content = text.trim();
    if (!content) return;
    const { id, token, application_id } = entry.interaction;
    const expired = isExpired(entry);
    setBusyId(id);
    try {
      if (entry.state === "deferred" || expired) {
        // The callback route is dead; only the webhook follow-up can still work.
        await commandApi.followUp(getRest(), application_id, token, { content });
        setReplyState(id, "answered", "Sent as a follow-up message.");
      } else {
        await commandApi.respond(getRest(), id, token, { content });
        setReplyState(id, "answered", "Replied.");
      }
      setOpenId(null);
      setText("");
    } catch (cause) {
      setReplyState(
        id,
        entry.state === "deferred" ? "deferred" : "failed",
        cause instanceof Error ? cause.message : "Failed to send the reply.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function defer(entry: InboxEntry) {
    const { id, token } = entry.interaction;
    setBusyId(id);
    try {
      await commandApi.defer(getRest(), id, token);
      setReplyState(id, "deferred", "Deferred — you have 15 minutes to follow up.");
    } catch (cause) {
      setReplyState(id, "failed", cause instanceof Error ? cause.message : "Deferring failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      <div className="shrink-0 border-b border-line px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted">
          Interactions only reach this client over the gateway while the application has{" "}
          <span className="text-amber">no Interactions Endpoint URL</span> set in the Developer
          Portal. With one configured, Discord POSTs every interaction there instead and nothing
          shows up here.
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Discord expects the first acknowledgement within{" "}
          <span className="font-mono">3 s</span>. After that only a deferred response (type 5) plus
          a follow-up message can still be delivered. The last{" "}
          <span className="font-mono">{MAX_INTERACTIONS}</span> interactions are kept in memory and
          are lost on reload.
        </p>
        {status !== "ready" && (
          <p className="mt-1 text-[11px] text-amber">
            The gateway is not connected, so nothing is arriving right now.
          </p>
        )}
        {entries.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="mt-2 rounded border border-line px-2 py-1 text-[11px] hover:bg-panel"
          >
            Clear list
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted">
            No interactions yet. Run one of the bot&apos;s slash commands in Discord.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => {
              const info = describe(entry.interaction);
              const remaining = entry.createdAt + INTERACTION_DEADLINE_MS - now;
              const expired = remaining <= 0;
              const busy = busyId === entry.interaction.id;
              return (
                <li
                  key={entry.interaction.id}
                  className="rounded border border-line bg-raised/40 px-3 py-2"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-mono text-sm text-text">
                      {info.commandName ? `/${info.commandName}` : "(no command name)"}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
                      {new Date(entry.createdAt).toLocaleTimeString("en-US")}
                    </span>
                  </div>

                  <p className="mt-0.5 text-[11px] text-muted">
                    {INTERACTION_TYPE_LABELS[entry.interaction.type] ??
                      `Type ${entry.interaction.type}`}{" "}
                    · {info.userName} · {info.channelName}
                  </p>
                  {info.userId && (
                    <p className="font-mono text-[10px] text-muted">{info.userId}</p>
                  )}

                  {info.options.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {info.options.map((option) => (
                        <li key={option.name} className="font-mono text-[11px] text-muted">
                          <span className="text-text">{option.name}</span>: {option.value}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-1 text-[11px]">
                    {entry.state === "answered" ? (
                      <span className="text-accent">Answered</span>
                    ) : entry.state === "deferred" ? (
                      <span className="text-amber">
                        Deferred — follow-up possible for 15 minutes
                      </span>
                    ) : expired ? (
                      <span className="text-danger">
                        The 3-second window has passed — a direct reply is no longer accepted.
                      </span>
                    ) : (
                      <span className="text-amber">
                        <span className="font-mono">{(remaining / 1000).toFixed(1)} s</span> left to
                        answer
                      </span>
                    )}
                  </p>
                  {entry.note && (
                    <p
                      className={`mt-0.5 text-[11px] leading-relaxed ${
                        entry.state === "failed" ? "text-danger" : "text-muted"
                      }`}
                    >
                      {entry.note}
                    </p>
                  )}

                  {openId === entry.interaction.id ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <textarea
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        rows={3}
                        placeholder="Reply text"
                        aria-label="Reply text"
                        className="rounded border border-line bg-raised px-2 py-1.5 text-sm text-text placeholder:text-muted"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void send(entry)}
                          disabled={busy || !text.trim()}
                          className="flex-1 rounded bg-accent/15 px-3 py-1.5 text-xs text-accent hover:bg-accent/25 disabled:opacity-50"
                        >
                          {busy
                            ? "Sending…"
                            : entry.state === "deferred" || expired
                              ? "Send follow-up"
                              : "Send reply"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenId(null);
                            setText("");
                          }}
                          className="rounded border border-line px-3 py-1.5 text-xs hover:bg-panel"
                        >
                          Cancel
                        </button>
                      </div>
                      {expired && entry.state !== "deferred" && (
                        <p className="text-[11px] leading-relaxed text-muted">
                          This will be sent as a webhook follow-up. It only works if the
                          interaction was already acknowledged; otherwise Discord rejects it as an
                          unknown webhook.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(entry.interaction.id);
                          setText("");
                        }}
                        className="rounded border border-line px-2 py-1 text-[11px] hover:bg-panel"
                      >
                        Reply
                      </button>
                      {entry.state === "pending" && !expired && (
                        <button
                          type="button"
                          onClick={() => void defer(entry)}
                          disabled={busy}
                          className="rounded border border-line px-2 py-1 text-[11px] text-amber hover:bg-amber/10 disabled:opacity-50"
                        >
                          {busy ? "Deferring…" : "Thinking…"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(entry.interaction.id)}
                        className="ml-auto rounded border border-line px-2 py-1 text-[11px] text-danger hover:bg-danger/10"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
