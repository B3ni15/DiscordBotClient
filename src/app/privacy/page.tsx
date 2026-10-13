import type { Metadata } from "next";
import { LegalPage, REPO_URL, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What disbotclient keeps, where it keeps it, and why the server never holds anything it can read.",
  alternates: { canonical: "/privacy" },
};

const sections: LegalSection[] = [
  {
    id: "overview",
    title: "The short version",
    body: (
      <>
        <p>
          disbotclient is a web client for Discord bots. It is built so that it does not need to
          know anything about you: your bot token, your settings and the conversations you open
          live in your own browser. Nothing is sold, shared or used for advertising.
        </p>
        <ul>
          <li>No account is needed. Without one, nothing about you reaches our server.</li>
          <li>
            The optional account stores only data that was encrypted in your browser first, with a
            key we never see.
          </li>
          <li>Requests to Discord pass through a proxy that keeps no copy of them.</li>
        </ul>
      </>
    ),
  },
  {
    id: "browser",
    title: "Data kept in your browser",
    body: (
      <>
        <p>
          Everything the client needs to work is stored in your browser&rsquo;s{" "}
          <code>localStorage</code> on the device you use:
        </p>
        <ul>
          <li>the bot token you signed in with;</li>
          <li>your settings, such as notification and presence preferences;</li>
          <li>the list of direct messages you opened, with notes you add to them;</li>
          <li>the scripts behind your slash commands, and what you have read where.</li>
        </ul>
        <p>
          This data never leaves your device unless you turn on sync (see below). Signing out
          removes the token; clearing the site&rsquo;s data in your browser removes all of it.
        </p>
      </>
    ),
  },
  {
    id: "discord",
    title: "Talking to Discord",
    body: (
      <>
        <p>
          The live connection (the gateway) goes straight from your browser to Discord. Regular
          API requests go through a same-origin proxy on this site, because browsers block direct
          calls to Discord&rsquo;s API. The proxy forwards each request with your token and passes
          the answer back. It does not store requests, responses or tokens.
        </p>
        <p>
          What Discord does with that traffic is covered by{" "}
          <a href="https://discord.com/privacy" target="_blank" rel="noreferrer">
            Discord&rsquo;s Privacy Policy
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "The optional account and sync",
    body: (
      <>
        <p>
          You can sign in with Discord to keep your bots and DM list across devices. The sign-in
          asks Discord for the <code>identify</code> scope only. From it we store your Discord
          user ID, username, display name and avatar, so the account can be recognised and shown.
        </p>
        <h3>End-to-end encrypted vault</h3>
        <p>
          Your bots, tokens, DM list and command scripts are encrypted in your browser before they
          are uploaded. The key is protected by your passkey, recovery code or passphrase, which
          never reach the server. The database therefore holds ciphertext that nobody, including
          the people running this site, can read. If you lose every way to unlock it, the data
          cannot be recovered.
        </p>
        <h3>Sessions</h3>
        <p>
          Signing in sets one cookie, <code>dbc_session</code>, that keeps you signed in for up to
          30 days. The server keeps only a hash of its secret, together with the browser&rsquo;s
          user agent so you can recognise your sessions. A short-lived cookie also protects the
          sign-in against forgery for ten minutes. No other cookies are used.
        </p>
      </>
    ),
  },
  {
    id: "analytics",
    title: "Analytics",
    body: (
      <p>
        The hosted site counts anonymous page views with Vercel Web Analytics, which uses no
        cookies and does not identify you. None of your Discord data is part of it. A self-hosted
        copy only collects this if its operator enables it.
      </p>
    ),
  },
  {
    id: "retention",
    title: "Keeping and deleting data",
    body: (
      <>
        <p>
          Browser data stays until you clear it. Account data stays until you delete the account
          from the app&rsquo;s settings: that removes your profile, sessions, key wrappers and
          every encrypted item immediately and for good.
        </p>
        <p>
          Because we cannot read the vault, we cannot hand its content to anyone, and we cannot
          restore it for you either.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <p>
        You can see, export or delete what is stored about you at any time, mostly by yourself
        from the app. Depending on where you live (for example under the GDPR) you also have the
        right to ask for access, correction or erasure, and to complain to your data protection
        authority. For anything you cannot do in the app,{" "}
        <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
          open an issue
        </a>
        .
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        The client is meant for people who are old enough to use Discord in their country, and at
        least 13. It is not directed at children.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If how data is handled changes, this page is updated and the date at the top moves with
        it. The full history is public in the{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          source repository
        </a>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 13, 2026"
      summary={
        <>
          <strong className="text-bright">Your data stays yours.</strong> The client keeps your
          token and settings in your browser. The optional account only ever stores data encrypted
          on your device, so the server holds nothing it can read.
        </>
      }
      sections={sections}
      other={{ href: "/terms", label: "Terms of Service" }}
    />
  );
}
