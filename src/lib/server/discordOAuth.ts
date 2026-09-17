/**
 * Discord OAuth2, used only to say who you are.
 *
 * The scope is `identify` and nothing else: this app never asks for a token
 * that can act on your account, it just needs a stable id to hang an encrypted
 * vault on.
 */

const DISCORD_API = "https://discord.com/api/v10";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** The configured app, or null when Discord sign-in is not set up. */
export function oauthConfig(origin: string): OAuthConfig | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const redirectUri = process.env.DISCORD_REDIRECT_URI ?? `${origin}/api/auth/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function authorizeUrl(config: OAuthConfig, state: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  // Skip the consent screen for someone who has already authorised the app.
  url.searchParams.set("prompt", "none");
  return url.toString();
}

export interface DiscordAccount {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

/**
 * Trades the callback code for the account behind it. The access token is used
 * once, here, and then thrown away — nothing about it is stored.
 */
export async function exchangeCode(
  config: OAuthConfig,
  code: string,
): Promise<DiscordAccount> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });

  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) {
    throw new Error(`Discord refused the sign-in (${tokenResponse.status}).`);
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Discord returned no access token.");

  const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) {
    throw new Error(`Could not read the Discord account (${userResponse.status}).`);
  }
  const user = (await userResponse.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };

  // Revoking immediately keeps the grant from lingering on Discord's side.
  void fetch(`${DISCORD_API}/oauth2/token/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      token: token.access_token,
    }),
  }).catch(() => {});

  return {
    id: user.id,
    username: user.username,
    globalName: user.global_name ?? null,
    avatar: user.avatar ?? null,
  };
}
