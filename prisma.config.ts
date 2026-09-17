import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * Cloudflare D1 speaks HTTP rather than a database URL, so the CLI never talks
 * to it directly: `npm run db:sql` renders the schema to plain SQLite SQL with
 * `prisma migrate diff`, and `npm run db:push` sends that SQL to D1's query
 * endpoint. `DATABASE_URL` below is only the local SQLite file used while
 * developing without a Cloudflare account.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
