// The effects test page (tests/render/fx.html, outside the game build): the game's own render path (WorldView, every
// registered module) over a match at its opening, the fleet in two ranks riding the Great Current, with WP22's effects
// driven by scripted events. window.__fx drives it from fx.shots.ts: stage(set) fires a set's events (battle | chests |
// claim | current) and seek(t, cam) draws t s after them from a camera (deck | orbit | near | high), returning the
// frame's draw calls and triangles and the effects' share.
import * as THREE from 'three';
import { effects } from '../../src/render/fx.ts';
import { Pipeline } from '../../src/render/pipeline.ts';
import { WorldView } from '../../src/render/world.ts';
import { cellOf, localFrame, R, TERRITORY } from '../../src/sim/sphere.ts';
import { createMatch, EVENT, type MatchState } from '../../src/sim/state.ts';
import { BATTERY } from '../../src/sim/tables.ts';
import { world } from '../sim/vectors.ts';

const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const view = new WorldView(pipeline, world()), camera = view.camera;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight);
const state: MatchState = createMatch({ seed: 11 });
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const E = V(), N = V();
let clock = 0, base = 0, last = 0;
type Ev = [kind: number, ship: number, by: number, at: THREE.Vector3, amount: number, cells?: number[]];

const pos = (i: number) => V(state.ships[i].pos.x, state.ships[i].pos.y, state.ships[i].pos.z);
const centre = () => state.ships.reduce((c, s) => c.add(V(s.pos.x, s.pos.y, s.pos.z)), V()).normalize();
/** p (unit) moved e u east and n u north over the sea. */
function off(p: THREE.Vector3, e: number, n: number): THREE.Vector3 {
  localFrame(p, E, N);
  return p.clone().multiplyScalar(R).addScaledVector(E, e).addScaledVector(N, n).normalize();
}
function fire(evs: Ev[]): void {
  state.events.length = 0;
  for (const [kind, ship, by, at, amount, cells = []] of evs) state.events.push({ kind, ship, by, at: { x: at.x, y: at.y, z: at.z }, amount, cells });
  state.tick++;
  view.frame({ state, dt: 0, clock: base, alpha: 1 });
  state.events.length = 0;
}
function look(c: THREE.Vector3, alt: number, back: number): void {
  localFrame(c, E, N);
  camera.position.copy(c).multiplyScalar(R + alt).addScaledVector(N, -alt * back);
  camera.up.copy(c);
  camera.lookAt(V().copy(c).multiplyScalar(R));
}
const shot = (k: number) => ({ ship: k % 10, kind: 0, from: { ...state.ships[k % 10].pos }, to: { ...state.ships[(k + 5) % 10].pos }, age: 0, time: 1.4,
  top: k % 6 === 0 ? 9 : 3, power: 10, effect: k % 3, lasting: 0, blast: k % 6 === 0 ? 4 : 0 }) as unknown as MatchState['shots'][number];

function stage(set: string): void {
  clock += 30;
  base = last = clock;
  state.shots.length = 0;
  state.chests.length = 0;
  state.ships.forEach((s, i) => { s.fire = set === 'battle' && (i === 2 || i === 7) ? 8 : 0; });
  const c = centre(), aside = off(c, 0, -30);
  if (set === 'battle') {
    const evs: Ev[] = [];
    for (let i = 0; i < 10; i++) evs.push([EVENT.broadside, i, (i + 5) % 10, pos(i), i % 2 ? BATTERY.port : BATTERY.starboard]);
    evs.push([EVENT.hit, 3, 0, off(pos(3), 0.5, 0.5), 25], [EVENT.hit, 5, 2, off(pos(5), -0.5, 0.3), 30], [EVENT.ablaze, 2, 1, pos(2), 8]);
    for (let k = 0; k < 6; k++) evs.push([EVENT.splash, k, -1, off(c, -12 + 5 * k, 9 - 3 * k), 0]);
    evs.push([EVENT.ram, 6, 8, pos(6), 30], [EVENT.shell, 8, -1, off(c, 14, -6), 2], [EVENT.mortar, 9, 3, pos(9), 2]);
    fire(evs);
    for (let k = 0; k < 12; k++) state.shots.push(shot(k));
  } else if (set === 'chests') {
    for (let t = 0; t < 5; t++) state.chests.push({ at: { ...off(aside, -8 + 4 * t, 7) }, tier: t, fitting: { kind: 0, tier: t }, from: -1 } as unknown as MatchState['chests'][number]);
    fire([0, 1, 2, 3, 4].map((t): Ev => [EVENT.opened, 0, -1, off(aside, -8 + 4 * t, -3), t]));
  } else if (set === 'claim') {
    const ring = new Set<number>(), line = new Set<number>();
    for (let a = 0; a < 96; a++) ring.add(cellOf(TERRITORY, off(c, 16 * Math.cos((a / 48) * Math.PI), 16 * Math.sin((a / 48) * Math.PI))));
    for (let k = 0; k < 8; k++) line.add(cellOf(TERRITORY, off(c, -30 + 2 * k, -14)));
    fire([[EVENT.loop, 0, -1, pos(0), Math.PI * 16 * 16, [...ring]], [EVENT.bank, 0, -1, pos(0), 120], [EVENT.broken, 4, 1, off(c, -24, -14), 40, [...line]],
      [EVENT.spill, 4, -1, off(c, -24, -14), 60]]);
  }
}
function seek(dt: number, cam: string): Record<string, number> {
  const c = centre();
  if (cam === 'deck') look(c, 3.5, 4);
  else if (cam === 'orbit') look(c, 70, 0.4);
  else if (cam === 'near') look(off(c, 0, -30), 8, 1.8);
  else look(c, 48, 0.6);
  for (let t = last; t < base + dt; t += 1 / 30) {
    state.shots.forEach((s, k) => { s.age = Math.min(s.time, 0.08 * k + t - base); });
    view.frame({ state, dt: 1 / 30, clock: t, alpha: 1 });
  }
  last = base + dt;
  view.frame({ state, dt: 0, clock: last, alpha: 1 });
  pipeline.render(view.scene, camera, 1 / 60);
  const fx = effects.get(view.scene)!;
  return { calls: pipeline.stats.calls, triangles: pipeline.stats.triangles, fxTriangles: fx.triangles, alive: fx.live(last), tail: fx.tail };
}

const hook = { ready: false, stage, seek };
(window as unknown as { __fx: typeof hook }).__fx = hook;
look(centre(), 6, 4.5);
view.frame({ state, dt: 0, clock, alpha: 1 });
pipeline.render(view.scene, camera, 1 / 60);
hook.ready = true;
