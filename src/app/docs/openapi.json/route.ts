import { apiOpenApi } from "@/lib/api/apiDocs";

const SITE_URL = "https://disbotclient.xyz";

export const dynamic = "force-static";

/** OpenAPI 3.1 description of the REST proxy, for agent frameworks that import specs. */
export function GET() {
  return Response.json(apiOpenApi(SITE_URL), {
    headers: { "access-control-allow-origin": "*" },
  });
}
