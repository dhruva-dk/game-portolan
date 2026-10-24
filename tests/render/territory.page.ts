// The territory test page (tests/render/territory.html, outside the game build): the game's own render path (WorldView,
// every registered module) over the real headless match of territory.match.ts. Query: scene=flood|break|storm|
// patterns|border; at=<tick> the player's big loop closes (from a dry run when absent). window.__territory drives it
// from territory.shots.ts and territory.test.ts: seek(s) draws s after the last tick, advance(n) plays n ticks,
// cross() sails a rival across the player's open trail, swallow() lets the storm take a bite of its waters,
// hour(h) sets the hour, flicker(n, du) measures border stability over a slow camera move.
import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { seas } from '../../src/render/sea.ts';
import { territories, type Claim } from '../../src/render/territory.ts';
import { WorldView } from '../../src/render/world.ts';
import { step } from '../../src/sim/match.ts';
import { cellDir, cellOf, localFrame, R, TERRITORY } from '../../src/sim/sphere.ts';
import { PHASE, SHIPS, TICK } from '../../src/sim/state.ts';
import { chart, swallow } from '../../src/sim/territory.ts';
import { world } from '../sim/vectors.ts';
import { bigLoop, helm, scripted } from './territory.match.ts';

const q = new URLSearchParams(location.search), scene = q.get('scene') ?? 'flood';
const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const view = new WorldView(pipeline, world()), camera = view.camera;
const territory = territories.get(view.scene)!, sea = seas.get(view.scene)!;
const claims: Claim[] = [];
territory.onClaim((c) => claims.push(c));
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight);
const at = q.has('at') ? Number(q.get('at')) : bigLoop().tick;
const { sea: sim, state } = scripted();
let clock = 0;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const E = V(), N = V(), centre = V(), mid = V(), d = V();
let span = 30;

function tick(): void {
  step(sim, state, helm(state));
  clock += TICK;
  view.frame({ state, dt: TICK, clock, alpha: 1 });
}
function draw(dt = 0): void {
  view.frame({ state, dt: 0, clock: clock + dt, alpha: 1 });
  pipeline.render(view.scene, camera, 1 / 60);
}
/** The camera `alt` u over c, stood back to look down on it. */
function look(c: THREE.Vector3, alt: number, back = 0.6): void {
  localFrame(c, E, N);
  camera.position.copy(c).multiplyScalar(R + alt).addScaledVector(N, -alt * back);
  camera.up.copy(c);
  camera.lookAt(V().copy(c).multiplyScalar(R));
}
/** The centre and reach (u) of the player's open trail, and its middle cell. */
function measureTrail(): void {
  const laid = state.ships[0].laid;
  centre.set(0, 0, 0);
  for (const c of laid) centre.add(cellDir(TERRITORY, c, d));
  centre.normalize();
  span = 10;
  for (const c of laid) {
    cellDir(TERRITORY, c, d);
    span = Math.max(span, d.angleTo(centre) * R);
  }
  cellDir(TERRITORY, laid[laid.length >> 1] ?? 0, mid);
}
/** A territory tick outside the sim's step (the rival's crossing, the storm's bite), as the modules will see it. */
function territoryTick(act: () => void): void {
  state.events.length = 0;
  act();
  state.tick++;
  clock += TICK;
  view.frame({ state, dt: TICK, clock, alpha: 1 });
}

if (scene === 'patterns') {
  // the ten teams' trails side by side, each a ship sailing straight on in open sea (positions driven, not sailed)
  const base = V(Math.cos(0.32), 0, Math.sin(0.32)).normalize();
  localFrame(base, E, N);
  for (let n = 0; n < 150; n++) {
    state.tick++;
    clock += TICK;
    for (let i = 0; i < SHIPS; i++) {
      const ship = state.ships[i], p = V().copy(base).multiplyScalar(R).addScaledVector(E, (i - 4.5) * 4.2).addScaledVector(N, n * 0.3 - 20).normalize();
      ship.was = { ...ship.pos };
      ship.wasHead = { ...ship.head };
      ship.pos = { x: p.x, y: p.y, z: p.z };
      ship.head = { x: N.x, y: N.y, z: N.z };
      ship.phase = PHASE.sailing;
      ship.laid = [cellOf(TERRITORY, p)];
    }
    view.frame({ state, dt: TICK, clock, alpha: 1 });
  }
  look(V().copy(base).multiplyScalar(R).addScaledVector(N, 8).normalize(), 34, 0.9);
} else {
  const until = scene === 'flood' ? at - 45 : scene === 'break' ? at - 240 : at + 300;
  while (state.tick < Math.min(until, at - 45)) tick();
  measureTrail();
  while (state.tick < until) tick();
  if (scene === 'flood') look(centre, span * 1.9 + 12);
  else if (scene === 'border') look(mid, 26, 0.8);
  else if (scene === 'break') {
    cellDir(TERRITORY, state.ships[0].laid[state.ships[0].laid.length >> 1], d);
    look(V().copy(d), 40);
  }
  else look(centre, span * 2.1 + 14);
}

const hook = {
  ready: false, at, scene, claims,
  stats: () => ({ calls: pipeline.stats.calls, triangles: pipeline.stats.triangles, textureMB: +(pipeline.stats.textureBytes / 2 ** 20).toFixed(1), uploaded: territory.uploaded }),
  seek(dt: number) {
    draw(dt);
    return hook.stats();
  },
  advance(n: number) {
    const before = territory.uploaded;
    for (let k = 0; k < n; k++) tick();
    draw();
    return { ...hook.stats(), claimUpload: territory.uploaded - before, claim: claims.at(-1) };
  },
  cross() {
    const laid = state.ships[0].laid, c = cellDir(TERRITORY, laid[laid.length >> 1], V());
    const j = Math.max(1, state.ships.findIndex((s, i) => i > 0 && s.phase === PHASE.sailing));
    state.ships[j].phase = PHASE.sailing; // a rival under sail, whether or not it has broken off yet
    localFrame(c, E, N);
    territoryTick(() => {
      for (const s of state.ships) s.was = { ...s.pos };
      const from = V().copy(c).multiplyScalar(R).addScaledVector(E, -2).normalize(), to = V().copy(c).multiplyScalar(R).addScaledVector(E, 2).normalize();
      state.ships[j].was = { x: from.x, y: from.y, z: from.z };
      state.ships[j].pos = { x: to.x, y: to.y, z: to.z };
      chart(state);
    });
    draw();
    return { ...hook.stats(), events: state.events.map((e) => e.kind) };
  },
  swallow() {
    const bite = V().copy(centre).multiplyScalar(R).addScaledVector(E, span * 0.9).normalize(), cells: number[] = [];
    for (let c = 0; c < state.owner.length; c++) {
      if (state.owner[c] !== 1) continue;
      cellDir(TERRITORY, c, d);
      if (d.angleTo(bite) * R < span * 1.1) cells.push(c);
    }
    territoryTick(() => swallow(state, cells));
    draw();
    return { ...hook.stats(), swallowed: cells.length };
  },
  hour(h: number) {
    state.hour = h;
    draw();
    return hook.stats();
  },
  /** Pixels the territory darkens (its wash, hatching and inked border) that flip by more than 0.35 in luminance
   * between frames of a camera sliding du u a frame: their mean and worst share, and how many there are. */
  flicker(n: number, du: number) {
    const gl = pipeline.renderer.getContext(), base = camera.position.clone();
    const grab = (): Float32Array => {
      pipeline.renderer.setRenderTarget(null);
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4), l = new Float32Array(w * h);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let k = 0; k < l.length; k++) l[k] = (0.2126 * px[4 * k] + 0.7152 * px[4 * k + 1] + 0.0722 * px[4 * k + 2]) / 255;
      return l;
    };
    let worst = 0, sum = 0, pixels = 0, prev: Float32Array | null = null, mask: Uint8Array | null = null;
    for (let k = 0; k <= n; k++) {
      camera.position.copy(base).addScaledVector(E, k * du);
      draw();
      const on = grab();
      sea.setTerritory(null);
      draw();
      const off = grab();
      sea.setTerritory(territory.wash, territory.moments, territory.slots);
      if (prev && mask) {
        let flips = 0, total = 0;
        for (let p = 0; p < on.length; p++) {
          if (!mask[p]) continue;
          total++;
          if (Math.abs(on[p] - prev[p]) > 0.35) flips++;
        }
        worst = Math.max(worst, flips / Math.max(total, 1));
        sum += flips / Math.max(total, 1);
      }
      mask = new Uint8Array(on.length);
      for (let p = 0; p < on.length; p++) if (off[p] - on[p] > 0.25) mask[p] = 1;
      pixels += mask.reduce((a, b) => a + b, 0) / (n + 1);
      prev = on;
    }
    camera.position.copy(base);
    return { mean: sum / n, worst, pixels: Math.round(pixels) };
  },
};
(window as unknown as { __territory: typeof hook }).__territory = hook;
draw();
hook.ready = true;
