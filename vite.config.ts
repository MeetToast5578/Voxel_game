import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The generator and streaming tests build thousands of blocks. On a slow
    // laptop they need far more than the 5 s default (task T-A1).
    // Timeout tiers (task T-A4): 30 s is the default (the older positional `}, 30_000)` annotations in spawn and
    // trees are now redundant but harmless). Tests that scan mountain columns, strata or ore placement annotate
    // { timeout: 60000 }; tests that trigger region simulation (rivers, lakes, whole-region determinism) annotate
    // { timeout: 120000 }. A new slow test picks the tier that fits and says why in a comment.
    testTimeout: 30_000,
  },
});
