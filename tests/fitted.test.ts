import { test } from 'node:test';
import assert from 'node:assert/strict';
import { specField } from '../src/play/race.ts';
import type { Fitted, PartType, RaceShip } from '../src/sim/race.ts';
import {
  battleOf,
  crewOf,
  fitOf,
  stepBattle,
  weathered,
  type Crew,
} from '../src/sim/battle.ts';
import { afloat } from '../src/sim/contact.ts';
import { fitted } from '../src/play/fitted.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf } from '../src/sim/gun.ts';
import { HEALTH, SPEC } from '../src/sim/handling.ts';
import { harmed, healed, hullCap } from '../src/sim/health.ts';
import { USES, useful } from '../src/sim/hold.ts';
import { shipAt, step } from '../src/sim/ship.ts';
import { dot, frameAt, fromLatLon, scale } from '../src/world/sphere.ts';

const SHIP = specField(5, 1).ships[1];
const built = (over: Partial<Record<PartType, Partial<Fitted>>>): RaceShip => ({
  ...SHIP,
  parts: {
    ...SHIP.parts,
    ...Object.fromEntries(
      Object.entries(over).map(([p, f]) => [p, { ...SHIP.parts.sails, ...f }])
    ),
  },
});
const crew = (over: Partial<Record<PartType, Partial<Fitted>>> = {}): Crew =>
  fitted(crewOf(1), built(over));
const here = fromLatLon(0.2, 0.3),
  deep = () => 30;

test("a spec ship is the tables' own: their handling, their hull; a match with no card fits nothing", () => {
  const c = crew();
  assert.deepEqual(c.build?.fit, SPEC);
  assert.deepEqual(c.health, {
    hull: HEALTH.hull,
    shield: HEALTH.start,
    most: HEALTH.hull,
  });
  for (const cap of [25, 75, 100]) assert.equal(hullCap(c.health, cap), cap);
  const bare = crewOf(1);
  assert.equal(fitted(bare), bare);
  assert.equal(fitOf(bare), SPEC);
});

test('performance makes its handling: sails its top speed, rigging its gathering way, rudder its turn, hull its most hull, keel its spread, mounts its reload', () => {
  const fit = (over: Parameters<typeof crew>[0]) => crew(over).build?.fit;
  assert.deepEqual(fit({ sails: { performance: 1.1 } }), {
    ...SPEC,
    top: SPEC.top * 1.1,
  });
  assert.deepEqual(fit({ rigging: { performance: 1.2 } }), {
    ...SPEC,
    gather: SPEC.gather * 1.2,
  });
  assert.deepEqual(fit({ rudder: { performance: 0.9 } }), {
    ...SPEC,
    turn: SPEC.turn * 0.9,
  });
  assert.deepEqual(fit({ keel: { performance: 1.25 } }), {
    ...SPEC,
    spread: 0.8,
  });
  assert.deepEqual(fit({ mounts: { performance: 1.25 } }), {
    ...SPEC,
    reload: 0.8,
  });
  const stout = crew({ hull: { performance: 1.2 } });
  assert.deepEqual(stout.build?.fit, SPEC);
  assert.deepEqual(stout.health, { hull: 120, shield: 0, most: 120 });
});

test('its own handling sails it: better rigging gathers way sooner to the same top, better sails a higher top', () => {
  const sailed = (c: Crew, seconds: number) => {
    let s = shipAt(here, frameAt(here).east);
    for (let i = 0; i < seconds / STEP; i++)
      s = step(s, { course: null, throttle: 1 }, STEP, deep, fitOf(c));
    return s.speed;
  };
  const spec = crew(),
    rigged = crew({ rigging: { performance: 1.3 } }),
    canvas = crew({ sails: { performance: 1.1 } });
  assert.ok(sailed(rigged, 1) > sailed(spec, 1) + 0.5);
  assert.ok(Math.abs(sailed(rigged, 30) - sailed(spec, 30)) < 1e-6);
  assert.ok(Math.abs(sailed(spec, 30) - SPEC.top) < 1e-6);
  assert.ok(Math.abs(sailed(canvas, 30) - SPEC.top * 1.1) < 1e-6);
});

test("its keel steadies its guns: the same draw goes off closer to the gun's line", () => {
  const off = (keel: number) => {
    const c = { ...crew({ keel: { performance: keel } }), ...armed() },
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
  const stout = crew({ hull: { performance: 1.2 } }),
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

test('a card with a part of no performance is refused', () => {
  assert.throws(() => crew({ keel: { performance: 0 } }), /ship 1's keel/);
});
