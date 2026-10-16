import Link from "next/link";
import { ChatIcon } from "@/components/ui/icons";

export const REPO_URL = "https://github.com/B3ni15/DiscordBotClient";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/**
 * The shared shell of the Terms and Privacy pages: a slim top bar back to the
 * app, the title with its date, a table of contents that stays in view on wide
 * screens, and the sections themselves set for reading.
 */
export function LegalPage({
  title,
  summary,
  updated,
  sections,
  other,
  eyebrow = "Legal",
}: {
  title: string;
  /** The small label above the title. */
  eyebrow?: string;
  /** One or two sentences: the page in short, above the details. */
  summary: React.ReactNode;
  updated: string;
  sections: LegalSection[];
  /** The sibling document, linked at the bottom. */
  other: { href: string; label: string };
}) {
  return (
    <div className="min-h-screen bg-ink text-text">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-ink/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-5">
          <Link href="/" className="flex items-center gap-2.5 font-semibold text-bright">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-white">
              <ChatIcon size={18} />
            </span>
            <span className="hidden sm:inline">disbotclient</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href="/docs/commands"
              className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-hover hover:text-text"
            >
              Docs
            </Link>
            <Link
              href="/docs/api"
              className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-hover hover:text-text"
            >
              API
            </Link>
            <Link
              href="/terms"
              className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-hover hover:text-text"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-hover hover:text-text"
            >
              Privacy
            </Link>
            <Link
              href="/"
              className="ml-2 rounded-md bg-accent px-3.5 py-1.5 font-medium whitespace-nowrap text-white transition-colors hover:bg-accent-strong"
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <div className="relative overflow-hidden border-b border-white/5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_20%_0%,rgb(88_101_242/0.22),transparent_60%),radial-gradient(40%_80%_at_90%_10%,rgb(235_69_158/0.12),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-5xl px-5 pt-14 pb-10">
          <p className="text-xs font-bold tracking-[0.14em] text-accent uppercase">{eyebrow}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-bright">{title}</h1>
          <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
          <div className="mt-6 max-w-2xl rounded-xl border border-white/5 bg-panel/70 p-4 text-[15px] leading-relaxed text-text">
            {summary}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-12 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24">
            <p className="mb-3 text-xs font-bold tracking-wide text-muted uppercase">On this page</p>
            <ol className="flex flex-col gap-1 border-l border-line text-sm">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l border-transparent py-1 pl-3 text-muted transition-colors hover:border-muted hover:text-text"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="legal-prose min-w-0">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <h2>
                <span className="mr-2 text-faint">{index + 1}.</span>
                {section.title}
              </h2>
              {section.body}
            </section>
          ))}

          <div className="mt-12 flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-panel p-5 text-sm">
            <span className="text-muted">Questions or something looks wrong?</span>
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-link hover:underline"
            >
              Open an issue on GitHub
            </a>
            <span className="ml-auto text-muted">
              See also the{" "}
              <Link href={other.href} className="font-medium text-link hover:underline">
                {other.label}
              </Link>
            </span>
          </div>
        </article>
      </div>
    </div>
  );
}
