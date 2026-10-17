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
    testTimeout: 30_000,
  },
});
