// What a step of the match costs, by its parts: the game's own step (play/state.ts start and advance, the match dealt
// as play/setup.ts deals it) on the real swell (world/swell.ts, as play/game.ts builds it), every ship a bot, timed
// part by part (state.ts PARTS) for the first seconds of a match of SHIPS ships. Prints each part's median, 95th
// percentile and worst, ms a step, and the swell's reads: how many a step and what one costs. Then what the water's
// copy of the cells costs a frame (claimedCosts). Fails (exit 1) over LIMIT: the times `npm test` leaves out, as they
// are the machine's.
//   node tools/steps.ts [seconds=60] [seed]      (npm run steps)

import { STEP } from '../src/sim/fixed.ts';
import type { Sea } from '../src/snapshot.ts';
import { createClaimed } from '../src/water/claimed.ts';
import { random } from '../src/world/random.ts';
import { halfLoop, match } from './seas.ts';
import { RIDE } from '../src/sim/ride.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { createMatches } from '../src/play/setup.ts';
import { PARTS, createState, type Part } from '../src/play/state.ts';
import { CASCADES } from '../src/world/cascades.ts';
import { FREQUENCY, anchors, icosphere } from '../src/world/lattice.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/world/planet.ts';
import type { Vec3 } from '../src/world/sphere.ts';
import { createSwell, type Hull } from '../src/world/swell.ts';
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
  const planet = planetOf(seed, landOf(seed));
  const depth = (p: Vec3) => -planet.height(p);
  // the sea's charts as frame.ts lays them, but for the choice of offsets (which moves no cost)
  const sea = anchors(icosphere(FREQUENCY), createWind(seed), CASCADES[0]);
  return { seed, planet, sea, waters: { chart: chart(depth), water: berthing(depth) } };
}

/** The first `seconds` of a match of bots on the world, each step timed by its parts. */
export function steps(w: ReturnType<typeof world>, seconds = 60): Steps {
  const swell = createSwell(w.sea, w.planet.height, MEAN.wind, { shortest: RIDE.shortest }).hull;
  let reads = 0, reading = 0;
  const sea: Hull = (at, heading, reach, rail, time) => {
    const t = performance.now(), under = swell(at, heading, reach, rail, time);
    reading += performance.now() - t;
    reads++;
    return under;
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

/** What the water's copy of the cells (water/claimed.ts) costs a frame, ms, on the seas of tools/seas.ts: the mean
 *  frame of two matches followed (frames now and then missed), the middle one of the frames that took a sea whole, and
 *  the worst frame of a loop round half the planet drawn (the best of five runs). */
export function claimedCosts(): { frame: number; whole: number; loop: number } {
  const claimed = createClaimed(), draw = random(17), wholes: number[] = [];
  let wait = 0, frames = 0, spent = 0, clock = 0;
  const frame = (sea: Sea | undefined, time = clock) => {
    const t0 = performance.now(), taken = claimed.follow(sea);
    claimed.work((clock = time));
    const ms = performance.now() - t0;
    if (taken && sea) wholes.push(ms);
    else [spent, frames] = [spent + ms, frames + 1];
  };
  for (const generation of [1, 2]) {
    let last: Sea | undefined;
    match(generation * 101, generation, 3600, (sea, time) => {
      last = sea;
      if (wait-- > 0) return;
      wait = draw() < 0.004 ? 300 : draw() < 0.5 ? 1 : 0;
      frame(sea, time);
    });
    frame(last);
    for (let f = 0; f < 600 && !claimed.idle(); f++) frame(last, clock + 1 / 60);
    for (let f = 0; f < 600 && (f === 0 || !claimed.idle()); f++) frame(undefined);
  }
  const { before, after, time } = halfLoop();
  let loop = Infinity;
  for (let run = 0; run < 5; run++) {
    const c = createClaimed();
    c.follow(before);
    c.follow(after);
    let worst = 0;
    for (let f = 0; f < 600 && !c.idle(); f++) {
      const t0 = performance.now();
      c.work(time + f / 60);
      worst = Math.max(worst, performance.now() - t0);
    }
    loop = Math.min(loop, worst);
  }
  return { frame: spent / frames, whole: wholes.sort((a, b) => a - b)[wholes.length >> 1], loop };
}

/** The most a step and the water's frame may cost, ms: the median step (wide enough that a busy machine passes,
 *  narrow enough that the ride's cost coming back, 8 ms and more a step, fails); the water's mean frame, the middle
 *  frame taking a sea whole, and the worst frame of the loop round half the planet. */
export const LIMIT = { step: 5, frame: 0.5, whole: 6, loop: 8 };

if (import.meta.main) {
  const seconds = Number(process.argv[2] ?? 60), seed = Number(process.argv[3] ?? SEED);
  const t0 = performance.now(), w = world(seed);
  console.log(`world in ${(performance.now() - t0).toFixed(0)} ms`);
  const r = steps(w, seconds);
  console.log(`${r.steps} steps (${seconds} s); the swell read under ${r.reads.toFixed(0)} hulls a step, ${r.read.toFixed(1)} µs a hull`);
  console.log('part        median     p95   worst  (ms a step)');
  for (const [k, c] of r.parts) console.log(`${k.padEnd(10)} ${c.median.toFixed(3).padStart(7)} ${c.p95.toFixed(3).padStart(7)} ${c.worst.toFixed(3).padStart(7)}`);
  const c = claimedCosts();
  console.log(`the water's cells: ${c.frame.toFixed(3)} ms a frame, ${c.whole.toFixed(2)} ms a frame taking a sea whole, ${c.loop.toFixed(2)} ms the worst frame of a loop round half the planet`);
  const step = r.parts.find(([k]) => k === 'step')![1].median;
  const over = [
    step >= LIMIT.step && `the median step ${step.toFixed(2)} ms (under ${LIMIT.step})`,
    c.frame >= LIMIT.frame && `the water's mean frame ${c.frame.toFixed(3)} ms (under ${LIMIT.frame})`,
    c.whole >= LIMIT.whole && `the water's frame taking a sea whole ${c.whole.toFixed(2)} ms (under ${LIMIT.whole})`,
    c.loop >= LIMIT.loop && `the water's worst frame of the half-planet loop ${c.loop.toFixed(2)} ms (under ${LIMIT.loop})`,
  ].filter((x) => x);
  console.log(over.length ? `OVER: ${over.join('; ')}` : `ok: the median step under ${LIMIT.step} ms; the water's frames under ${LIMIT.frame} ms on the mean, ${LIMIT.whole} ms taking a sea whole, ${LIMIT.loop} ms at worst`);
  process.exit(over.length ? 1 : 0);
}
