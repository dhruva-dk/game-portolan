// Shared by the tools: start Vite and a headless Chromium with WebGPU.
import { chromium } from 'playwright';
import { createServer } from 'vite';

/** The port asked for; if it is taken (another checkout's tools running), Vite takes the next free one. */
export const PORT = 5199;

/** The device the tools stand in for: the iPad Air M1 in landscape, its CSS pixels (the layout page, src/ui/screens.ts
 *  W × H) and its pixels per CSS pixel. */
export const DEVICE = { width: 1180, height: 820, dpr: 2 } as const;

export async function launch() {
  const server = await createServer({ logLevel: 'error', server: { port: PORT, strictPort: false } });
  await server.listen();
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  return {
    browser,
    url: server.resolvedUrls?.local[0] ?? `http://localhost:${PORT}/`,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}
