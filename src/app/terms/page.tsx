import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, REPO_URL, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using disbotclient, the browser client for Discord bots.",
  alternates: { canonical: "/terms" },
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreeing to these terms",
    body: (
      <p>
        disbotclient (&ldquo;the client&rdquo;) lets you use a Discord bot from your browser the way
        you would use the Discord app. By signing in or otherwise using the client you agree to
        these terms. If you do not agree, do not use it.
      </p>
    ),
  },
  {
    id: "discord",
    title: "Discord comes first",
    body: (
      <>
        <p>
          The client is an independent, open-source project. It is not made, endorsed or
          supported by Discord Inc. Everything you do through it happens on Discord, so
          Discord&rsquo;s rules apply to it in full:
        </p>
        <ul>
          <li>
            <a href="https://discord.com/terms" target="_blank" rel="noreferrer">
              Discord Terms of Service
            </a>
          </li>
          <li>
            <a href="https://discord.com/developers/docs/policies-and-agreements/developer-policy" target="_blank" rel="noreferrer">
              Discord Developer Policy
            </a>{" "}
            and{" "}
            <a href="https://discord.com/developers/docs/policies-and-agreements/developer-terms-of-service" target="_blank" rel="noreferrer">
              Developer Terms of Service
            </a>
          </li>
          <li>
            <a href="https://discord.com/guidelines" target="_blank" rel="noreferrer">
              Discord Community Guidelines
            </a>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "tokens",
    title: "Bot tokens only",
    body: (
      <>
        <p>
          Sign in only with the token of a <strong>bot application you own or are allowed to
          manage</strong>. Using a user account&rsquo;s token (&ldquo;self-botting&rdquo;) breaks
          Discord&rsquo;s terms, is not supported, and may get that account banned.
        </p>
        <p>
          A token is a password for the bot. Keep it secret, and reset it in the{" "}
          <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
            Developer Portal
          </a>{" "}
          if you think someone else has seen it. You are responsible for everything done with
          your bot through the client.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>Do not use the client to:</p>
        <ul>
          <li>send spam, unsolicited mass DMs or advertising, or mass-open DMs to find people;</li>
          <li>harass, threaten, impersonate or deceive anyone;</li>
          <li>
            collect or export people&rsquo;s data beyond what your bot needs, or without the
            consent Discord&rsquo;s policies require;
          </li>
          <li>share illegal content, malware or anything that breaks Discord&rsquo;s rules;</li>
          <li>overload, probe or attack Discord, this site or its proxy.</li>
        </ul>
        <p>
          The client paces bulk actions such as searching for DMs so a bot stays within
          Discord&rsquo;s limits. Getting around those safeguards is at your own risk.
        </p>
      </>
    ),
  },
  {
    id: "scripts",
    title: "Command scripts",
    body: (
      <p>
        Slash-command scripts you write run in your own browser, with your bot&rsquo;s
        permissions. You are responsible for what they do and for the replies they send. Only
        paste scripts you understand and trust.
      </p>
    ),
  },
  {
    id: "account",
    title: "The optional account",
    body: (
      <p>
        Sync is optional and free. Your vault is encrypted with keys only you hold, so if you lose
        every passkey, recovery code and passphrase, the data in it is gone and nobody can restore
        it. You can delete the account at any time from the settings. See the{" "}
        <Link href="/privacy">Privacy Policy</Link> for exactly what is stored.
      </p>
    ),
  },
  {
    id: "license",
    title: "Open source",
    body: (
      <p>
        The client&rsquo;s source code is published under the MIT License at{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          github.com/B3ni15/DiscordBotClient
        </a>
        . You may read it, change it and host your own copy under that license. A copy hosted by
        someone else is run by them, not by this site.
      </p>
    ),
  },
  {
    id: "warranty",
    title: "No warranty",
    body: (
      <>
        <p>
          The client is provided <strong>&ldquo;as is&rdquo;</strong>, without warranties of any
          kind. Features can change, break or disappear, for example when Discord changes its API.
          The service may be unavailable at times.
        </p>
        <p>
          To the extent the law allows, the people behind the client are not liable for any loss
          or damage from using it, including actions Discord takes against your bot or account.
        </p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Suspension and changes",
    body: (
      <p>
        Access to the hosted site may be limited or blocked for anyone who breaks these terms. The
        terms may change; the date at the top shows the latest version, and continuing to use the
        client after a change means you accept it.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="October 13, 2026"
      summary={
        <>
          <strong className="text-bright">Use your own bot, play by Discord&rsquo;s rules.</strong>{" "}
          Sign in only with bot tokens you are allowed to use, do not spam or harass, and remember
          the client is free, open source and comes without guarantees.
        </>
      }
      sections={sections}
      other={{ href: "/privacy", label: "Privacy Policy" }}
    />
  );
}
