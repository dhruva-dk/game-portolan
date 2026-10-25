// The ships-alive test page (tests/render/shipView.html, outside the game build): the game's own render path (WorldView,
// so the Fleet module draws the ships) over a real match whose ten ships are posed by hand in open water round the
// player's start, sailing on every heading in the sim's wind and moved along it frame by frame, ?scene=
//   deck     clear morning, the eye at deck height astern of the fleet      chart    the same from high above
//   storm    a squall laid over the fleet, canvas reefed                       night    the same fleet at 22:30, lanterns lit
//   damaged  hulls from whole to all but gone, three ablaze, two in chain-shot rags, the leader's gold pennant
// window.__ships: ready, scene, stats() → draw calls and triangles of the frame and the ships' share of them.
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { fleets } from '../../src/render/ships/shipView.ts';
import { WorldView } from '../../src/render/world.ts';
import { R } from '../../src/sim/sphere.ts';
import { createMatch, fullHull, SAIL } from '../../src/sim/state.ts';
import { SPELL } from '../../src/sim/tables.ts';
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
  put(s.pos, at(c, e1, e2, 13 * ((k % 5) - 2) + 4 * (k >> 2), 14 * ((k / 5) | 0) - 7));
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
for (let f = 0; f < 180; f++) {
  clock += dt;
  for (const s of state.ships) {
    put(s.was, s.pos);
    const p = V(s.pos.x, s.pos.y, s.pos.z), h = V(s.head.x, s.head.y, s.head.z);
    p.multiplyScalar(R).addScaledVector(h, s.speed * dt).normalize();
    h.addScaledVector(p, -p.dot(h)).normalize();
    put(s.pos, p); put(s.head, h); put(s.wasHead, h);
  }
  view.frame({ state, dt, clock, alpha: 1 });
}
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
(window as unknown as { __ships: typeof hook }).__ships = hook;
