import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEVICES, launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const AT: [string, number][] = (process.env.SINK_AT?.split(',').map(Number) ?? [5, 6, 7, 8, 9, 10, 11, 12]).map((t, i) => [`${i + 1}`, t]);
const out = process.env.SINK_OUT ?? join(root, 'out/shots'), only = process.env.SINK_ONLY;
const server = await serve();
const { browser, gpu, renderer } = await launch();
if (!gpu) { console.error(`sinking.shots: no GPU WebGL (${renderer})`); await browser.close(); await server.close(); process.exit(2); }
const files: [string, string][] = [];
type Got = { sinkT: number; z: number; dist: number; alt: number; visible: boolean; rings: number; foam: number; flotsam: number; slick: number };
try {
  for (const device of ['iphone', 'ipad'] as DeviceName[]) {
    const s = DEVICES[device].safeArea;
    for (const weather of ['storm', 'clear']) {
      if (only && only !== `${device}-${weather}`) continue;
      const game = await openGame(browser, `${server.url}tests/render/sinking.html`, { device, hook: '__sink', query: { weather, safe: `${s.top},${s.right},${s.bottom},${s.left}` } });
      await game.until((g) => g.ready, undefined, 240000);
      console.log(`${device} ${weather}: she sinks at ${JSON.stringify(await game.page.evaluate(() => (window as unknown as { __sink: { where: unknown } }).__sink.where))}`);
      for (const [k, t] of AT) {
        const r = await game.page.evaluate((t) => (window as unknown as { __sink: { at(t: number): Got } }).__sink.at(t), t);
        console.log(`${device} ${weather} ${k} (${t} s): z ${r.z.toFixed(2)}, ${r.dist.toFixed(1)} u off, ${r.alt.toFixed(1)} u up, hull ${r.visible ? 'shown' : 'gone'}, rings ${r.rings}, foam ${r.foam}, flotsam ${r.flotsam}, slick ${r.slick}`);
        const file = join(out, `wp27h-${device}-sink-${weather}-${k}.png`);
        await game.page.screenshot({ path: file, scale: 'css' });
        files.push([file, `${device} ${weather} ${k}: ${t} s`]);
      }
      game.assertClean();
      await game.page.close();
    }
  }
  const page = await browser.newPage({ viewport: { width: 2000, height: 100 } });
  const imgs = await Promise.all(files.map(async ([f, label]) => [`data:image/png;base64,${(await readFile(f)).toString('base64')}`, label]));
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(${Math.min(AT.length, 8)},1fr);gap:6px;font:13px sans-serif">${imgs.map(([src, label]) => `<figure style="margin:0"><img src="${src}" style="width:100%;display:block"><figcaption>${label}</figcaption></figure>`).join('')}</body>`);
  await page.screenshot({ path: join(out, 'wp27h-sheet.png'), fullPage: true });
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
