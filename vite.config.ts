import { defineConfig } from 'vite';

// Relative base so the static build runs from any path, and inside the Capacitor shell.
export default defineConfig({
  base: './',
  server: { warmup: { clientFiles: ['./src/app/main.ts'] } },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4096 },
});
