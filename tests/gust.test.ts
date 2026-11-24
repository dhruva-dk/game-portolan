import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleOf, crewOf, stepBattle, type Crew } from '../src/sim/battle.ts';
import type { Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import {
  charged,
  gustOf,
  startable,
  stepGust,
  toggled,
  type Gust,
} from '../src/sim/gust.ts';
import { GUST } from '../src/sim/handling.ts';
import { shipAt, step, type ShipState } from '../src/sim/ship.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { asked, crewed, NOTHING, stored } from '../src/sim/stores.ts';
import { GUST_METER } from '../src/sim/tuning.ts';
import {
  R,
  along,
  dot,
  frameAt,
  fromLatLon,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';
import { BEST, EVEN_SHIP, WORST } from './setups.ts';

const deep: Depth = () => 30;
const c0 = fromLatLon(0.1, 0.2);
const east = frameAt(c0).east;
const at = (m: number) => along(c0, east, m).p;
const vessel = (id: number, p: Vec3): Vessel => ({
  id,
  ship: shipAt(p, frameAt(p).north),
  shove: [0, 0, 0],
  engaged: [],
});
const CAPACITY = 5;

const run = (g: Gust, seconds: number, capacity = CAPACITY): Gust => {
  for (let t = 0; t < seconds - 1e-9; t += STEP)
    g = stepGust(g, capacity, STEP);
  return g;
};

test('its meter starts full at its capacity, and a tap turns it on, a tap off', () => {
  const g = gustOf(CAPACITY);
  assert.deepEqual(g, { meter: CAPACITY, on: false });
  assert.equal(charged(g, CAPACITY), 1);
  const on = toggled(g, CAPACITY);
  assert.equal(on.on, true);
  assert.equal(toggled(on, CAPACITY).on, false);
});

test('on, the meter drains a second a second; off, it refills at half that, up to its capacity', () => {
  let g = run(toggled(gustOf(CAPACITY), CAPACITY), 2);
  assert.ok(Math.abs(g.meter - (CAPACITY - 2 * GUST_METER.drain)) < 1e-6);
  assert.equal(GUST_METER.drain, 1);
  g = run(toggled(g, CAPACITY), 2);
  assert.ok(
    Math.abs(g.meter - (CAPACITY - 2 + 2 * GUST_METER.refill)) < 1e-6,
    `${g.meter}`
  );
  assert.equal(GUST_METER.refill, 0.5);
  assert.equal(run(g, 60).meter, CAPACITY, 'never past it');
});

test('empty, it turns off; below 30% of its capacity it cannot be turned on', () => {
  let g = toggled(gustOf(CAPACITY), CAPACITY),
    t = 0;
  while (g.on) {
    g = stepGust(g, CAPACITY, STEP);
    t += STEP;
  }
  assert.deepEqual(g, { meter: 0, on: false });
  assert.ok(Math.abs(t - CAPACITY / GUST_METER.drain) < 2 * STEP);
  assert.equal(toggled(g, CAPACITY), g, 'empty: stays off');
  const below = GUST_METER.least * CAPACITY - 0.1;
  g = run(g, below / (GUST_METER.refill * GUST_METER.drain));
  assert.ok(!startable(g, CAPACITY));
  assert.equal(toggled(g, CAPACITY).on, false);
  g = run(g, 0.4);
  assert.ok(startable(g, CAPACITY));
  assert.equal(toggled(g, CAPACITY).on, true);
  assert.equal(GUST_METER.least, 0.3);
});

test('its rigging: the level-100 Gust capacity blows longer than the level-0 one', () => {
  assert.ok(BEST.gustCapacity > WORST.gustCapacity);
  const lasts = (capacity: number) => {
    let g = toggled(gustOf(capacity), capacity),
      t = 0;
    while (g.on) {
      g = stepGust(g, capacity, STEP);
      t += STEP;
    }
    return t;
  };
  assert.ok(lasts(BEST.gustCapacity) > lasts(WORST.gustCapacity));
  const crew = (id: number) => crewOf(id, id === 1 ? BEST : WORST);
  assert.equal(crew(1).gust.meter, BEST.gustCapacity);
  assert.equal(crew(2).gust.meter, WORST.gustCapacity);
});

test('a ship asked for a Gust turns it on and sails with it; asked again, it turns it off; its meter runs in its stores', () => {
  let c: Crew = crewOf(1, EVEN_SHIP);
  const helm = { course: null, throttle: 1 };
  const tap = (crew: Crew) =>
    asked([crew], new Map([[1, { ...NOTHING, gust: true }]]));
  const on = tap(c);
  assert.deepEqual(on.blew, [1]);
  c = on.crews[0];
  assert.equal(crewed(helm, c).gust, true);
  for (let t = 0; t < 1; t += STEP)
    c = stored([c], { pieces: [], next: 0 }, [], [], STEP, deep, 1).crews[0];
  assert.ok(c.gust.meter < EVEN_SHIP.gustCapacity - 0.9);
  const off = tap(c);
  assert.deepEqual(off.blew, []);
  assert.equal(crewed(helm, off.crews[0]).gust, undefined);
});

test('bots use the same meter: a bot that wants a Gust cannot have one with its meter low', () => {
  const low: Crew = {
    ...crewOf(1, EVEN_SHIP),
    gust: { meter: 0.1, on: false },
  };
  const r = asked([low], new Map([[1, { ...NOTHING, gust: true }]]));
  assert.equal(r.crews[0].gust.on, false);
  assert.deepEqual(r.blew, []);
});

test('in a gust it runs well past its top and turns quicker; after it it sheds the speed back to its top', () => {
  let s: ShipState = { ...shipAt(c0, east), speed: EVEN_SHIP.topSpeed };
  const plain = step(
    s,
    { course: frameAt(c0).north, throttle: 1 },
    STEP,
    deep,
    EVEN_SHIP
  );
  for (let t = 0; t < 1; t += STEP)
    s = step(
      s,
      { course: null, throttle: 1, gust: true },
      STEP,
      deep,
      EVEN_SHIP
    );
  assert.ok(s.speed > EVEN_SHIP.topSpeed + 0.9 * GUST.speed, `${s.speed}`);
  const quick = step(
    { ...shipAt(c0, east), speed: EVEN_SHIP.topSpeed },
    { course: frameAt(c0).north, throttle: 1, gust: true },
    STEP,
    deep,
    EVEN_SHIP
  );
  assert.ok(quick.turn > plain.turn * 1.3);
  for (let t = 0; t < 1; t += STEP)
    s = step(s, { course: null, throttle: 1 }, STEP, deep, EVEN_SHIP);
  assert.ok(
    s.speed > EVEN_SHIP.topSpeed + GUST.speed - GUST.shed * 1.1 &&
      s.speed < EVEN_SHIP.topSpeed + GUST.speed,
    'shed at its rate'
  );
  for (let t = 0; t < 5; t += STEP)
    s = step(s, { course: null, throttle: 1 }, STEP, deep, EVEN_SHIP);
  assert.ok(Math.abs(s.speed - EVEN_SHIP.topSpeed) < 1e-9);
});

test('a ball fired in a gust goes off wider', () => {
  const fleet = [vessel(1, c0), vessel(2, at(150))];
  const spreadOf = (on: boolean) => {
    let worst = 0;
    for (let seed = 0; seed < 40; seed++) {
      const b = battleOf(
        [
          { ...crewOf(1, EVEN_SHIP), gust: { meter: 1, on } },
          crewOf(2, EVEN_SHIP),
        ],
        seed
      );
      const r = stepBattle(
        b,
        fleet,
        [
          {
            aim: { from: scale(c0, R + 20), dir: frameAt(c0).north },
            fire: true,
          },
          { aim: null, fire: false },
        ],
        [],
        STEP,
        deep
      );
      worst = Math.max(worst, Math.abs(dot(r.shots[0].dirs[0], east)));
    }
    return worst;
  };
  assert.ok(spreadOf(true) > spreadOf(false) * 1.3);
});
