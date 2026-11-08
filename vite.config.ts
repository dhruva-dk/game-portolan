import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { packScans } from './tools/scans.ts';

let out = '';

// Relative base so the static build runs from any path, and inside the Capacitor shell. three's entry points are
// pre-bundled together, so 'three', 'three/webgpu' and 'three/tsl' share one copy of the node system: a second copy
// discovered mid-load would hold its own shader stack and break every TSL function. The post effects', the shadow
// cascades' and the dev pages' sky addons are listed with them for the same reason. The dev server answers on the
// network, and to the app's own page (capacitor://localhost), which loads the code from it in `npm run ios:ipad:dev`.
// The land's scans are packed for the GPU (tools/scans.ts) before anything is built or served, and the maps they are
// packed from are left out of the build.
export default defineConfig({
  base: './',
  plugins: [{
    name: 'scans',
    configResolved: (c) => { out = resolve(c.root, c.build.outDir); },
    buildStart: () => packScans(),
    closeBundle: () => rm(join(out, 'tex', 'regions'), { recursive: true, force: true }),
  }],
  server: { host: true, cors: { origin: 'capacitor://localhost' }, warmup: { clientFiles: ['./src/app/main.ts'] } },
  optimizeDeps: { include: ['three', 'three/webgpu', 'three/tsl', 'three/addons/tsl/display/*.js', 'three/addons/csm/*.js', 'three/addons/objects/SkyMesh.js'] },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4096 },
});
