// Screenshots of the game in headless Chromium with WebGPU, for judging changes by eye.
//   node tools/capture.ts [query ...]      e.g. node tools/capture.ts t=10 t=15 t=18.6
// Starts the Vite dev server, opens one page per query, waits for frames, writes captures/<query>.png.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const queries = process.argv.slice(2);
if (queries.length === 0) queries.push('');

const server = await createServer({ logLevel: 'error', server: { port: 5199 } });
await server.listen();
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
mkdirSync('captures', { recursive: true });

try {
  for (const q of queries) {
    // iPhone 16 Pro Max in landscape, CSS pixels
    const page = await browser.newPage({ viewport: { width: 956, height: 440 } });
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error(`[${q}] ${m.text()}`));
    page.on('pageerror', (e) => console.error(`[${q}] ${e.message}`));
    await page.goto(`http://localhost:5199/?${q}`);
    await page.waitForTimeout(2500);
    const file = `captures/${q.replace(/[^\w.=-]+/g, '_') || 'default'}.png`;
    await page.screenshot({ path: file });
    console.log(file, await page.textContent('#meter'));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
