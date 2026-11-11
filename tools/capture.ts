// Screenshots of the game in headless Chromium with WebGPU, for judging changes by eye.
//   node tools/capture.ts [query ...]      e.g. node tools/capture.ts t=10 t=15 t=18.6
// Starts the Vite dev server, opens one page per query, waits for a second and a half of frames, writes
// captures/<query>.png.
// The frame rate is uncapped, so the FPS printed is a cost measure; GPU timestamps read 0 when uncapped.

import { mkdirSync } from 'node:fs';
import { launch } from './launch.ts';

const queries = process.argv.slice(2);
if (queries.length === 0) queries.push('');

const { browser, url, close } = await launch();
mkdirSync('captures', { recursive: true });

try {
  for (const q of queries) {
    // iPhone 16 Pro Max in landscape, CSS pixels
    const page = await browser.newPage({ viewport: { width: 956, height: 440 } });
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error(`[${q}] ${m.text()}`));
    page.on('pageerror', (e) => console.error(`[${q}] ${e.message}`));
    await page.goto(`${url}?${q}`);
    // the meter's first reading: a second of frames has run (the ground's bake comes first)
    await page.waitForFunction(() => document.getElementById('meter')?.textContent, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const file = `captures/${q.replace(/[^\w.=-]+/g, '_') || 'default'}.png`;
    await page.screenshot({ path: file });
    console.log(file, await page.textContent('#meter'));
    await page.close();
  }
} finally {
  await close();
}
