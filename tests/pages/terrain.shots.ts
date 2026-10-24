// Captures WP15 part A on the sea test page: a generic island (the Spice Isles) from deck, high and orbit at dawn,
// midday and golden hour, at both devices (wp15-<device>-<view>-<hour>.png, and each device's nine as a contact
// sheet, wp15-<device>-sheet.png), with draw calls, triangles, the terrain's share and GPU memory for A9 (the orbit
// view holds the whole region).
//   node tests/pages/terrain.shots.ts [outDir]     (default outDir: progress/shots)
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launch, openGame, root, serve } from '../harness.ts';

const outDir = process.argv[2] ?? join(root, 'progress/shots');
const VIEWS = ['deck', 'high', 'orbit'] as const;
const HOURS = [['dawn', 6.5], ['midday', 12], ['golden', 18]] as const;
await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
const url = `${server.url}tests/pages/sea.html`;
try {
  for (const device of ['ipad', 'iphone'] as const) {
    const frames: string[] = [];
    for (const view of VIEWS) {
      const game = await openGame(browser, url, { device, hook: '__sea', query: { view, region: 'Spice', clock: '12', off: '34' } });
      await game.until((g) => g.ready, undefined, 30000);
      for (const [name, hour] of HOURS) {
        await game.hook((g, h) => g.setHour(h), hour);
        await game.page.waitForTimeout(250);
        const png = await game.page.screenshot({ path: join(outDir, `wp15-${device}-${view}-${name}.png`), scale: 'css' });
        frames.push(png.toString('base64'));
        console.log(device, view, name, JSON.stringify(await game.hook((g) => ({
          calls: g.calls, triangles: g.triangles, terrain: g.terrainTriangles, chunks: g.chunks, terrainMB: +g.terrainMB.toFixed(1),
          textureMB: +g.textureMB.toFixed(1), targetMB: +g.targetMB.toFixed(1), terrainMs: Math.round(g.terrainMs),
        }))));
      }
      game.assertClean();
      await game.close();
    }
    const W = device === 'ipad' ? 344 : 390;
    const sheet = await browser.newPage({ viewport: { width: 3 * W, height: 600 } });
    await sheet.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(3,${W}px);font:13px Georgia,serif">${frames
      .map((f, k) => `<figure style="margin:0"><img width="${W}" style="display:block" src="data:image/png;base64,${f}"><figcaption style="height:20px;line-height:20px;text-align:center">${VIEWS[Math.floor(k / 3)]} · ${HOURS[k % 3][0]}</figcaption></figure>`)
      .join('')}</body>`);
    await sheet.screenshot({ path: join(outDir, `wp15-${device}-sheet.png`), fullPage: true });
    await sheet.close();
  }
} finally {
  await browser.close();
  await server.close();
}
