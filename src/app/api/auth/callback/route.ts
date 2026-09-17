import type { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { exchangeCode, oauthConfig } from "@/lib/server/discordOAuth";
import { createSession, newId, takeOAuthState } from "@/lib/server/session";

/** Where Discord sends the browser back to after a sign-in. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const config = oauthConfig(origin);
  if (!config) return Response.redirect(`${origin}/?auth=unavailable`, 302);

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = await takeOAuthState();

  if (request.nextUrl.searchParams.get("error")) {
    return Response.redirect(`${origin}/?auth=cancelled`, 302);
  }
  // A missing or mismatched state means this callback did not come from a
  // sign-in this browser started.
  if (!code || !state || !expected || state !== expected) {
    return Response.redirect(`${origin}/?auth=invalid`, 302);
  }

  try {
    const account = await exchangeCode(config, code);
    const prisma = await db();
    const user = await prisma.user.upsert({
      where: { discordId: account.id },
      create: {
        id: newId(),
        discordId: account.id,
        username: account.username,
        globalName: account.globalName,
        avatar: account.avatar,
      },
      update: {
        username: account.username,
        globalName: account.globalName,
        avatar: account.avatar,
      },
    });

    await createSession(user.id, request.headers.get("user-agent"));
    return Response.redirect(`${origin}/?auth=ok`, 302);
  } catch {
    return Response.redirect(`${origin}/?auth=failed`, 302);
  }
}
