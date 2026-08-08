#!/bin/sh
set -eu
npx prisma db push --schema prisma/schema.postgres.prisma --skip-generate
node --experimental-strip-types prisma/seed.ts
exec npm start
