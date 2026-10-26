import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { fleets } from '../../src/render/ships/shipView.ts';
import { WorldView } from '../../src/render/world.ts';
import { R } from '../../src/sim/sphere.ts';
import { createMatch, fullHull, PHASE, SAIL } from '../../src/sim/state.ts';
import { newWind, seaFor, windAt } from '../../src/sim/environment.ts';
import { FITTING, SPELL } from '../../src/sim/tables.ts';
import { heightAt } from '../../src/sim/world/geography.ts';
import { world } from '../sim/vectors.ts';

const scene = new URLSearchParams(location.search).get('scene') ?? 'deck';
const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const W = world(), view = new WorldView(pipeline, W), camera = view.camera;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const put = (o: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }) => { o.x = v.x; o.y = v.y; o.z = v.z; };
const state = createMatch({ seed: 3 }), me = state.ships[0];
const at = (c: THREE.Vector3, e1: THREE.Vector3, e2: THREE.Vector3, a: number, b: number) => c.clone().multiplyScalar(R).addScaledVector(e1, a).addScaledVector(e2, b).normalize();
const open = (p: THREE.Vector3, e1: THREE.Vector3, e2: THREE.Vector3) => [0, 1, 2, 3, 4, 5, 6, 7].every((k) => heightAt(W.geo, at(p, e1, e2, 45 * Math.cos(k * 0.785), 45 * Math.sin(k * 0.785))) < -1.5);
let c = V(me.pos.x, me.pos.y, me.pos.z).normalize();
const e1 = V(me.head.x, me.head.y, me.head.z), e2 = V();
for (let k = 0; k < 40; k++) {
  e1.addScaledVector(c, -c.dot(e1)).normalize();
  e2.crossVectors(c, e1);
  if (open(c, e1, e2)) break;
  c = at(c, e1, e2, 25, 0);
}
state.hour = scene === 'night' ? 22.5 : scene === 'storm' ? 16 : 9.5;
state.leader = 0;
state.ships.forEach((s, k) => {
  put(s.pos, scene !== 'hero' ? at(c, e1, e2, 13 * ((k % 5) - 2) + 4 * (k >> 2), 14 * ((k / 5) | 0) - 7) : k === 2 ? c : at(c, e1, e2, 42 * Math.cos(k * 0.7), 42 * Math.sin(k * 0.7)));
  if (scene === 'hero' && k === 2) s.form = 3;
  put(s.was, s.pos);
  const h = e1.clone().applyAxisAngle(V(s.pos.x, s.pos.y, s.pos.z), 0.3 + (k * 2 * Math.PI) / 10);
  put(s.head, h); put(s.wasHead, h);
  s.speed = 3.5; s.rate = 0; s.pigment = k; s.pattern = k ? k * 3 : 31;
  s.sail = scene === 'storm' ? SAIL.reefed : [SAIL.full, SAIL.plain, SAIL.reefed][k % 3];
  if (scene === 'damaged') {
    s.hull = fullHull(s.form, s.fittings) * [1, 0.7, 0.45, 0.25, 0.12][k % 5];
    s.fire = [2, 4, 7].includes(k) ? 20 : 0;
    s.torn = [3, 5].includes(k) ? 20 : 0;
  }
});
if (scene === 'storm') Object.assign(state.weather[0], { kind: SPELL.squall, at: { x: c.x, y: c.y, z: c.z }, v: { x: 0, y: 0, z: 0 }, r: 90, life: 400, age: 200 });

const dt = 1 / 30;
let clock = 0;
function step(frames: number, each?: () => void): void {
for (let f = 0; f < frames; f++) {
  clock += dt;
  for (const s of state.ships) {
    if (s.phase === PHASE.sunk) continue;
    put(s.was, s.pos);
    const p = V(s.pos.x, s.pos.y, s.pos.z), h = V(s.head.x, s.head.y, s.head.z);
    p.multiplyScalar(R).addScaledVector(h, s.speed * dt).normalize();
    h.addScaledVector(p, -p.dot(h)).normalize();
    put(s.pos, p); put(s.head, h); put(s.wasHead, h);
  }
  each?.();
  view.frame({ state, dt, clock, alpha: 1 });
}
}
step(180);
const ctr = V(state.ships[2].pos.x, state.ships[2].pos.y, state.ships[2].pos.z);
const back = scene === 'chart' ? -55 : scene === 'damaged' ? -26 : -34, high = scene === 'chart' ? 95 : 4.5;
camera.position.copy(at(ctr, e1, e2, back, 6)).multiplyScalar(R + high);
camera.up.copy(ctr);
camera.lookAt(ctr.clone().multiplyScalar(R + 1.5));
view.frame({ state, dt: 0, clock, alpha: 1 });
pipeline.render(view.scene, camera, 1 / 60);

const fleet = fleets.get(view.scene)!;
const hook = {
  ready: true, scene,
  stats() {
    pipeline.render(view.scene, camera, 1 / 60);
    const calls = pipeline.stats.calls, triangles = pipeline.stats.triangles;
    fleet.group.visible = false;
    pipeline.render(view.scene, camera, 1 / 60);
    const out = { calls, triangles, shipCalls: calls - pipeline.stats.calls, shipTris: triangles - pipeline.stats.triangles, fleetTris: fleet.triangles, lods: fleet.views.map((v) => v?.ship.lod) };
    fleet.group.visible = true;
    pipeline.render(view.scene, camera, 1 / 60);
    return out;
  },
};
const hero = state.ships[2], wind = newWind(), waters = seaFor(W, state.seed), wv = V();
const POINTS: Record<string, number> = { close: Math.PI - 0.85, reach: -Math.PI / 2, run: 0.15, irons: Math.PI };
const F = FITTING, FITS: Record<string, number[]> = {
  'fit-a': [F.ironRam, F.longGuns, F.sternChasers, F.spareCanvas, F.copperSheathing, F.crowsNest],
  'fit-b': [F.stemPost, F.swivelGuns, F.mortar, F.lateenMizzen, F.doubledPlanking, F.sternGlass],
  'fit-c': [F.cutwater, F.lightGuns, F.powderKegs, F.stormSails, F.pumps, F.lookout],
  'fit-d': [F.stemPost, F.heatedShot, F.sternChasers, F.spareCanvas, F.copperSheathing, F.lookout],
  'fit-e': [F.cutwater, F.chainShot, F.mortar, F.lateenMizzen, F.doubledPlanking, F.sternGlass],
};
const DAMAGE: Record<string, readonly [number, number, number]> = { 'dmg-0': [1, 0, 0], 'dmg-1': [0.62, 0, 0], 'dmg-2': [0.35, 20, 0], 'dmg-3': [0.1, 0, 20], 'dmg-patched': [0.9, 0, 0] };
const SINKS: Record<string, number> = { 'sink-0': 0.9, 'sink-1': 3.4, 'sink-2': 6.2, 'sink-3': 8.6, 'sink-4': 13 };
let sunkAt = -1, az = 0.8, near = 1, lift = 0.3;
const follow = () => {
  const v = fleet.views[2];
  if (!v) return;
  const up = v.up, fwd = v.forward, port = V().crossVectors(up, fwd), H = v.ship.height, L = v.length;
  const lee = sunkAt >= 0 ? (v.heel < 0 ? -1 : 1) : port.dot(wv) > 0 ? 1 : -1;
  const tan = Math.tan((camera.fov * Math.PI) / 360), dist = near * Math.max((0.62 * H) / tan, (0.7 * L) / (tan * camera.aspect));
  const base = v.at.clone().multiplyScalar(R);
  camera.position.copy(base).addScaledVector(fwd, Math.cos(az) * dist).addScaledVector(port, lee * Math.sin(az) * dist).addScaledVector(up, lift * H + 1);
  camera.up.copy(up);
  camera.lookAt(base.addScaledVector(up, 0.42 * H));
};
function pose(name: string): void {
  const full = fullHull(hero.form, hero.fittings), p = V(hero.pos.x, hero.pos.y, hero.pos.z).normalize();
  windAt(waters, state, hero.pos, wind);
  wv.set(wind.v.x, wind.v.y, wind.v.z).addScaledVector(p, -p.dot(wv.set(wind.v.x, wind.v.y, wind.v.z))).normalize();
  if (name in SINKS) {
    if (sunkAt < 0) { hero.phase = PHASE.sunk; hero.speed = 0; sunkAt = clock; }
    az = 1.15; near = 1.5; lift = 0.4;
    step(Math.max(1, Math.round((sunkAt + SINKS[name] - clock) / dt)), follow);
  } else {
    const h = wv.clone().applyAxisAngle(p, POINTS[name] ?? -Math.PI / 2), d = DAMAGE[name] ?? [1, 0, 0];
    put(hero.head, h); put(hero.wasHead, h);
    hero.speed = name === 'irons' ? 0.4 : 3; hero.rate = 0; hero.sail = SAIL.full;
    FITS[name]?.forEach((kind, slot) => Object.assign(hero.fittings[slot], { kind, tier: 3 }));
    hero.hull = full * d[0]; hero.fire = d[1]; hero.torn = d[2];
    if (name === 'dmg-patched') { hero.hull = full * 0.3; step(30, follow); hero.hull = full * d[0]; }
    az = name.startsWith('fit') ? (name === 'fit-b' || name === 'fit-e' ? 2.35 : 0.8) : name.startsWith('dmg') ? 1.4 : 0.85;
    near = name.startsWith('fit') ? 0.8 : 1; lift = name.startsWith('fit') ? 0.45 : 0.3;
    step(60, follow);
  }
  follow();
  view.frame({ state, dt: 0, clock, alpha: 1 });
  pipeline.render(view.scene, camera, 1 / 60);
}
Object.assign(hook, { pose });
(window as unknown as { __ships: typeof hook }).__ships = hook;
