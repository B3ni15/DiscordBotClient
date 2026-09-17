import { db } from "@/lib/server/db";
import { currentUser, newId } from "@/lib/server/session";

const KINDS = new Set(["bot", "dm", "settings"]);
const MAX_ITEMS = 2000;
const MAX_CIPHERTEXT = 64 * 1024;
const MAX_BATCH = 200;

interface ItemInput {
  kind?: string;
  ref?: string;
  ciphertext?: string;
}

/** Everything stored for this account, as ciphertext. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const prisma = await db();
  const items = await prisma.vaultItem.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "asc" },
  });

  return Response.json({
    items: items.map((item) => ({
      kind: item.kind,
      ref: item.ref,
      ciphertext: item.ciphertext,
      updatedAt: item.updatedAt.toISOString(),
    })),
  });
}

/**
 * Writes a batch of encrypted records, replacing any with the same reference.
 *
 * The reference is derived in the browser from the record's real id under the
 * vault key, so two devices agree on which row to overwrite while the server
 * only ever sees an opaque string.
 */
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { items?: ItemInput[] } | null;
  const items = body?.items;
  if (!Array.isArray(items)) {
    return Response.json({ error: "Expected a list of items." }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return Response.json({ error: "Too many items in one request." }, { status: 413 });
  }

  for (const item of items) {
    if (!item.kind || !KINDS.has(item.kind)) {
      return Response.json({ error: `Unknown item kind: ${item.kind}` }, { status: 400 });
    }
    if (typeof item.ref !== "string" || !item.ref || item.ref.length > 256) {
      return Response.json({ error: "Every item needs a reference." }, { status: 400 });
    }
    if (typeof item.ciphertext !== "string" || item.ciphertext.length > MAX_CIPHERTEXT) {
      return Response.json({ error: "Ciphertext missing or too large." }, { status: 413 });
    }
  }

  const prisma = await db();
  const existing = await prisma.vaultItem.count({ where: { userId: user.id } });
  if (existing + items.length > MAX_ITEMS) {
    return Response.json({ error: "This account is holding too many items." }, { status: 409 });
  }

  // D1 has no upsert-many, and the batch is small: one upsert per item is both
  // simpler and easy to reason about.
  for (const item of items) {
    await prisma.vaultItem.upsert({
      where: {
        userId_kind_ref: { userId: user.id, kind: item.kind!, ref: item.ref! },
      },
      create: {
        id: newId(),
        userId: user.id,
        kind: item.kind!,
        ref: item.ref!,
        ciphertext: item.ciphertext!,
      },
      update: { ciphertext: item.ciphertext! },
    });
  }

  return Response.json({ ok: true, written: items.length });
}

/** Removes records by reference, or a whole kind when no reference is given. */
export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { kind?: string; refs?: string[] }
    | null;
  if (!body?.kind || !KINDS.has(body.kind)) {
    return Response.json({ error: "Unknown item kind." }, { status: 400 });
  }

  const prisma = await db();
  const removed = await prisma.vaultItem.deleteMany({
    where: {
      userId: user.id,
      kind: body.kind,
      ...(Array.isArray(body.refs) && body.refs.length > 0 ? { ref: { in: body.refs } } : {}),
    },
  });

  return Response.json({ ok: true, removed: removed.count });
}
