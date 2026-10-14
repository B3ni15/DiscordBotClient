const SITE_URL = "https://disbotclient.xyz";

export const dynamic = "force-static";

/** https://llmstxt.org — where AI assistants find this site's documentation. */
export function GET() {
  const body = `# disbotclient

> Use a Discord bot like a real client, in the browser: messages, DMs, threads, voice, server
> management, and slash commands whose handlers are JavaScript scripts that run in the browser.

## Docs

- [Command scripts reference](${SITE_URL}/docs/commands.md): everything a slash command script can use, with examples (Markdown)

## Optional

- [Terms of Service](${SITE_URL}/terms)
- [Privacy Policy](${SITE_URL}/privacy)
- [Source code](https://github.com/B3ni15/DiscordBotClient)
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
