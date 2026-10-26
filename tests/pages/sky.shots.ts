import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launch, openGame, root, serve } from '../harness.ts';

const outDir = process.argv[2] ?? join(root, 'out/shots');
const W = 344, H = 258;
await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
const url = `${server.url}tests/pages/sea.html`;
try {
  const game = await openGame(browser, url, { device: 'ipad', hook: '__sea', query: { view: 'light', clock: '12' } });
  await game.until((g) => g.ready, undefined, 30000);
  const frames: string[] = [];
  for (let h = 0; h < 24; h++) {
    await game.hook((g, hour) => g.setHour(hour), h);
    await game.page.waitForTimeout(150);
    frames.push((await game.page.screenshot({ scale: 'css' })).toString('base64'));
    if (h % 3 === 0) console.log(`${h}:00`, JSON.stringify(await game.hook((g) => ({ calls: g.calls, triangles: g.triangles }))));
  }
  game.assertClean();
  await game.close();
  const sheet = await browser.newPage({ viewport: { width: 6 * W, height: 4 * (H + 20) } });
  await sheet.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(6,${W}px);font:13px Georgia,serif">${frames
    .map((f, h) => `<figure style="margin:0"><img width="${W}" height="${H}" style="display:block" src="data:image/png;base64,${f}"><figcaption style="height:20px;line-height:20px;text-align:center">${String(h).padStart(2, '0')}:00</figcaption></figure>`)
    .join('')}</body>`);
  await sheet.screenshot({ path: join(outDir, 'wp14-hours.png'), fullPage: true });
  await sheet.close();
  for (const device of ['ipad', 'iphone'] as const) {
    const g = await openGame(browser, url, { device, hook: '__sea', query: { view: 'light', hour: '22', clock: '12', off: '28', height: '11', pitch: '-0.36' } });
    await g.until((x) => x.ready, undefined, 30000);
    await g.page.waitForTimeout(300);
    const file = join(outDir, `wp14-${device}-night.png`);
    await g.page.screenshot({ path: file, scale: 'css' });
    g.assertClean();
    console.log(file, JSON.stringify(await g.hook((x) => ({ calls: x.calls, triangles: x.triangles, sky: x.skyTriangles }))));
    await g.close();
  }
} finally {
  await browser.close();
  await server.close();
}
