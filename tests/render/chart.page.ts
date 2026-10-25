// The chart test page (tests/render/chart.html, outside the game build): the game's own render path (WorldView with
// the WP24 rig driving the camera, every registered module) over the real headless match of territory.match.ts.
// Query: at=<tick> to play to; safe=top,right,bottom,left (CSS px). window.__chart: stop(lift) settles the camera at a
// lift (0..1 deck pinch, 1..2 the chart zoom), renders and reports draw calls, triangles and the chart's ships against
// the player's sight; sequence() plays the open move and reports z every 6th frame.
import { Pipeline } from '../../src/render/pipeline.ts';
import { chartShips } from '../../src/render/chart.ts';
import { WorldView } from '../../src/render/world.ts';
import { step } from '../../src/sim/match.ts';
import { R } from '../../src/sim/sphere.ts';
import { TICK } from '../../src/sim/state.ts';
import { world } from '../sim/vectors.ts';
import { helm, scripted } from './territory.match.ts';

const q = new URLSearchParams(location.search);
const [top, right, bottom, left] = (q.get('safe') ?? '0,0,0,0').split(',').map(Number);
const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const view = new WorldView(pipeline, world()), camera = view.camera, rig = view.rig;
view.drive = true;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight, { top, right, bottom, left });
const { sea, state } = scripted();
const info = pipeline.renderer.info;
info.autoReset = false;
let clock = 0;

function frame(dt: number, render: boolean): void {
  clock += rig.chartOpen ? 0 : dt;
  view.frame({ state, dt, clock, alpha: 1 });
  if (render) pipeline.render(view.scene, camera, dt);
}

const at = Number(q.get('at') ?? 600);
rig.zoom.set(0.35);
while (state.tick < at) {
  step(sea, state, helm(state));
  frame(TICK, false);
}

const hook = {
  ready: true,
  stop(lift: number) {
    rig.zoom.set(lift);
    for (let k = 0; k < 45; k++) frame(1 / 60, false);
    info.reset();
    frame(1 / 60, true);
    const z = rig.z, alt = z < 0.5 ? camera.position.length() - R : camera.position.dot(view.chart.net.normal) - R;
    return { calls: info.render.calls, tris: info.render.triangles, z, drawn: view.chart.drawn, expected: chartShips(state, view.sight(state)), alt };
  },
  sequence() {
    rig.zoom.set(0.35);
    for (let k = 0; k < 30; k++) frame(1 / 60, false);
    rig.zoom.open();
    const zs: number[] = [];
    for (let k = 0; k < 150; k++) {
      frame(1 / 60, k % 6 === 0);
      if (k % 6 === 0) zs.push(rig.z);
    }
    return zs;
  },
};
(window as unknown as { __chart: typeof hook }).__chart = hook;
