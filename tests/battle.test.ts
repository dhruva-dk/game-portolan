import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleOf, crewOf, stepBattle, type Battle, type Order, type Strike } from '../src/sim/battle.ts';
import { afloat, stepFleet, type Blow, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { chosen, gunOf, laid, muzzle } from '../src/sim/gun.ts';
import { GUN, HEALTH, SHIP } from '../src/sim/handling.ts';
import { harmed, healed, sunk, whole } from '../src/sim/health.ts';
import { BEST, elevationFor, flightTime, flown, loosed, reach, type Ball } from '../src/sim/shot.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt, turned, type Helm, type ShipState } from '../src/sim/ship.ts';
import { R, add, along, distance, dot, frameAt, fromLatLon, length, normalize, scale, type Vec3 } from '../src/world/sphere.ts';

const deep: Depth = () => 30;
const deg = Math.PI / 180;
const centre = fromLatLon(0.2, 0.3);
/** A ship at `c` heading `bearing` (radians to port of east) at `speed`. */
const lying = (c: Vec3, bearing: number, speed = 0): ShipState => {
  const s = shipAt(c, frameAt(c).east);
  return { ...s, heading: turned(s, bearing), speed };
};
/** The point `metres` from `c` on `bearing` (radians to port of east). */
const out = (c: Vec3, bearing: number, metres: number) => along(c, turned(lying(c, 0), bearing), metres).p;

/** The fleet sailed and fought `seconds` under `orders`, every helm holding her course at `throttles`. */
const fight = (fleet: Vessel[], b: Battle, orders: (f: readonly Vessel[], t: number) => Order[], seconds: number, throttles: number[], depth = deep) => {
  const strikes: Strike[] = [], blows: Blow[] = [];
  let shots = 0, splashes = 0, land = 0;
  const helms: Helm[] = throttles.map((throttle) => ({ course: null, throttle }));
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const met = stepFleet(fleet, helms, STEP, depth);
    fleet = met.fleet;
    blows.push(...met.blows);
    const r = stepBattle(b, fleet, orders(fleet, i), met.blows, STEP, depth);
    b = r.battle;
    strikes.push(...r.strikes);
    shots += r.shots.length;
    splashes += r.splashes.length;
    land += r.splashes.filter((s) => s.land).length;
  }
  return { fleet, battle: b, strikes, blows, shots, splashes, land };
};
const never = (f: readonly Vessel[]): Order[] => f.map(() => ({ aim: null, fire: false }));
/** The first ship fires once, at the first step, on `aim`; the rest hold their fire. */
const once = (aim: Vec3 | null) => (f: readonly Vessel[], t: number): Order[] => f.map((_, i) => ({ aim, fire: i === 0 && t === 0 }));

// ------------------------------------------------------------------ health

test('the shield takes a blow first, the hull the rest; past the shield, the hull alone; sunk at 0 hull', () => {
  const h = whole();
  assert.deepEqual(h, { hull: HEALTH.hull, shield: HEALTH.start });
  const a = harmed(h, 30);
  assert.deepEqual([a.health, a.shield, a.hull], [{ hull: 100, shield: 70 }, 30, 0]);
  const b = harmed(a.health, 90);
  assert.deepEqual([b.health, b.shield, b.hull], [{ hull: 80, shield: 0 }, 70, 20]);
  const c = harmed(whole(), 25, true);
  assert.deepEqual(c.health, { hull: 75, shield: 100 });
  const d = harmed(b.health, 500);
  assert.equal(d.hull, 80);
  assert.ok(sunk(d.health));
  assert.equal(harmed(d.health, 10).health, d.health, 'a sunk ship takes nothing more');
});

test('healing mends hull or shield up to its cap, never past it, and nothing once sunk', () => {
  const h = harmed(whole(), 150).health;
  assert.deepEqual(h, { hull: 50, shield: 0 });
  assert.deepEqual(healed(h, 25, 'shield'), { hull: 50, shield: 25 });
  assert.deepEqual(healed(h, 25, 'shield', 20), { hull: 50, shield: 20 });
  assert.deepEqual(healed(h, 80, 'hull'), { hull: 100, shield: 0 });
  assert.equal(healed({ hull: 0, shield: 0 }, 50, 'hull').hull, 0);
});

test('a ram takes off each ship what contact.ts reported, through her shield', () => {
  const target = lying(centre, 0);
  const from = along(target.at, turned(target, Math.PI / 2), -45 - SHIP.length / 2);
  const fleet = [afloat(1, { ...shipAt(from.p, from.t), speed: SHIP.top }), afloat(2, target)];
  const r = fight(fleet, battleOf([], 1), never, 6, [1, 0]);
  assert.equal(r.blows.length, 1, 'one ram');
  const blow = r.blows[0], by = new Map(r.battle.crews.map((c) => [c.id, c.health]));
  assert.ok(blow.struck.damage > 10, `the struck ship took ${blow.struck.damage}`);
  assert.equal(by.get(blow.struck.id)!.shield, HEALTH.start - blow.struck.damage);
  assert.equal(by.get(blow.striker.id)!.shield, HEALTH.start - blow.striker.damage);
  assert.deepEqual(r.strikes.map((s) => [s.struck, s.shooter, s.ram]), [[blow.striker.id, blow.struck.id, true], [blow.struck.id, blow.striker.id, true]]);
});

// ------------------------------------------------------------------ the ball's flight

test("a ball's carry and flight time on the sphere match the orbit's, to a few centimetres", () => {
  const up = normalize(centre), east = frameAt(centre).east;
  for (const e of [3 * deg, 10 * deg, 20 * deg, BEST, 55 * deg]) {
    let b: Ball = loosed(0, scale(up, R + GUN.up), add(scale(east, Math.cos(e)), up, Math.sin(e)), 1);
    let prev = b;
    do [prev, b] = [b, flown(b, STEP)];
    while (!(length(b.p) < R + GUN.up && b.age > STEP));
    // where it came back through the muzzle's height, between the last two steps (a cubic through their places and
    // velocities, as fine as the stepping)
    const [p0, v0, p1, v1] = [prev.p, prev.v, b.p, b.v];
    const between = (k: number): Vec3 => {
      const k2 = k * k, k3 = k2 * k;
      return add(add(add(scale(p0, 2 * k3 - 3 * k2 + 1), v0, STEP * (k3 - 2 * k2 + k)), p1, -2 * k3 + 3 * k2), v1, STEP * (k3 - k2));
    };
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) [lo, hi] = length(between((lo + hi) / 2)) > R + GUN.up ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
    const k = lo, at = between(k);
    assert.ok(Math.abs(distance(up, at) - reach(e)) < 0.05, `${(e / deg).toFixed(1)}°: carried ${distance(up, at).toFixed(3)}, the orbit says ${reach(e).toFixed(3)}`);
    assert.ok(Math.abs(prev.age + k * STEP - flightTime(e)) < 0.002, `${(e / deg).toFixed(1)}°: flew ${prev.age + k * STEP}, the orbit says ${flightTime(e)}`);
  }
  assert.ok(Math.abs(reach(BEST) - GUN.range) < 1e-9, 'the best elevation carries the full range');
  for (const m of [20, 80, 150, 199]) assert.ok(Math.abs(reach(elevationFor(m)!) - m) < 1e-9);
  assert.equal(elevationFor(GUN.range + 1), null);
});

// ------------------------------------------------------------------ laying the gun

/** A shooter lying still at the centre heading east, and a target `metres` off on `bearing`, heading `course`. */
const pair = (metres: number, bearing: number, course: number, speed: number): Vessel[] => [
  afloat(1, lying(centre, 0)),
  afloat(2, lying(out(centre, bearing, metres), course, speed)),
];

test('led with no spread, a ball strikes a ship on a steady course, at any range and crossing', () => {
  for (const metres of [50, 100, 150, 175]) for (const crossing of [0, 45, 90, 135, 180, 270]) {
    const bearing = 30 * deg;
    const fleet = pair(metres, bearing, bearing + crossing * deg, SHIP.top);
    // the gun laid with no spread, and its ball flown among them as she sails on
    const lay = laid(fleet[0], gunOf(0), turned(fleet[0].ship, bearing), fleet, 7, 0);
    assert.equal(lay.target, 2, `${metres} m, crossing ${crossing}°: laid on her`);
    let balls: Ball[] = [loosed(1, lay.from, lay.dir, 20)], f = fleet, struck: number | null = null;
    for (let i = 0; i < 120 && balls.length && struck === null; i++) {
      f = stepFleet(f, [{ course: null, throttle: 0 }, { course: null, throttle: 1 }], STEP, deep).fleet;
      const r2 = stepBattle({ crews: [crewOf(1), crewOf(2)], balls, seed: 0 }, f, never(f), [], STEP, deep);
      balls = r2.battle.balls;
      struck = r2.strikes[0]?.struck ?? null;
    }
    assert.equal(struck, 2, `${metres} m, crossing ${crossing}°: struck her`);
  }
});

test('with no ship in the assist cone the gun is laid on the bearing, at full range', () => {
  const g = gunOf(2), cone = GUN.assist[2];
  for (const k of [-1, 1]) {
    const inside = pair(120, k * (cone - 0.03), 0, 0), outside = pair(120, k * (cone + 0.03), 0, 0);
    const bearing = inside[0].ship.heading;
    assert.equal(laid(inside[0], g, bearing, inside, 1, 0).target, 2);
    const lay = laid(outside[0], g, bearing, outside, 1, 0);
    assert.equal(lay.target, null);
    const up = normalize(lay.from), level = normalize(add(lay.dir, up, -dot(lay.dir, up)));
    assert.ok(Math.acos(Math.min(1, dot(level, normalize(add(bearing, up, -dot(bearing, up)))))) < 1e-9, 'along the bearing');
    assert.ok(Math.abs(Math.asin(dot(lay.dir, up)) - elevationFor(GUN.range)!) < 1e-9, 'at full range');
  }
  // out of range, in the cone: not laid on
  const far = pair(GUN.range + 10, 0, 0, 0);
  assert.equal(chosen(muzzle(far[0]), far[0].ship.heading, GUN.assist[4], far.slice(1)), null);
});

test('of two in the cone, the gun takes the one nearer the bearing', () => {
  const fleet = [afloat(1, lying(centre, 0)), afloat(3, lying(out(centre, 0.15, 80), 1)), afloat(2, lying(out(centre, 0.02, 140), 2))];
  assert.equal(laid(fleet[0], gunOf(4), fleet[0].ship.heading, fleet, 1, 0).target, 2);
});

test('the spread closes up with rarity, and is the same for the same seed', () => {
  const misses = GUN.rarities.map((_, rarity) => {
    const fleet = pair(150, 0, 90 * deg, 0);
    let sum = 0;
    for (let n = 0; n < 300; n++) {
      const gun = { ...gunOf(rarity), fired: n };
      const lay = laid(fleet[0], gun, fleet[0].ship.heading, fleet, 99), clean = laid(fleet[0], gun, fleet[0].ship.heading, fleet, 99, 0);
      assert.deepEqual(lay, laid(fleet[0], gun, fleet[0].ship.heading, fleet, 99));
      const angle = Math.acos(Math.min(1, dot(lay.dir, clean.dir)));
      assert.ok(angle <= GUN.spread[rarity] + 1e-9, 'within the cone');
      sum += angle;
    }
    return sum / 300;
  });
  for (let i = 1; i < misses.length; i++) assert.ok(misses[i] < misses[i - 1] * 0.9, `rarity ${i}: ${misses.join(', ')}`);
  // and so more of a common gun's balls miss than a legendary's, at 150 m
  const hits = [0, 4].map((rarity) => {
    const fleet = pair(150, 0, 90 * deg, 0);
    const r = fight(fleet, battleOf([crewOf(1, gunOf(rarity)), { ...crewOf(2), health: { hull: 1e6, shield: 0 } }], 5), (f) => f.map((_, i) => ({ aim: fleet[0].ship.heading, fire: i === 0 })), 60, [0, 0]);
    return r.strikes.length / r.shots;
  });
  assert.ok(hits[1] > hits[0] + 0.1, `common hits ${hits[0]}, legendary ${hits[1]}`);
});

// ------------------------------------------------------------------ the fighting

test('the land is in the way: a ball laid over an island falls on it', () => {
  const fleet = pair(150, 0, 0, 0);
  // a ridge 20 m high across the line between them, 75 m out
  const ridge: Depth = (p) => (Math.abs(distance(centre, p) - 75) < 4 ? -20 : 30);
  const r = fight(fleet, battleOf([crewOf(1, gunOf(4)), crewOf(2)], 3), once(fleet[0].ship.heading), 3, [0, 0], ridge);
  assert.equal(r.shots, 1);
  assert.equal(r.strikes.length, 0, 'not struck');
  assert.equal(r.land, 1, 'fell on the land');
  // and with no ridge, it strikes her
  assert.equal(fight(fleet, battleOf([crewOf(1, gunOf(4)), crewOf(2)], 3), once(fleet[0].ship.heading), 3, [0, 0]).strikes.length, 1);
});

test('a gun fires no faster than it reloads, and a ship with no gun fires nothing', () => {
  for (const rarity of [0, 4]) {
    const fleet = pair(150, 0, 0, 0);
    const always = (f: readonly Vessel[]) => f.map(() => ({ aim: null, fire: true }));
    const r = fight(fleet, battleOf([crewOf(1, gunOf(rarity)), crewOf(2)], 3), always, 10, [0, 0]);
    const every = GUN.reload * GUN.reloadBy[rarity];
    assert.equal(r.shots, Math.floor(10 / every - 1e-9) + 1, `rarity ${rarity}, every ${every} s`);
  }
  const fleet = pair(100, 0, 0, 0);
  const r = fight(fleet, battleOf([], 3), (f) => f.map(() => ({ aim: null, fire: true })), 5, [0, 0]);
  assert.equal(r.shots, 0);
  assert.ok(r.battle.crews.every((c) => c.gun === null));
});

test('a ship struck to 0 hull is sunk, reported once, and takes and fires no more', () => {
  const fleet = pair(100, 0, 0, 0);
  const b = battleOf([crewOf(1, gunOf(4)), { ...crewOf(2, gunOf(0)), health: { hull: 30, shield: 0 } }], 3);
  const sunkAt: number[] = [];
  let battle = b;
  for (let i = 0; i < 300; i++) {
    const r = stepBattle(battle, fleet, fleet.map(() => ({ aim: fleet[0].ship.heading, fire: true })), [], STEP, deep);
    battle = r.battle;
    sunkAt.push(...r.sunk);
    if (sunk(battle.crews[1].health)) assert.equal(r.shots.filter((s) => s.shooter === 2).length, 0, 'the sunk fire nothing');
  }
  assert.deepEqual(sunkAt, [2]);
  assert.equal(battle.crews[1].health.hull, 0);
});

test('the same fleet under the same orders fights the same way, to the bit', () => {
  const four = (): Vessel[] => [0, 1, 2, 3].map((k) => afloat(10 - k, lying(out(centre, (k * Math.PI) / 2 + 0.3, 60), (k * Math.PI) / 2 + 2, 6 + k)));
  const crews = () => [10, 9, 8, 7].map((id, k) => crewOf(id, gunOf(k)));
  const orders = (f: readonly Vessel[], t: number) => f.map((v, i) => ({ aim: turned(v.ship, Math.sin(t * 0.05 + i) * 3), fire: (t + i) % 7 === 0 }));
  const a = fight(four(), battleOf(crews(), 42), orders, 20, [0.6, 0.8, 1, 0.4]);
  const b = fight(four(), battleOf(crews(), 42), orders, 20, [0.6, 0.8, 1, 0.4]);
  assert.ok(a.shots > 10 && a.strikes.length > 0, `${a.shots} shots, ${a.strikes.length} strikes`);
  assert.deepEqual(a, b);
});
