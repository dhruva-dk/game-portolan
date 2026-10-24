// Retakes the WP15 part-B shots at both devices: a lighthouse at dusk and at night with its beam, a harbour at dusk
// with a ship at its mooring, and a far lighthouse over the curve (hull-down: only the lantern clears the horizon).
// node tests/pages/structures.shots.ts [outDir]
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launch, openGame, root, serve } from '../harness.ts';

const outDir = process.argv[2] ?? join(root, 'progress/shots');
const SHOTS: [string, Record<string, string>, number][] = [
  ['lighthouse-dusk', { view: 'light', off: '40', height: '4', pitch: 'lamp' }, 19.4],
  ['lighthouse-night', { view: 'light', off: '40', height: '4', pitch: 'lamp' }, 22.5],
  ['harbour-dusk', { view: 'harbour', region: 'Spice' }, 19.2],
  ['far-lighthouse', { view: 'light', off: 'curve', height: '2.5', pitch: '0.02' }, 20.2],
];
await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
try {
  for (const device of ['ipad', 'iphone'] as const) {
    const frames: string[] = [];
    for (const [name, query, hour] of SHOTS) {
      const game = await openGame(browser, `${server.url}tests/pages/sea.html`, { device, hook: '__sea', query: { ...query, clock: '12' } });
      await game.until((g) => g.ready, undefined, 30000);
      await game.hook((g, h) => g.setHour(h), hour);
      await game.page.waitForTimeout(300);
      const png = await game.page.screenshot({ path: join(outDir, `wp15-${device}-${name}.png`), scale: 'css' });
      frames.push(png.toString('base64'));
      console.log(device, name, JSON.stringify(await game.hook((g) => ({ calls: g.calls, triangles: g.triangles, structures: g.structureTriangles }))));
      game.assertClean();
      await game.close();
    }
    const W = device === 'ipad' ? 516 : 585;
    const sheet = await browser.newPage({ viewport: { width: 2 * W, height: 600 } });
    await sheet.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(2,${W}px);font:13px Georgia,serif">${frames
      .map((f, k) => `<figure style="margin:0"><img width="${W}" style="display:block" src="data:image/png;base64,${f}"><figcaption style="height:20px;line-height:20px;text-align:center">${SHOTS[k][0]}</figcaption></figure>`)
      .join('')}</body>`);
    await sheet.screenshot({ path: join(outDir, `wp15-${device}-structures-sheet.png`), fullPage: true });
    await sheet.close();
  }
} finally {
  await browser.close();
  await server.close();
}
