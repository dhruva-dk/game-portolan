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
