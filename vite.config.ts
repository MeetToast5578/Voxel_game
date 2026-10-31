import { defineConfig } from 'vitest/config';
import { offlineShell } from './scripts/offline-shell.mjs';

export default defineConfig({
  plugins: [offlineShell()],
  base: './',
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: 'index.html' } },
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
    // World generation tests build many chunks; slow machines need more than the 5 s default.
    testTimeout: 30_000,
  },
});
