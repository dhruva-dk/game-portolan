// WP30a GPU timing harness: GPU ms per pass (scene, edges, composite, interface) and per scene group, and whole-frame GPU
// time, at the full iPad Pro 13" resolution (2752×2064, render scale pinned to 1), over the real headless matches of the
// weather test page (tests/render/weather.html: the game's own WorldView with every module). Timer queries
// (EXT_disjoint_timer_query_webgl2) wrap every renderer.render call of a frame; a group's cost is the scene pass with it
// hidden subtracted from the scene pass with it shown. Saves a 1:1 device-pixel capture of each frame (twice, a second
// apart, so a before/after comparison knows the frame's own noise floor).
//   node tests/render/gpu.timing.ts [--label=now] [--scenes=sea,bruise,calm,inside] [--frames=30] [--out=<dir>] [--quantile=0.5]
// (--quantile=0.1 reports each pass's 10th percentile instead of its median: steadier while other GPU work runs — WP30b)
// Writes <out>/gpu-<label>.json and <out>/<label>-<scene>.png, <label>-<scene>-b.png (default out: $TMPDIR/portolan-gpu).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, openGame, serve } from '../harness.ts';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const label = arg('label', 'now'), frames = +arg('frames', '30'), out = arg('out', join(tmpdir(), 'portolan-gpu'));
const scenes = arg('scenes', 'sea,bruise,calm,inside').split(','), quantile = +arg('quantile', '0.5');

await mkdir(out, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
const report: Record<string, unknown> = { label, renderer, device: 'ipad', at: new Date().toISOString() };
console.log(`renderer: ${renderer}`);
try {
  for (const scene of scenes) {
    const game = await openGame(browser, `${server.url}tests/render/weather.html`, { device: 'ipad', hook: '__weather', query: { scene } });
    await game.until((g) => g.ready, undefined, 240000);
    const info = await game.page.evaluate(async ([n, qn]) => {
      type Hook = { stats(): unknown; budget(): unknown; gpu(n: number): Promise<unknown>; profile(n: number, q: number): Promise<unknown> };
      const w = (window as unknown as { __weather: Hook }).__weather;
      return { stats: w.stats(), budget: w.budget(), gpu: await w.gpu(n), profile: await w.profile(n, qn) };
    }, [frames, quantile] as const);
    await game.page.screenshot({ path: join(out, `${label}-${scene}.png`), scale: 'device' });
    await game.page.waitForTimeout(1000);
    await game.page.screenshot({ path: join(out, `${label}-${scene}-b.png`), scale: 'device' });
    report[scene] = info;
    console.log(scene, JSON.stringify(info));
    game.assertClean();
    await game.page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
await writeFile(join(out, `gpu-${label}.json`), JSON.stringify(report, null, 1));
