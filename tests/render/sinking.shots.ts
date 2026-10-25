// WP27 pass g (S-019 (g)) shots: the sinking itself, about a second apart, in clear weather and in the storm, on the
// iPhone and the iPad (tests/render/sinking.page.ts): progress/shots/wp27g-<device>-sink-<weather>-<k>.png at the
// seconds after she sank in AT (1: rolled over, down by the stern, the sea over her rail; 2–4: her masts going under
// one by one; 5: the masthead pennant last; 6: the sea closed over her, ripples, wreckage and her chest riding the
// swell), and the sheet wp27g-sheet.png.
//   node tests/render/sinking.shots.ts        (SINK_OUT=<dir> writes there instead of progress/shots; SINK_AT=5,6.5,…
//   shoots those seconds instead; SINK_ONLY=iphone-clear shoots one device and weather)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEVICES, launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const AT: [string, number][] = (process.env.SINK_AT?.split(',').map(Number) ?? [5, 6, 7, 8, 9.5, 11.2]).map((t, i) => [`${i + 1}`, t]);
const out = process.env.SINK_OUT ?? join(root, 'progress/shots'), only = process.env.SINK_ONLY;
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
        const file = join(out, `wp27g-${device}-sink-${weather}-${k}.png`);
        await game.page.screenshot({ path: file, scale: 'css' });
        files.push([file, `${device} ${weather} ${k}: ${t} s`]);
      }
      game.assertClean();
      await game.page.close();
    }
  }
  const page = await browser.newPage({ viewport: { width: 2000, height: 100 } });
  const imgs = await Promise.all(files.map(async ([f, label]) => [`data:image/png;base64,${(await readFile(f)).toString('base64')}`, label]));
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(${Math.min(AT.length, 6)},1fr);gap:6px;font:13px sans-serif">${imgs.map(([src, label]) => `<figure style="margin:0"><img src="${src}" style="width:100%;display:block"><figcaption>${label}</figcaption></figure>`).join('')}</body>`);
  await page.screenshot({ path: join(out, 'wp27g-sheet.png'), fullPage: true });
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
