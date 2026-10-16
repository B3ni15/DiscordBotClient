import { apiDocsMarkdown } from "@/lib/api/apiDocs";

const SITE_URL = "https://disbotclient.xyz";

export const dynamic = "force-static";

/** The REST proxy reference as plain Markdown, for AI agents and scrapers. */
export function GET() {
  return new Response(apiDocsMarkdown(SITE_URL), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
