import type { Metadata } from "next";
import { CodeBlock, Inline } from "@/components/docs/DocParts";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import {
  API_DOCS_SUMMARY,
  API_DOCS_UPDATED,
  apiDocSections,
  type ApiEntry,
} from "@/lib/api/apiDocs";

const SITE_URL = "https://disbotclient.xyz";

export const metadata: Metadata = {
  title: "REST API proxy — reference",
  description: API_DOCS_SUMMARY,
  alternates: {
    canonical: "/docs/api",
    types: { "text/markdown": "/docs/api.md" },
  },
};

function Entry({ entry }: { entry: ApiEntry }) {
  return (
    <div className="docs-entry">
      <h3>
        <code>{entry.signature}</code>
      </h3>
      <p>
        <Inline text={entry.description} />
      </p>
      {entry.example && <CodeBlock code={entry.example} lang={entry.lang ?? "json"} />}
    </div>
  );
}

const sections: LegalSection[] = apiDocSections(SITE_URL).map((section) => ({
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
        <CodeBlock key={example.title} title={example.title} code={example.code} lang={example.lang} />
      ))}
    </>
  ),
}));

export default function ApiDocsPage() {
  return (
    <LegalPage
      eyebrow="Docs"
      title="REST API proxy"
      updated={API_DOCS_UPDATED}
      summary={
        <>
          <p>{API_DOCS_SUMMARY}</p>
          <p className="mt-2 text-sm text-muted">
            For AI agents: this page is also plain Markdown at{" "}
            <a href="/docs/api.md" className="text-link hover:underline">
              /docs/api.md
            </a>
            , an OpenAPI description at{" "}
            <a href="/docs/openapi.json" className="text-link hover:underline">
              /docs/openapi.json
            </a>{" "}
            and an index at{" "}
            <a href="/llms.txt" className="text-link hover:underline">
              /llms.txt
            </a>
            .
          </p>
        </>
      }
      sections={sections}
      other={{ href: "/docs/commands", label: "Command scripts reference" }}
    />
  );
}
