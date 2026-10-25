// Captures WP23's life (tests/render/fauna.html) on iPhone and iPad: the companion gull's plumage on its truck with no
// training, each trait at its top and every trait at the top (wp23-plumage-*), ship 0's gull wheeling, out along the
// bow, home with a gold-leaf chest, circling and stooping (wp23-flight-*), and each species in its region
// (wp23-life-*); each set on a contact sheet (wp23-<set>-sheet.png). Logs the frame's draw calls and triangles and
// life's share (A9).
//   node tests/render/fauna.shots.ts [outDir]
import { join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const outDir = process.argv[2] ?? join(root, 'progress/shots');
type Hook = { seek(step: string): Record<string, number> };
const SETS: { set: string; steps: [name: string, step: string][] }[] = [
  { set: 'plumage', steps: ['0-plain', '1-talons', '2-wings', '3-eye', '4-beak', '5-dive', '6-gilt'].map((n, k) => [n, `plumage:${k}`]) },
  { set: 'flight', steps: ['wheel', 'out', 'back', 'circle', 'dive'].map((n) => [n, `flight:${n}`]) },
  { set: 'life', steps: ['puffin', 'seal', 'otter', 'wader', 'heron', 'turtle', 'whale', 'dolphin'].map((n) => [n, `life:${n}`]) },
];

async function sheet(browser: Browser, files: string[], out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  const imgs = await Promise.all(files.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${imgs.map((src) => `<img src="${src}" style="width:100%">`).join('')}</body>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

await mkdir(outDir, { recursive: true });
const server = await serve(), { browser } = await launch(), shots = new Map<string, string[]>();
try {
  for (const device of ['iphone', 'ipad'] as DeviceName[]) {
    const game = await openGame(browser, `${server.url}tests/render/fauna.html`, { device, hook: '__fauna' });
    await game.until((g) => g.ready, undefined, 240000);
    for (const { set, steps } of SETS) for (const [name, step] of steps) {
      const stats = await game.page.evaluate((step) => (window as unknown as { __fauna: Hook }).__fauna.seek(step), step);
      const file = join(outDir, `wp23-${set}-${name}-${device}.png`);
      await game.page.screenshot({ path: file, scale: 'css' });
      shots.set(set, [...(shots.get(set) ?? []), file]);
      console.log(`wp23-${set}-${name}-${device}`, JSON.stringify(stats));
    }
    console.log(`${device} console problems:`, JSON.stringify(game.problems().slice(0, 4)).slice(0, 1500));
    await game.close();
  }
  for (const [set, files] of shots) await sheet(browser, files, join(outDir, `wp23-${set}-sheet.png`));
} finally {
  await browser.close();
  await server.close();
}
