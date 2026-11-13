import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleOf, crewOf, stepBattle, weathered } from '../src/sim/battle.ts';
import type { Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf } from '../src/sim/gun.ts';
import { charging, gustOf, ready, spent, stepGust } from '../src/sim/gust.ts';
import { GUST, HEALTH, SHIP } from '../src/sim/handling.ts';
import { begun, emptyHold, progress, roomFor, stepUse, stowed, tapped, useful, USES } from '../src/sim/hold.ts';
import { berthed, cargo, drifted, LOOT, offered, overboard, rolled, strewn, swept, type Flotsam, type Loot } from '../src/sim/loot.ts';
import { shipAt, step, type ShipState } from '../src/sim/ship.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { random } from '../src/world/random.ts';
import { R, along, distance, dot, frameAt, fromLatLon, type Vec3 } from '../src/world/sphere.ts';

const deep: Depth = () => 30;
const c0 = fromLatLon(0.1, 0.2);
const east = frameAt(c0).east;
const at = (m: number) => along(c0, east, m).p;
const vessel = (id: number, p: Vec3): Vessel => ({ id, ship: shipAt(p, frameAt(p).north), shove: [0, 0, 0], engaged: [] });
const piece = (id: number, p: Vec3, goods: Loot['goods'], from = -1, age = 10): Loot => ({ id, at: p, goods, from, age, way: [0, 0, 0] });
const lying = (...pieces: Loot[]): Flotsam => ({ pieces, next: 100 });

// ------------------------------------------------------------------ gust

test('a gust spends a charge, blows its time, and the charges come back one at a time', () => {
  let g = gustOf();
  assert.ok(ready(g));
  g = spent(g).gust;
  assert.deepEqual([g.charges, g.blowing], [1, GUST.time]);
  assert.equal(spent(g).blew, false, 'not while one still blows');
  for (let t = 0; t < GUST.time + 0.1; t += STEP) g = stepGust(g, STEP);
  assert.equal(g.blowing, 0);
  const since = g.recharge;
  g = spent(g).gust;
  assert.equal(g.charges, 0);
  assert.equal(spent(g).blew, false, 'none left');
  let t = since;
  while (g.charges < 1) { g = stepGust(g, STEP); t += STEP; }
  assert.ok(Math.abs(t - GUST.recharge) < 2 * STEP, `the first back ${t} s after it was spent`);
  assert.ok(charging(g) < 0.05);
  while (g.charges < 2) { g = stepGust(g, STEP); t += STEP; }
  assert.ok(Math.abs(t - 2 * GUST.recharge) < 3 * STEP, 'the second after the first');
  assert.equal(charging(g), 1);
});

test('in a gust she runs well past her top and turns quicker; after it she sheds the speed back to her top', () => {
  let s: ShipState = { ...shipAt(c0, east), speed: SHIP.top };
  const plain = step(s, { course: frameAt(c0).north, throttle: 1 }, STEP, deep);
  for (let t = 0; t < GUST.time; t += STEP) s = step(s, { course: null, throttle: 1, gust: true }, STEP, deep);
  assert.ok(s.speed > SHIP.top + 0.9 * GUST.speed, `${s.speed}`);
  const quick = step({ ...shipAt(c0, east), speed: SHIP.top }, { course: frameAt(c0).north, throttle: 1, gust: true }, STEP, deep);
  assert.ok(quick.turn > plain.turn * 1.3);
  for (let t = 0; t < 1; t += STEP) s = step(s, { course: null, throttle: 1 }, STEP, deep);
  assert.ok(s.speed > SHIP.top + GUST.speed - GUST.shed * 1.1 && s.speed < SHIP.top + GUST.speed, 'shed at its rate');
  for (let t = 0; t < 5; t += STEP) s = step(s, { course: null, throttle: 1 }, STEP, deep);
  assert.ok(Math.abs(s.speed - SHIP.top) < 1e-9);
});

test('a ball fired in a gust goes off wider', () => {
  const fleet = [vessel(1, c0), vessel(2, at(150))];
  const spreadOf = (blowing: number) => {
    let worst = 0;
    for (let seed = 0; seed < 40; seed++) {
      const b = battleOf([{ ...crewOf(1, gunOf(0)), gust: { charges: 1, recharge: 0, blowing } }, crewOf(2)], seed);
      const r = stepBattle(b, fleet, [{ aim: frameAt(c0).north, fire: true }, { aim: null, fire: false }], [], STEP, deep);
      worst = Math.max(worst, Math.acos(Math.min(1, dot(r.shots[0].dir, r.shots[0].dir))) + Math.abs(dot(r.shots[0].dir, east)));
    }
    return worst;
  };
  assert.ok(spreadOf(1) > spreadOf(0) * 1.3);
});

// ------------------------------------------------------------------ hold

test('stacks fill up to their most, then empty slots; what does not fit is left over', () => {
  let h = emptyHold();
  h = stowed(h, 'smallShield', 3).hold;
  h = stowed(h, 'smallShield', 3).hold;
  assert.deepEqual(h.items, [{ kind: 'smallShield', count: 6 }, null, null]);
  const r = stowed(h, 'smallShield', 2);
  assert.deepEqual(r.hold.items[1], { kind: 'smallShield', count: 2 });
  h = stowed(stowed(r.hold, 'repairKit', 4).hold, 'bigShield', 1).hold;
  assert.equal(roomFor(h, 'bigShield'), -1);
  assert.equal(roomFor(h, 'repairKit'), 2);
  assert.equal(stowed(h, 'fullRepair', 1).left, 1);
});

test('a tap chooses a slot; a tap on the chosen begins it; done, it mends to its cap and one is gone', () => {
  const hurt = { hull: 40, shield: 0 };
  let h = stowed(stowed(emptyHold(), 'smallShield', 2).hold, 'repairKit', 1).hold;
  h = tapped(h, 1, hurt);
  assert.deepEqual([h.chosen, h.using], [1, null]);
  h = tapped(h, 1, hurt);
  assert.deepEqual(h.using, { slot: 1, left: USES.smallShield.time });
  let health = hurt;
  for (let t = 0; t < USES.smallShield.time - 0.1; t += STEP) ({ hold: h, health } = stepUse(h, health, STEP));
  assert.ok(progress(h)! > 0.8 && h.using);
  for (let t = 0; t < 0.2; t += STEP) ({ hold: h, health } = stepUse(h, health, STEP));
  assert.deepEqual(health, { hull: 40, shield: 25 });
  assert.deepEqual(h.items[0], { kind: 'smallShield', count: 1 });
  assert.equal(h.using, null);
  // a second to its cap: a small shield gives up to 50
  health = { hull: 40, shield: 40 };
  h = begun(h, 1, health);
  for (let t = 0; t < 1.1; t += STEP) ({ hold: h, health } = stepUse(h, health, STEP));
  assert.equal(health.shield, 50);
  assert.equal(h.items[0], null, 'the last one gone empties the slot');
  // a kit: hull up to 75
  health = { hull: 70, shield: 0 };
  h = tapped(tapped(h, 2, health), 2, health);
  for (let t = 0; t < 2; t += STEP) ({ hold: h, health } = stepUse(h, health, STEP));
  assert.equal(health.hull, 75);
});

test('nothing is begun that would do nothing, and choosing another slot breaks it off', () => {
  const h = stowed(emptyHold(), 'smallShield', 1).hold;
  assert.equal(useful({ hull: 100, shield: 50 }, 'smallShield'), false);
  assert.equal(begun(h, 1, { hull: 100, shield: 50 }).using, null);
  assert.equal(begun(h, 1, { hull: 0, shield: 0 }).using, null, 'not when sunk');
  const using = begun(h, 1, { hull: 100, shield: 0 });
  assert.ok(using.using);
  assert.equal(tapped(using, 0, { hull: 100, shield: 0 }).using, null);
});

test('a blow breaks off what she is mending with; the storm does not', () => {
  const p = c0, q = at(60);
  const fleet = [vessel(1, p), vessel(2, q)];
  const h = begun(stowed(emptyHold(), 'bigShield', 1).hold, 1, { hull: 100, shield: 0 });
  let b = battleOf([{ ...crewOf(1, gunOf(4)), health: { hull: 100, shield: 0 } }, { ...crewOf(2), hold: h }], 1);
  const aim = frameAt(p).east;
  let broke = false;
  for (let i = 0; i < 60 && !broke; i++) {
    const r = stepBattle(b, fleet, [{ aim, fire: i === 0 }, { aim: null, fire: false }], [], STEP, deep);
    b = r.battle;
    if (r.strikes.length) broke = b.crews[1].hold.using === null;
  }
  assert.ok(broke);
  const out = { centre: frameAt(c0).north, radius: 1, damage: 0.01 };
  const w = weathered(battleOf([{ ...crewOf(2), health: { hull: 100, shield: 0 }, hold: h }], 1), [vessel(2, q)], out, STEP);
  assert.ok(w.battle.crews[0].health.hull < 100 && w.battle.crews[0].hold.using);
});

// ------------------------------------------------------------------ loot

test('the pieces drawn come in 0117 shares: some three in five guns, mostly common', () => {
  const draw = random(7), n = 20000;
  const g = Array.from({ length: n }, () => rolled(draw));
  const guns = g.filter((x) => x.kind === 'gun');
  assert.ok(Math.abs(guns.length / n - LOOT.gun) < 0.02);
  const common = guns.filter((x) => x.kind === 'gun' && x.rarity === 0).length / guns.length;
  const legendary = guns.filter((x) => x.kind === 'gun' && x.rarity === 4).length / guns.length;
  assert.ok(Math.abs(common - 0.42) < 0.02 && Math.abs(legendary - 0.03) < 0.01, `${common} ${legendary}`);
  const small = g.filter((x) => x.kind === 'smallShield');
  assert.ok(small.every((x) => x.kind === 'smallShield' && x.count === 3));
});

test('the loot is strewn evenly over the planet, on open water only, the same for a seed', () => {
  // a world with a round island: its middle dry, its rim shallow
  const isle = fromLatLon(0, 0);
  const depth: Depth = (p) => (distance(p, isle) < 120 ? -5 : 20);
  const f = strewn(5, depth);
  assert.deepEqual(f, strewn(5, depth));
  assert.notDeepEqual(f.pieces.map((l) => l.at), strewn(6, depth).pieces.map((l) => l.at));
  assert.ok(f.pieces.every((l) => depth(l.at) >= SHIP.draught + LOOT.open));
  assert.ok(f.pieces.length > LOOT.spots * 1.3 && f.pieces.length < LOOT.spots * 1.5, `${f.pieces.length}`);
  // the island's spots are moved to its shore, not lost
  assert.ok(f.pieces.some((l) => distance(l.at, isle) < 140));
  // everywhere has some within a cell or so
  const cell = Math.sqrt((4 * Math.PI * R * R) / LOOT.spots);
  const draw = random(3);
  for (let k = 0; k < 200; k++) {
    const p = fromLatLon(Math.asin(2 * draw() - 1), draw() * 2 * Math.PI);
    const near = Math.min(...f.pieces.map((l) => distance(p, l.at)));
    assert.ok(near < 1.2 * cell, `${near}`);
  }
});

test('every berth has a gun within reach of it at the start, on open water; one laid only where there was none', () => {
  // a shoal bank to the east of the berths: no gun is laid on it
  const depth: Depth = (p) => (dot(p, east) > 0 && distance(p, c0) < 60 ? 1 : 20);
  const berths = [c0, at(400), at(-300)];
  const f = berthed(lying(piece(0, at(410), { kind: 'gun', rarity: 1 }), piece(1, at(-300), { kind: 'repairKit', count: 4 })), berths, 9, depth);
  assert.equal(f.pieces.length, 4);
  assert.equal(f.next, 102);
  for (const b of berths) assert.ok(f.pieces.some((l) => l.goods.kind === 'gun' && distance(l.at, b) < LOOT.berth));
  for (const l of f.pieces.slice(2)) assert.ok(depth(l.at) >= SHIP.draught + LOOT.open);
  assert.deepEqual(f, berthed(lying(piece(0, at(410), { kind: 'gun', rarity: 1 }), piece(1, at(-300), { kind: 'repairKit', count: 4 })), berths, 9, depth));
});

test('she takes what fits within reach: a gun with none, stacks into her slots; what does not fit lies', () => {
  const f = lying(piece(1, at(5), { kind: 'gun', rarity: 2 }), piece(2, at(-5), { kind: 'repairKit', count: 4 }), piece(3, at(30), { kind: 'gun', rarity: 4 }));
  const r = swept(f, [crewOf(1)], [vessel(1, c0)], new Map(), 1);
  assert.equal(r.crews[0].gun?.rarity, 2);
  assert.deepEqual(r.crews[0].hold.items[0], { kind: 'repairKit', count: 4 });
  assert.deepEqual(r.flotsam.pieces.map((l) => l.id), [3]);
  // with a gun, another is offered, not taken
  const r2 = swept(lying(piece(4, at(3), { kind: 'gun', rarity: 0 })), r.crews, [vessel(1, c0)], new Map(), 1);
  assert.equal(r2.crews[0].gun?.rarity, 2);
  assert.equal(offered(r2.crews[0], c0, r2.flotsam).gun?.id, 4);
});

test('asked, she swaps her gun for the one offered, and hers goes over the side and lies until she is clear', () => {
  const armed = { ...crewOf(1, gunOf(0)) };
  const f = lying(piece(4, at(3), { kind: 'gun', rarity: 3 }));
  const r = swept(f, [armed], [vessel(1, c0)], new Map([[1, 0]]), 1);
  assert.equal(r.crews[0].gun?.rarity, 3);
  assert.equal(r.flotsam.pieces.length, 1);
  const old = r.flotsam.pieces[0];
  assert.deepEqual([old.goods, old.from], [{ kind: 'gun', rarity: 0 }, 1]);
  // she lies over it unarmed-for-it: her own is not taken back
  const bare = { ...r.crews[0], gun: null };
  let fl = drifted(r.flotsam, 2, deep);
  assert.equal(swept(fl, [bare], [vessel(1, c0)], new Map(), 1).crews[0].gun, null, 'not while she is over it');
  // clear of it, then back: hers again
  fl = swept(fl, [bare], [vessel(1, at(40))], new Map(), 1).flotsam;
  assert.equal(swept(fl, [bare], [vessel(1, c0)], new Map(), 1).crews[0].gun?.rarity, 0);
});

test('with her slots full, a take swaps the stack in hand for what is offered', () => {
  let h = emptyHold();
  for (const k of ['smallShield', 'repairKit', 'bigShield'] as const) h = stowed(h, k, 1).hold;
  const c = { ...crewOf(1), hold: h };
  const f = lying(piece(5, at(2), { kind: 'fullRepair', count: 1 }));
  assert.equal(offered(c, c0, f).item?.id, 5);
  const r = swept(f, [c], [vessel(1, c0)], new Map([[1, 2]]), 1);
  assert.deepEqual(r.crews[0].hold.items[1], { kind: 'fullRepair', count: 1 });
  assert.deepEqual(r.flotsam.pieces.map((l) => l.goods), [{ kind: 'repairKit', count: 1 }]);
});

test('a sinking ship spills all she has, kicked out to drift to a stop', () => {
  const c = { ...crewOf(1, gunOf(2)), hold: stowed(stowed(emptyHold(), 'smallShield', 4).hold, 'repairKit', 2).hold };
  const goods = cargo(c);
  assert.equal(goods.length, 3);
  let f = overboard({ pieces: [], next: 0 }, c0, goods, 1, 9);
  assert.ok(f.pieces.every((l) => Math.hypot(...l.way) >= LOOT.kick));
  for (let t = 0; t < 5; t += STEP) f = drifted(f, STEP, deep);
  const out = f.pieces.map((l) => distance(c0, l.at));
  assert.ok(out.every((d) => d > 0.5 && d < 4), `${out}`);
  assert.ok(f.pieces.every((l) => Math.hypot(...l.way) < 0.01));
});

test('a ship sunk takes nothing', () => {
  const f = lying(piece(1, c0, { kind: 'gun', rarity: 1 }));
  const r = swept(f, [{ ...crewOf(1), health: { hull: 0, shield: 0 } }], [vessel(1, c0)], new Map(), 1);
  assert.equal(r.crews[0].gun, null);
  assert.equal(HEALTH.start, 0, 'she puts to sea with no shield, filled from loot');
});
