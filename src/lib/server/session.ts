import { cookies } from "next/headers";
import type { UserModel } from "@/generated/prisma/models";
import { db } from "./db";

export const SESSION_COOKIE = "dbc_session";
export const OAUTH_STATE_COOKIE = "dbc_oauth_state";

/** Thirty days, refreshed whenever the session is used. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A sign-in has ten minutes to come back from Discord. */
const STATE_TTL_SECONDS = 10 * 60;

function randomId(bytes = 18): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function base64url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(digest);
}

/**
 * Starts a session for a user and puts it in a cookie.
 *
 * The cookie carries `id.secret`; the database only keeps a hash of the secret,
 * so a copy of the database cannot be turned back into a working login.
 */
export async function createSession(userId: string, userAgent: string | null): Promise<void> {
  const id = randomId();
  const secret = randomId(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const prisma = await db();
  await prisma.session.create({
    data: { id, userId, secretHash: await sha256(secret), userAgent, expiresAt },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, `${id}.${secret}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export interface SessionUser {
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

/** The signed-in user, or null. Expired sessions are cleaned up on the way. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const separator = raw.indexOf(".");
  if (separator <= 0) return null;
  const id = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);

  const prisma = await db();
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  // A wrong secret means the cookie was forged or replayed from an old value.
  if (session.secretHash !== (await sha256(secret))) return null;

  // Keep the session alive while it is in use, without writing on every request.
  if (Date.now() - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await prisma.session
      .update({
        where: { id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      })
      .catch(() => {});
  }

  return toSessionUser(session.user);
}

export function toSessionUser(user: UserModel): SessionUser {
  return {
    id: user.id,
    discordId: user.discordId,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
  };
}

/** Drops the current session, both in the database and in the browser. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (!raw) return;
  const id = raw.slice(0, raw.indexOf("."));
  if (!id) return;
  const prisma = await db();
  await prisma.session.delete({ where: { id } }).catch(() => {});
}

/** Remembers the OAuth state across the round trip to Discord. */
export async function setOAuthState(state: string): Promise<void> {
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
}

export async function takeOAuthState(): Promise<string | null> {
  const store = await cookies();
  const state = store.get(OAUTH_STATE_COOKIE)?.value ?? null;
  store.delete(OAUTH_STATE_COOKIE);
  return state;
}

export function newOAuthState(): string {
  return randomId(24);
}

/** Ids for rows this app creates; Prisma leaves id generation to us on SQLite. */
export function newId(): string {
  return randomId(16);
}
