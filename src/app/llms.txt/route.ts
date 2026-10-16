const SITE_URL = "https://disbotclient.xyz";

export const dynamic = "force-static";

/** https://llmstxt.org — where AI assistants find this site's documentation. */
export function GET() {
  const body = `# disbotclient

> Use a Discord bot like a real client, in the browser: messages, DMs, threads, voice, server
> management, and slash commands whose handlers are JavaScript scripts that run in the browser.
> It also hosts a stateless proxy for the Discord REST API (v10) at ${SITE_URL}/api/discord/* that
> any program or AI agent can call with its own bot token (\`Authorization: Bot <token>\`).

## Docs

- [Discord REST API proxy](${SITE_URL}/docs/api.md): how to call Discord through ${SITE_URL}/api/discord, auth, rate limits, endpoint cheat sheet, agent guidance (Markdown)
- [OpenAPI description of the proxy](${SITE_URL}/docs/openapi.json): OpenAPI 3.1, base URL ${SITE_URL}/api/discord
- [Command scripts reference](${SITE_URL}/docs/commands.md): everything a slash command script can use, with examples (Markdown)

## Optional

- [Terms of Service](${SITE_URL}/terms)
- [Privacy Policy](${SITE_URL}/privacy)
- [Source code](https://github.com/B3ni15/DiscordBotClient)
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
