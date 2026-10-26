import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { fleets, RING, FLOTSAM, SLICK, FOAM } from '../../src/render/ships/shipView.ts';
import { WorldView } from '../../src/render/world.ts';
import { aground } from '../../src/sim/environment.ts';
import { step } from '../../src/sim/match.ts';
import { R } from '../../src/sim/sphere.ts';
import { CAUSE, PHASE, TICK } from '../../src/sim/state.ts';
import { world } from '../sim/vectors.ts';
import { helm, scripted } from './territory.match.ts';

const q = new URLSearchParams(location.search);
const [top, right, bottom, left] = (q.get('safe') ?? '0,0,0,0').split(',').map(Number);
const storm = q.get('weather') === 'storm';
const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const W = world(), view = new WorldView(pipeline, W), camera = view.camera, rig = view.rig;
view.drive = true;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight, { top, right, bottom, left });
const { sea, state } = scripted();
let clock = 0;
const frame = (dt: number, render: boolean): void => {
  clock += dt;
  view.frame({ state, dt, clock, alpha: 1 });
  if (render) pipeline.render(view.scene, camera, dt);
};

rig.zoom.set(0.35);
const me = state.ships[0], at = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), p = new THREE.Vector3();
const open = (): boolean => {
  at.set(me.pos.x, me.pos.y, me.pos.z).normalize();
  e1.set(0, 1, 0).cross(at).normalize();
  e2.crossVectors(at, e1);
  for (const r of [6, 12, 18, 24, 30]) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    p.copy(at).addScaledVector(e1, (r / R) * Math.cos(a)).addScaledVector(e2, (r / R) * Math.sin(a)).normalize();
    if (aground(sea, state, p)) return false;
  }
  return true;
};
while (state.tick < Math.round(30 / TICK) || (state.tick < Math.round(150 / TICK) && (state.tick % 30 !== 0 || !open()))) { step(sea, state, helm(state)); frame(TICK, false); }
at.set(me.pos.x, me.pos.y, me.pos.z).normalize();
const where = { s: Math.round(state.tick * TICK), open: open() };
if (storm) {
  state.tick = Math.round(225 / TICK);
  const calm = state.storm.calms[0], hd = new THREE.Vector3(me.head.x, me.head.y, me.head.z).addScaledVector(at, -at.dot(me.head as THREE.Vector3Like)).normalize();
  const port = new THREE.Vector3().crossVectors(at, hd), toward = hd.clone().addScaledVector(port, 0.35).normalize(), ang = calm.r + 16 / R;
  const c = at.clone().multiplyScalar(Math.cos(ang)).addScaledVector(toward, Math.sin(ang)).normalize();
  calm.at.x = c.x; calm.at.y = c.y; calm.at.z = c.z;
  for (let k = 0; k < 240; k++) frame(1 / 60, false);
}
me.phase = PHASE.sunk;
me.hull = 0;
me.speed = 0;
const sankAt = state.tick;
state.sunk.push({ ship: 0, by: -1, cause: CAUSE.storm, tick: sankAt });
let since = 0;
const on = (dt: number, render: boolean): void => { since += dt; state.tick = sankAt + Math.floor(since / TICK); frame(dt, render); };

const hook = {
  ready: true,
  storm,
  where,
  at(s: number) {
    while (since + 1 / 60 <= s) on(1 / 60, false);
    on(1 / 60, true);
    const fleet = fleets.get(view.scene)!, v = fleet.views[0]!, p = fleet.plumes;
    return {
      sinkT: v.sinkT, z: rig.z, dist: camera.position.distanceTo(v.at.clone().multiplyScalar(R)), alt: camera.position.length() - R, visible: v.ship.visible,
      rings: p.live(RING, clock), foam: p.live(FOAM, clock), flotsam: p.live(FLOTSAM, clock), slick: p.live(SLICK, clock),
    };
  },
};
(window as unknown as { __sink: typeof hook }).__sink = hook;
