import { defineConfig } from 'vite';

// Relative base so the static build can be hosted from any path (GitHub Pages, Netlify, a USB stick).
export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4096 },
});
