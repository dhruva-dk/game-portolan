// What a step of the match costs, by its parts: the game's own step (play/state.ts start and advance, the match dealt
// as play/setup.ts deals it) on the real swell (world/swell.ts, as play/game.ts builds it), every ship a bot, timed
// part by part (state.ts PARTS) for the first seconds of a match of SHIPS ships. Prints each part's median, 95th
// percentile and worst, ms a step, and the swell's reads: how many a step and what one costs.
//   node tools/steps.ts [seconds=60] [seed]      (npm run steps)

import { STEP } from '../src/sim/fixed.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { createMatches } from '../src/play/setup.ts';
import { PARTS, createState, type Part } from '../src/play/state.ts';
import { CASCADES } from '../src/world/cascades.ts';
import { FREQUENCY, anchors, icosphere } from '../src/world/lattice.ts';
import { SEED, createPlanet } from '../src/world/planet.ts';
import type { Vec3 } from '../src/world/sphere.ts';
import { createSwell } from '../src/world/swell.ts';
import { MEAN } from '../src/world/weather.ts';
import { createWind } from '../src/world/wind.ts';

/** A part's cost over the steps timed, ms: the median, the 95th percentile and the worst. */
export interface Cost { median: number; p95: number; worst: number }
/** Each part's cost and the whole step's; the swell's reads a step and what one costs, µs; the steps timed. */
export interface Steps { parts: [Part | 'step', Cost][]; reads: number; read: number; steps: number }

const costOf = (xs: number[]): Cost => {
  const s = [...xs].sort((a, b) => a - b);
  return { median: s[s.length >> 1], p95: s[Math.floor(0.95 * (s.length - 1))], worst: s[s.length - 1] };
};

/** The planet of a seed, its sea and its water sounded, built once for any number of runs. */
export function world(seed = SEED) {
  const planet = createPlanet(seed);
  const depth = (p: Vec3) => -planet.height(p);
  // the sea's charts as frame.ts lays them, but for the choice of offsets (which moves no cost)
  const sea = anchors(icosphere(FREQUENCY), createWind(seed), CASCADES[0]);
  return { seed, planet, sea, waters: { chart: chart(depth), water: berthing(depth) } };
}

/** The first `seconds` of a match of bots on the world, each step timed by its parts. */
export function steps(w: ReturnType<typeof world>, seconds = 60): Steps {
  const swell = createSwell(w.sea, w.planet.height, MEAN.wind);
  let reads = 0, reading = 0;
  const sea = (p: Vec3, time: number) => {
    const t = performance.now(), h = swell(p, time);
    reading += performance.now() - t;
    reads++;
    return h;
  };
  const matches = createMatches(w.seed, w.planet, null, null);
  const state = createState(w.planet, sea, w.waters, matches.first);
  state.start(matches.deal(), false);
  const idle = { course: null, throttle: 0 }, still = { aim: null, fire: false };
  const names: (Part | 'step')[] = [...PARTS, 'step'];
  const times = new Map(names.map((k): [Part | 'step', number[]] => [k, []]));
  let mark = 0;
  const lap = (part: Part) => {
    const t = performance.now();
    times.get(part)!.push(t - mark);
    mark = t;
  };
  const count = Math.round(seconds / STEP);
  [reads, reading] = [0, 0];
  for (let i = 0; i < count; i++) {
    const t = (mark = performance.now());
    state.advance(idle, still, undefined, lap);
    times.get('step')!.push(performance.now() - t);
  }
  return { parts: names.map((k) => [k, costOf(times.get(k)!)]), reads: reads / count, read: (1000 * reading) / Math.max(1, reads), steps: count };
}

if (import.meta.main) {
  const seconds = Number(process.argv[2] ?? 60), seed = Number(process.argv[3] ?? SEED);
  const t0 = performance.now(), w = world(seed);
  console.log(`world in ${(performance.now() - t0).toFixed(0)} ms`);
  const r = steps(w, seconds);
  console.log(`${r.steps} steps (${seconds} s); the swell read ${r.reads.toFixed(0)} times a step, ${r.read.toFixed(1)} µs a read`);
  console.log('part        median     p95   worst  (ms a step)');
  for (const [k, c] of r.parts) console.log(`${k.padEnd(10)} ${c.median.toFixed(3).padStart(7)} ${c.p95.toFixed(3).padStart(7)} ${c.worst.toFixed(3).padStart(7)}`);
}
