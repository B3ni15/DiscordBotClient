"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { useClient } from "@/lib/store/client";

const REPO_URL = "https://github.com/B3ni15/DiscordBotClient";

/** Login screen: takes a bot token and hands it to the store. */
export function TokenGate() {
  const login = useClient((state) => state.login);
  const error = useClient((state) => state.error);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !token.trim()) return;
    setBusy(true);
    // login resolves either way; on success this component unmounts.
    await login(token.trim());
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-6 py-16">
      <div className="w-full max-w-md animate-pop-in rounded-lg bg-panel p-8 shadow-2xl">
        <h1 className="text-center text-2xl font-bold text-bright">Welcome back!</h1>
        <p className="mt-2 text-center text-sm text-muted">
          Sign in with a bot token to use it like a Discord client.
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          <label
            htmlFor="token"
            className="block text-xs font-bold tracking-wide text-muted uppercase"
          >
            Bot token
          </label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="MTE4OTQy…"
            className="mt-2 w-full rounded-[3px] bg-ink px-3 py-2.5 font-mono text-sm text-text transition-shadow outline-none placeholder:text-faint/60 focus:shadow-[0_0_0_1px_var(--accent)]"
          />
          <button
            type="submit"
            aria-disabled={busy || !token.trim()}
            className={`mt-5 flex w-full items-center justify-center gap-2 rounded-[3px] bg-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong ${
              busy || !token.trim() ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            {busy && <Spinner size={14} />}
            {busy ? "Connecting…" : "Log In"}
          </button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-4 animate-fade-in rounded-[3px] bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-8 space-y-3 border-t border-line pt-6 text-xs leading-relaxed text-muted">
          <p>
            Find the token on the Bot tab of the{" "}
            <a
              className="text-link hover:underline"
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noreferrer"
            >
              Developer Portal
            </a>
            . Turn on the <span className="font-mono text-amber">MESSAGE CONTENT</span>,{" "}
            <span className="font-mono text-amber">SERVER MEMBERS</span> and{" "}
            <span className="font-mono text-amber">PRESENCE</span> intents there too, or message
            text arrives empty and nobody shows up as online.
          </p>

          <p>
            <span className="font-semibold text-text">No data is stored.</span> There is no account
            and no database: your token, your settings and the list of DMs you opened stay in this
            browser’s <span className="font-mono">localStorage</span>, and signing out erases them.
            Requests go through a same-origin proxy that only forwards them to Discord — it keeps
            no copy of the token, the messages or anything else. The hosted site counts anonymous
            page views (Vercel Web Analytics); none of your Discord data is part of that.
          </p>

          <p>
            Open source — read the code, file an issue or host it yourself:{" "}
            <a
              className="text-link hover:underline"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              github.com/B3ni15/DiscordBotClient
            </a>
            . Use a <span className="font-semibold text-text">bot</span> token only; user tokens
            break Discord’s terms of service and are not supported.
          </p>
        </div>
      </div>
    </main>
  );
}
