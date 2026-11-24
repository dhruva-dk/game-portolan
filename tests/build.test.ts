import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  battleOf,
  crewOf,
  fitOf,
  stepBattle,
  weathered,
  type Crew,
} from '../src/sim/battle.ts';
import { afloat } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf } from '../src/sim/gun.ts';
import { HEALTH, SPEC } from '../src/sim/handling.ts';
import { harmed, healed, hullCap } from '../src/sim/health.ts';
import { USES, useful } from '../src/sim/hold.ts';
import { shipAt, step } from '../src/sim/ship.ts';
import { dot, frameAt, fromLatLon, scale } from '../src/world/sphere.ts';

type Build = { top: number; gather: number; spread: number; hull: number };
const crew = (over: Partial<Build> = {}): Crew => {
  const b: Build = { top: 1, gather: 1, spread: 1, hull: 1, ...over },
    most = HEALTH.hull * b.hull;
  return {
    ...crewOf(1),
    health: { ...crewOf(1).health, hull: most, most },
    build: {
      fit: {
        ...SPEC,
        top: SPEC.top * b.top,
        gather: SPEC.gather * b.gather,
        spread: SPEC.spread / b.spread,
      },
    },
  };
};
const here = fromLatLon(0.2, 0.3),
  deep = () => 30;

test('its own handling sails it: better rigging gathers way sooner to the same top, better sails a higher top', () => {
  const sailed = (c: Crew, seconds: number) => {
    let s = shipAt(here, frameAt(here).east);
    for (let i = 0; i < seconds / STEP; i++)
      s = step(s, { course: null, throttle: 1 }, STEP, deep, fitOf(c));
    return s.speed;
  };
  const spec = crew(),
    rigged = crew({ gather: 1.3 }),
    canvas = crew({ top: 1.1 });
  assert.ok(sailed(rigged, 1) > sailed(spec, 1) + 0.5);
  assert.ok(Math.abs(sailed(rigged, 30) - sailed(spec, 30)) < 1e-6);
  assert.ok(Math.abs(sailed(spec, 30) - SPEC.top) < 1e-6);
  assert.ok(Math.abs(sailed(canvas, 30) - SPEC.top * 1.1) < 1e-6);
});

test("its keel steadies its guns: the same draw goes off closer to the gun's line", () => {
  const off = (keel: number) => {
    const c = { ...crew({ spread: keel }), ...armed() },
      v = afloat(1, shipAt(here, frameAt(here).east));
    let b = battleOf([c], 9);
    for (let i = 0; i < 200; i++) {
      const r = stepBattle(b, [v], [{ aim: null, fire: true }], [], STEP, deep);
      b = r.battle;
      const dir = r.shots[0]?.dirs[0];
      if (dir) return dir;
    }
    throw new Error('it never fired');
  };
  const armed = () => ({ guns: crewOf(1, gunOf('cannon', 0)).guns });
  const true0 = off(1e9),
    away = (keel: number) => Math.acos(Math.min(1, dot(off(keel), true0)));
  assert.ok(away(1) > 1e-4, 'a spec keel: the gun spreads');
  assert.ok(Math.abs(away(2) / away(1) - 0.5) < 0.01, 'twice the keel: half');
  assert.ok(away(0.5) > 1.9 * away(1), 'half the keel: twice');
});

test('its most hull is its own: the storm takes its share of it, its stores mend up to their share of it, and a blow leaves it its own', () => {
  const stout = crew({ hull: 1.2 }),
    spec = crew();
  const blown = harmed(stout.health, 70).health;
  assert.deepEqual(blown, { hull: 50, shield: 0, most: 120 });
  const cap = USES.repairKit.cap;
  assert.equal(hullCap(blown, cap), 90);
  assert.equal(healed(blown, 100, 'hull', cap).hull, 90);
  assert.equal(healed(blown, 100, 'hull').hull, 120);
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
