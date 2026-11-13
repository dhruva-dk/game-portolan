import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH, type GunKind } from '../src/sim/handling.ts';
import { armed, battleOf, crewOf, stepBattle, type Battle, type Order } from '../src/sim/battle.ts';
import { mind, shot, think, type Memory } from '../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf, type Gun } from '../src/sim/gun.ts';
import { asked, type Ask } from '../src/sim/stores.ts';
import { reactTime, spreadBy } from '../src/sim/gunner.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt, type Helm } from '../src/sim/ship.ts';
import { add, along, distance, frameAt, fromLatLon, scale, type Vec3 } from '../src/world/sphere.ts';
import { temper } from '../src/sim/temper.ts';
import { sunk } from '../src/sim/health.ts';
import type { Storm } from '../src/sim/storm.ts';
import { R } from '../src/world/sphere.ts';

const deep: Depth = () => 30;
const start = fromLatLon(0.2, 0.3);
const deg = Math.PI / 180;
const way = (p: Vec3, bearing: number): Vec3 => {
  const f = frameAt(p);
  return add(scale(f.north, Math.cos(bearing)), f.east, Math.sin(bearing));
};
const placed = (id: number, bearing: number, metres: number, heading: number, speed = 0): Vessel => {
  const at = along(start, way(start, bearing), metres).p;
  return afloat(id, { ...shipAt(at, way(at, heading)), speed });
};
const bold = (() => {
  const out: number[] = [];
  for (let s = 1; out.length < 3; s++) if (temper(s).fight > 0.7) out.push(s);
  return out;
})();

/** Bots `seeds` (null: a ship holding `held`, firing along her heading if `fire`) sailing and fighting `seconds`;
 *  armed as `guns` (a cannon's rarity, the guns she carries, or null); in `storm` if given; bots told of the balls that
 *  strike them, and the guns they ask for taken in hand. */
function battle(fleet: Vessel[], seeds: (number | null)[], guns: (number | Gun[] | null)[], seconds: number, held: Helm = { course: null, throttle: 0 }, { storm, fire = false }: { storm?: Storm; fire?: boolean } = {}) {
  const minds: (Memory | null)[] = fleet.map((v, i) => (seeds[i] === null ? null : mind(seeds[i]!, v.ship.at)));
  // every ship put to sea with a full shield, as she would be with a few fights' loot in her, so a test runs its length
  const carried = (g: number | Gun[] | null): Gun[] => (g === null ? [] : typeof g === 'number' ? [gunOf('cannon', g)] : g);
  let b: Battle = battleOf(fleet.map((v, i) => ({ ...crewOf(v.id, ...carried(guns[i])), health: { hull: HEALTH.hull, shield: HEALTH.shield } })), 7);
  const fired: { t: number; id: number; gun: GunKind }[] = [], ranges: number[] = [];
  let strikes = 0, blows = 0;
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const seen = fleet.map((v) => {
      const c = b.crews.find((k) => k.id === v.id)!;
      return { ...v, hull: c.health.hull, shield: c.health.shield, armed: armed(c), crew: c };
    });
    const helms: Helm[] = [], orders: Order[] = [], asks = new Map<number, Ask>();
    fleet.forEach((v, i) => {
      const m = minds[i];
      if (!m) { helms.push(held); orders.push({ aim: null, fire }); return; }
      const r = think(seen[i], seen.filter((o) => o.id !== v.id), { depth: deep, storm }, m, seeds[i]!);
      minds[i] = r.memory;
      helms.push(r.helm);
      orders.push(r.order);
      asks.set(v.id, r.ask);
    });
    // the guns she asks for taken in hand
    b = { ...b, crews: asked(b.crews, fleet, { pieces: [], next: 0 }, asks).crews };
    const met = stepFleet(fleet, helms, STEP, deep);
    fleet = met.fleet;
    blows += met.blows.length;
    const f = stepBattle(b, fleet, orders, met.blows, STEP, deep);
    b = f.battle;
    for (const s of f.shots) fired.push({ t: n * STEP, id: s.shooter, gun: s.gun });
    strikes += f.strikes.filter((s) => !s.ram).length;
    for (const s of f.strikes) {
      const k = fleet.findIndex((v) => v.id === s.struck);
      if (!s.ram && minds[k]) minds[k] = shot(minds[k]!, s.shooter);
    }
    if (fleet.length > 1) ranges.push(distance(fleet[0].ship.at, fleet[1].ship.at));
  }
  return { fleet, battle: b, minds, fired, strikes, blows, ranges };
}

test('an armed bot holds off at her gun\'s range and shoots a steady ship, rather than ramming her', () => {
  for (const seed of bold) {
    const r = battle([placed(0, 0, 0, 90 * deg), placed(1, 0, 150, 0)], [seed, null], [0, null], 40, { course: null, throttle: 0.4 });
    const later = r.ranges.slice(Math.round(10 / STEP));
    const near = Math.min(...later), far = Math.max(...later);
    console.log(`# seed ${seed}: ${r.fired.length} shots, ${r.strikes} hits, range ${near.toFixed(0)}–${far.toFixed(0)} m, ${r.blows} rams`);
    assert.equal(r.blows, 0, `${seed}: rammed`);
    assert.ok(near > 20, `${seed}: closed to ${near.toFixed(0)} m`);
    assert.ok(r.fired.length >= 6, `${seed}: ${r.fired.length} shots`);
    assert.ok(r.strikes >= 3, `${seed}: ${r.strikes} hits`);
  }
});

test('an armed bot holds her fire till she has got over first seeing her foe', () => {
  for (const seed of bold) {
    const r = battle([placed(0, 0, 0, 0), placed(1, 0, 120, 90 * deg)], [seed, null], [2, null], 10);
    assert.ok(r.fired.length > 0, `${seed}: never fired`);
    assert.ok(r.fired[0].t >= reactTime(temper(seed).skill) - 0.25, `${seed}: fired at ${r.fired[0].t.toFixed(2)} s`);
  }
});

test('two armed bots fight it out, the same every time, till one is sunk', () => {
  const fight = () => battle([placed(0, 0, 0, 30 * deg), placed(1, 40 * deg, 160, 200 * deg)], [bold[0], bold[1]], [1, 1], 120);
  const a = fight(), b = fight();
  assert.deepEqual(a.battle, b.battle);
  assert.deepEqual(a.fired, b.fired);
  assert.ok(a.battle.crews.some((c) => sunk(c.health)), `none sunk: ${a.battle.crews.map((c) => c.health.hull.toFixed(0))}`);
});

test('an unarmed bot never orders her gun fired', () => {
  const r = battle([placed(0, 0, 0, 0), placed(1, 0, 100, 90 * deg)], [bold[0], null], [null, null], 20);
  assert.equal(r.fired.length, 0);
});

/** The storm in its first phase (her restraint at its most), or once its last cap has closed (none left). */
const stormIn = (phase: number): Storm => ({
  centre: start, radius: Math.PI, next: { centre: start, radius: Math.PI }, closing: false, secondsToNext: phase < 7 ? 60 : Infinity, phase, damage: 0,
});
const mild = (() => {
  const out: number[] = [];
  for (let s = 1; out.length < 3; s++) if (temper(s).fight < 0.35) out.push(s);
  return out;
})();

test('early in a match a mild armed bot keeps out of a fight she would take up late in it', () => {
  for (const seed of mild) {
    const fights = (phase: number) => battle([placed(0, 0, 0, 0), placed(1, 0, 110, 90 * deg)], [seed, null], [1, null], 30, undefined, { storm: stormIn(phase) });
    const early = fights(0), late = fights(7);
    console.log(`# seed ${seed}: ${early.fired.length} shots early, ${late.fired.length} late`);
    assert.equal(early.fired.length, 0, `${seed}: fired early`);
    assert.ok(late.fired.length > 0, `${seed}: never fired late`);
  }
});

test('holding back, she still fires back at a ship close by that is shooting her', () => {
  for (const seed of mild) {
    // a ship 70 m off, bow on to her, firing along her heading
    const r = battle([placed(0, 0, 0, 90 * deg), placed(1, 0, 70, 180 * deg)], [seed, null], [1, 1], 30, undefined, { storm: stormIn(0), fire: true });
    const back = r.fired.filter((f) => f.id === 0).length;
    console.log(`# seed ${seed}: ${back} shots back`);
    assert.ok(back > 0, `${seed}: never fired back`);
  }
});

test('a green bot\'s balls spread wider than a sharp one\'s, and hit less', () => {
  const by = (ok: (skill: number) => boolean) => {
    const out: number[] = [];
    for (let s = 1; out.length < 4; s++) if (ok(temper(s).skill) && temper(s).fight > 0.5) out.push(s);
    return out;
  };
  const green = by((k) => k < 0.5), sharp = by((k) => k > 0.8);
  assert.ok(spreadBy(temper(green[0]).skill) > 2 * spreadBy(1) && spreadBy(1) === 1);
  // the share of her balls that strike home in her first 15 s on him (before either could sink him)
  const share = (seeds: number[]) => {
    const rs = seeds.map((seed) => battle([placed(0, 0, 0, 90 * deg), placed(1, 0, 150, 0)], [seed, null], [0, null], 15, { course: null, throttle: 0.4 }));
    return rs.reduce((n, r) => n + r.strikes, 0) / Math.max(1, rs.reduce((n, r) => n + r.fired.length, 0));
  };
  const g = share(green), s = share(sharp);
  console.log(`# balls striking a steady ship 150 m off in 15 s: green ${(100 * g).toFixed(0)}%, sharp ${(100 * s).toFixed(0)}%`);
  assert.ok(g < s - 0.15, `green ${g}, sharp ${s}`);
});

test('a bot with two guns takes in hand the one for the range: a scatter close, a harpoon far off', () => {
  for (const seed of bold) {
    // the scatter in hand to begin with, her foe far off; then the harpoon in hand, her foe close
    const far = battle([placed(0, 0, 0, 90 * deg), placed(1, 0, 200, 0)], [seed, null], [[gunOf('scatter', 0), gunOf('harpoon', 0)], null], 12);
    const near = battle([placed(0, 0, 0, 90 * deg), placed(1, 0, 30, 0)], [seed, null], [[gunOf('harpoon', 0), gunOf('scatter', 0)], null], 6);
    const kinds = (r: ReturnType<typeof battle>) => [...new Set(r.fired.filter((f) => f.id === 0).map((f) => f.gun))];
    console.log(`# seed ${seed}: far ${kinds(far)}, near ${kinds(near)}`);
    assert.deepEqual(kinds(far), ['harpoon'], `${seed}: far off`);
    assert.ok(kinds(near).includes('scatter'), `${seed}: close`);
  }
});
