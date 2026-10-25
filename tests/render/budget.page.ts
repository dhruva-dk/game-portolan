// The scene budget page (tests/render/budget.html, outside the game build; WP30 part C): the game's own render path
// (WorldView, every registered module) over the real headless match of territory.match.ts, posed at every standard
// view: the zoom's stops (the rig driving), each region from the deck, low along its shore (where WP23's life is
// captured), high over its coast and from orbit, and a ten-ship battle. window.__budget: views() names them;
// measure(name) poses one, draws it and reports its draw calls and triangles, and the triangles by module.
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { WorldView } from '../../src/render/world.ts';
import { step } from '../../src/sim/match.ts';
import { localFrame, R } from '../../src/sim/sphere.ts';
import { TICK } from '../../src/sim/state.ts';
import { coastAt, heightAt, toWorld } from '../../src/sim/world/geography.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { world } from '../sim/vectors.ts';
import { helm, scripted } from './territory.match.ts';

const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const w = world(), view = new WorldView(pipeline, w), camera = view.camera, rig = view.rig, scene = view.scene;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight);
const { sea, state } = scripted();
const info = pipeline.renderer.info;
info.autoReset = false;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const E = V(), N = V();
let clock = 0;

function frame(dt: number, render: boolean): void {
  clock += dt;
  view.frame({ state, dt, clock, alpha: 1 });
  if (render) pipeline.render(scene, camera, dt);
}
view.drive = true;
rig.zoom.set(0.35);
while (state.tick < 600) {
  step(sea, state, helm(state));
  frame(TICK, false);
}

/** A point in region ri's waters `want` u off its coast (at least `deep` u deep), and the land it faces. */
function spot(ri: number, want: number, deep: number): { at: THREE.Vector3; land: THREE.Vector3 } | null {
  const p = V(), g = V(), geo = w.geo, coast = (x: number, y: number) => coastAt(geo, toWorld(ri, x, y, g));
  for (let r = 10; r < 140; r++) {
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2 + r * 0.37, x = r * Math.cos(a), y = r * Math.sin(a);
      toWorld(ri, x, y, p);
      if (Math.abs(coastAt(geo, p) - want) > 0.5 || heightAt(geo, p) > -deep) continue;
      const gx = coast(x + 1, y) - coast(x - 1, y), gy = coast(x, y + 1) - coast(x, y - 1), l = Math.hypot(gx, gy) || 1;
      return { at: p.clone(), land: toWorld(ri, x - (gx / l) * want, y - (gy / l) * want, V()) as THREE.Vector3 };
    }
  }
  return null;
}

/** The camera `height` u over unit point `at`, facing unit point `toward`, pitched by `pitch` rad. */
function pose(at: THREE.Vector3, toward: THREE.Vector3, height: number, pitch: number): void {
  const up = at.clone().normalize(), f = toward.clone().addScaledVector(up, -up.dot(toward)).normalize();
  camera.position.copy(up).multiplyScalar(R + height);
  camera.up.copy(up);
  camera.lookAt(camera.position.clone().addScaledVector(f, Math.cos(pitch)).addScaledVector(up, Math.sin(pitch)));
}

/** Ten ships in a knot round the player (a battle), once. */
let gathered = false;
function gather(): THREE.Vector3 {
  const s0 = state.ships[0], c = V(s0.pos.x, s0.pos.y, s0.pos.z), len = c.length();
  c.normalize();
  localFrame(c, E, N);
  if (!gathered) {
    state.ships.forEach((s, i) => {
      if (i === 0) return;
      const a = (i / 9) * Math.PI * 2, rr = 5 + (i % 3) * 3;
      const p = c.clone().multiplyScalar(R).addScaledVector(E, Math.cos(a) * rr).addScaledVector(N, Math.sin(a) * rr).normalize().multiplyScalar(len);
      Object.assign(s.pos, { x: p.x, y: p.y, z: p.z });
    });
    gathered = true;
  }
  return c;
}

const VIEWS = new Map<string, () => void>();
for (const lift of [0.3, 0.95, 1.22, 1.26, 1.3, 1.33, 1.35, 1.38, 1.42, 1.45, 1.49, 1.5, 1.62, 1.8, 2]) {
  VIEWS.set(`zoom ${lift}`, () => {
    view.drive = true;
    rig.zoom.set(lift);
    for (let k = 0; k < 45; k++) frame(1 / 60, false);
  });
}
const manual = (f: () => void) => () => { view.drive = false; camera.layers.set(0); f(); };
REGIONS.forEach((reg, ri) => {
  const name = reg.name.toLowerCase().replace(/^the /, '').replace(/[^a-z]+/g, '-');
  const deck = spot(ri, 6, 2), shore = spot(ri, 3, 1) ?? spot(ri, 4, 0.5), high = spot(ri, 20, 2);
  if (deck) VIEWS.set(`deck ${name}`, manual(() => pose(deck.at, deck.land, 3.5, -0.05)));
  if (shore) VIEWS.set(`shore ${name}`, manual(() => pose(shore.at, shore.land, 1.2, -0.02)));
  if (high) VIEWS.set(`high ${name}`, manual(() => pose(high.at, high.land, 24, -0.5)));
  VIEWS.set(`orbit ${name}`, manual(() => {
    const c = toWorld(ri, 0, 0, V()) as THREE.Vector3;
    localFrame(c, E, N);
    camera.position.copy(c).multiplyScalar(R + 70).addScaledVector(N, -28);
    camera.up.copy(c);
    camera.lookAt(c.clone().multiplyScalar(R));
  }));
});
VIEWS.set('battle deck', manual(() => { const c = gather(); pose(c.clone().multiplyScalar(R).addScaledVector(N, -12).normalize(), c, 3.5, -0.06); }));
VIEWS.set('battle high', manual(() => { const c = gather(); pose(c.clone().multiplyScalar(R).addScaledVector(N, -28).normalize(), c, 16, -0.5); }));

// triangles by module: each drawable's share of renderer.info, booked to the module that built its top-level object
const owner = new WeakMap<THREE.Object3D, string>(), tally = new Map<string, number>();
let mark = 0;
function label(o: THREE.Object3D): string {
  let t = o;
  while (t.parent && t.parent !== scene) t = t.parent;
  if (t === view.chart.group) return 'chart';
  const m = t.userData.module as string | undefined;
  return m ? m.replace(/^create/, '').toLowerCase() : t.name || t.type.toLowerCase();
}
function book(): void {
  scene.traverse((o) => {
    const d = o as THREE.Mesh & THREE.Points & THREE.Line & THREE.Sprite;
    if (owner.has(o) || !(d.isMesh || d.isPoints || d.isLine || d.isSprite)) return;
    owner.set(o, label(o));
    const b = o.onBeforeRender, a = o.onAfterRender;
    o.onBeforeRender = function (...args) { mark = info.render.triangles; b.apply(this, args); };
    o.onAfterRender = function (...args) {
      a.apply(this, args);
      const k = owner.get(o)!;
      tally.set(k, (tally.get(k) ?? 0) + info.render.triangles - mark);
    };
  });
}

const hook = {
  ready: true,
  views: () => [...VIEWS.keys()],
  measure(name: string) {
    VIEWS.get(name)!();
    for (let k = 0; k < 6; k++) frame(1 / 60, true);
    book();
    tally.clear();
    info.reset();
    frame(1 / 60, true);
    const mods = Object.fromEntries([...tally].filter(([, t]) => t > 0).sort((a, b) => b[1] - a[1]));
    return { calls: info.render.calls, tris: info.render.triangles, mods, z: rig.z, alt: camera.position.length() - R };
  },
};
(window as unknown as { __budget: typeof hook }).__budget = hook;
