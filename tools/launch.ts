// Shared by the tools: start Vite and a headless Chromium with WebGPU.
import { chromium } from 'playwright';
import { createServer } from 'vite';

export const PORT = 5199;

export async function launch() {
  const server = await createServer({ logLevel: 'error', server: { port: PORT } });
  await server.listen();
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  return {
    browser,
    url: `http://localhost:${PORT}/`,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}
