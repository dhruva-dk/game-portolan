// WP19: the ships follow the sim. Where a ship floats and which way it points between ticks, heel to leeward and
// outward in a turn, sails that show the point of sail and the sail step, damage states, levels by distance, no NaNs
// through a battering, and ten ships within the fleet's triangle and draw budgets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStyle } from '../../src/style/glsl.ts';
import { createMatch, fullHull, SAIL, type Ship as Vessel } from '../../src/sim/state.ts';
import { R } from '../../src/sim/sphere.ts';
import { MOTION, Plumes, ShipView, type Conditions, type Rider } from '../../src/render/ships/shipView.ts';
import { FLEET_TRIANGLES, fleetLods } from '../../src/render/ships/shipwright.ts';

const style = createStyle();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** A glassy sea: hulls float at R, decks level. */
const flat: Rider = { ride: (p, _f, _l, _b, _t, out) => { out.position.set(p.x, p.y, p.z).normalize().multiplyScalar(R); out.up.set(p.x, p.y, p.z).normalize(); return out; } };
const put = (o: { x: number; y: number; z: number }, v: THREE.Vector3) => { o.x = v.x; o.y = v.y; o.z = v.z; };
const cond = (wind = V(), strength = 1): Conditions => ({ wind, strength, rough: 1, leader: false, hit: false, battle: false });
const P0 = V(0, 0, 1), EAST = V(1, 0, 0), PORT = V(0, 1, 0); // heading east at the pole: port is +y

function vessel(form = 1, k = 0): Vessel {
  const s = createMatch({ seed: 7 }).ships[k];
  s.form = form;
  put(s.pos, P0); put(s.was, P0); put(s.head, EAST); put(s.wasHead, EAST);
  s.speed = 3; s.rate = 0; s.sail = SAIL.full; s.hull = fullHull(s.form, s.fittings); s.fire = 0; s.torn = 0;
  return s;
}
let clock = 0;
function run(v: ShipView, s: Vessel, c: Conditions, seconds: number, plumes?: Plumes, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) {
    clock += dt;
    v.update(s, { alpha: 1, clock, dt }, c, flat);
    if (plumes) v.exhale(plumes, s, c, dt, clock);
  }
}
const mast = (v: ShipView) => V(0, 1, 0).applyQuaternion(v.ship.quaternion);
const bow = (v: ShipView) => V(0, 0, 1).applyQuaternion(v.ship.quaternion);

test('between ticks a ship floats where the sim puts it and points where it heads', () => {
  const s = vessel(), v = new ShipView(style, 0, s);
  s.speed = 0;
  const next = P0.clone().applyAxisAngle(PORT, 0.004), turned = EAST.clone().applyAxisAngle(P0, 0.3);
  put(s.pos, next); put(s.head, turned);
  v.update(s, { alpha: 0.5, clock: 1, dt: 1 / 60 }, cond(V(), 0), flat);
  const mid = P0.clone().add(next).normalize().multiplyScalar(R);
  assert.ok(v.ship.position.distanceTo(mid) < 1e-6 * R, `position off by ${v.ship.position.distanceTo(mid)}`);
  const want = EAST.clone().applyAxisAngle(P0, 0.15);
  assert.ok(bow(v).angleTo(want) < 0.01, `bow off the interpolated heading by ${bow(v).angleTo(want)} rad`);
  assert.ok(mast(v).angleTo(mid.clone().normalize()) < 0.01, 'upright on a calm sea');
});

test('heels to leeward under sail and outward in a turn, answering the helm within a second', () => {
  const s = vessel(), v = new ShipView(style, 0, s);
  run(v, s, cond(PORT.clone().multiplyScalar(-6)), 3); // the wind from port, beam on
  assert.ok(v.heel > 0.08 && v.heel < MOTION.max, `heel ${v.heel}`);
  assert.ok(mast(v).dot(PORT) < -0.05, 'the masts lean to starboard, away from the wind');
  const t = new ShipView(style, 0, vessel());
  const ts = vessel();
  ts.rate = 0.6; ts.speed = 4;
  run(t, ts, cond(V(), 0), 0.6);
  const target = -MOTION.turn * 0.6 * 4;
  assert.ok(t.heel < 0.6 * target, `turning to starboard heels to port: ${t.heel} after 0.6 s (target ${target})`);
});

test('the sails show the truth: luffing head to wind, drawing on a reach, reefed when the step drops', () => {
  const s = vessel(), v = new ShipView(style, 0, s);
  run(v, s, cond(EAST.clone().multiplyScalar(-6)), 2); // dead ahead
  assert.ok(v.rig.sails.every((sl) => sl.fill < 0.05 && sl.shiver > 0.5), 'head to wind: no fill, shivering');
  run(v, s, cond(PORT.clone().multiplyScalar(-6)), 2);
  assert.ok(v.rig.sails.every((sl) => sl.fill > 0.6 && sl.shiver < 0.2), 'beam reach: full and drawing');
  s.sail = SAIL.reefed;
  run(v, s, cond(PORT.clone().multiplyScalar(-6)), 5);
  const reefed = v.ship.rig.state('reefed');
  v.rig.sails.forEach((sl, i) => assert.ok(Math.abs(sl.set - reefed.sails[i].set) < 0.05 && Math.abs(sl.reef - reefed.sails[i].reef) < 0.05, `sail ${i} reefed`));
});

test('damage: a hit shivers the canvas; a battered hull lists, settles, tears its sails, smokes and burns', () => {
  const s = vessel(3), v = new ShipView(style, 1, s), plumes = new Plumes(style), c = cond(PORT.clone().multiplyScalar(-6));
  run(v, s, c, 1);
  c.hit = true;
  run(v, s, c, 1 / 60);
  assert.ok(v.rig.sails.every((sl) => sl.shiver === 1), 'shivers on the hit');
  c.hit = false;
  s.hull = 0.12 * fullHull(s.form, s.fittings); s.fire = 10; s.torn = 4; s.speed = 0;
  run(v, s, cond(V(), 0), 3, plumes);
  assert.ok(Math.abs(v.heel) > 0.15, `lists ${v.heel}`);
  assert.ok(v.ship.position.length() < R - 0.2, 'settles in the water');
  assert.ok(v.rig.sails.every((sl) => sl.torn >= 0.8 && sl.slack > 0.5), 'torn and slack');
  plumes.update(clock);
  assert.ok(plumes.triangles > 20, `smoke and flame: ${plumes.triangles} triangles`);
  assert.ok(v.lamp.reach < 6, 'the lantern gutters');
});

test('levels follow the distance: hero under the chase camera, far on the horizon', () => {
  const s = vessel(2), v = new ShipView(style, 0, s), cam = new THREE.PerspectiveCamera(50, 956 / 440, 0.1, 2000);
  run(v, s, cond(), 0.1);
  for (const [d, lod] of [[9, 'hero'], [400, 'far'], [9, 'hero']] as const) {
    cam.position.copy(v.ship.position).addScaledVector(EAST, -d).addScaledVector(P0, 2);
    cam.lookAt(v.ship.position);
    cam.updateMatrixWorld();
    for (let k = 0; k < 40; k++) fleetLods([v.ship], cam, 440, 0.05);
    assert.equal(v.ship.lod, lod, `at ${d} u`);
  }
});

test('ten ships through a battering: never a NaN, within the fleet budgets', () => {
  const plumes = new Plumes(style), rng = (() => { let a = 99; return () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 2 ** 32); })();
  const ships = Array.from({ length: 10 }, (_, k) => {
    const s = vessel(k % 4, k), p = P0.clone().applyAxisAngle(EAST, (k * 7) / R).applyAxisAngle(PORT, ((k % 3) * 9) / R);
    put(s.pos, p); put(s.was, p);
    return { s, v: new ShipView(style, k, s) };
  });
  for (let f = 0; f < 300; f++) {
    clock += 1 / 30;
    const c = cond(V(rng() - 0.5, rng() - 0.5, 0).multiplyScalar(14), 2.5 * rng());
    for (const { s, v } of ships) {
      s.rate = 2 * rng() - 1; s.speed = 8 * rng(); s.sail = Math.floor(3 * rng()); s.fire = rng() < 0.3 ? 5 : 0;
      s.hull = rng() * fullHull(s.form, s.fittings); c.hit = rng() < 0.1;
      v.update(s, { alpha: rng(), clock, dt: 1 / 30 }, c, flat);
      v.exhale(plumes, s, c, 1 / 30, clock);
      v.ship.updateMatrixWorld(true);
      assert.ok(v.ship.matrixWorld.elements.every(Number.isFinite) && Number.isFinite(v.heel + v.pitch + v.lamp.reach), `NaN on ship ${v.id}`);
    }
  }
  plumes.update(clock);
  const cam = new THREE.PerspectiveCamera(50, 956 / 440, 0.1, 2000), lead = ships[0].v.ship.position;
  cam.position.copy(lead).addScaledVector(EAST, -12).addScaledVector(P0, 3);
  cam.lookAt(lead);
  cam.updateMatrixWorld();
  let tris = 0;
  for (let k = 0; k < 40; k++) tris = fleetLods(ships.map((x) => x.v.ship), cam, 440, 0.05);
  let draws = 0;
  for (const { v } of ships) v.ship.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) draws++; });
  console.log(`ten ships: ${tris} triangles under fleetLods, ${draws} draws, plumes ${plumes.triangles} triangles in 1 draw`);
  assert.ok(tris <= FLEET_TRIANGLES, `${tris} triangles`);
  assert.ok(draws + 1 <= 50, `${draws} draws`);
});
