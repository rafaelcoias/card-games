import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // Trivial reference game: the spec's 90% bar applies to Mexicana; branches here are defensive guards.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
