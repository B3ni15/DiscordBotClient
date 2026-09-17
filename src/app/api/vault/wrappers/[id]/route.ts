import { db } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";

/**
 * Removes one way of unlocking the vault.
 *
 * The last one cannot be removed: without a wrapper the vault key is gone for
 * good, and the encrypted items would be unreadable rather than deleted.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await context.params;
  const prisma = await db();
  const wrapper = await prisma.keyWrapper.findUnique({ where: { id } });
  if (!wrapper || wrapper.userId !== user.id) {
    return Response.json({ error: "No such unlock method." }, { status: 404 });
  }

  const remaining = await prisma.keyWrapper.count({ where: { userId: user.id } });
  if (remaining <= 1) {
    return Response.json(
      { error: "This is the only way left to unlock the vault. Add another one first." },
      { status: 409 },
    );
  }

  await prisma.keyWrapper.delete({ where: { id } });
  return Response.json({ ok: true });
}

/** Records that a wrapper was just used, for the "last used" column. */
export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await context.params;
  const prisma = await db();
  const updated = await prisma.keyWrapper.updateMany({
    where: { id, userId: user.id },
    data: { lastUsedAt: new Date() },
  });
  if (updated.count === 0) {
    return Response.json({ error: "No such unlock method." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
