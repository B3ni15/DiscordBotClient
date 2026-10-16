import type { Metadata } from "next";
import { CodeBlock, Inline } from "@/components/docs/DocParts";
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
