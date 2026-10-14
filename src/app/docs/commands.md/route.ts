import { docsMarkdown } from "@/lib/commands/scriptDocs";

const SITE_URL = "https://disbotclient.xyz";

export const dynamic = "force-static";

/** The command script reference as plain Markdown, for AI assistants and scrapers. */
export function GET() {
  return new Response(docsMarkdown(SITE_URL), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
