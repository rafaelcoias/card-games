import { defineConfig } from 'vitest/config';

/** Protocol E2E against a running server (see test/multiplayer.e2e.test.ts). */
export default defineConfig({
  test: { include: ['test/**/*.e2e.test.ts'], testTimeout: 240_000, hookTimeout: 30_000 },
});
