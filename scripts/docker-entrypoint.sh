#!/bin/sh
set -eu

mkdir -p /app/public/uploads/backgrounds \
  /app/public/uploads/knowledge \
  /app/public/uploads/external-sources

echo "Running Prisma migrations"
npx prisma migrate deploy

exec "$@"
