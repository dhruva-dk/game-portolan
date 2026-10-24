// Captures WP21's weather and storm over real headless matches (tests/render/weather.html) on both devices: a fog bank
// hiding a ship's lantern, a squall at the blue hour, a calm mirror, the opening's bruise on the horizon, the storm wall
// from outside and inside, the final calm ring (wp21-<scene>-<device>.png, contact sheets wp21-sheet-<device>.png).
// Logs draw calls and triangles per scene.
//   node tests/render/weather.shots.ts [outDir] [--only=<scene>]     (default outDir: progress/shots)
import { basename, join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'progress/shots');
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? '';
const SCENES = ['fog', 'squall', 'calm', 'bruise', 'outside', 'inside', 'ring'].filter((s) => !only || s === only);
const STRIKE = new Set(['outside', 'ring']);

async function sheet(browser: Browser, files: string[], out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  const imgs = await Promise.all(files.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${
    imgs.map((src, k) => `<figure style="margin:0"><img src="${src}" style="width:100%;display:block"><figcaption style="font:15px serif;padding:2px 4px">${basename(files[k], '.png')}</figcaption></figure>`).join('')}</body>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
try {
  for (const device of ['ipad', 'iphone'] as DeviceName[]) {
    const files: string[] = [];
    for (const scene of SCENES) {
      const game = await openGame(browser, `${server.url}tests/render/weather.html`, { device, hook: '__weather', query: { scene } });
      await game.until((g) => g.ready, undefined, 240000);
      const info = await game.page.evaluate((strike) => {
        const w = (window as unknown as { __weather: { seed: number; hour: number; tick: number; lamps: number; stats(): unknown; strike(): unknown } }).__weather;
        return { seed: w.seed, hour: w.hour, tick: w.tick, lamps: w.lamps, stats: strike ? w.strike() : w.stats() };
      }, STRIKE.has(scene));
      const file = join(outDir, `wp21-${scene}-${device}.png`);
      await game.page.screenshot({ path: file, scale: 'css' });
      files.push(file);
      console.log(file, JSON.stringify(info));
      game.assertClean();
      await game.page.close();
    }
    if (!only) await sheet(browser, files, join(outDir, `wp21-sheet-${device}.png`));
  }
} finally {
  await browser.close();
  await server.close();
}
