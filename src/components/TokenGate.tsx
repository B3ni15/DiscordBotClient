"use client";

import { useState } from "react";
import Link from "next/link";
import { BotAvatar } from "@/components/account/BotSwitcher";
import { Spinner } from "@/components/ui/Spinner";
import {
  ChatIcon,
  CheckIcon,
  ChevronDownIcon,
  KeyIcon,
  LinkIcon,
  LockIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { useAccount } from "@/lib/store/account";
import { useClient } from "@/lib/store/client";
import { useUI } from "@/lib/store/ui";

const REPO_URL = "https://github.com/B3ni15/DiscordBotClient";
const PORTAL_URL = "https://discord.com/developers/applications";

/** Three dot-separated base64url parts; a leading "Bot " is stripped on login anyway. */
const TOKEN_SHAPE = /^(Bot\s+)?[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/;

const INTENTS = ["MESSAGE CONTENT", "SERVER MEMBERS", "PRESENCE"];

/** Login screen: takes a bot token and hands it to the store. */
export function TokenGate() {
  const login = useClient((state) => state.login);
  const error = useClient((state) => state.error);
  const accountStatus = useAccount((state) => state.status);
  const bots = useAccount((state) => state.bots);
  const openDialog = useUI((state) => state.openDialog);
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimmed = token.trim();
  // Only nag once something token-length is there; a half-typed token is not wrong yet.
  const looksOff = trimmed.length > 30 && !TOKEN_SHAPE.test(trimmed);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !trimmed) return;
    setBusy(true);
    // login resolves either way; on success this component unmounts.
    await login(trimmed);
    setBusy(false);
  }

  async function pasteToken() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setToken(text.trim());
    } catch {
      // Clipboard access was refused; the field still takes a normal paste.
    }
  }

  const savedBots = accountStatus === "unlocked" && bots.length > 0;

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-ink">
      <Backdrop />

      <header className="relative z-10 flex items-center px-6 py-5 sm:px-10">
        <span className="flex items-center gap-2.5 text-[17px] font-bold text-bright">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white shadow-lg shadow-accent/30">
            <ChatIcon size={20} />
          </span>
          disbotclient
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-text backdrop-blur transition-colors hover:bg-white/10"
        >
          <span className="hidden sm:inline">Open source on </span>GitHub
        </a>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-10 sm:px-6">
        <div className="w-full max-w-[820px] animate-pop-in overflow-hidden rounded-2xl border border-white/5 bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="grid md:grid-cols-[1fr_300px]">
            <section className="p-7 sm:p-9 md:flex md:flex-col md:justify-center">
              <h1 className="text-center text-2xl font-bold text-bright md:text-left">
                Welcome back!
              </h1>
              <p className="mt-1.5 text-center text-[15px] text-muted md:text-left">
                Sign in with a bot token and use your bot like a Discord client.
              </p>

              {savedBots && (
                <div className="mt-7">
                  <h2 className="pb-2 text-xs font-bold tracking-wide text-muted uppercase">
                    Your bots
                  </h2>
                  <ul className="flex flex-col gap-1.5">
                    {bots.map((bot) => (
                      <li key={bot.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            void login(bot.token).finally(() => setBusy(false));
                          }}
                          className="group/bot flex w-full items-center gap-3 rounded-lg bg-ink/70 px-3 py-2.5 text-left transition-colors hover:bg-hover disabled:opacity-60"
                        >
                          <BotAvatar bot={bot} size={32} />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-bright">
                            {bot.name}
                          </span>
                          <span className="shrink-0 rounded-md bg-accent/15 px-2 py-1 text-xs font-medium text-accent transition-colors group-hover/bot:bg-accent group-hover/bot:text-white">
                            Sign in
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Divider label="or use another token" />
                </div>
              )}

              <form onSubmit={handleSubmit} className={savedBots ? "" : "mt-7"}>
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor="token"
                    className="text-xs font-bold tracking-wide text-muted uppercase"
                  >
                    Bot token <span className="text-danger">*</span>
                  </label>
                  <a
                    href={PORTAL_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-link hover:underline"
                  >
                    Where do I find it?
                  </a>
                </div>
                <div
                  className={`mt-2 flex items-center rounded-lg bg-ink transition-shadow focus-within:shadow-[0_0_0_2px_var(--accent)] ${
                    looksOff ? "shadow-[0_0_0_1px_var(--amber)]" : ""
                  }`}
                >
                  <span className="pl-3 text-faint">
                    <KeyIcon size={16} />
                  </span>
                  <input
                    id="token"
                    type={visible ? "text" : "password"}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    autoComplete="off"
                    autoFocus
                    spellCheck={false}
                    placeholder="Paste your bot token"
                    aria-describedby="token-hint"
                    aria-invalid={looksOff || undefined}
                    className="min-w-0 flex-1 bg-transparent px-2.5 py-3 font-mono text-sm text-text outline-none placeholder:font-sans placeholder:text-faint focus-visible:outline-none"
                  />
                  {token ? (
                    <button
                      type="button"
                      onClick={() => setVisible((value) => !value)}
                      className="mr-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-text"
                      aria-label={visible ? "Hide token" : "Show token"}
                    >
                      {visible ? "Hide" : "Show"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void pasteToken()}
                      className="mr-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-text"
                    >
                      Paste
                    </button>
                  )}
                </div>
                <p
                  id="token-hint"
                  className={`mt-2 flex items-center gap-1.5 text-xs ${looksOff ? "text-amber" : "text-faint"}`}
                >
                  <LockIcon size={12} />
                  {looksOff
                    ? "That does not look like a bot token. It has three parts separated by dots."
                    : "Stays in this browser. It is only ever sent to Discord."}
                </p>

                <button
                  type="submit"
                  aria-disabled={busy || !trimmed}
                  className={`mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white transition-[background-color,transform] hover:bg-accent-strong active:scale-[0.99] ${
                    busy || !trimmed ? "cursor-not-allowed opacity-50" : ""
                  }`}
                >
                  {busy && <Spinner size={14} />}
                  {busy ? "Connecting…" : "Log In"}
                </button>
              </form>

              {error && (
                <p
                  role="alert"
                  className="mt-4 animate-fade-in rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
                >
                  {error}
                </p>
              )}

              {(accountStatus === "signedOut" ||
                accountStatus === "locked" ||
                accountStatus === "needsSetup") && (
                <>
                  <Divider label="or" />
                  {accountStatus === "signedOut" ? (
                    <a
                      href="/api/auth/discord"
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-raised text-sm font-semibold text-bright transition-colors hover:bg-hover"
                    >
                      <LinkIcon size={16} />
                      Sign in with Discord to sync
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        openDialog({
                          kind: accountStatus === "locked" ? "accountUnlock" : "accountSetup",
                        })
                      }
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-raised text-sm font-semibold text-bright transition-colors hover:bg-hover"
                    >
                      <KeyIcon size={16} />
                      {accountStatus === "locked" ? "Unlock your saved bots" : "Turn on sync"}
                    </button>
                  )}
                  <p className="mt-2 text-center text-xs text-faint">
                    Optional · keeps your bots across devices, end-to-end encrypted.
                  </p>
                </>
              )}

              {/* On narrow screens the guide folds away under the form. */}
              <details className="group/guide mt-6 rounded-lg bg-ink/60 md:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-bright">
                  How do I get a bot token?
                  <span className="text-muted transition-transform group-open/guide:rotate-180">
                    <ChevronDownIcon size={16} />
                  </span>
                </summary>
                <div className="px-4 pb-4">
                  <Steps />
                </div>
              </details>
            </section>

            <aside className="hidden border-l border-white/5 bg-panel-alt/60 p-8 md:flex md:flex-col">
              <h2 className="text-sm font-semibold text-bright">Get your token</h2>
              <p className="mt-1 text-xs text-muted">Takes about a minute.</p>
              <div className="mt-5">
                <Steps />
              </div>
              <ul className="mt-auto flex flex-col gap-2.5 border-t border-white/5 pt-5 text-xs text-muted">
                <Assurance icon={<LockIcon size={14} />}>Your token never leaves this browser</Assurance>
                <Assurance icon={<ShieldIcon size={14} />}>Sync is end-to-end encrypted</Assurance>
                <Assurance icon={<CheckIcon size={14} />}>Free and open source</Assurance>
              </ul>
            </aside>
          </div>
        </div>
      </div>

      <footer className="relative z-10 flex flex-col items-center gap-2 px-6 pb-7 text-center text-xs text-muted">
        <p>
          By logging in you agree to the{" "}
          <Link href="/terms" className="font-medium text-text hover:underline">
            Terms of Service
          </Link>{" "}
          and acknowledge the{" "}
          <Link href="/privacy" className="font-medium text-text hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
        <p className="text-faint">Not affiliated with Discord. Bot tokens only — never a user token.</p>
      </footer>
    </main>
  );
}

function Steps() {
  return (
    <ol className="flex flex-col gap-4">
      <Step n={1}>
        Open the{" "}
        <a href={PORTAL_URL} target="_blank" rel="noreferrer" className="text-link hover:underline">
          Developer Portal
        </a>{" "}
        and pick your application, or create one.
      </Step>
      <Step n={2}>
        On the <span className="font-semibold text-text">Bot</span> tab, press{" "}
        <span className="font-semibold text-text">Reset Token</span> and copy it.
      </Step>
      <Step n={3}>
        <span className="block">Turn on the privileged intents, so messages and members show up:</span>
        <span className="mt-2 flex flex-wrap gap-1">
          {INTENTS.map((intent) => (
            <span
              key={intent}
              className="rounded-md bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber"
            >
              {intent}
            </span>
          ))}
        </span>
      </Step>
    </ol>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-xs leading-relaxed text-muted">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
        {n}
      </span>
      <span className="min-w-0 pt-0.5">{children}</span>
    </li>
  );
}

function Assurance({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-online">{icon}</span>
      {children}
    </li>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] font-semibold tracking-wide text-faint uppercase">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Soft colour washes and a faint dot grid behind the card, in place of Discord's artwork. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="login-blob absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-accent/30 blur-[120px]" />
      <div
        className="login-blob absolute -right-40 -bottom-48 h-[560px] w-[560px] rounded-full bg-[#eb459e]/20 blur-[130px]"
        style={{ animationDelay: "-6s" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
    </div>
  );
}
