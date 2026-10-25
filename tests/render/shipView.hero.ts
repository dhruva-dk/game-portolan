// Captures WP19 part B's hero close-ups (tests/render/shipView.html?scene=hero) on both devices: each point of sail,
// the fittings line-up, each damage stage and the sinking frame by frame, one galleon framed close by __ships.pose.
// Contact sheets wp19b-<group>-<device>.png go to outDir; the single poses to --poses (default: the OS temp dir).
// Logs draw calls and triangles per pose and the ships' share.
//   node tests/render/shipView.hero.ts [outDir] [--device=ipad|iphone] [--poses=<dir>]
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, readFile } from 'node:fs/promises';
import type { Browser } from 'playwright';
import { launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'progress/shots');
const poseDir = args.find((a) => a.startsWith('--poses='))?.slice(8) ?? join(tmpdir(), 'wp19b');
const devices = (args.find((a) => a.startsWith('--device='))?.slice(9) ?? 'ipad,iphone').split(',') as DeviceName[];
// in this order: the sinking last, for she does not come back
const GROUPS: [string, string[]][] = [
  ['sail', ['close', 'reach', 'run', 'irons']],
  ['fit', ['fit-a', 'fit-b', 'fit-c', 'fit-d', 'fit-e']],
  ['damage', ['dmg-0', 'dmg-1', 'dmg-2', 'dmg-3', 'dmg-patched']],
  ['sink', ['sink-0', 'sink-1', 'sink-2', 'sink-3', 'sink-4']],
];

async function sheet(browser: Browser, files: string[], out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const imgs = await Promise.all(files.map(async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`));
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(${files.length > 4 ? 3 : 2},1fr);gap:6px">${
    imgs.map((src, k) => `<figure style="margin:0"><img src="${src}" style="width:100%;display:block"><figcaption style="font:15px serif;padding:2px 4px">${basename(files[k], '.png')}</figcaption></figure>`).join('')}</body>`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}

await mkdir(outDir, { recursive: true });
await mkdir(poseDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
type Hook = { ready: boolean; stats(): unknown; pose(name: string): void };
try {
  for (const device of devices) {
    const game = await openGame(browser, `${server.url}tests/render/shipView.html`, { device, hook: '__ships', query: { scene: 'hero' } });
    await game.until((g) => g.ready, undefined, 240000);
    for (const [group, poses] of GROUPS) {
      const files: string[] = [];
      for (const name of poses) {
        await game.page.evaluate((n) => (window as unknown as { __ships: Hook }).__ships.pose(n), name);
        const info = await game.page.evaluate(() => (window as unknown as { __ships: Hook }).__ships.stats());
        const file = join(poseDir, `wp19b-${name}-${device}.png`);
        await game.page.screenshot({ path: file, scale: 'css' });
        files.push(file);
        console.log(`${device} ${name} ${JSON.stringify(info)}`);
      }
      await sheet(browser, files, join(outDir, `wp19b-${group}-${device}.png`));
    }
    game.assertClean();
    await game.page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
