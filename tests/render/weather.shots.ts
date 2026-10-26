import { basename, join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'out/shots');
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? '';
const SCENES = ['fog', 'squall', 'calm', 'bruise', 'outside', 'inside', 'ring', 'sea'].filter((s) => !only || s === only);
const devices = (args.find((a) => a.startsWith('--device='))?.slice(9) ?? 'ipad,iphone').split(',') as DeviceName[];
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
  for (const device of devices) {
    const files: string[] = [];
    for (const scene of SCENES) {
      const game = await openGame(browser, `${server.url}tests/render/weather.html`, { device, hook: '__weather', query: { scene } });
      await game.until((g) => g.ready, undefined, 240000);
      const info = await game.page.evaluate(async (strike) => {
        type Hook = { seed: number; hour: number; tick: number; lamps: number; stats(): unknown; strike(): unknown; budget(): unknown; gpu(frames: number): Promise<unknown> };
        const w = (window as unknown as { __weather: Hook }).__weather, budget = w.budget(), gpu = await w.gpu(40);
        return { seed: w.seed, hour: w.hour, tick: w.tick, lamps: w.lamps, stats: strike ? w.strike() : w.stats(), budget, gpu };
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
