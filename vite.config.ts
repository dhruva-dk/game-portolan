import { defineConfig } from 'vite';

// Relative base so the static build runs from any path, and inside the Capacitor shell. three's entry points are
// pre-bundled together, so 'three', 'three/webgpu' and 'three/tsl' share one copy of the node system: a second copy
// discovered mid-load would hold its own shader stack and break every TSL function. The post effects', the shadow
// cascades' and the dev pages' sky addons are listed with them for the same reason.
export default defineConfig({
  base: './',
  server: { warmup: { clientFiles: ['./src/app/main.ts'] } },
  optimizeDeps: { include: ['three', 'three/webgpu', 'three/tsl', 'three/addons/tsl/display/*.js', 'three/addons/csm/*.js', 'three/addons/objects/SkyMesh.js'] },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4096 },
});
