import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  // In watch mode keep the existing dist (built by turbo's ^build) so dependants never
  // see the fresh JS before its .d.ts is regenerated.
  clean: !options.watch,
  sourcemap: true,
  target: 'es2022',
}));
