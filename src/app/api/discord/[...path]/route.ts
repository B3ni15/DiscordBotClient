const DISCORD_API_BASE = "https://discord.com/api/v10";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const target = `${DISCORD_API_BASE}/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;
  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  const auditReason = request.headers.get("x-audit-log-reason");

  if (authorization) headers.set("authorization", authorization);
  if (contentType) headers.set("content-type", contentType);
  if (auditReason) headers.set("x-audit-log-reason", auditReason);

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  });

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get("content-type");
  const retryAfter = response.headers.get("retry-after");
  if (responseContentType) responseHeaders.set("content-type", responseContentType);
  if (retryAfter) responseHeaders.set("retry-after", retryAfter);

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;