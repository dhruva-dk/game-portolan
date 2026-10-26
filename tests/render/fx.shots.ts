import { join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const outDir = process.argv[2] ?? join(root, 'out/shots');
type Hook = { stage(set: string): void; seek(t: number, cam: string): Record<string, number> };
const SETS: { set: string; devices: DeviceName[]; steps: [name: string, t: number, cam: string][] }[] = [
  { set: 'battle', devices: ['iphone', 'ipad'], steps: [['0-ripple', 0.14, 'deck'], ['1-smoke', 0.6, 'deck'], ['2-banks', 2.2, 'deck'], ['3-orbit', 2.4, 'orbit']] },
  { set: 'chests', devices: ['ipad'], steps: [['0-open', 0.35, 'near'], ['1-burst', 0.8, 'near'], ['2-afloat', 2.5, 'near']] },
  { set: 'claim', devices: ['iphone'], steps: [['0', 0.3, 'high'], ['1', 0.9, 'high'], ['2', 1.6, 'high']] },
  { set: 'current', devices: ['iphone', 'ipad'], steps: [['0-deck', 2, 'deck'], ['1-orbit', 2.5, 'orbit']] },
];

async function sheet(browser: Browser, files: string[], out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  const imgs = await Promise.all(files.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(${Math.min(files.length, 4)},1fr);gap:6px">${
    imgs.map((src) => `<img src="${src}" style="width:100%">`).join('')}</body>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

await mkdir(outDir, { recursive: true });
const server = await serve(), { browser } = await launch(), shots = new Map<string, string[]>();
try {
  for (const device of ['iphone', 'ipad'] as DeviceName[]) {
    const game = await openGame(browser, `${server.url}tests/render/fx.html`, { device, hook: '__fx' });
    await game.until((g) => g.ready, undefined, 240000);
    for (const s of SETS.filter((x) => x.devices.includes(device))) {
      await game.page.evaluate((set) => (window as unknown as { __fx: Hook }).__fx.stage(set), s.set);
      for (const [name, t, cam] of s.steps) {
        const stats = await game.page.evaluate(([t, cam]) => (window as unknown as { __fx: Hook }).__fx.seek(t, cam), [t, cam] as const);
        const file = join(outDir, `wp22-${s.set}-${name}-${device}.png`);
        await game.page.screenshot({ path: file, scale: 'css' });
        shots.set(s.set, [...(shots.get(s.set) ?? []), file]);
        console.log(`wp22-${s.set}-${name}-${device}`, JSON.stringify(stats));
      }
    }
    console.log(`${device} console problems:`, JSON.stringify(game.problems().slice(0, 4)).slice(0, 1200));
    await game.close();
  }
  for (const [set, files] of shots) await sheet(browser, files, join(outDir, `wp22-${set}-sheet.png`));
} finally {
  await browser.close();
  await server.close();
}
