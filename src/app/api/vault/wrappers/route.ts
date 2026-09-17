import { db } from "@/lib/server/db";
import { currentUser, newId } from "@/lib/server/session";

/** Bounds on what a browser may store, so a stray loop cannot fill the table. */
const MAX_WRAPPERS = 20;
const MAX_FIELD = 4096;

interface WrapperBody {
  kind?: string;
  label?: string;
  credentialId?: string | null;
  salt?: string;
  wrapped?: string;
  params?: unknown;
}

const KINDS = new Set(["passkey", "recovery", "passphrase"]);

/**
 * Stores one more way of unlocking the vault.
 *
 * The body is a wrapped key and the parameters needed to reproduce the key that
 * wrapped it. The wrapping key itself — a passkey's PRF output, a recovery code,
 * a passphrase — never leaves the browser, so this endpoint receives nothing it
 * could decrypt.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as WrapperBody | null;
  if (!body || !body.kind || !KINDS.has(body.kind)) {
    return Response.json({ error: "Unknown wrapper kind." }, { status: 400 });
  }
  if (!body.salt || !body.wrapped || typeof body.salt !== "string" || typeof body.wrapped !== "string") {
    return Response.json({ error: "A wrapper needs a salt and a wrapped key." }, { status: 400 });
  }
  if (body.salt.length > MAX_FIELD || body.wrapped.length > MAX_FIELD) {
    return Response.json({ error: "Wrapper payload is too large." }, { status: 413 });
  }

  const prisma = await db();
  const count = await prisma.keyWrapper.count({ where: { userId: user.id } });
  if (count >= MAX_WRAPPERS) {
    return Response.json({ error: "Too many unlock methods." }, { status: 409 });
  }

  // One recovery code and one passphrase at a time; passkeys may be many.
  if (body.kind !== "passkey") {
    await prisma.keyWrapper.deleteMany({ where: { userId: user.id, kind: body.kind } });
  }

  const wrapper = await prisma.keyWrapper.create({
    data: {
      id: newId(),
      userId: user.id,
      kind: body.kind,
      label: (body.label ?? body.kind).slice(0, 80),
      credentialId: typeof body.credentialId === "string" ? body.credentialId.slice(0, MAX_FIELD) : null,
      salt: body.salt,
      wrapped: body.wrapped,
      params: body.params === undefined ? null : JSON.stringify(body.params).slice(0, MAX_FIELD),
    },
  });

  return Response.json({
    id: wrapper.id,
    kind: wrapper.kind,
    label: wrapper.label,
    credentialId: wrapper.credentialId,
    createdAt: wrapper.createdAt.toISOString(),
    lastUsedAt: null,
  });
}

/** Everything needed to attempt an unlock in this browser. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const prisma = await db();
  const wrappers = await prisma.keyWrapper.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({
    wrappers: wrappers.map((wrapper) => ({
      id: wrapper.id,
      kind: wrapper.kind,
      label: wrapper.label,
      credentialId: wrapper.credentialId,
      salt: wrapper.salt,
      wrapped: wrapper.wrapped,
      params: wrapper.params ? (JSON.parse(wrapper.params) as unknown) : null,
      createdAt: wrapper.createdAt.toISOString(),
      lastUsedAt: wrapper.lastUsedAt?.toISOString() ?? null,
    })),
  });
}
