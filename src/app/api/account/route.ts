import { db } from "@/lib/server/db";
import { currentUser, destroySession } from "@/lib/server/session";

/**
 * Deletes the account and everything attached to it: every session, every key
 * wrapper and every encrypted item. Nothing is kept, and nothing can be
 * restored afterwards — the vault key only ever existed in a browser.
 */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const prisma = await db();
  // D1 enforces the foreign keys, but deleting the children explicitly keeps
  // the outcome the same on a database where they are switched off.
  await prisma.vaultItem.deleteMany({ where: { userId: user.id } });
  await prisma.keyWrapper.deleteMany({ where: { userId: user.id } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });

  await destroySession();
  return Response.json({ ok: true });
}
