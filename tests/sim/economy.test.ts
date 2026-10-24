// WP7, doubloons: the purse a trail fills (up to the form's capacity) and a closed loop banks, the income held
// sea pays into the bank, and the coins a spill scatters, which hulls scoop and which sink at the end of their life;
// the finds (wrecks and island caches taken by holding beside them, flotsam and bottles adrift) and the Caldera's rain.
// (Sailing a trail to fill the purse, and breaking one to spill it, are in territory.test.ts.)
//   node --test tests/sim/economy.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankPurse, earn, eruption, fill, forage, scoop, siteValue, spill, untilEruption } from '../../src/sim/economy.ts';
import { aground, seaFor } from '../../src/sim/environment.ts';
import { cross, dot, normalize, v3, type V3 } from '../../src/sim/math.ts';
import { AREA_Q, R, TERRITORY, cellDir, cellOf } from '../../src/sim/sphere.ts';
import { AFLOAT, EVENT, TICK, createMatch, type MatchState } from '../../src/sim/state.ts';
import { CALDERA, COINS, ECONOMY, FINDS, FORMS, PERK } from '../../src/sim/tables.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { world } from './vectors.ts';

const sea = seaFor(world(), 11);

/** A match, and a place across the planet from its fleet. */
function match() {
  const s = createMatch({ seed: 11 }), p = s.ships[0].pos;
  return { s, far: normalize(v3(-p.x, -p.y, -p.z)) };
}

test("the purse fills by the distance sailed, never past the form's capacity, and a closed loop banks it", () => {
  const { s } = match(), ship = s.ships[0], cap = FORMS[ship.form].purse;
  fill(s, 0, 10);
  assert.equal(ship.purse, 10 * ECONOMY.trail);
  fill(s, 0, 1e6);
  assert.equal(ship.purse, cap);
  bankPurse(s, 0);
  assert.deepEqual([ship.bank, ship.purse], [cap, 0]);
  assert.deepEqual(s.events.map((e) => [e.kind, e.ship, e.amount]), [[EVENT.bank, 0, cap]]);
  bankPurse(s, 0); // an empty purse banks nothing
  assert.equal(s.events.length, 1);
});

test('held sea pays its income straight into the bank: a doubloon a minute for every 1000 u²', () => {
  const { s } = match();
  s.ships[2].held = 1000 * AREA_Q;
  for (let k = 0; k < Math.round(60 / TICK); k++) earn(sea, s);
  assert.ok(Math.abs(s.ships[2].bank - 1) < 1e-9, `${s.ships[2].bank}`);
  assert.equal(s.ships[3].bank, 0);
});

test('a spill scatters coins worth all of it round the place; hulls scoop them, into the bank or an open trail\'s purse as far as it has room', () => {
  const { s, far } = match();
  spill(s, far, 100, 3);
  const afloat = s.coins.filter((c) => c.value > 0);
  assert.equal(afloat.length, Math.ceil(100 / COINS.each));
  assert.ok(Math.abs(afloat.reduce((sum, c) => sum + c.value, 0) - 100) < 1e-9);
  for (const c of afloat) assert.ok(Math.hypot(c.at.x - far.x, c.at.y - far.y, c.at.z - far.z) * R <= COINS.scatter + 1e-9);
  assert.deepEqual(s.events.map((e) => [e.kind, e.ship, e.amount]), [[EVENT.spill, 3, 100]]);
  const ship = s.ships[4];
  for (const c of afloat) {
    ship.pos = { ...c.at };
    scoop(s);
  }
  assert.ok(Math.abs(ship.bank - 100) < 1e-9);
  assert.equal(s.coins.filter((c) => c.value > 0).length, 0);
  const trader = s.ships[5], cap = FORMS[trader.form].purse;
  trader.laid.push(0); // sailing an open trail
  trader.purse = cap - 5;
  spill(s, far, 20, 3); // two coins of 10, 3 u apart
  const [first] = s.coins.filter((c) => c.value > 0);
  trader.pos = { ...first.at };
  scoop(s);
  assert.deepEqual([trader.purse, first.value, trader.bank], [cap, 5, 0]);
});

test("coins sink at the end of their life; a spill into a full sea takes the oldest coins' places", () => {
  const { s, far } = match();
  spill(s, far, 100, 1);
  for (let k = 0; k <= Math.round(COINS.life / TICK); k++) scoop(s);
  assert.equal(s.coins.filter((c) => c.value > 0).length, 0);
  for (let k = 0; k < COINS.count / COINS.most; k++) {
    spill(s, far, COINS.most * COINS.each, 1);
    scoop(s);
  }
  spill(s, far, COINS.most * COINS.each, 2);
  assert.equal(s.coins.filter((c) => c.value > 0).length, COINS.count);
  assert.ok(s.coins.slice(0, COINS.most).every((c) => c.age === 0));
});

test('holding the Weeping Isle doubles the income held sea pays', () => {
  const { s } = match();
  s.ships[2].held = s.ships[3].held = 1000 * AREA_Q;
  s.owner[sea.marks[sea.geo.landmarks.findIndex((l) => l.perk === 'weepingIsle')]] = 3;
  for (let k = 0; k < Math.round(60 / TICK); k++) earn(sea, s);
  assert.ok(Math.abs(s.ships[2].bank - PERK.weepingIsle) < 1e-9 && Math.abs(s.ships[3].bank - 1) < 1e-9);
});

/** One tick of finds, its events alone in the list. */
function pass(s: MatchState): void {
  s.events.length = 0;
  forage(sea, s);
  s.tick++;
}

/** A point in open water within `reach` u of p, searched ring by ring outward, or null. */
function water(s: MatchState, p: V3, reach: number): V3 | null {
  const e = normalize(cross(v3(), Math.abs(p.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0), p)), n = cross(v3(), p, e);
  for (let d = 0.5; d < reach; d += 0.5) {
    for (let k = 0; k < 24; k++) {
      const c = (Math.cos((k * Math.PI) / 12) * d) / R, si = (Math.sin((k * Math.PI) / 12) * d) / R;
      const q = normalize(v3(p.x + e.x * c + n.x * si, p.y + e.y * c + n.y * si, p.z + e.z * c + n.z * si));
      if (!aground(sea, s, q)) return q;
    }
  }
  return null;
}

test('every wreck and island cache has open water within reach, where a ship can hold beside it', () => {
  const { s } = match();
  for (const f of sea.geo.finds) assert.ok(water(s, f.pos, FINDS[f.kind].reach), `a ${f.kind} in ${REGIONS[f.region].id}`);
});

test('richer regions hold richer finds', () => {
  sea.geo.finds.forEach((f, k) => assert.equal(siteValue(sea, k), FINDS[f.kind].value * REGIONS[f.region].richness));
  const richest = Math.max(...REGIONS.map((r) => r.richness));
  assert.ok(sea.geo.finds.some((f) => f.kind === 'wreck' && REGIONS[f.region].richness === richest));
});

for (const kind of ['wreck', 'cache'] as const) {
  test(`holding beside a ${kind} for ${FINDS[kind].hold} s takes it into the bank; it comes back later; moving away loses the hold`, () => {
    const { s } = match(), dock = { ...s.ships[0].pos }, sites = sea.geo.finds, ship = s.ships[0], rival = s.ships[1];
    let k = -1; // the site of the kind farthest from the fleet, which waits at its start
    sites.forEach((f, j) => { if (f.kind === kind && (k < 0 || dot(f.pos, dock) < dot(sites[k].pos, dock))) k = j; });
    const spot = water(s, sites[k].pos, FINDS[kind].reach)!, ticks = Math.round(FINDS[kind].hold / TICK);
    const worth = FINDS[kind].value * sites[k].richness;
    ship.pos = { ...spot };
    for (let t = 1; t < ticks; t++) pass(s);
    assert.deepEqual([ship.prize, ship.bank], [k, 0]);
    pass(s);
    assert.deepEqual([ship.prize, ship.holding, ship.bank, siteValue(sea, k)], [-1, 0, worth, worth]);
    assert.ok(s.events.some((e) => e.kind === EVENT.find && e.ship === 0 && e.by === k && e.amount === worth));
    assert.ok(s.timeline.some((e) => e.kind === EVENT.find && e.ship === 0 && e.by === k));
    const wait = s.finds[k], refill = FINDS[kind].refill;
    assert.ok(wait >= refill * (1 - FINDS.jitter) && wait <= refill * (1 + FINDS.jitter), `${wait}`);
    pass(s);
    assert.equal(ship.prize, -1); // nothing there to take while it refills
    ship.pos = { ...dock };
    while (s.finds[k] > 0) pass(s);
    rival.pos = { ...spot };
    for (let t = 1; t < ticks; t++) pass(s);
    assert.equal(rival.prize, k);
    rival.pos = { ...dock };
    pass(s);
    assert.deepEqual([rival.prize, rival.holding, rival.bank, s.finds[k]], [-1, 0, 0, 0]);
  });
}

test('wrecks shed flotsam and bottles come afloat on their rhythms; both drift on the currents and are scooped by sailing through them', () => {
  const { s } = match(), kinds: number[] = [];
  while (s.tick <= Math.round(FINDS.bottle.every / TICK)) {
    pass(s);
    for (const e of s.events) if (e.kind === EVENT.afloat) kinds.push(e.by);
  }
  assert.deepEqual(kinds, [AFLOAT.flotsam, AFLOAT.flotsam, AFLOAT.bottle]);
  const flotsam = s.coins.filter((c) => c.kind === AFLOAT.flotsam && c.value > 0);
  const bottle = s.coins.find((c) => c.kind === AFLOAT.bottle && c.value > 0)!, worth = bottle.value;
  assert.equal(flotsam.length, 2 * FINDS.flotsam.pieces);
  assert.ok(!aground(sea, s, bottle.at));
  assert.equal(worth, FINDS.bottle.value * REGIONS[sea.geo.region[cellOf(TERRITORY, bottle.at)]].richness);
  const ship = s.ships[0], before = ship.bank;
  ship.pos = { ...bottle.at };
  s.events.length = 0;
  scoop(s);
  assert.ok(Math.abs(ship.bank - before - worth) < 1e-9 && bottle.value === 0);
  assert.ok(s.events.some((e) => e.kind === EVENT.scoop && e.ship === 0 && e.by === AFLOAT.bottle && e.amount === worth));
  const p = sea.current.points, on = normalize(v3(p[90], p[91], p[92])); // on the Great Current
  Object.assign(bottle, { at: { ...on }, value: 1, age: 0 });
  for (let t = 0; t < Math.round(1 / TICK); t++) pass(s);
  assert.ok(R * Math.acos(Math.min(1, dot(bottle.at, on))) > 1, 'a second on the Great Current carries it along');
  flotsam[0].age = FINDS.flotsam.life - TICK / 2;
  scoop(s);
  assert.equal(flotsam[0].value, 0); // broken up at the end of its life
});

test("the Caldera erupts on its rhythm, raining doubloons into its holder's waters, or round it for anyone while unheld", () => {
  const mark = sea.geo.landmarks.find((l) => l.perk === 'caldera')!, d = v3(), reach = mark.r + CALDERA.spread;
  for (const held of [true, false]) {
    const { s } = match();
    while (eruption(s) >= 0) s.tick++;
    s.tick += Math.round(untilEruption(s) / TICK);
    assert.equal(eruption(s), 0);
    if (held) for (let c = 0; c < TERRITORY.cells; c++) if (dot(cellDir(TERRITORY, c, d), mark.pos) > Math.cos((reach + 2) / R)) s.owner[c] = 5;
    const erupted: number[] = [];
    while (eruption(s) >= 0) {
      pass(s);
      for (const e of s.events) if (e.kind === EVENT.erupt) erupted.push(e.ship, e.amount);
    }
    assert.deepEqual(erupted, [held ? 4 : -1, CALDERA.value]);
    assert.ok(untilEruption(s) > 0);
    const rain = s.coins.filter((c) => c.kind === AFLOAT.coin && c.value > 0);
    assert.ok(rain.length > 0 && rain.reduce((a, c) => a + c.value, 0) <= CALDERA.value + 1e-9, `${rain.length} coins`);
    for (const c of rain) {
      assert.ok(dot(c.at, mark.pos) >= Math.cos(reach / R) - 1e-12);
      if (held) assert.equal(s.owner[cellOf(TERRITORY, c.at)], 5);
    }
  }
});
