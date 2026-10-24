// WP7 part A, doubloons: the purse a trail fills (up to the form's capacity) and a closed loop banks, the income held
// sea pays into the bank, and the coins a spill scatters, which hulls scoop and which sink at the end of their life.
// (Sailing a trail to fill the purse, and breaking one to spill it, are in territory.test.ts.)
//   node --test tests/sim/economy.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankPurse, earn, fill, scoop, spill } from '../../src/sim/economy.ts';
import { normalize, v3 } from '../../src/sim/math.ts';
import { AREA_Q, R } from '../../src/sim/sphere.ts';
import { EVENT, TICK, createMatch } from '../../src/sim/state.ts';
import { COINS, ECONOMY, FORMS } from '../../src/sim/tables.ts';

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
  for (let k = 0; k < Math.round(60 / TICK); k++) earn(s);
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
