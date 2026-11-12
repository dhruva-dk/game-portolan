import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleOf, crewOf, stepBattle, type Battle, type Order } from '../src/sim/battle.ts';
import { mind, think, type Memory } from '../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf } from '../src/sim/gun.ts';
import { reactTime } from '../src/sim/gunner.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt, type Helm } from '../src/sim/ship.ts';
import { add, along, distance, frameAt, fromLatLon, scale, type Vec3 } from '../src/world/sphere.ts';
import { temper } from '../src/sim/temper.ts';
import { sunk } from '../src/sim/health.ts';

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

/** Bots `seeds` (null: a ship holding `held`) sailing and fighting `seconds`; armed as `guns` (rarity, or null). */
function battle(fleet: Vessel[], seeds: (number | null)[], guns: (number | null)[], seconds: number, held: Helm = { course: null, throttle: 0 }) {
  const minds: (Memory | null)[] = fleet.map((v, i) => (seeds[i] === null ? null : mind(seeds[i]!, v.ship.at)));
  let b: Battle = battleOf(fleet.map((v, i) => crewOf(v.id, guns[i] === null ? null : gunOf(guns[i]!))), 7);
  const fired: { t: number; id: number }[] = [], ranges: number[] = [];
  let strikes = 0, blows = 0;
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const seen = fleet.map((v) => {
      const c = b.crews.find((k) => k.id === v.id)!;
      return { ...v, hull: c.health.hull, shield: c.health.shield, armed: !!c.gun };
    });
    const helms: Helm[] = [], orders: Order[] = [];
    fleet.forEach((v, i) => {
      const m = minds[i];
      if (!m) { helms.push(held); orders.push({ aim: null, fire: false }); return; }
      const r = think(seen[i], seen.filter((o) => o.id !== v.id), deep, m, seeds[i]!);
      minds[i] = r.memory;
      helms.push(r.helm);
      orders.push(r.order);
    });
    const met = stepFleet(fleet, helms, STEP, deep);
    fleet = met.fleet;
    blows += met.blows.length;
    const f = stepBattle(b, fleet, orders, met.blows, STEP, deep);
    b = f.battle;
    for (const s of f.shots) fired.push({ t: n * STEP, id: s.shooter });
    strikes += f.strikes.filter((s) => !s.ram).length;
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
