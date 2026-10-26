import * as THREE from 'three';
import { faunas, KIND, type Animal } from '../../src/render/fauna.ts';
import { GULL_FLY } from '../../src/render/gull.ts';
import { Pipeline } from '../../src/render/pipeline.ts';
import { fleets } from '../../src/render/ships/shipView.ts';
import { WorldView } from '../../src/render/world.ts';
import { localFrame, R } from '../../src/sim/sphere.ts';
import { createMatch, FLIGHT, type MatchState } from '../../src/sim/state.ts';
import { GULL } from '../../src/sim/tables.ts';
import { world } from '../sim/vectors.ts';

const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const view = new WorldView(pipeline, world()), camera = view.camera;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight);
const state: MatchState = createMatch({ seed: 11, hour: 10 });
[[0, 0, 0, 0, 0], [4, 0, 0, 0, 0], [0, 4, 0, 0, 0], [0, 0, 4, 0, 0], [0, 0, 0, 3, 0], [0, 0, 0, 0, 3], [4, 4, 4, 3, 3]].forEach(([talons, wings, eye, beak, dive], i) =>
  Object.assign(state.ships[i].gull, { talons, wings, eye, beak, dive }));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const unit = (p: { x: number; y: number; z: number }) => V(p.x, p.y, p.z).normalize();
const E = V(), N = V();
let clock = 0;
function run(sec: number): void {
  for (let t = 0; t < sec; t += 1 / 30) { clock += 1 / 30; view.frame({ state, dt: 1 / 30, clock, alpha: 1 }); }
}
function look(from: THREE.Vector3, at: THREE.Vector3): void {
  camera.position.copy(from);
  camera.up.copy(from).normalize();
  camera.lookAt(at);
}
function seek(step: string): Record<string, number> {
  const [set, arg] = step.split(':'), fa = faunas.get(view.scene)!;
  for (const s of state.ships) Object.assign(s.gull, { flight: FLIGHT.mast, tier: -1, prey: -1 });
  if (set === 'plumage') {
    const k = Number(arg), s = state.ships[k];
    run(0.2);
    const perch = fleets.get(view.scene)?.views[k]?.perch(V()) ?? unit(s.pos).multiplyScalar(R + GULL_FLY.mast);
    const up = perch.clone().normalize(), head = unit(s.head), side = V().crossVectors(up, head).normalize();
    look(perch.clone().addScaledVector(side, 1.7).addScaledVector(head, 0.7).addScaledVector(up, 0.3), perch.clone().addScaledVector(up, 0.12));
    run(1.4);
  } else if (set === 'flight') {
    const s = state.ships[0], g = s.gull, up = unit(s.pos), head = unit(s.head), side = V().crossVectors(up, head).normalize();
    const flight = FLIGHT[arg as keyof typeof FLIGHT], leg = flight === FLIGHT.out ? GULL.legs.out : flight === FLIGHT.back ? GULL.legs.back : GULL.legs.circle;
    g.span = GULL.flight[g.wings];
    Object.assign(g, { flight, time: g.span * leg * 0.5, tier: flight === FLIGHT.back || flight === FLIGHT.circle ? 4 : -1, prey: flight === FLIGHT.dive ? 3 : -1 });
    const at = up.clone().multiplyScalar(R).addScaledVector(flight === FLIGHT.circle ? side : head, flight === FLIGHT.circle ? GULL.circle : 22).normalize();
    Object.assign(g.at, { x: at.x, y: at.y, z: at.z });
    Object.assign(g.dir, { x: head.x, y: head.y, z: head.z });
    run(flight === FLIGHT.dive ? 0.45 : 2.5);
    const p = fa.gulls.at(0)!;
    look(p.clone().addScaledVector(head, -3.2).addScaledVector(side, 1.6).addScaledVector(p.clone().normalize(), 0.8), p);
    run(1 / 30);
  } else {
    const k = KIND[arg as Animal], c = fa.creatures.find((x) => x.kind === k && (k !== KIND.puffin || x.land)) ?? fa.creatures.find((x) => x.kind === k)!;
    const far = { puffin: 3.5, seal: 6, otter: 5, wader: 4, heron: 6, turtle: 4.5, whale: 26, dolphin: 8 }[arg as Animal];
    const p = c.home.clone().multiplyScalar(R + c.seat);
    localFrame(c.home, E, N);
    look(p.clone().addScaledVector(N, -far).addScaledVector(c.home, far * 0.3 + 0.6), p.clone().addScaledVector(c.home, far * 0.08));
    const t = clock + c.seed * 29;
    run(arg === 'whale' ? (((1 - t) % 26) + 26) % 26 : arg === 'dolphin' ? (((0.42 - t - c.seed * 7) % 1.7) + 1.7) % 1.7 : 1);
  }
  view.frame({ state, dt: 0, clock, alpha: 1 });
  pipeline.render(view.scene, camera, 1 / 60);
  return { calls: pipeline.stats.calls, triangles: pipeline.stats.triangles, life: fa.triangles, lifeDraws: fa.draws, cards: fa.cards, gulls: fa.gulls.count };
}

const hook = { ready: false, seek };
(window as unknown as { __fauna: typeof hook }).__fauna = hook;
const start = unit(state.ships[0].pos);
localFrame(start, E, N);
look(start.clone().multiplyScalar(R + 6).addScaledVector(N, -10), start.clone().multiplyScalar(R));
view.frame({ state, dt: 0, clock, alpha: 1 });
pipeline.render(view.scene, camera, 1 / 60);
hook.ready = true;
