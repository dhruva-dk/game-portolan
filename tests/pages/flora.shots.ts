import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launch, openGame, root, serve } from '../harness.ts';

const outDir = process.argv[2] ?? join(root, 'out/shots');
const SHOTS: [string, Record<string, string>, number][] = [
  ['forest-deck', { view: 'deck', region: 'Weeping', off: '26', pitch: '0.04' }, 10.5],
  ['forest-high', { view: 'high', region: 'Weeping' }, 10.5],
  ['forest-orbit', { view: 'orbit', region: 'Weeping' }, 11],
  ['jungle', { view: 'deck', region: 'Spice', off: '7', height: '2.6', pitch: '0.06' }, 9.5],
  ['cove', { view: 'high', region: 'Coral', off: '16', height: '11', pitch: '-0.42' }, 15],
  ['pine-slope', { view: 'deck', region: 'Fjords', off: '9', height: '4', pitch: '0.1' }, 10],
  ['kelp', { view: 'high', region: 'Kelp', off: '24', height: '12', pitch: '-0.7' }, 12.5],
  ['wind-a', { view: 'deck', region: 'Coral', off: '6', height: '2.4', pitch: '0.05', wind: '1.4', clock: '12' }, 14],
  ['wind-b', { view: 'deck', region: 'Coral', off: '6', height: '2.4', pitch: '0.05', wind: '1.4', clock: '12.7' }, 14],
];
await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
try {
  for (const device of ['ipad', 'iphone'] as const) {
    const frames: string[] = [];
    for (const [name, query, hour] of SHOTS) {
      const game = await openGame(browser, `${server.url}tests/pages/sea.html`, { device, hook: '__sea', query: { clock: '12', ...query } });
      await game.until((g) => g.ready, undefined, 60000);
      await game.hook((g, h) => g.setHour(h), hour);
      await game.page.waitForTimeout(300);
      const png = await game.page.screenshot({ path: join(outDir, `wp15c-${device}-${name}.png`), scale: 'css' });
      frames.push(png.toString('base64'));
      console.log(device, name, JSON.stringify(await game.hook((g) => ({ calls: g.calls, triangles: g.triangles, flora: g.flora, textureMB: g.textureMB, targetMB: g.targetMB }))));
      game.assertClean();
      await game.close();
    }
    const W = device === 'ipad' ? 516 : 585;
    const sheet = await browser.newPage({ viewport: { width: 3 * W, height: 600 } });
    await sheet.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(3,${W}px);font:13px Georgia,serif">${frames
      .map((f, k) => `<figure style="margin:0"><img width="${W}" style="display:block" src="data:image/png;base64,${f}"><figcaption style="height:20px;line-height:20px;text-align:center">${SHOTS[k][0]}</figcaption></figure>`)
      .join('')}</body>`);
    await sheet.screenshot({ path: join(outDir, `wp15c-${device}-sheet.png`), fullPage: true });
    await sheet.close();
  }
} finally {
  await browser.close();
  await server.close();
}
