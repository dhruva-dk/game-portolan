// A race's result is the same to the bit within one engine (the orchestrator's ruling on #62): a race dealt
// (play/deal.ts) run whole in headless Chromium's Worker (play/league.ts, by tools/league-page.ts) and on the page's
// own thread must agree, and run twice in node (play/race.ts runRace) must agree. Node and Chromium are not compared:
// V8's Math differs between them in the last bits, and the game only ever runs races in the browser. Where node and
// the browser part is still told, for the record. Exit 1 unless both pairs agree.
//   node tools/league.ts [seed=11] [ships=80] [pace=0.5]
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { deal } from '../src/play/deal.ts';
import { runRace } from '../src/play/race.ts';
import { SEED, createPlanet } from '../src/world/planet.ts';
import type { Vec3 } from '../src/world/sphere.ts';
import type { RaceCard, RaceResult } from '../src/race.ts';
import { launch } from './launch.ts';
import { stages } from './league-page.ts';

const seed = Number(process.argv[2] ?? 11), count = Number(process.argv[3] ?? 80), pace = Number(process.argv[4] ?? 0.5);
const key = (r: RaceResult) => JSON.stringify(r);
const told = (who: string, r: RaceResult, ms: number) =>
  console.log(`${who}: ${ms.toFixed(0)} ms, ${r.seconds.toFixed(1)} s raced, first ${r.order.slice(0, 2)}, ${r.sinkings.length} sunk`);

/** The race run whole in node, on a planet built afresh each time (so nothing is carried from one run to the next). */
const inNode = (card: RaceCard) => {
  const t = performance.now(), planet = createPlanet(SEED), depth = (p: Vec3) => -planet.height(p);
  const r = runRace(card, planet, { chart: chart(depth), water: berthing(depth) });
  return { r, ms: performance.now() - t };
};
const c = deal(seed, count), card = { ...c, rules: { ...c.rules, storm: { pace } } };
const first = inNode(card), second = inNode(card);
told('node', first.r, first.ms);
told('node again', second.r, second.ms);
const nodeTwice = key(first.r) === key(second.r);

const { browser, url, close } = await launch();
let inBrowser = false;
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
  inBrowser = key(worker) === key(onPage);
  console.log(`worker and page: ${inBrowser ? 'the same' : 'DIFFERENT'}; node twice: ${nodeTwice ? 'the same' : 'DIFFERENT'}`);
  if (key(worker) !== key(first.r)) {
    // for the record only (#62): where the engines' last bits first show
    const seconds = Math.ceil(first.r.seconds), mine = stages(SEED, seed, count, seconds);
    const theirs = await ask<string[]>('stages', [SEED, seed, count, seconds]);
    const k = mine.findIndex((s, i) => s !== theirs[i]);
    console.log(`  (for the record) node and the browser part at: ${k < 0 ? 'nowhere read' : mine[k].split(' ')[0]}`);
  }
} finally {
  await close();
}
process.exit(inBrowser && nodeTwice ? 0 : 1);
