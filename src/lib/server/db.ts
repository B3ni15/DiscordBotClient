import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma against Cloudflare D1.
 *
 * D1 has no connection string: it is reached over Cloudflare's HTTP API, which
 * is what Prisma's D1 driver adapter speaks when it is handed an account, a
 * database and a token. Locally, where there is no Cloudflare account, the same
 * schema runs on a SQLite file instead, so the app can be developed without one.
 */

declare global {
  // Next reloads modules on every request in development; without this the app
  // would open a new client (and a new pool) on each of them.
  var __disbotclientPrisma: PrismaClient | undefined;
}

export interface DatabaseConfig {
  accountId: string;
  databaseId: string;
  token: string;
}

/** The Cloudflare credentials, when all three are present. */
export function d1Config(): DatabaseConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_DATABASE_ID;
  const token = process.env.CLOUDFLARE_D1_TOKEN;
  if (!accountId || !databaseId || !token) return null;
  return { accountId, databaseId, token };
}

/** The local SQLite file used when Cloudflare is not configured. */
function localDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL;
  return url?.startsWith("file:") ? url : null;
}

/**
 * Whether cloud sync is available at all. With neither D1 nor a local file the
 * app still runs — it just keeps everything in the browser, as it always has.
 */
export function isDatabaseConfigured(): boolean {
  return d1Config() !== null || localDatabaseUrl() !== null;
}

let creating: Promise<PrismaClient> | null = null;

/** The shared client, created on first use. Throws when nothing is configured. */
export async function db(): Promise<PrismaClient> {
  if (globalThis.__disbotclientPrisma) return globalThis.__disbotclientPrisma;
  creating ??= create();
  const client = await creating;
  globalThis.__disbotclientPrisma = client;
  return client;
}

async function create(): Promise<PrismaClient> {
  const cloudflare = d1Config();
  if (cloudflare) {
    const { PrismaD1 } = await import("@prisma/adapter-d1");
    const adapter = new PrismaD1({
      CLOUDFLARE_ACCOUNT_ID: cloudflare.accountId,
      CLOUDFLARE_DATABASE_ID: cloudflare.databaseId,
      CLOUDFLARE_D1_TOKEN: cloudflare.token,
    });
    return new PrismaClient({ adapter });
  }

  const file = localDatabaseUrl();
  if (file) {
    // A development-only dependency, so a production deployment on D1 never
    // has to build a native SQLite module.
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url: file.replace(/^file:/, "") });
    return new PrismaClient({ adapter });
  }

  throw new DatabaseNotConfiguredError();
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "No database is configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID and " +
        "CLOUDFLARE_D1_TOKEN (or DATABASE_URL=file:./prisma/dev.db for local development).",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}
