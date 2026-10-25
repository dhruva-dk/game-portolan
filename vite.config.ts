import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The world cache key (src/app/worldWorker.ts): a hash of every source file of the simulation, which builds the
// world, so a world cached on the device is never older than the code that generated it.
const sim = fileURLToPath(new URL('src/sim', import.meta.url));
const worldKey = createHash('sha256');
for (const file of readdirSync(sim, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).sort()) {
  worldKey.update(file).update(readFileSync(join(sim, file)));
}

// Relative base so the static build can be hosted from any path (GitHub Pages, Netlify, a USB stick).
export default defineConfig({
  base: './',
  // WP26 transform the app's and the world worker's module graphs as the dev server starts, not on the first page's
  // demand (a cold first load waited ~1 s on ~110 on-demand transforms before the title); the build is unaffected.
  server: { warmup: { clientFiles: ['./src/main.ts', './src/app/worldWorker.ts'] } },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4096 },
  define: { __WORLD_KEY__: JSON.stringify(worldKey.digest('hex').slice(0, 16)) },
});
