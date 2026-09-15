"use client";

import { useState } from "react";
import { useClient } from "@/lib/store/client";

/** Login screen: takes a bot token and hands it to the store. */
export function TokenGate() {
  const login = useClient((state) => state.login);
  const error = useClient((state) => state.error);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    // login resolves either way; on success this component unmounts.
    await login(token.trim());
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="font-mono text-2xl font-medium tracking-tight">disbotclient</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Discord kliens a botodhoz, ami teljes egészében a böngészőben fut. Nincs szerver a
          háttérben: a token a gépeden marad, a kérések közvetlenül a Discordhoz mennek.
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          <label htmlFor="token" className="block text-sm font-medium">
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
            className="mt-2 w-full rounded-md border border-line bg-panel px-3 py-2 font-mono text-sm outline-none placeholder:text-muted/60 focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="mt-4 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Csatlakozás…" : "Csatlakozás"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-10 border-t border-line pt-6 text-sm leading-relaxed text-muted">
          <p>
            A tokent a{" "}
            <a
              className="text-accent hover:underline"
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noreferrer"
            >
              Developer Portal
            </a>{" "}
            Bot fülén találod. Ugyanott kapcsold be a{" "}
            <span className="font-mono text-amber">MESSAGE CONTENT</span> és{" "}
            <span className="font-mono text-amber">SERVER MEMBERS</span> intentet, különben az
            üzenetek szövege üresen érkezik.
          </p>
        </div>
      </div>
    </main>
  );
}
