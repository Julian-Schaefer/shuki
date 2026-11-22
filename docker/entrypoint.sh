#!/bin/sh
set -e

# --enable-source-maps gives readable stack traces from the bundled code.
case "$1" in
  server)  exec node --enable-source-maps /app/apps/server/dist/index.mjs ;;
  worker)  exec node --enable-source-maps /app/apps/worker/dist/index.mjs ;;
  migrate) exec node --enable-source-maps /app/apps/server/dist/migrate.mjs ;;
  *)       exec "$@" ;;
esac
