import { basename, join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'out/shots');
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? '';
const SCENES = ['deck', 'chart', 'storm', 'night', 'damaged'].filter((s) => !only || s === only);
const devices = (args.find((a) => a.startsWith('--device='))?.slice(9) ?? 'ipad,iphone').split(',') as DeviceName[];

async function sheet(browser: Browser, files: string[], out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  const imgs = await Promise.all(files.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${
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
      const game = await openGame(browser, `${server.url}tests/render/shipView.html`, { device, hook: '__ships', query: { scene } });
      await game.until((g) => g.ready, undefined, 240000);
      const info = await game.page.evaluate(() => (window as unknown as { __ships: { stats(): unknown } }).__ships.stats());
      const file = join(outDir, `wp19-${scene}-${device}.png`);
      await game.page.screenshot({ path: file, scale: 'css' });
      files.push(file);
      console.log(file, JSON.stringify(info));
      game.assertClean();
      await game.page.close();
    }
    if (!only) await sheet(browser, files, join(outDir, `wp19-sheet-${device}.png`));
  }
} finally {
  await browser.close();
  await server.close();
}
