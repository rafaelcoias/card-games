#!/usr/bin/env sh
# Runs inside `firebase emulators:exec` (Auth + Firestore are up). Starts the built
# game server, then runs the Firestore integration, protocol and browser suites.
set -eu

pnpm --filter @cardroom/server start > server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
npx --yes wait-on http://localhost:4000/api/health --timeout 60000

pnpm --filter @cardroom/server test:int
pnpm --filter @cardroom/server test:e2e
pnpm test:e2e
