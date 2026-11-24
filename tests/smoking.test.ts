// Which ships smoke and how much (gunfire/smoking.ts): the nearest few within
// sight, thinner the farther and close by the eye, and all of it within its
// budget; and in a match, each ship's wear her hull's.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEED } from '../src/environment.ts';
import { createMatches } from '../src/play/setup.ts';
import { createState } from '../src/play/state.ts';
import { wearOf } from '../src/sim/health.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import type { ShipDraw } from '../src/snapshot.ts';
import {
  CLOSE,
  LIFE_SPREAD,
  MOST_RATE,
  SMOKING,
  WORN,
  smokers,
  type Smoker,
} from '../src/gunfire/smoking.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { R, type Vec3 } from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

/** A ship `metres` round the sea from under the eye. */
const ship = (
  id: number,
  metres: number,
  wear: ShipDraw['wear'],
  afloat = true
): ShipDraw => {
  const a = metres / R;
  return {
    id,
    pose: {
      position: [R * Math.sin(a), R * Math.cos(a), 0],
      forward: [0, 0, 1],
      up: [Math.sin(a), Math.cos(a), 0],
    },
    look: { paint: [0.5, 0.4, 0.3], sail: [0.8, 0.1, 0.1], pattern: 'plain' },
    velocity: [0, 0, 0],
    afloat,
    gun: null,
    wear,
  };
};
/** An eye `height` metres over the sea. */
const eyeAt = (height: number): [number, number, number] => [0, R + height, 0];
const plan = (ships: ShipDraw[], height = 150) => {
  const out: Smoker[] = [];
  const n = smokers(ships, eyeAt(height), out);
  return out.slice(0, n);
};
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('the nearest SMOKING.most smoke, nearest first', () => {
  const ships = Array.from({ length: 12 }, (_, i) => ship(i, 240 - 20 * i, 2));
  const p = plan(ships);
  assert.equal(p.length, SMOKING.most);
  assert.deepEqual(
    p.map((m) => m.ship.id),
    [11, 10, 9, 8, 7, 6, 5, 4]
  );
  for (let i = 1; i < p.length; i++)
    assert.ok((p[i]?.away ?? 0) >= (p[i - 1]?.away ?? 0));
  // the same, frame after frame, its entries kept
  const out: Smoker[] = [];
  smokers(ships, eyeAt(150), out);
  const kept = new Set(out);
  smokers(ships, eyeAt(150), out);
  assert.ok(out.every((m) => kept.has(m)) && out.length === kept.size);
});

test('none past SMOKING.far, nor over the horizon', () => {
  // from high over the sea, ships every 20 m out: those within SMOKING.far of
  // the eye smoke, none beyond
  const eye = eyeAt(300),
    ships = Array.from({ length: 30 }, (_, i) => ship(i, 20 * i, 1)),
    away = (s: ShipDraw) => {
      const p = s.pose.position;
      return Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
    };
  const out: Smoker[] = [],
    n = smokers(ships, eye, out);
  const within = ships.filter((s) => away(s) <= SMOKING.far);
  assert.ok(within.length > 0 && within.length < ships.length);
  assert.equal(n, Math.min(within.length, SMOKING.most));
  for (const m of out.slice(0, n)) assert.ok(m.away <= SMOKING.far);
  // from 8 m up, a ship 250 m off is under the horizon; from 150 m, not
  assert.equal(plan([ship(1, 250, 2)], 8).length, 0);
  assert.equal(plan([ship(1, 250, 2)], 150).length, 1);
});

test('only the worn smoke, and only afloat', () => {
  const [wisps] = plan([ship(1, 50, 1)]);
  assert.ok(wisps && wisps.wear > 0);
  assert.equal(plan([ship(1, 50, 0)]).length, 0);
  // nor does a ship sinking
  assert.equal(plan([ship(1, 50, 2, false)]).length, 0);
});

test('fewer puffs the farther, from SMOKING.near on; thinner close by the eye', () => {
  // (an eye just over the sea, so her distance is near what she is round it)
  const at = (metres: number) => plan([ship(1, metres, 2)], 0.5)[0];
  const full = at(SMOKING.near - 1),
    twice = at(2 * SMOKING.near);
  assert.ok(full && twice);
  near(full.wear, WORN[2].rate);
  const by = SMOKING.near / twice.away;
  assert.ok(by > 0.45 && by < 0.55);
  near(twice.wear, WORN[2].rate * by);
  // close by the eye: her smoke at CLOSE's share, and less of it lower (its
  // closeness 0)
  const close = at(SMOKING.close[0] - 2);
  assert.ok(close);
  assert.equal(close.close, 0);
  near(close.wear, WORN[2].rate * CLOSE.rate);
  assert.equal(at(SMOKING.close[1] + 1)?.close, 1);
  const between = at((SMOKING.close[0] + SMOKING.close[1]) / 2);
  assert.ok(between && between.close > 0.3 && between.close < 0.7);
});

test('all of it together keeps no more than SMOKING.alive puffs alive, a quarter of the ring at most', () => {
  const ships = Array.from({ length: 20 }, (_, i) =>
    ship(i, SMOKING.close[1] + 1 + i * 0.1, 2)
  );
  const all = plan(ships, 0.5),
    sum = all.reduce((s, m) => s + m.wear, 0);
  assert.equal(all.length, SMOKING.most);
  assert.ok(sum <= MOST_RATE + 1e-9, `${sum} a second`);
  // what lives longest, at the most a second, is all that can be alive
  const longest = (WORN[2]?.life ?? 0) * LIFE_SPREAD;
  assert.ok(MOST_RATE * longest <= SMOKING.alive + 1e-9);
  assert.ok(SMOKING.alive <= 4096 / 4);
  // under it, nothing is scaled
  const one = plan([ship(1, SMOKING.near - 1, 2)], 0.5)[0];
  assert.ok(one);
  near(one.wear, 8);
});

test("in the game's own match, every ship drawn shows her wear", () => {
  const planet = planetOf(SEED, landOf(SEED)),
    depth = (p: Vec3) => -planet.height(p),
    matches = createMatches(SEED, planet, null, null),
    state = createState(
      planet,
      flat,
      { chart: chart(depth), water: berthing(depth) },
      matches.first
    );
  state.start(matches.deal(), false);
  const idle = { course: null, throttle: 0 },
    still = { aim: null, fire: false };
  let worn = false;
  while (state.time() < 400 && !worn) {
    state.advance(idle, still);
    for (const d of state.drawn(1)) {
      if (!d.afloat) continue;
      assert.equal(d.wear, wearOf(state.crew(d.id).health));
      worn ||= d.wear > 0;
    }
  }
  assert.ok(worn, 'a ship was worn');
});
