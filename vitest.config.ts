import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config (audit M4: "zero tests exist anywhere").
 * Only pure-logic modules are unit-tested (no DB/network); route handlers
 * are covered separately by scripts/smoke-auth.mjs against a live server.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'hooks/**/*.test.ts'],
    globals: false,
  },
});
