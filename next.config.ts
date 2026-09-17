import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  /*
   * Prisma's driver adapters load native or environment-specific code at
   * runtime; bundling them breaks that, so they stay external to the server
   * build. better-sqlite3 is only ever reached in local development.
   */
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-d1",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
  ],
};

export default nextConfig;
