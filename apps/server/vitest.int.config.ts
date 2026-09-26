import { defineConfig } from 'vitest/config';

/** Integration tests against the Firebase Emulator Suite. */
export default defineConfig({
  test: { include: ['test/**/*.int.test.ts'], testTimeout: 30_000 },
});
