import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GALE, HOLD, berth, botLeaps, markLeap, openAt, seatAt, startDrop, stepDrop, type Drop, type Flyer, type Leap } from '../src/sim/drop.ts';
import { STEP } from '../src/sim/fixed.ts';
import { SHIP } from '../src/sim/handling.ts';
import { createStorm } from '../src/sim/storm.ts';
import { createPlanet } from '../src/world/planet.ts';
import { R, along, cross, distance, scale, type Vec3 } from '../src/world/sphere.ts';

const SHIPS = 20;
const planets = new Map<number, ReturnType<typeof createPlanet>>();
const world = (seed: number) => {
  if (!planets.has(seed)) planets.set(seed, createPlanet(seed));
  const planet = planets.get(seed)!, depth = (p: Vec3) => -planet.height(p);
  return { depth, sites: planet.islands.map((i) => i.chart.at), first: createStorm(seed, depth)(0).next };
};

/** A whole drop: the player (0) leaving at `leaveAt` s (never: thrown off) and gliding for `mark` if given, the
 * rest bots; the ships down held still where they touched. Every step's ships, and every touch-down. */
function sail(seed: number, leaveAt = Infinity, mark: Vec3 | null = null) {
  const { depth, sites, first } = world(seed);
  const ids = Array.from({ length: SHIPS }, (_, i) => i);
  let d: Drop = startDrop(seed, ids, ids.slice(1), sites, first, depth);
  const down: Flyer[] = [], frames: { at: Vec3; height: number }[][] = [];
  for (let i = 0; i < 200 / STEP && d.flyers.length; i++) {
    const bots = botLeaps(d);
    const me = d.flyers.find((f) => f.id === 0);
    const leaps = new Map<number, Leap>(bots.leaps);
    if (me) leaps.set(0, me.stage === 'gale' ? { ...HOLD, leave: d.t >= leaveAt } : mark ? markLeap(me, mark) : HOLD);
    const r = stepDrop(bots.drop, leaps, STEP, depth, down.map((f) => f.at));
    d = r.drop;
    down.push(...r.landed);
    frames.push([...d.flyers, ...down]);
  }
  return { d, down, frames, depth };
}

test('the Gale seats the fleet well apart, more than a hull length', () => {
  const { depth, sites, first } = world(3);
  const d = startDrop(3, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [], sites, first, depth);
  for (const a of d.flyers) for (const b of d.flyers) if (a !== b) assert.ok(distance(a.at, b.at) >= GALE.lane - 1, `${distance(a.at, b.at)}`);
  assert.ok(GALE.lane > SHIP.length * 1.5 && GALE.rank > SHIP.length * 1.5);
  // and they stay in their seats as it blows
  const s = seatAt(d.gale, 3, 10), t = seatAt(d.gale, 3, 11);
  assert.ok(Math.abs(distance(s.at, t.at) - (GALE.arc * R) / GALE.time) < 0.5);
});

test('the same seed makes the same drop; another seed another', () => {
  const a = sail(3, 12), b = sail(3, 12), c = sail(4, 12);
  assert.deepEqual(a.down, b.down);
  assert.notDeepEqual(a.down.map((f) => f.at), c.down.map((f) => f.at));
});

for (const seed of [3, 4, 5]) {
  test(`seed ${seed}: every ship comes down, on open water, never nearer another than a hull length`, () => {
    const { d, down, frames, depth } = sail(seed, 8 + seed);
    assert.equal(d.flyers.length, 0, 'some never came down');
    assert.equal(down.length, SHIPS);
    for (const f of down) assert.ok(openAt(f.at, depth), `ship ${f.id} came down on land or in shoal water`);
    let least = Infinity;
    for (const ships of frames) {
      for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
        const p = scale(ships[i].at, R + ships[i].height), q = scale(ships[j].at, R + ships[j].height);
        least = Math.min(least, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      }
    }
    assert.ok(least >= SHIP.length, `two ships came within ${least.toFixed(1)} m`);
    // the bots spread over the planet, not all to one spot
    const spread = Math.max(...down.map((a) => Math.max(...down.map((b) => distance(a.at, b.at)))));
    assert.ok(spread > 300, `all came down within ${spread.toFixed(0)} m`);
  });
}

test('the Gale throws off whoever is still aboard as it blows out', () => {
  const { frames, down } = sail(3);
  const me = down.find((f) => f.id === 0)!;
  assert.ok(me);
  // she left at 35 s from 350 m, falling 10 m/s: down at about 70 s
  const at = frames.findIndex((ships) => ships.some((s) => s === me)) * STEP;
  assert.ok(at > GALE.time + 30 && at < GALE.time + 40, `${at}`);
});

test('she glides for her mark and comes down close to it', () => {
  const { depth, sites, first } = world(3);
  // open water 500 m on from where she leaves, and 150 m to one side: well within a glide
  const gale = startDrop(3, [0], [], sites, first, depth).gale, seat = seatAt(gale, 0, 10);
  const ahead = along(seat.at, seat.heading, 500), aside = along(ahead.p, cross(ahead.p, ahead.t), 150).p;
  const mark = berth(aside, depth, [], 200)!;
  assert.ok(mark);
  const marked = sail(3, 10, mark).down.find((f) => f.id === 0)!;
  assert.ok(distance(marked.at, mark) < GALE.pick + GALE.apart, `${distance(marked.at, mark).toFixed(0)} m off`);
});

test('no ship may leave before the Gale has taken her up', () => {
  const { depth, sites, first } = world(3);
  let d = startDrop(3, [0, 1], [], sites, first, depth);
  const go = new Map([[0, { ...HOLD, leave: true }]]);
  for (let t = 0; t < GALE.allowed - 0.2; t += STEP) d = stepDrop(d, go, STEP, depth, []).drop;
  assert.equal(d.flyers[0].stage, 'gale');
  for (let t = 0; t < 0.4; t += STEP) d = stepDrop(d, go, STEP, depth, []).drop;
  assert.equal(d.flyers[0].stage, 'glide');
});
