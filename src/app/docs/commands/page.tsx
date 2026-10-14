import type { Metadata } from "next";
import { Fragment } from "react";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import {
  DOC_SECTIONS,
  DOCS_SUMMARY,
  DOCS_UPDATED,
  type DocEntry,
} from "@/lib/commands/scriptDocs";

export const metadata: Metadata = {
  title: "Command scripts — reference",
  description: DOCS_SUMMARY,
  alternates: {
    canonical: "/docs/commands",
    types: { "text/markdown": "/docs/commands.md" },
  },
};

/** `code` spans and bare links inside a docs paragraph. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
          return <code key={index}>{part.slice(1, -1)}</code>;
        }
        return (
          <Fragment key={index}>
            {part.split(/(https?:\/\/[^\s)]+)/).map((piece, inner) =>
              /^https?:\/\//.test(piece) ? (
                <a key={inner} href={piece} target="_blank" rel="noreferrer">
                  {piece}
                </a>
              ) : (
                piece
              ),
            )}
          </Fragment>
        );
      })}
    </>
  );
}

function CodeBlock({ code, title }: { code: string; title?: string }) {
  return (
    <figure className="docs-code">
      {title && <figcaption>{title}</figcaption>}
      <pre>
        <code className="language-js">{code}</code>
      </pre>
    </figure>
  );
}

function Entry({ entry }: { entry: DocEntry }) {
  return (
    <div className="docs-entry">
      <h3>
        <code>{entry.signature}</code>
      </h3>
      <p>
        <Inline text={entry.description} />
      </p>
      {entry.example && <CodeBlock code={entry.example} />}
    </div>
  );
}

const sections: LegalSection[] = DOC_SECTIONS.map((section) => ({
  id: section.id,
  title: section.title,
  body: (
    <>
      {section.intro.map((paragraph, index) => (
        <p key={index}>
          <Inline text={paragraph} />
        </p>
      ))}
      {section.entries?.map((entry) => <Entry key={entry.signature} entry={entry} />)}
      {section.examples?.map((example) => (
        <CodeBlock key={example.title} title={example.title} code={example.code} />
      ))}
    </>
  ),
}));

export default function CommandDocsPage() {
  return (
    <LegalPage
      eyebrow="Docs"
      title="Command scripts"
      updated={DOCS_UPDATED}
      summary={
        <>
          <p>{DOCS_SUMMARY}</p>
          <p className="mt-2 text-sm text-muted">
            Also available as plain Markdown at{" "}
            <a href="/docs/commands.md" className="text-link hover:underline">
              /docs/commands.md
            </a>{" "}
            — handy for pasting into an AI assistant.
          </p>
        </>
      }
      sections={sections}
      other={{ href: "/terms", label: "Terms of Service" }}
    />
  );
}
