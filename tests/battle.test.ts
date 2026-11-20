import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleOf, crewOf, stepBattle, weathered, type Battle, type Order, type Strike } from '../src/sim/battle.ts';
import { afloat, stepFleet, type Blow, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { chosen, gunOf, laid, muzzle, spreadOf } from '../src/sim/gun.ts';
import { KINDS, type GunKind } from '../src/kinds.ts';
import { GUN, GUNS, HEALTH, SHIP } from '../src/sim/handling.ts';
import { FOOT } from '../src/ship/gun-shape.ts';
import { GUN_DRAWN, GUN_MOUNT } from '../src/ship/mount.ts';
import { harmed, healed, sunk, whole } from '../src/sim/health.ts';
import { flown, loosed, reach, thrown, type Ball } from '../src/sim/shot.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { offSight, seaAlong, type Sight } from '../src/sim/sight.ts';

/** A cannon of `rarity`, and its range. */
const cannon = (rarity: number) => gunOf('cannon', rarity), RANGE = GUNS.cannon.range;
/** The best elevation, radians: the furthest carry on a sphere of radius R (a quarter turn less a quarter of the arc). */
const BEST = Math.PI / 4 - GUNS.cannon.carry / R / 4;
import { shipAt, turned, type Helm, type ShipState } from '../src/sim/ship.ts';
import { R, add, along, cross, distance, dot, frameAt, fromLatLon, length, normalize, scale, type Vec3 } from '../src/world/sphere.ts';

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
const fight = (
  fleet: Vessel[], b: Battle, orders: (f: readonly Vessel[], t: number) => Order[], seconds: number, throttles: number[], depth = deep
) => {
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
/** Her line of sight from `ALOFT` m over `s` onto the sea `metres` off on `bearing` (a tangent there), or level along
 *  it (meeting nothing: over the horizon) with no metres. */
const ALOFT = 20;
const on = (s: ShipState, bearing: Vec3, metres?: number): Sight => {
  const from = scale(s.at, R + ALOFT);
  return { from, dir: metres === undefined ? bearing : normalize(add(scale(along(s.at, bearing, metres).p, R), from, -1)) };
};
const never = (f: readonly Vessel[]): Order[] => f.map(() => ({ aim: null, fire: false }));
/** The first ship fires once, at the first step, on `aim`; the rest hold their fire. */
const once = (aim: Sight | null) => (f: readonly Vessel[], t: number): Order[] => f.map((_, i) => ({ aim, fire: i === 0 && t === 0 }));

// ------------------------------------------------------------------ health

test('the shield takes a blow first, the hull the rest; past the shield, the hull alone; sunk at 0 hull', () => {
  assert.deepEqual(whole(), { hull: HEALTH.hull, shield: HEALTH.start });
  const h = { hull: HEALTH.hull, shield: HEALTH.shield };
  const a = harmed(h, 30);
  assert.deepEqual([a.health, a.shield, a.hull], [{ hull: 100, shield: 70 }, 30, 0]);
  const b = harmed(a.health, 90);
  assert.deepEqual([b.health, b.shield, b.hull], [{ hull: 80, shield: 0 }, 70, 20]);
  const c = harmed(h, 25, true);
  assert.deepEqual(c.health, { hull: 75, shield: 100 });
  const d = harmed(b.health, 500);
  assert.equal(d.hull, 80);
  assert.ok(sunk(d.health));
  assert.equal(harmed(d.health, 10).health, d.health, 'a sunk ship takes nothing more');
});

test('healing mends hull or shield up to its cap, never past it, and nothing once sunk', () => {
  const h = harmed({ hull: 100, shield: 100 }, 150).health;
  assert.deepEqual(h, { hull: 50, shield: 0 });
  assert.deepEqual(healed(h, 25, 'shield'), { hull: 50, shield: 25 });
  assert.deepEqual(healed(h, 25, 'shield', 20), { hull: 50, shield: 20 });
  assert.deepEqual(healed(h, 80, 'hull'), { hull: 100, shield: 0 });
  assert.equal(healed({ hull: 0, shield: 0 }, 50, 'hull').hull, 0);
});

test('a ram takes off each ship what contact.ts reported, through her shield (none, putting to sea) into her hull', () => {
  const target = lying(centre, 0);
  const from = along(target.at, turned(target, Math.PI / 2), -45 - SHIP.length / 2);
  const fleet = [afloat(1, { ...shipAt(from.p, from.t), speed: SHIP.top }), afloat(2, target)];
  const r = fight(fleet, battleOf([], 1), never, 6, [1, 0]);
  assert.equal(r.blows.length, 1, 'one ram');
  const blow = r.blows[0], by = new Map(r.battle.crews.map((c) => [c.id, c.health]));
  assert.ok(blow.struck.damage > 10, `the struck ship took ${blow.struck.damage}`);
  assert.equal(by.get(blow.struck.id)!.hull, HEALTH.hull + HEALTH.start - blow.struck.damage);
  assert.equal(by.get(blow.striker.id)!.hull, HEALTH.hull + HEALTH.start - blow.striker.damage);
  assert.deepEqual(
    r.strikes.map((s) => [s.struck, s.shooter, s.ram]),
    [[blow.striker.id, blow.struck.id, true], [blow.struck.id, blow.striker.id, true]]
  );
});

// ------------------------------------------------------------------ the ball's flight

/** Where a ball of `kind` fired at `e` and `speed` comes back through the muzzle's height: metres along the sea, and
 *  seconds flown. */
function landing(kind: GunKind, e: number, speed: number): { metres: number; seconds: number } {
  const up = normalize(centre), east = frameAt(centre).east;
  let b: Ball = loosed(0, kind, scale(up, R + GUN.up), add(scale(east, Math.cos(e)), up, Math.sin(e)), speed, 1);
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
  return { metres: distance(up, between(lo)), seconds: prev.age + lo * STEP };
}

test("a ball's carry and flight time on the sphere match the orbit's, to a few centimetres", () => {
  for (const e of [3 * deg, 10 * deg, 20 * deg, BEST, 55 * deg]) {
    const l = landing('cannon', e, GUNS.cannon.speed), t = thrown('cannon', reach('cannon', e))!;
    assert.ok(
      Math.abs(l.metres - reach('cannon', e)) < 0.05,
      `${(e / deg).toFixed(1)}°: carried ${l.metres.toFixed(3)}, the orbit says ${reach('cannon', e).toFixed(3)}`
    );
    // (over the best elevation a cannon is thrown low to the same carry, only a lobbed gun high: that one's carry alone)
    if (e > BEST) continue;
    assert.ok(Math.abs(t.elevation - e) < 1e-5, `${(e / deg).toFixed(1)}°: thrown at ${t.elevation / deg}°`);
    assert.ok(Math.abs(l.seconds - t.time) < 0.002, `${(e / deg).toFixed(1)}°: flew ${l.seconds}, the orbit says ${t.time}`);
  }
  assert.ok(Math.abs(reach('cannon', BEST) - GUNS.cannon.carry) < 1e-9, 'the best elevation carries the full carry');
  for (const m of [20, 80, 150, 199]) assert.ok(Math.abs(reach('cannon', thrown('cannon', m)!.elevation) - m) < 1e-9);
  assert.equal(thrown('cannon', RANGE + 1), null);
  // every kind's low throw carries where it is laid; the mortar's lob at its elevation with the charge it needs
  for (const kind of KINDS) for (const k of [0.3, 0.6, 1]) {
    const m = Math.max(GUNS[kind].least + 1, k * GUNS[kind].range), t = thrown(kind, m)!, l = landing(kind, t.elevation, t.speed);
    assert.ok(
      Math.abs(l.metres - m) < 0.05 + 6e-4 * m && Math.abs(l.seconds - t.time) < 0.003,
      `${kind} at ${m} m: ${l.metres.toFixed(2)} m in ${l.seconds.toFixed(3)} s, said ${t.time.toFixed(3)}`
    );
    if (GUNS[kind].lob > 0) assert.equal(t.elevation, GUNS[kind].lob);
  }
  assert.equal(thrown('mortar', GUNS.mortar.least - 1), null, 'no nearer than its least');
});

// ------------------------------------------------------------------ laying the gun

/** A shooter lying still at the centre heading east, and a target `metres` off on `bearing`, heading `course`. */
const pair = (metres: number, bearing: number, course: number, speed: number): Vessel[] => [
  afloat(1, lying(centre, 0)),
  afloat(2, lying(out(centre, bearing, metres), course, speed)),
];

test('led with no spread, a ball strikes a ship on a steady course, at any range and crossing', () => {
  // (out to 160 m, not 175: since the bore moved abaft her mainmast with the drawn plinth, and her best rose to 16 m/s,
  // one further out running from her at her best is led past the cannon's 200 m from it)
  for (const metres of [50, 100, 150, 160]) for (const crossing of [0, 45, 90, 135, 180, 270]) {
    const bearing = 30 * deg;
    const fleet = pair(metres, bearing, bearing + crossing * deg, SHIP.top);
    // the gun laid with no spread, and its ball flown among them as she sails on
    const lay = laid(fleet[0], cannon(0), on(fleet[0].ship, turned(fleet[0].ship, bearing), metres), fleet, 7, deep, 0);
    assert.equal(lay.target, 2, `${metres} m, crossing ${crossing}°: laid on her`);
    let balls: Ball[] = [loosed(1, 'cannon', lay.from, lay.dirs[0], lay.speed, 20)], f = fleet, struck: number | null = null;
    for (let i = 0; i < 120 && balls.length && struck === null; i++) {
      f = stepFleet(f, [{ course: null, throttle: 0 }, { course: null, throttle: 1 }], STEP, deep).fleet;
      const r2 = stepBattle({ crews: [crewOf(1), crewOf(2)], balls, seed: 0 }, f, never(f), [], STEP, deep);
      balls = r2.battle.balls;
      struck = r2.strikes[0]?.struck ?? null;
    }
    assert.equal(struck, 2, `${metres} m, crossing ${crossing}°: struck her`);
  }
});

/** A sight from aloft over `v` on the middle of `o`'s body, swung `angle` radians to port about the eye's up. */
const swung = (v: Vessel, o: Vessel, angle: number): Sight => {
  const from = scale(v.ship.at, R + ALOFT), up = normalize(from);
  const d = normalize(add(scale(o.ship.at, R + SHIP.rig / 2), from, -1));
  return {
    from,
    dir: normalize(add(add(scale(d, Math.cos(angle)), cross(up, d), Math.sin(angle)), up, dot(up, d) * (1 - Math.cos(angle))))
  };
};

test('with no ship in the assist cone the gun is laid along the sight, at full range when it meets nothing', () => {
  const g = cannon(2), cone = GUN.assist[2], fleet = pair(120, 0, 0, 0);
  for (const k of [-1, 1]) {
    // swung off her until her body stands just inside the cone, and just outside it
    let a = 0;
    while (offSight(swung(fleet[0], fleet[1], k * a), fleet[1].ship)!.angle < cone - 0.01) a += 1e-4;
    assert.equal(laid(fleet[0], g, swung(fleet[0], fleet[1], k * a), fleet, 1, deep, 0).target, 2, 'inside: laid on her');
    while (offSight(swung(fleet[0], fleet[1], k * a), fleet[1].ship)!.angle < cone + 0.01) a += 1e-4;
    const sight = swung(fleet[0], fleet[1], k * a), lay = laid(fleet[0], g, sight, fleet, 1, deep, 0);
    assert.equal(lay.target, null, 'outside: not laid on her');
    assert.equal(lay.reached, false, 'the sight meets nothing');
    const dir = lay.dirs[0], up = normalize(lay.from), level = normalize(add(dir, up, -dot(dir, up)));
    const far = normalize(add(sight.from, sight.dir, 1000)), toward = normalize(add(far, up, -dot(far, up)));
    assert.ok(Math.acos(Math.min(1, dot(level, toward))) < 1e-6, 'along the sight');
    assert.ok(Math.abs(Math.asin(dot(dir, up)) - thrown('cannon', RANGE)!.elevation) < 1e-9, 'at full range');
  }
  // out of range, on the sight: not laid on
  const far = pair(RANGE + 10, 0, 0, 0);
  assert.equal(chosen(on(far[0].ship, far[0].ship.heading, RANGE + 10), muzzle(far[0]), GUN.assist[4], far.slice(1), RANGE), null);
});

test('with no ship in the cone, the ball is laid to come down where the sight meets the sea, out to its range', () => {
  const fleet = [afloat(1, lying(centre, 0))];
  for (const metres of [30, 80, 140]) {
    const sight = on(fleet[0].ship, fleet[0].ship.heading, metres), lay = laid(fleet[0], cannon(0), sight, fleet, 1, deep, 0);
    const meet = normalize(add(sight.from, sight.dir, seaAlong(sight)!));
    assert.ok(distance(lay.fall, meet) < 1e-6, `${metres} m: laid on the point`);
    assert.ok(
      Math.abs(reach('cannon', Math.asin(dot(lay.dirs[0], normalize(lay.from)))) - distance(normalize(lay.from), meet)) < 1e-6,
      `${metres} m: carries there`
    );
    assert.equal(lay.reached, true);
  }
});

test('of two in the cone, the gun takes the one nearer the sight, and of two on it the nearer', () => {
  const fleet = [afloat(1, lying(centre, 0)), afloat(3, lying(out(centre, 0.2, 80), 1)), afloat(2, lying(out(centre, 0, 140), 2))];
  const sight = on(fleet[0].ship, fleet[0].ship.heading, 140);
  assert.ok(offSight(sight, fleet[1].ship)!.angle > 0.02 && offSight(sight, fleet[1].ship)!.angle < GUN.assist[4], 'both in the cone');
  assert.equal(laid(fleet[0], cannon(4), sight, fleet, 1, deep, 0).target, 2);
  const both = [fleet[0], afloat(3, lying(out(centre, 0, 80), 1)), fleet[2]];
  assert.equal(laid(both[0], cannon(4), sight, both, 1, deep, 0).target, 3);
});

test('the spread closes up with rarity, and is the same for the same seed', () => {
  const misses = GUN.rarities.map((_, rarity) => {
    const fleet = pair(150, 0, 90 * deg, 0);
    let sum = 0;
    for (let n = 0; n < 300; n++) {
      const gun = { ...cannon(rarity), fired: n };
      const sight = on(fleet[0].ship, fleet[0].ship.heading, 150), lay = laid(fleet[0], gun, sight, fleet, 99, deep),
        clean = laid(fleet[0], gun, sight, fleet, 99, deep, 0);
      assert.deepEqual(lay, laid(fleet[0], gun, sight, fleet, 99, deep));
      const angle = Math.acos(Math.min(1, dot(lay.dirs[0], clean.dirs[0])));
      assert.ok(angle <= spreadOf(gun) + 1e-9, 'within the cone');
      sum += angle;
    }
    return sum / 300;
  });
  for (let i = 1; i < misses.length; i++) assert.ok(misses[i] < misses[i - 1] * 0.9, `rarity ${i}: ${misses.join(', ')}`);
  // (and so fewer of its balls miss: tests/gunnery.test.ts)
});

test("an order's spread widens the gun's by that many times: the same draw, further off, and fewer hits", () => {
  const fleet = pair(150, 0, 90 * deg, 0);
  const shots = (spread?: number) => {
    const r = fight(
      fleet, battleOf([crewOf(1, cannon(2)), { ...crewOf(2), health: { hull: 1e6, shield: 0 } }], 5),
      (f) => f.map((_, i) => ({ aim: on(fleet[0].ship, fleet[0].ship.heading, 150), fire: i === 0, spread })), 60, [0, 0]
    );
    return r.strikes.length / r.shots;
  };
  const plain = shots(), as1 = shots(1), wide = shots(2.5);
  assert.equal(plain, as1);
  assert.ok(wide < plain - 0.1, `hits ${plain} plain, ${wide} at 2.5 times the spread`);
  // laid by the battle as by laid() with the gun's spread times the order's
  const gun = cannon(2), sight = on(fleet[0].ship, fleet[0].ship.heading, 150),
    clean = laid(fleet[0], gun, sight, fleet, 5, deep, 0).dirs[0];
  const off = (k: number) => Math.acos(Math.min(1, dot(laid(fleet[0], gun, sight, fleet, 5, deep, spreadOf(gun) * k).dirs[0], clean)));
  assert.ok(Math.abs(off(2.5) / off(1) - 2.5) < 0.01, `${off(1)}, ${off(2.5)}`);
});

test('the muzzle stands on the drawn plinth: as far ahead, and its bore a little above the top', () => {
  assert.ok(Math.abs(GUN.ahead - GUN_MOUNT[2]) < 0.05, `${GUN.ahead} m ahead, the plinth ${GUN_MOUNT[2]}`);
  assert.equal(GUN_MOUNT[0], 0);
  const bore = GUN.up - GUN_MOUNT[1];
  assert.ok(bore > 0.3 && bore < 1, `bore ${bore.toFixed(2)} m above the plinth`);
  // the gun drawn on it has its trunnions at that bore, and its post's foot still in the plinth
  assert.ok(Math.abs(GUN_MOUNT[1] + GUN_DRAWN.lift - GUN.up) < 0.05, `trunnions ${(GUN_MOUNT[1] + GUN_DRAWN.lift).toFixed(2)} m up`);
  assert.ok(GUN_DRAWN.lift < FOOT * GUN_DRAWN.scale);
});

// ------------------------------------------------------------------ the fighting

test('the land is in the way: a ball laid over an island falls on it', () => {
  const fleet = pair(150, 0, 0, 0);
  // a ridge 20 m high across the line between them, 75 m out
  const ridge: Depth = (p) => (Math.abs(distance(centre, p) - 75) < 4 ? -20 : 30);
  const r = fight(
    fleet, battleOf([crewOf(1, cannon(4)), crewOf(2)], 3), once(on(fleet[0].ship, fleet[0].ship.heading, 150)), 3, [0, 0], ridge
  );
  assert.equal(r.shots, 1);
  assert.equal(r.strikes.length, 0, 'not struck');
  assert.equal(r.land, 1, 'fell on the land');
  // and with no ridge, it strikes her
  assert.equal(fight(
    fleet, battleOf([crewOf(1, cannon(4)), crewOf(2)], 3), once(on(fleet[0].ship, fleet[0].ship.heading, 150)), 3, [0, 0]
  ).strikes.length, 1);
  // thrown at her over a ridge 40 m high: a cannon's ball falls on it, a mortar's shell lobs over it and strikes her
  const high: Depth = (p) => (Math.abs(distance(centre, p) - 75) < 4 ? -40 : 30);
  for (const [kind, land, struck] of [['cannon', 1, 0], ['mortar', 0, 1]] as const) {
    const from = muzzle(fleet[0]), t = thrown(kind, distance(normalize(from), fleet[1].ship.at))!, up = normalize(from),
      ahead = fleet[0].ship.heading;
    let b: Battle = {
      crews: [crewOf(1), crewOf(2)],
      balls: [loosed(1, kind, from, add(scale(ahead, Math.cos(t.elevation)), up, Math.sin(t.elevation)), t.speed, 20)],
      seed: 0
    };
    let fell = 0, hit = 0;
    for (let i = 0; i < 300 && b.balls.length; i++) {
      const r = stepBattle(b, fleet, never(fleet), [], STEP, high);
      [b, fell, hit] = [r.battle, fell + r.splashes.filter((s) => s.land).length, hit + r.strikes.length];
    }
    assert.deepEqual([fell, hit], [land, struck], `${kind}: on the land, struck`);
  }
});

test('a ship with no gun fires nothing, whatever she is ordered', () => {
  const fleet = pair(100, 0, 0, 0);
  const r = fight(fleet, battleOf([], 3), (f) => f.map(() => ({ aim: null, fire: true })), 5, [0, 0]);
  assert.equal(r.shots, 0);
  assert.ok(r.battle.crews.every((c) => c.guns.every((g) => g === null)));
});

test('a ship struck to 0 hull is sunk, reported once, and takes and fires no more', () => {
  const fleet = pair(100, 0, 0, 0);
  const b = battleOf([crewOf(1, cannon(4)), { ...crewOf(2, cannon(0)), health: { hull: 30, shield: 0 } }], 3);
  const sunkAt: number[] = [];
  let battle = b;
  for (let i = 0; i < 300; i++) {
    const r = stepBattle(
      battle, fleet, fleet.map(() => ({ aim: on(fleet[0].ship, fleet[0].ship.heading, 100), fire: true })), [], STEP, deep
    );
    battle = r.battle;
    sunkAt.push(...r.sunk);
    if (sunk(battle.crews[1].health)) assert.equal(r.shots.filter((s) => s.shooter === 2).length, 0, 'the sunk fire nothing');
  }
  assert.deepEqual(sunkAt, [2]);
  assert.equal(battle.crews[1].health.hull, 0);
});

test('the same fleet under the same orders fights the same way, to the bit', () => {
  const four = (): Vessel[] =>
    [0, 1, 2, 3].map((k) => afloat(10 - k, lying(out(centre, (k * Math.PI) / 2 + 0.3, 60), (k * Math.PI) / 2 + 2, 6 + k)));
  const crews = () => [10, 9, 8, 7].map((id, k) => crewOf(id, gunOf(KINDS[k + 1], k), gunOf(KINDS[k], 4 - k)));
  const orders = (f: readonly Vessel[], t: number) =>
    f.map((v, i) => ({ aim: on(v.ship, turned(v.ship, Math.sin(t * 0.05 + i) * 3), 100), fire: (t + i) % 7 === 0 }));
  const a = fight(four(), battleOf(crews(), 42), orders, 20, [0.6, 0.8, 1, 0.4]);
  const b = fight(four(), battleOf(crews(), 42), orders, 20, [0.6, 0.8, 1, 0.4]);
  assert.ok(a.shots > 10 && a.strikes.length > 0, `${a.shots} shots, ${a.strikes.length} strikes`);
  assert.deepEqual(a, b);
});

test('the storm wears at a ship outside its cap, past her shield, and sinks her; inside it, nothing', () => {
  const inside = afloat(0, lying(centre, 0)), beyond = afloat(1, lying(out(centre, 0, 120), 0));
  const storm = { centre, radius: 50 / R, damage: 0.05 };
  let b = battleOf([crewOf(0), crewOf(1)], 1), sank: number[] = [];
  for (let i = 0; i < Math.round(21 / STEP); i++) {
    const w = weathered(b, [inside, beyond], storm, STEP);
    b = w.battle;
    sank = sank.concat(w.sunk);
  }
  assert.deepEqual(b.crews[0].health, whole());
  assert.equal(b.crews[1].health.shield, HEALTH.start);
  assert.deepEqual(sank, [1]);
});
