// Shared by the tools: start Vite and a headless Chromium with WebGPU.
import { chromium } from 'playwright';
import { createServer } from 'vite';

/** The target's screen: the iPad Air (M1) in landscape, CSS pixels, and its pixels per CSS pixel. */
export const VIEW = { width: 1180, height: 820 } as const, DPR = 2;

/** The port asked for; if it is taken (another checkout's tools running), Vite takes the next free one. */
export const PORT = 5199;

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
