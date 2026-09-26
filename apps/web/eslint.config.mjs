// @ts-check
import nextVitals from 'eslint-config-next/core-web-vitals';
import root from '../../eslint.config.mjs';

// Next's presets first, then the shared TypeScript rules (which re-enable the
// type-aware parser for TS files and disable it for plain JS config files).
const config = [
  ...nextVitals,
  ...root,
  { ignores: ['.next/**', 'public/**', 'playwright-report/**', 'test-results/**'] },
];

export default config;
