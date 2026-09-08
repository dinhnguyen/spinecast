#!/usr/bin/env bash
set -euo pipefail
rm -rf .wrangler/state
npx wrangler d1 migrations apply spinecast --local
HASH=$(npx tsx scripts/hash-password.ts '123456')
npx wrangler d1 execute spinecast --local --command "insert into users (id, email, password_hash, role, created_at) values ('e2e-admin', 'admin@dev.local', '$HASH', 'admin', unixepoch()), ('e2e-reader', 'reader@dev.local', '$HASH', 'user', unixepoch());"
