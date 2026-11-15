// Her own water's rules (sim/holding.ts): in it she sails faster and her shield comes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crewOf, type Crew } from '../src/sim/battle.ts';
import { HEALTH, HOLDING, SHIP } from '../src/sim/handling.ts';
import { atHome, homed, regain, type Waters } from '../src/sim/holding.ts';
import { shipAt, step, type ShipState } from '../src/sim/ship.ts';
import { normalize, type Vec3 } from '../src/world/sphere.ts';

/** Ship 0 holds the water with x > 0, ship 1 the water with x < −0.5; the rest is open sea. */
const waters: Waters = { ownerAt: (p) => (p[0] > 0 ? 0 : p[0] < -0.5 ? 1 : -1) };
const east: Vec3 = [1, 0, 0], west: Vec3 = [-1, 0, 0], between: Vec3 = normalize([-0.2, 1, 0]);
const lying = (id: number, at: Vec3) => ({ id, ship: { at } });
const shielded = (id: number, shield: number): Crew => ({ ...crewOf(id), health: { hull: HEALTH.hull, shield } });

test('she is at home only in her own water, and never outside a match', () => {
  assert.equal(atHome(waters, lying(0, east)), true);
  assert.equal(atHome(waters, lying(1, east)), false, "another's water");
  assert.equal(atHome(waters, lying(0, between)), false, 'open sea');
  assert.equal(atHome(waters, lying(1, west)), true);
  assert.equal(atHome(null, lying(0, east)), false);
});

test("in her sidemate's water she is at home too: her shield comes back there and her helm is homed", () => {
  // ships 0 and 1 one side (7), ship 2 another
  const sideOf = [7, 7, 3], sided: Waters = { ...waters, sideAt: (p) => { const o = waters.ownerAt(p); return o < 0 ? -1 : sideOf[o]; } };
  const at = (id: number, p: Vec3) => ({ ...lying(id, p), side: sideOf[id] });
  assert.equal(atHome(sided, at(1, east)), true, "her mate's water");
  assert.equal(atHome(sided, at(2, east)), false, "a foe's water");
  assert.equal(atHome(sided, at(0, between)), false, 'open sea');
  assert.equal(homed({ course: null, throttle: 1 }, sided, at(1, east)).home, true);
  const r = regain([shielded(1, 10)], [at(1, east)], sided, 1);
  assert.equal(r.crews[0].health.shield, 10 + HOLDING.shield);
});

test('in her own water her helm asks for HOLDING.speed times her top speed, and gets it', () => {
  const helm = { course: null, throttle: 1 };
  assert.deepEqual(homed(helm, waters, lying(0, east)), { ...helm, home: true });
  assert.deepEqual(homed(helm, waters, lying(1, east)), { ...helm, home: false });
  let home: ShipState = { ...shipAt([0, 0, 1], [1, 0, 0]), speed: SHIP.top }, away = home;
  for (let t = 0; t < 20; t += 1 / 30) {
    home = step(home, { ...helm, home: true }, 1 / 30, () => 50);
    away = step(away, { ...helm, home: false }, 1 / 30, () => 50);
  }
  assert.ok(Math.abs(home.speed - SHIP.top * HOLDING.speed) < 0.01, `${home.speed}`);
  assert.ok(Math.abs(away.speed - SHIP.top) < 0.01, `${away.speed}`);
});

test('in her own water her shield comes back at HOLDING.shield a second, up to its most; elsewhere it does not', () => {
  const dt = 1 / 30, crews = [shielded(0, 40), shielded(1, 40), shielded(2, HEALTH.shield - 0.01), shielded(3, 40)];
  const fleet = [lying(0, east), lying(1, east), lying(2, east), lying(3, west)];
  // ship 2 lies in ship 0's water; ship 3 in ship 1's (and ship 1 is not in hers)
  const r = regain(crews, fleet, { ownerAt: (p) => (p[0] > 0 ? (p[1] > 2 ? 9 : 0) : 1) }, dt);
  assert.ok(Math.abs(r.crews[0].health.shield - (40 + HOLDING.shield * dt)) < 1e-12);
  assert.equal(r.crews[1], crews[1], "in another's water: the same crew");
  assert.equal(r.crews[3], crews[3]);
  assert.deepEqual(r.regained.map((k) => k.id), [0]);
  assert.ok(Math.abs(r.regained[0].shield - HOLDING.shield * dt) < 1e-12);
  // at her most, nothing more: the same crew, nothing regained
  const full = regain([shielded(0, HEALTH.shield)], [lying(0, east)], waters, dt);
  assert.equal(full.crews[0].health.shield, HEALTH.shield);
  assert.deepEqual(full.regained, []);
  const topped = regain([shielded(0, HEALTH.shield - 0.01)], [lying(0, east)], waters, dt);
  assert.equal(topped.crews[0].health.shield, HEALTH.shield);
  assert.ok(Math.abs(topped.regained[0].shield - 0.01) < 1e-9);
  // a crew not in the fleet (sunk) is left as she is
  assert.equal(regain([shielded(5, 10)], [], waters, dt).crews[0].health.shield, 10);
});
