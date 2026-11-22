// A ship fitted out by her card (play/fitted.ts, MANAGER.md 3 point 5): her
// parts' performance makes her handling and her most hull, their reliability
// the hull at which her zones fault. A spec ship is the tables' own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { specField } from '../src/play/race.ts';
import type { Fitted, PartType, RaceShip } from '../src/race.ts';
import {
  battleOf,
  crewOf,
  stepBattle,
  weathered,
  type Crew,
} from '../src/sim/battle.ts';
import { afloat } from '../src/sim/contact.ts';
import { FAULTS, faultsIn, faultsOf, fitOf } from '../src/sim/faults.ts';
import { FITTED, fitted } from '../src/play/fitted.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf } from '../src/sim/gun.ts';
import { HEALTH, SPEC } from '../src/sim/handling.ts';
import { harmed, healed, hullCap } from '../src/sim/health.ts';
import { USES, useful } from '../src/sim/hold.ts';
import { shipAt, step } from '../src/sim/ship.ts';
import { dot, frameAt, fromLatLon, scale } from '../src/world/sphere.ts';

const SHIP = specField(5, 1).ships[1];
/** A spec ship but for the parts given. */
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

test("a spec ship is the tables' own: their handling, their bands, their hull; a match with no card fits nothing", () => {
  const c = crew();
  assert.deepEqual(c.build?.fit, SPEC);
  assert.deepEqual(
    c.build?.bands,
    [0, 1, 2, 3].map(() => ({ minor: FAULTS.minor, major: FAULTS.major }))
  );
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

test('performance makes her handling: sails her top speed, rigging her gathering way, rudder her turn, hull her most hull, keel her spread, mounts her reload', () => {
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

test('her own handling sails her: better rigging gathers way sooner to the same top, better sails a higher top', () => {
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

test("her keel steadies her guns: the same draw goes off closer to the gun's line", () => {
  /** How far off her heading her first ball flies, radians. */
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
    throw new Error('she never fired');
  };
  const armed = () => ({ guns: crewOf(1, gunOf('cannon', 0)).guns });
  const true0 = off(1e9),
    away = (keel: number) => Math.acos(Math.min(1, dot(off(keel), true0)));
  assert.ok(away(1) > 1e-4, 'a spec keel: the gun spreads');
  assert.ok(Math.abs(away(2) / away(1) - 0.5) < 0.01, 'twice the keel: half');
  assert.ok(away(0.5) > 1.9 * away(1), 'half the keel: twice');
});

test("reliability moves the hull her zones fault at: 0.5 the tables', the most reliable less by FITTED.sway of them, the least as much more; each zone by its own parts", () => {
  const bands = (over: Parameters<typeof crew>[0]) => crew(over).build!.bands;
  const lo = 1 - FITTED.sway,
    hi = 1 + FITTED.sway,
    band = (by: number) => ({
      minor: FAULTS.minor * by,
      major: FAULTS.major * by,
    });
  const [rig, rudder, water, deck] = [0, 1, 2, 3];
  assert.deepEqual(bands({ rudder: { reliability: 1 } })[rudder], band(lo));
  assert.deepEqual(bands({ rudder: { reliability: 0 } })[rudder], band(hi));
  assert.deepEqual(bands({ rudder: { reliability: 1 } })[rig], band(1));
  assert.deepEqual(bands({ mounts: { reliability: 0 } })[deck], band(hi));
  // two parts to a zone: the mean of them
  assert.deepEqual(bands({ sails: { reliability: 1 } })[rig], band(0.75));
  assert.deepEqual(
    bands({ sails: { reliability: 1 }, rigging: { reliability: 0 } })[rig],
    band(1)
  );
  assert.deepEqual(bands({ hull: { reliability: 0 } })[water], band(1.25));
  assert.deepEqual(bands({ keel: { reliability: 0 } })[water], band(1.25));
});

test('her faults by her own bands: her most-hit zone by its band, the next minor under its own major', () => {
  // her rudder has taken the most, her rigging the next
  const worn = (c: Crew, hull: number): Crew => ({
    ...c,
    health: { ...c.health, hull },
    wear: { zones: [10, 30, 0, 0], quiet: 0, mending: false },
  });
  const spec = crew(),
    sound = crew({ rudder: { reliability: 1 } }),
    frail = crew({ rudder: { reliability: 0 } }),
    rigged = crew({
      rudder: { reliability: 1 },
      sails: { reliability: 0 },
      rigging: { reliability: 0 },
    });
  // at 50 hull: only a frail rudder (minor at 60) has gone
  assert.deepEqual(faultsIn(worn(spec, 50)), [0, 0, 0, 0]);
  assert.deepEqual(faultsIn(worn(frail, 50)), [0, 1, 0, 0]);
  // at 30: the spec rudder is minor, the frail major (under 37.5), the sound
  // whole (minor at 20)
  assert.deepEqual(faultsIn(worn(spec, 30)), [0, 1, 0, 0]);
  assert.deepEqual(faultsIn(worn(frail, 30)), [0, 2, 0, 0]);
  assert.deepEqual(faultsIn(worn(sound, 30)), [0, 0, 0, 0]);
  // her frail rigging, the next most-hit, is minor under its own major
  // (37.5) though her sound rudder holds
  assert.deepEqual(faultsIn(worn(rigged, 30)), [1, 0, 0, 0]);
  assert.deepEqual(faultsIn(worn(rigged, 15)), [1, 1, 0, 0]);
  // a spec ship's are the tables', at every hull
  for (let hull = 0; hull <= 100; hull += 2.5)
    assert.deepEqual(
      faultsIn(worn(spec, hull)),
      faultsOf(hull, worn(spec, hull).wear),
      `${hull}`
    );
  // and her faults cost her own handling
  const fast = worn(crew({ sails: { performance: 1.1 } }), 30),
    torn: Crew = { ...fast, wear: { ...fast.wear, zones: [30, 10, 0, 0] } };
  assert.equal(fitOf(torn).top, SPEC.top * 1.1 * FAULTS.cost.rigging.by[1]);
});

test('her most hull is hers: the storm takes its share of it, her stores mend up to their share of it, and a blow leaves it hers', () => {
  const stout = crew({ hull: { performance: 1.2 } }),
    spec = crew();
  const blown = harmed(stout.health, 70).health;
  assert.deepEqual(blown, { hull: 50, shield: 0, most: 120 });
  // a repair kit mends to 75 of a 100 hull: 90 of hers
  const cap = USES.repairKit.cap;
  assert.equal(hullCap(blown, cap), 90);
  assert.equal(healed(blown, 100, 'hull', cap).hull, 90);
  assert.equal(healed(blown, 100, 'hull').hull, 120);
  assert.equal(useful({ ...blown, hull: 80 }, 'repairKit'), true);
  assert.equal(useful({ ...spec.health, hull: 80 }, 'repairKit'), false);
  assert.equal(healed(blown, 100, 'shield').shield, HEALTH.shield);
  // a second of the storm at a tenth of a hull a second
  const v = afloat(1, shipAt(here, frameAt(here).east)),
    storm = { centre: scale(here, -1), radius: 0.1, damage: 0.1 };
  const after = (c: Crew) =>
    weathered(battleOf([c], 1), [v], storm, 1).battle.crews[0].health.hull;
  assert.ok(Math.abs(after(spec) - 90) < 1e-9);
  assert.ok(Math.abs(after(stout) - 108) < 1e-9);
});

test('a card with a part of no performance, or a reliability out of 0 to 1, is refused', () => {
  assert.throws(() => crew({ keel: { performance: 0 } }), /ship 1's keel/);
  assert.throws(() => crew({ hull: { reliability: 1.2 } }), /ship 1's hull/);
  assert.throws(() => crew({ sails: { reliability: -0.1 } }), /ship 1's sails/);
});
