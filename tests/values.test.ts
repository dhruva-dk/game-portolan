import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  battleOf,
  crewOf,
  stepBattle,
  weathered,
  type Crew,
} from '../src/sim/battle.ts';
import { afloat } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf } from '../src/sim/gun.ts';
import { HEALTH } from '../src/sim/handling.ts';
import { harmed, healed, sunk } from '../src/sim/health.ts';
import { useful } from '../src/sim/hold.ts';
import type { ShipValues } from '../src/sim/setup.ts';
import { shipAt, step, turned, type Sailing } from '../src/sim/ship.ts';
import { dot, frameAt, fromLatLon, scale } from '../src/world/sphere.ts';
import { BEST, EVEN_SHIP, WORST } from './setups.ts';

const here = fromLatLon(0.2, 0.3),
  deep = () => 30;

const only = <K extends keyof ShipValues>(
  key: K,
  from: ShipValues
): ShipValues => ({ ...EVEN_SHIP, [key]: from[key] });

const sailed = (fit: Sailing, seconds: number, turning = false) => {
  let s = shipAt(here, frameAt(here).east),
    quickest = 0;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    s = step(
      s,
      { course: turning ? turned(s, 2) : null, throttle: 1 },
      STEP,
      deep,
      fit
    );
    quickest = Math.max(quickest, Math.abs(s.turn));
  }
  return { speed: s.speed, quickest };
};

test('its sails: the level-100 top speed reaches a higher speed than the level-0 one', () => {
  const low = sailed(only('topSpeed', WORST), 60).speed,
    high = sailed(only('topSpeed', BEST), 60).speed;
  assert.ok(high > low, `${high} against ${low}`);
  assert.ok(Math.abs(low - WORST.topSpeed) < 1e-6, `${low}`);
  assert.ok(Math.abs(high - BEST.topSpeed) < 1e-6, `${high}`);
});

test('its rigging: the level-100 gather gathers way faster than the level-0 one', () => {
  const low = sailed(only('gather', WORST), 1).speed,
    high = sailed(only('gather', BEST), 1).speed;
  assert.ok(high > low, `${high} against ${low}`);
});

test('its rudder: the level-100 turn rate turns tighter than the level-0 one', () => {
  const low = sailed(only('turnRate', WORST), 10, true).quickest,
    high = sailed(only('turnRate', BEST), 10, true).quickest;
  assert.ok(high > low, `${high} against ${low}`);
});

test('its hull: the level-100 hull survives the blows that sink the level-0 one', () => {
  const blow = (WORST.hullPoints + BEST.hullPoints) / 2;
  const low = harmed(crewOf(1, only('hullPoints', WORST)).health, blow),
    high = harmed(crewOf(1, only('hullPoints', BEST)).health, blow);
  assert.ok(sunk(low.health));
  assert.ok(!sunk(high.health));
});

const firstShot = (values: ShipValues) => {
  const v = afloat(1, shipAt(here, frameAt(here).east));
  let b = battleOf([crewOf(1, values, gunOf('cannon', 0))], 9);
  for (let i = 0; i < 200; i++) {
    const r = stepBattle(b, [v], [{ aim: null, fire: true }], [], STEP, deep);
    b = r.battle;
    const dir = r.shots[0]?.dirs[0];
    if (dir) return dir;
  }
  throw new Error('it never fired');
};

test('its keel: the level-100 spread factor groups its shots tighter than the level-0 one, by the factor', () => {
  const line = firstShot({ ...EVEN_SHIP, spreadFactor: 1e-9 });
  const away = (values: ShipValues) =>
    Math.acos(Math.min(1, dot(firstShot(values), line)));
  const low = away(only('spreadFactor', WORST)),
    high = away(only('spreadFactor', BEST));
  assert.ok(high < low, `${high} against ${low}`);
  assert.ok(
    Math.abs(high / low - BEST.spreadFactor / WORST.spreadFactor) < 0.01,
    `${high / low}`
  );
});

test('its mounts: the level-100 reload factor fires again sooner than the level-0 one', () => {
  const shotsIn = (values: ShipValues, seconds: number) => {
    const v = afloat(1, shipAt(here, frameAt(here).east));
    let b = battleOf([crewOf(1, values, gunOf('cannon', 0))], 9);
    const at: number[] = [];
    for (let i = 1; i <= Math.round(seconds / STEP); i++) {
      const r = stepBattle(b, [v], [{ aim: null, fire: true }], [], STEP, deep);
      b = r.battle;
      if (r.shots.length) at.push(i * STEP);
    }
    return at;
  };
  const low = shotsIn(only('reloadFactor', WORST), 10),
    high = shotsIn(only('reloadFactor', BEST), 10);
  assert.ok(high.length > low.length, `${high.length} against ${low.length}`);
});

test('its hull points are its own: the storm takes its share of them, its stores mend up to their share of them, a blow leaves them its own', () => {
  const stout: Crew = crewOf(1, { ...EVEN_SHIP, hullPoints: 120 }),
    spec: Crew = crewOf(1, { ...EVEN_SHIP, hullPoints: 100 });
  const blown = harmed(stout.health, 70).health;
  assert.deepEqual(blown, { hull: 50, shield: 0, most: 120 });
  assert.equal(healed(blown, 100, 'hull').hull, 120);
  assert.equal(healed(blown, 100, 'hull', 90).hull, 90);
  assert.equal(useful({ ...blown, hull: 80 }, 'repairKit'), true);
  assert.equal(useful({ ...spec.health, hull: 80 }, 'repairKit'), false);
  assert.equal(healed(blown, 100, 'shield').shield, HEALTH.shield);
  const v = afloat(1, shipAt(here, frameAt(here).east)),
    storm = { center: scale(here, -1), radius: 0.1, damage: 0.1 };
  const after = (c: Crew) =>
    weathered(battleOf([c], 1), [v], storm, 1).battle.crews[0].health.hull;
  assert.ok(Math.abs(after(spec) - 90) < 1e-9);
  assert.ok(Math.abs(after(stout) - 108) < 1e-9);
});
