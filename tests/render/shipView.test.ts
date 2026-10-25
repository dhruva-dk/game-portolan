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
  assert.ok(v.rig.sails.every((sl) => Math.abs(sl.fill) < 0.05 && sl.shiver > 0.5), 'head to wind: no fill, shivering');
  run(v, s, cond(PORT.clone().multiplyScalar(-6)), 2);
  assert.ok(v.rig.sails.every((sl) => Math.abs(sl.fill) > 0.6 && sl.shiver < 0.2), 'beam reach: full and drawing');
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

// ── part B: the sinking, struck colours, fittings and wounds on the hull, canvas to leeward, rigging clear of canvas ──
import { PHASE } from '../../src/sim/state.ts';
import { FITTING, FITTING_SLOT, SLOT } from '../../src/sim/tables.ts';
import { dressHull, WOUND } from '../../src/render/ships/outfit.ts';
import { ShipMesher } from '../../src/render/ships/mesher.ts';
import { sailLocal, trim, type Anchor } from '../../src/render/ships/rig.ts';
import { FORM_NAMES } from '../../src/render/ships/forms.ts';
import { LOD_BUDGET } from '../../src/render/ships/shipwright.ts';
import { FLOTSAM, RING, SINK, SLICK, STRIKE } from '../../src/render/ships/shipView.ts';

test('sinking: colours struck and a deepening list, the canvas gone, down by an end, rings, slick and flotsam, then gone', () => {
  const s = vessel(2), v = new ShipView(style, 4, s), plumes = new Plumes(style), c = cond(V(0, 1, 0), 1);
  run(v, s, c, 1.5, plumes);
  const r0 = v.ship.position.length();
  s.phase = PHASE.sunk; s.speed = 0;
  let t = 0;
  const until = (k: number) => { run(v, s, c, k - t, plumes); t = k; };
  until(SINK.strike + 0.3);
  assert.ok(v.struck > 0.95 && Math.abs(v.heel) > 0.3, `struck ${v.struck}, list ${v.heel}`);
  until(SINK.rig + 1.3);
  assert.ok(v.rig.sails.every((sl) => sl.set < 0.35), `canvas still set: ${v.rig.sails.map((sl) => sl.set.toFixed(2))}`);
  assert.ok(plumes.live(FLOTSAM, clock) >= 4, 'spars adrift where the rig went');
  until(8.5);
  assert.ok(v.ship.visible && v.pitch > 0.25, `down by the stern: pitch ${v.pitch}`);
  assert.ok(v.ship.position.length() < r0 - v.draft - 1, `founders: ${(r0 - v.ship.position.length()).toFixed(2)} u down`);
  assert.ok(plumes.live(RING, clock) > 0 && plumes.live(SLICK, clock) > 0, 'rings and a slick');
  until(SINK.gone + 0.2);
  assert.ok(v.gone && !v.ship.visible && v.lamp.reach === 0, 'gone, the lantern drowned');
  assert.ok(plumes.live(SLICK, clock) > 0 && plumes.live(FLOTSAM, clock) > 6, 'the slick and flotsam linger');
});

test('a beaten ship strikes her colours (the masthead pennant last) and hoists them again once repaired', () => {
  const s = vessel(3), v = new ShipView(style, 1, s), c = cond(V(0, 1, 0), 1), full = fullHull(s.form, s.fittings), flags = v.ship.flags;
  const top = flags.reduce((t, f, j) => (f.root.y > flags[t].root.y ? j : t), 0), rail = v.ship.rig.hull.railAft;
  run(v, s, c, 1);
  assert.equal(v.struck, 0);
  s.hull = full * (0.96 - STRIKE.at);
  run(v, s, c, 2);
  assert.ok(flags.length > 1 && v.struck > 0.999, `struck ${v.struck} of ${flags.length} flags`);
  flags.forEach((f, i) => {
    const q = v.colours[i];
    if (i === top) assert.ok(Math.abs(q.y - f.root.y) < 1e-6, 'the masthead pennant flies on');
    else assert.ok(q.y <= Math.min(f.root.y, rail + 0.13) + 1e-6 && q.w <= 0.36 * f.length, `flag ${i} not struck: ${q.y} (rail ${rail})`);
  });
  s.hull = full;
  run(v, s, c, 2);
  assert.ok(v.struck === 0 && flags.every((f, i) => Math.abs(v.colours[i].y - f.root.y) < 1e-6), 'colours hoisted again');
});

test('every fitting shows on the hull in its slot, within the hero budget and at no extra draw', () => {
  const s = vessel(2), v = new ShipView(style, 3, s), rig = v.ship.rig, L = v.length;
  for (let kind = 1; kind < FITTING_SLOT.length; kind++) {
    const m = new ShipMesher();
    dressHull(m, rig, [{ kind, tier: 2 }], [], true, 0, false);
    const g = m.build();
    g.computeBoundingBox();
    const b = g.boundingBox!, mid = b.getCenter(V()), slot = FITTING_SLOT[kind];
    assert.ok(m.triangles > 0, `fitting ${kind} builds nothing`);
    if (slot === SLOT.bow) assert.ok(b.max.z > 0.4 * L, `bow fitting ${kind} reaches z ${b.max.z.toFixed(2)} of ${L}`);
    if (slot === SLOT.stern) assert.ok(mid.z < -0.25 * L, `stern fitting ${kind} sits at z ${mid.z.toFixed(2)}`);
    if (slot === SLOT.broadside) assert.ok(b.max.x - b.min.x > 0.5 * v.beam, `broadside fitting ${kind} spans ${(b.max.x - b.min.x).toFixed(2)}`);
    if (kind === FITTING.copperSheathing || kind === FITTING.doubledPlanking) assert.ok(b.max.z - b.min.z > 0.6 * L, `hull fitting ${kind} runs ${(b.max.z - b.min.z).toFixed(2)}`);
    if (kind === FITTING.crowsNest || kind === FITTING.lookout) assert.ok(b.min.y > rig.hull.railAft + 1, `lookout fitting ${kind} aloft at ${b.min.y.toFixed(2)}`);
    g.dispose();
  }
  const c = cond(V(0, 1, 0)), meshes = () => { let n = 0; v.ship.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
  run(v, s, c, 0.3);
  const n0 = meshes(), t0 = v.outfit.triangles;
  ([[SLOT.bow, FITTING.ironRam], [SLOT.broadside, FITTING.longGuns], [SLOT.stern, FITTING.mortar], [SLOT.rig, FITTING.lateenMizzen], [SLOT.hull, FITTING.copperSheathing], [SLOT.lookout, FITTING.crowsNest]] as const)
    .forEach(([slot, kind]) => Object.assign(s.fittings[slot], { kind, tier: 3 }));
  s.hull = fullHull(s.form, s.fittings) * 0.2;
  run(v, s, c, 0.6);
  const hero = v.ship.lodTriangles[0] + v.outfit.triangles;
  console.log(`hero galleon with six fittings and ${v.wounds.length} wounds: +${v.outfit.triangles} triangles (outfit), ${hero} at the hero level`);
  assert.ok(v.outfit.triangles > t0 && meshes() === n0, 'the outfit is built into the wood, not drawn apart');
  assert.ok(hero <= LOD_BUDGET.hero, `${hero} hero triangles`);
});

test('wounds follow the loss: holes and stove-in rails, scorching after fire, patches once repaired', () => {
  const s = vessel(1), v = new ShipView(style, 5, s), c = cond(V(0, 1, 0)), full = fullHull(s.form, s.fittings);
  run(v, s, c, 0.5);
  const t0 = v.outfit.triangles;
  s.hull = full * 0.4; s.fire = 10;
  run(v, s, c, 3);
  const open = v.wounds.filter((w) => w.kind === WOUND.hole || w.kind === WOUND.rail).length;
  assert.ok(open >= 7 && v.wounds.some((w) => w.kind === WOUND.scorch) && v.outfit.triangles > t0, `${open} holes, ${v.outfit.triangles} triangles`);
  s.fire = 0; s.hull = full * 0.9;
  run(v, s, c, 1);
  assert.ok(v.wounds.filter((w) => w.kind === WOUND.patch).length >= 5, 'patched once repaired');
});

test('the canvas always bellies to leeward, on either tack and every point of sail', () => {
  const M = new THREE.Matrix4(), p0 = V(), p1 = V();
  for (let form = 0; form < FORM_NAMES.length; form++) {
    const s = vessel(form), v = new ShipView(style, 2, s), rig = v.ship.rig;
    s.speed = 0;
    for (const from of [-2.9, -2.3, -1.6, -1.0, -0.7, 0.7, 1.0, 1.6, 2.3, 2.9]) {
      const toward = from > 0 ? from - Math.PI : from + Math.PI, w = V(Math.sin(toward), 0, Math.cos(toward));
      run(v, s, cond(PORT.clone().multiplyScalar(w.x).addScaledVector(EAST, w.z), 1), 1.5);
      v.rig.sails.forEach((st, i) => {
        if (Math.abs(st.fill) < 0.1) return;
        const lay = rig.sails[i];
        rig.yardMatrix(v.rig, lay.yard, M);
        sailLocal(lay, st, 0.5, 0.55, 0, p1).applyMatrix4(M);
        sailLocal(lay, { ...st, fill: 0, shiver: 0, slack: 0 }, 0.5, 0.55, 0, p0).applyMatrix4(M);
        assert.ok(p1.sub(p0).dot(w) > 0, `${FORM_NAMES[form]} sail ${i} (${lay.kind}) bellies to windward, wind from ${from}`);
      });
    }
  }
});

test('rigging never cuts through the canvas across the trim, fill, reef and shiver sweep', () => {
  // heel and pitch turn hull, rig and canvas as one body; what moves rope against cloth is trim, set, fill and shiver
  const D = V(), E1 = V(), E2 = V(), PV = V(), TV = V(), QV = V(), A = V(), B = V(), M = new THREE.Matrix4();
  const through = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3): boolean => {
    D.subVectors(B, A); E1.subVectors(p1, p0); E2.subVectors(p2, p0); PV.crossVectors(D, E2);
    const det = E1.dot(PV);
    if (Math.abs(det) < 1e-12) return false;
    TV.subVectors(A, p0);
    const u = TV.dot(PV) / det;
    if (u < 0 || u > 1) return false;
    QV.crossVectors(TV, E1);
    const w = D.dot(QV) / det, t = E2.dot(QV) / det;
    return w >= 0 && u + w <= 1 && t > 0.03 && t < 0.97;
  };
  const cuts = new Set<string>(), G = 5;
  for (let form = 0; form < FORM_NAMES.length; form++) {
    const v = new ShipView(style, 2, vessel(form)), rig = v.ship.rig, ends = new Float32Array(6 * rig.ropes.length);
    for (const canvas of ['full', 'reefed'] as const) for (const from of [-2.9, -2.0, -1.2, -0.6, 0.6, 1.2, 2.0, 2.9]) for (const fill of [0, 0.7, 1]) for (const time of [0, 0.37]) {
      const st = rig.state(canvas);
      trim(rig, st, from);
      st.sails.forEach((sl) => { sl.fill = fill; sl.shiver = time > 0 ? 1 : 0; });
      rig.ropeEnds(st, time, ends);
      rig.sails.forEach((lay, i) => {
        rig.yardMatrix(st, lay.yard, M);
        const P: THREE.Vector3[] = [];
        for (let a = 0; a <= G; a++) for (let b = 0; b <= G; b++) P.push(sailLocal(lay, st.sails[i], a / G, b / G, time, V()).applyMatrix4(M));
        const q = (a: number, b: number) => P[a * (G + 1) + b], touches = (an: Anchor) => ('sail' in an && an.sail === i) || ('yard' in an && an.yard === lay.yard);
        rig.ropes.forEach((r, j) => {
          if (touches(r.a) || touches(r.b)) return;
          A.set(ends[6 * j], ends[6 * j + 1], ends[6 * j + 2]); B.set(ends[6 * j + 3], ends[6 * j + 4], ends[6 * j + 5]);
          for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) if (through(q(a, b), q(a + 1, b), q(a + 1, b + 1)) || through(q(a, b), q(a + 1, b + 1), q(a, b + 1))) cuts.add(`${FORM_NAMES[form]} rope ${j}${r.standing ? ' (standing)' : ''} through sail ${i} (${canvas}, wind ${from}, fill ${fill})`);
        });
      });
    }
  }
  assert.equal(cuts.size, 0, `${cuts.size} cuts, e.g. ${[...cuts].slice(0, 8).join('; ')}`);
});
