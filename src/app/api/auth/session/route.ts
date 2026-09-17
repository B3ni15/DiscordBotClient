import { db, isDatabaseConfigured } from "@/lib/server/db";
import { currentUser, destroySession } from "@/lib/server/session";

export interface SessionPayload {
  /** False when the deployment has no database or no Discord app configured. */
  available: boolean;
  user: {
    id: string;
    discordId: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
  } | null;
  /** How this browser can unlock the vault, without any of the secrets. */
  wrappers: Array<{
    id: string;
    kind: string;
    label: string;
    credentialId: string | null;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
}

/** Who is signed in, and what can open their vault. */
export async function GET() {
  const available =
    isDatabaseConfigured() &&
    Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

  if (!available) {
    return Response.json({ available: false, user: null, wrappers: [] } satisfies SessionPayload);
  }

  const user = await currentUser();
  if (!user) {
    return Response.json({ available: true, user: null, wrappers: [] } satisfies SessionPayload);
  }

  const prisma = await db();
  const wrappers = await prisma.keyWrapper.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      label: true,
      credentialId: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });

  return Response.json({
    available: true,
    user,
    wrappers: wrappers.map((wrapper) => ({
      ...wrapper,
      createdAt: wrapper.createdAt.toISOString(),
      lastUsedAt: wrapper.lastUsedAt?.toISOString() ?? null,
    })),
  } satisfies SessionPayload);
}

/** Signs out of this browser. The vault itself is untouched. */
export async function DELETE() {
  await destroySession();
  return Response.json({ ok: true });
}
