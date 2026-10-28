#!/bin/sh
# Applies the Prisma schema to the local SQLite file when the container is run
# without Cloudflare D1 credentials. With D1 configured the schema is managed in
# Cloudflare instead (npm run db:push), and this does nothing.
set -eu

if [ -n "${DATABASE_URL:-}" ] && [ -z "${CLOUDFLARE_D1_TOKEN:-}" ]; then
  case "$DATABASE_URL" in
    file:*)
      echo "[entrypoint] Applying the Prisma schema to ${DATABASE_URL}"
      ./node_modules/.bin/prisma db push
      ;;
  esac
fi

exec "$@"
