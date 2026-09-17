import type { NextRequest } from "next/server";
import { authorizeUrl, oauthConfig } from "@/lib/server/discordOAuth";
import { isDatabaseConfigured } from "@/lib/server/db";
import { newOAuthState, setOAuthState } from "@/lib/server/session";

/** Starts the Discord sign-in. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const config = oauthConfig(origin);

  if (!config || !isDatabaseConfigured()) {
    return Response.redirect(`${origin}/?auth=unavailable`, 302);
  }

  const state = newOAuthState();
  await setOAuthState(state);
  return Response.redirect(authorizeUrl(config, state), 302);
}
