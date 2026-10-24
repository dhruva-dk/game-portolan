// Captures the WP16 regions on the sea test page, on both devices: the Ice Crown under the aurora at night with the
// Crown Light on its skerry among the floes (capture 17), up the Falls Fjord at morning with a ship in the channel
// (capture 18), and each landmark from high above (wp16-<device>-<shot>.png, a contact sheet per device,
// wp16-<device>-sheet.png, and both together, wp16-sheet.png). Each frame logs draw calls and triangles (the regions'
// share) for A9.
// Part B: the Arch over the Basalt Stacks' maze in late afternoon (capture 19), a lane of the maze at deck, the Arch from
// high above. Part C: the Kelp Cathedral through clear water at midday, a ship half-hidden in the kelp (capture 20), at
// deck among the canopy, the Cathedral from high above. A name prefix (e.g. basalt) takes only those shots, as sheets wp16-<prefix>-<device>-sheet.png.
//   node tests/pages/regions.shots.ts [outDir] [prefix]
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launch, openGame, root, serve } from '../harness.ts';

const outDir = process.argv[2] ?? join(root, 'progress/shots');
const only = process.argv[3] ?? '', tag = only ? `${only}-` : '';
const SHOTS: readonly (readonly [string, Record<string, string>])[] = ([
  ['ice-crown', { view: 'crown', hour: '23' }],
  ['crown-light-orbit', { view: 'mark', region: 'Ice', hour: '23' }],
  ['fjord', { view: 'fjord', hour: '8' }],
  ['great-falls-orbit', { view: 'mark', region: 'Fjords', hour: '8' }],
  ['basalt-hero', { view: 'basalt', hour: '16.5' }],
  ['basalt-weave', { view: 'weave', hour: '16.5' }],
  ['basalt-arch-orbit', { view: 'mark', region: 'Basalt', hour: '16.5' }],
  ['kelp-hero', { view: 'kelp', hour: '12' }],
  ['kelp-deck', { view: 'kelpdeck', hour: '12' }],
  ['kelp-cathedral-orbit', { view: 'mark', region: 'Kelp', hour: '12' }],
] as const).filter(([name]) => name.startsWith(only));
await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
const url = `${server.url}tests/pages/sea.html`;

async function sheet(frames: string[], captions: string[], cols: number, W: number, path: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: cols * W, height: 400 } });
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(${cols},${W}px);font:13px Georgia,serif">${frames
    .map((f, k) => `<figure style="margin:0"><img width="${W}" style="display:block" src="data:image/png;base64,${f}"><figcaption style="height:20px;line-height:20px;text-align:center">${captions[k]}</figcaption></figure>`)
    .join('')}</body>`);
  await page.screenshot({ path, fullPage: true });
  await page.close();
}

try {
  const all: string[] = [], labels: string[] = [];
  for (const device of ['ipad', 'iphone'] as const) {
    const frames: string[] = [];
    for (const [name, query] of SHOTS) {
      const game = await openGame(browser, url, { device, hook: '__sea', query: { ...query, clock: '12' } });
      await game.until((g) => g.ready, undefined, 30000);
      await game.page.waitForTimeout(250);
      const png = await game.page.screenshot({ path: join(outDir, `wp16-${device}-${name}.png`), scale: 'css' });
      console.log(device, name, JSON.stringify(await game.hook((g) => ({ calls: g.calls, triangles: g.triangles, regions: g.regionTriangles }))));
      game.assertClean();
      await game.close();
      frames.push(png.toString('base64'));
      labels.push(`${device} · ${name}`);
    }
    await sheet(frames, SHOTS.map(([name]) => name), 2, device === 'ipad' ? 520 : 600, join(outDir, `wp16-${tag}${device}-sheet.png`));
    all.push(...frames);
  }
  await sheet(all, labels, 4, 420, join(outDir, `wp16-${tag}sheet.png`));
} finally {
  await browser.close();
  await server.close();
}
