// A ship's faults (sim/faults.ts): where a blow lands on her, her
// faults by her hull's band, what each costs her, her leak, and her water's
// mending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  battleOf,
  crewOf,
  stepBattle,
  type Battle,
  type Strike,
  type Crew,
} from '../src/sim/battle.ts';
import { afloat } from '../src/sim/contact.ts';
import {
  FAULTS,
  MEND,
  UNWORN,
  faultsOf,
  fitOf,
  rose,
  sharesOf,
  struck,
  wearOf,
  tended,
  zoneOf,
  type Wear,
} from '../src/sim/faults.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf, reloadOf } from '../src/sim/gun.ts';
import { SHIP, SPEC } from '../src/sim/handling.ts';
import { shipAt } from '../src/sim/ship.ts';
import { loosed } from '../src/sim/shot.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { ZONES, type Zone } from '../src/kinds.ts';
import { SEED } from '../src/environment.ts';
import { createMatches } from '../src/play/setup.ts';
import { createState } from '../src/play/state.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { flat } from '../src/world/swell.ts';
import {
  R,
  add,
  cross,
  frameAt,
  fromLatLon,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';

const deep: Depth = () => 30;
const centre = fromLatLon(0.2, 0.3);
/** Her, heading east; her port side north. */
const her = shipAt(centre, frameAt(centre).east),
  ahead = her.heading,
  port = cross(her.at, her.heading);
/** A point on her `fore` m ahead of amidships, `across` m to port (a unit vector). */
const on = (fore: number, across: number): Vec3 =>
  normalize(add(add(scale(her.at, R), ahead, fore), port, across));
/** A ball's way: coming at her from `off` radians to port of dead ahead. */
const from = (off: number): Vec3 =>
  scale(add(scale(ahead, -Math.cos(off)), port, -Math.sin(off)), 150);
const Z = (z: Zone) => ZONES.indexOf(z);
const deg = Math.PI / 180;
/** Her crew at `hull`, her tallies `zones`, quiet `quiet` s. */
const crew = (
  hull: number,
  zones: Wear['zones'] = UNWORN.zones,
  quiet = 0,
  shield = 0
): Crew => ({
  ...crewOf(2),
  health: { hull, shield },
  wear: { ...UNWORN, zones, quiet },
});

test('where a blow lands: abeam her waterline; her after third her rudder; raking within 25° of her line her deck; a scatter her rigging, a mortar her deck, a ram her waterline', () => {
  assert.equal(zoneOf(her, on(0, 2), from(90 * deg), 'cannon'), Z('waterline'));
  assert.equal(zoneOf(her, on(4, 2), from(60 * deg), 'cannon'), Z('waterline'));
  assert.equal(zoneOf(her, on(-8, 2), from(90 * deg), 'repeater'), Z('rudder'));
  assert.equal(
    zoneOf(her, on(-4, 2), from(90 * deg), 'repeater'),
    Z('waterline')
  );
  // from ahead along her line, and from astern past her after third
  assert.equal(zoneOf(her, on(6, 0), from(20 * deg), 'harpoon'), Z('deck'));
  assert.equal(
    zoneOf(her, on(6, 0), from(30 * deg), 'harpoon'),
    Z('waterline')
  );
  assert.equal(zoneOf(her, on(0, 1), from(170 * deg), 'cannon'), Z('deck'));
  // the gun's kind leans it, wherever it strikes
  assert.equal(zoneOf(her, on(-8, 2), from(90 * deg), 'scatter'), Z('rigging'));
  assert.equal(zoneOf(her, on(0, 2), from(90 * deg), 'mortar'), Z('deck'));
  assert.equal(zoneOf(her, on(8, 0), on(8, 0), null), Z('waterline'));
});

/**
 * A cannon ball loosed at her side from 20 m abeam, ship 1 the shooter (her
 * quiet 7 s), she with `shield`: the battle once it has struck, and its strikes
 * into `struck`.
 */
function shotAt(shield: number, struck: Strike[] = []): Battle {
  const muzzle = scale(on(0, 20), R + 3),
    fleet = [afloat(1, shipAt(on(0, 20), ahead)), afloat(2, her)];
  let b: Battle = {
    ...battleOf(
      [
        { ...crewOf(1), wear: { ...UNWORN, quiet: 7 } },
        crew(100, UNWORN.zones, 7, shield),
      ],
      0
    ),
    balls: [
      loosed(
        1,
        'cannon',
        muzzle,
        normalize(add(scale(port, -1), her.at, 0)),
        150,
        30
      ),
    ],
  };
  for (let i = 0; i < 30 && b.balls.length; i++) {
    const s = stepBattle(b, fleet, [], [], STEP, deep);
    struck.push(...s.strikes);
    b = s.battle;
  }
  return b;
}

test('a blow her shield holds harms no zone; past it, the zone it lands on takes the hull it took; and either way both ships’ quiet is broken', () => {
  const held = shotAt(100),
    [by, on] = held.crews;
  assert.equal(on.health.shield, 70, 'struck');
  assert.deepEqual(on.wear.zones, [0, 0, 0, 0]);
  assert.deepEqual([by.wear.quiet, on.wear.quiet], [0, 0]);
  const strikes: Strike[] = [],
    through = shotAt(20, strikes).crews[1];
  assert.equal(through.health.hull, 90);
  assert.deepEqual(through.wear.zones, [0, 0, 10, 0]);
  // the strike names the zone that took it (the HUD flashes it)
  assert.deepEqual(
    strikes.map((s) => s.zone),
    [Z('waterline')]
  );
});

test('faults by her hull: above 40 none; at 40 down to 25 her most-hit zone minor; under 25 that zone major and the next minor; ties to the first; none with no tally', () => {
  const w: Wear = { ...UNWORN, zones: [5, 0, 30, 10] };
  assert.deepEqual(faultsOf(40.01, w), [0, 0, 0, 0]);
  assert.deepEqual(faultsOf(FAULTS.minor, w), [0, 0, 1, 0]);
  assert.deepEqual(faultsOf(FAULTS.major, w), [0, 0, 1, 0]);
  assert.deepEqual(faultsOf(24.99, w), [0, 0, 2, 1]);
  assert.deepEqual(faultsOf(20, { ...w, zones: [10, 0, 10, 0] }), [2, 0, 1, 0]);
  assert.deepEqual(faultsOf(20, { ...w, zones: [0, 7, 0, 0] }), [0, 2, 0, 0]);
  assert.deepEqual(faultsOf(10, UNWORN), [0, 0, 0, 0]);
  // what her readout shows: each zone's share, and her wear
  assert.deepEqual(sharesOf(w), [5 / 45, 0, 30 / 45, 10 / 45]);
  assert.deepEqual(sharesOf(UNWORN), [0, 0, 0, 0]);
  assert.deepEqual(
    [wearOf(41), wearOf(40), wearOf(25), wearOf(24.9)],
    [0, 1, 1, 2]
  );
});

test('each fault costs her handling: rigging her top ×0.85 / ×0.7, rudder her turn ×0.8 / ×0.6, waterline her top ×0.92, deck her reload ×1.2 / ×1.5; together they multiply', () => {
  assert.equal(fitOf(crew(100, [9, 9, 9, 9])), SPEC);
  assert.equal(fitOf(crew(30, [1, 0, 0, 0])).top, SHIP.top * 0.85);
  const both = fitOf(crew(20, [3, 2, 0, 0]));
  assert.deepEqual(
    [both.top, both.turn, both.reload],
    [SHIP.top * 0.7, SHIP.turn * 0.8, 1]
  );
  const low = fitOf(crew(20, [0, 0, 2, 3]));
  assert.deepEqual([low.top, low.reload], [SHIP.top * 0.92, 1.5]);
  const leaking = fitOf(crew(20, [0, 0, 3, 2]));
  assert.deepEqual([leaking.top, leaking.reload], [SHIP.top * 0.92, 1.2]);
  assert.equal(fitOf(crew(20, [0, 3, 0, 0])).turn, SHIP.turn * 0.6);
  // her gun reloads by it
  const g = { ...gunOf('cannon', 2), rounds: 0 },
    c = { ...crew(20, [0, 0, 0, 3]), guns: [g, null] },
    b = stepBattle(battleOf([c], 0), [afloat(2, her)], [], [], STEP, deep);
  assert.equal(b.battle.crews[0].guns[0]?.reload, reloadOf(g) * 1.5);
});

/** Her crew `seconds` on, by tended, in her own water or not. */
const after = (c: Crew, seconds: number, home: boolean) => {
  let cs = [c];
  for (let i = 0; i < Math.round(seconds / STEP); i++)
    cs = tended(cs, () => home, STEP);
  return cs[0];
};

test('her leak: a major waterline fault takes 0.5 hull a second past her shield, never below 15; a minor one none; stopped while she mends', () => {
  const leak = after(crew(24, [0, 0, 10, 0], 0, 50), 2, false);
  assert.ok(Math.abs(leak.health.hull - 23) < 1e-9, `${leak.health.hull}`);
  assert.equal(leak.health.shield, 50);
  assert.equal(after(crew(15.2, [0, 0, 10, 0]), 10, false).health.hull, 15);
  assert.equal(after(crew(30, [0, 0, 10, 0]), 10, false).health.hull, 30);
  assert.equal(after(crew(20, [10, 0, 0, 0]), 10, false).health.hull, 20);
  const mending = after(crew(20, [0, 0, 10, 0], 5), 1, true);
  assert.ok(mending.wear.mending && mending.health.hull > 20);
});

test('her water mends her: 5 quiet seconds in her own water, then 2 hull a second up to 25 and never past it, which lifts her out of a major fault but not a minor', () => {
  const zones: Wear['zones'] = [10, 0, 0, 0];
  const early = after(crew(10, zones), MEND.quiet - 0.2, true);
  assert.equal(early.health.hull, 10);
  assert.ok(!early.wear.mending);
  const some = after(crew(10, zones), MEND.quiet + 5, true);
  assert.ok(Math.abs(some.health.hull - 20) < 0.1, `${some.health.hull}`);
  assert.ok(some.wear.mending);
  const done = after(crew(10, zones), 60, true);
  assert.equal(done.health.hull, MEND.cap);
  assert.ok(!done.wear.mending);
  assert.deepEqual(faultsOf(done.health.hull, done.wear), [1, 0, 0, 0]);
  // out of her water, over the cap, or struck within the 5 s: none
  assert.equal(after(crew(10, zones), 60, false).health.hull, 10);
  assert.equal(after(crew(30, zones, 60), 60, true).health.hull, 30);
  const hit = { ...some, wear: struck(some.wear, 0, 1) };
  assert.equal(
    after(hit, MEND.quiet - 0.2, true).health.hull,
    some.health.hull
  );
});

test("in the game's own match, every ship drawn shows her wear and faults, and her water mends her", () => {
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
  let faulted = false,
    mended = false;
  while (state.time() < 400 && !(faulted && mended)) {
    state.advance(idle, still);
    for (const d of state.drawn(1)) {
      if (!d.afloat) continue;
      const c = state.crew(d.id);
      assert.equal(d.wear, wearOf(c.health.hull));
      assert.deepEqual(d.faults, faultsOf(c.health.hull, c.wear));
      faulted ||= d.faults.some((f) => f > 0);
      mended ||= c.wear.mending;
    }
  }
  assert.ok(faulted, 'a ship was faulted');
  assert.ok(mended, 'a ship was mended in her water');
});

test('her tallies clear once her stores mend her above 40, and not short of it', () => {
  const w: Wear = { ...UNWORN, zones: [5, 0, 30, 10] };
  assert.equal(rose(w, 20, 35), w);
  assert.equal(rose(w, 60, 55), w);
  assert.deepEqual(rose(w, 20, 60).zones, [0, 0, 0, 0]);
  assert.deepEqual(rose(w, 60, 80).zones, [0, 0, 0, 0]);
});
