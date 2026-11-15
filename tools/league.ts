// The league's Worker gives the race node gives: a race dealt (play/deal.ts) run whole in headless Chromium's Worker
// (play/league.ts, by tools/league-page.ts), on the page's own thread, and in node (play/race.ts runRace); the three
// results should be the same to the bit. Where two part, the stage they part at is told: the planet's ground, its water,
// the berths, or the second of the race. Exit 1 unless all three agree.
//   node tools/league.ts [seed=11] [ships=80] [pace=0.5]
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { deal } from '../src/play/deal.ts';
import { runRace } from '../src/play/race.ts';
import { SEED, createPlanet } from '../src/world/planet.ts';
import type { Vec3 } from '../src/world/sphere.ts';
import type { RaceResult } from '../src/race.ts';
import { launch } from './launch.ts';
import { stages } from './league-page.ts';

const seed = Number(process.argv[2] ?? 11), count = Number(process.argv[3] ?? 80), pace = Number(process.argv[4] ?? 0.5);
const t0 = performance.now();
const planet = createPlanet(SEED), depth = (p: Vec3) => -planet.height(p);
const c = deal(seed, count), here = runRace({ ...c, rules: { ...c.rules, storm: { pace } } }, planet, { chart: chart(depth), water: berthing(depth) });
const told = (who: string, r: RaceResult, ms: number) =>
  console.log(`${who}: ${ms.toFixed(0)} ms, ${r.seconds.toFixed(1)} s raced, first ${r.order.slice(0, 2)}, ${r.sinkings.length} sunk`);
told('node', here, performance.now() - t0);

const { browser, url, close } = await launch();
let same = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  await page.goto(`${url}package.json`);
  const ask = <T>(fn: 'race' | 'onPage' | 'stages', args: readonly number[]) => page.evaluate(async ([path, f, a]) => {
    const m = await import(path) as Record<string, (...x: number[]) => unknown>;
    return m[f](...a);
  }, ['/tools/league-page.ts', fn, args] as const) as Promise<T>;
  let t = performance.now();
  const worker = await ask<RaceResult>('race', [SEED, seed, count, pace]);
  told('worker', worker, performance.now() - t);
  t = performance.now();
  const onPage = await ask<RaceResult>('onPage', [SEED, seed, count, pace]);
  told('page', onPage, performance.now() - t);
  const key = (r: RaceResult) => JSON.stringify(r);
  const inBrowser = key(worker) === key(onPage), withNode = key(worker) === key(here);
  console.log(`worker and page: ${inBrowser ? 'the same' : 'DIFFERENT'}; worker and node: ${withNode ? 'the same' : 'DIFFERENT'}`);
  if (!withNode) {
    const seconds = Math.ceil(here.seconds), mine = stages(SEED, seed, count, seconds);
    const theirs = await ask<string[]>('stages', [SEED, seed, count, seconds]);
    const k = mine.findIndex((s, i) => s !== theirs[i]);
    console.log(`  node and the browser part at: ${k < 0 ? 'nowhere read' : mine[k].split(' ')[0]}`);
  }
  same = inBrowser && withNode;
} finally {
  await close();
}
process.exit(same ? 0 : 1);
