#!/usr/bin/env node
/**
 * Applies `prisma/migrations/*.sql` to a Cloudflare D1 database.
 *
 * D1 is reached over Cloudflare's HTTP API — the same endpoint a `curl` would
 * hit — so no wrangler install and no local binding are needed. Applied files
 * are recorded in `_migrations`, which makes the script safe to re-run.
 *
 * Usage:  node scripts/d1-migrate.mjs [--status]
 * Needs:  CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_D1_TOKEN
 */

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_DATABASE_ID;
const token = process.env.CLOUDFLARE_D1_TOKEN;

if (!accountId || !databaseId || !token) {
  console.error(
    "Missing Cloudflare credentials. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID and CLOUDFLARE_D1_TOKEN.",
  );
  process.exit(1);
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

/** One request to D1. `sql` may contain several statements. */
async function query(sql, params = []) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message =
      payload?.errors?.map((error) => `${error.code}: ${error.message}`).join("; ") ??
      `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return payload.result ?? [];
}

async function appliedMigrations() {
  await query(
    `CREATE TABLE IF NOT EXISTS "_migrations" (
       "name" TEXT NOT NULL PRIMARY KEY,
       "checksum" TEXT NOT NULL,
       "appliedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
     );`,
  );
  const result = await query(`SELECT "name", "checksum" FROM "_migrations" ORDER BY "name";`);
  const rows = result[0]?.results ?? [];
  return new Map(rows.map((row) => [row.name, row.checksum]));
}

async function main() {
  const statusOnly = process.argv.includes("--status");
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  const applied = await appliedMigrations();

  let pending = 0;
  for (const name of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);
    const previous = applied.get(name);

    if (previous === checksum) {
      if (statusOnly) console.log(`  applied   ${name}`);
      continue;
    }
    if (previous && previous !== checksum) {
      console.error(
        `\n  ${name} has changed since it was applied. Write a new migration file instead of editing this one.`,
      );
      process.exit(1);
    }

    pending += 1;
    if (statusOnly) {
      console.log(`  pending   ${name}`);
      continue;
    }

    process.stdout.write(`  applying  ${name} … `);
    await query(sql);
    await query(`INSERT INTO "_migrations" ("name", "checksum") VALUES (?, ?);`, [name, checksum]);
    console.log("done");
  }

  if (pending === 0) console.log(statusOnly ? "" : "  Database is up to date.");
  else if (statusOnly) console.log(`\n  ${pending} migration(s) pending.`);
}

main().catch((error) => {
  console.error(`\n  Migration failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
