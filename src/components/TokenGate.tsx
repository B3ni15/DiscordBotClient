"use client";

import { useState } from "react";
import { BotAvatar } from "@/components/account/BotSwitcher";
import { Spinner } from "@/components/ui/Spinner";
import { useAccount } from "@/lib/store/account";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

const REPO_URL = "https://github.com/B3ni15/DiscordBotClient";

/** Login screen: takes a bot token and hands it to the store. */
export function TokenGate() {
  const login = useClient((state) => state.login);
  const error = useClient((state) => state.error);
  const accountStatus = useAccount((state) => state.status);
  const bots = useAccount((state) => state.bots);
  const openDialog = useUI((state) => state.openDialog);
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

        {accountStatus === "unlocked" && bots.length > 0 && (
          <div className="mt-6">
            <h2 className="pb-2 text-xs font-bold tracking-wide text-muted uppercase">
              Your bots
            </h2>
            <ul className="flex flex-col gap-1">
              {bots.map((bot) => (
                <li key={bot.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void login(bot.token).finally(() => setBusy(false));
                    }}
                    className="flex w-full items-center gap-3 rounded-[3px] bg-ink px-3 py-2 text-left transition-colors hover:bg-hover disabled:opacity-60"
                  >
                    <BotAvatar bot={bot} size={24} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-bright">
                      {bot.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted">Sign in</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-center text-xs text-muted">or use another token</p>
          </div>
        )}

        {(accountStatus === "locked" || accountStatus === "needsSetup") && (
          <button
            type="button"
            onClick={() =>
              openDialog({ kind: accountStatus === "locked" ? "accountUnlock" : "accountSetup" })
            }
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-[3px] bg-panel-alt px-3 py-2.5 text-sm font-medium text-bright transition-colors hover:bg-raised"
          >
            <span aria-hidden>🔑</span>
            {accountStatus === "locked" ? "Unlock your saved bots" : "Turn on sync"}
          </button>
        )}

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

        {accountStatus === "signedOut" && (
          <div className="mt-6 border-t border-line pt-6">
            <a
              href="/api/auth/discord"
              className="flex w-full items-center justify-center gap-2 rounded-[3px] bg-panel-alt px-3 py-2.5 text-sm font-medium text-bright transition-colors hover:bg-raised"
            >
              <span aria-hidden>🔗</span>
              Sign in with Discord
            </a>
            <p className="mt-2 text-center text-xs text-muted">
              Optional. Keeps your bots and DM list across devices, encrypted so the server cannot
              read them.
            </p>
          </div>
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
            <span className="font-semibold text-text">Nothing readable is stored.</span> Without
            signing in there is no account at all: your token, your settings and the list of DMs
            you opened stay in this browser’s{" "}
            <span className="font-mono">localStorage</span>, and signing out erases them. Sign in
            with Discord and those same things are also kept on the server — but encrypted in
            this browser first, with a key held by your passkey or recovery code, so the database
            holds ciphertext nobody can read. Deleting the account erases all of it. Requests to
            Discord go through a same-origin proxy that keeps no copy of anything. The hosted site
            counts anonymous page views (Vercel Web Analytics); none of your Discord data is part
            of that.
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
