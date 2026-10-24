// Captures WP20's territory and trails over the real headless match (tests/render/territory.html): a big loop closing
// and flooding (wp20-flood-*), a rival breaking the player's trail and the trail washing away (wp20-break-*), the storm
// taking a bite of the player's waters (wp20-storm-*), and the ten team patterns side by side at four hours
// (wp20-patterns-*); each set also on a contact sheet (wp20-<set>-sheet.png), and the sheets on one (wp20-sheet.png). Logs draw calls, triangles, texture
// memory and the claim's partial-upload bytes.
//   node tests/render/territory.shots.ts [outDir] [--only=<set>]     (default outDir: progress/shots)
import { basename, join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launch, openGame, root, serve, type DeviceName } from '../harness.ts';
import { bigLoop } from './territory.match.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'progress/shots');
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? '';
const loop = bigLoop();
console.log(`the player's big loop: tick ${loop.tick}, ${loop.area.toFixed(0)} u²`);
type Act = 'seek' | 'advance' | 'cross' | 'swallow' | 'hour';
const SETS: { set: string; device: DeviceName; steps: [name: string, act: Act, arg: number][] }[] = [
  { set: 'flood', device: 'ipad', steps: [['0-open', 'seek', 0], ['1-closed', 'advance', 45], ['2', 'seek', 0.3], ['3', 'seek', 0.7],
    ['4', 'seek', 1.2], ['5', 'seek', 1.9], ['6', 'seek', 3], ['7-dry', 'seek', 6]] },
  { set: 'break', device: 'iphone', steps: [['0-open', 'seek', 0], ['1-broken', 'cross', 0], ['2', 'seek', 0.8], ['3', 'seek', 1.7], ['4', 'seek', 2.7], ['5', 'seek', 3.8]] },
  { set: 'storm', device: 'iphone', steps: [['0-held', 'seek', 0], ['1-swallowed', 'swallow', 0], ['2', 'seek', 0.9], ['3', 'seek', 1.8], ['4', 'seek', 2.8], ['5', 'seek', 4.6]] },
  { set: 'patterns', device: 'iphone', steps: [['dawn', 'hour', 6.3], ['midday', 'hour', 12], ['golden', 'hour', 18.2], ['night', 'hour', 22.5]] },
];

async function sheet(browser: Browser, files: string[], out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  const imgs = await Promise.all(files.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(${Math.min(files.length, 4)},1fr);gap:6px">${
    imgs.map((src, k) => `<figure style="margin:0"><img src="${src}" style="width:100%;display:block"><figcaption style="font:15px serif;padding:2px 4px">${basename(files[k], '.png')}</figcaption></figure>`).join('')}</body>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
const sheets: string[] = [];
try {
  for (const s of SETS) {
    if (only && s.set !== only) continue;
    const game = await openGame(browser, `${server.url}tests/render/territory.html`, { device: s.device, hook: '__territory', query: { scene: s.set, at: String(loop.tick) } });
    await game.until((g) => g.ready, undefined, 240000);
    const files: string[] = [];
    for (const [name, act, arg] of s.steps) {
      const stats = await game.page.evaluate(([a, x]) => (window as unknown as { __territory: Record<string, (v: number) => unknown> }).__territory[a](x), [act, arg] as const);
      const file = join(outDir, `wp20-${s.set}-${name}.png`);
      await game.page.screenshot({ path: file, scale: 'css' });
      files.push(file);
      console.log(file, JSON.stringify(stats));
    }
    game.assertClean();
    await game.page.close();
    sheets.push(join(outDir, `wp20-${s.set}-sheet.png`));
    await sheet(browser, files, sheets[sheets.length - 1]);
  }
  if (!only) await sheet(browser, sheets, join(outDir, 'wp20-sheet.png'));
} finally {
  await browser.close();
  await server.close();
}
