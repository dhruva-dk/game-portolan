import { Pipeline } from '../../src/render/pipeline.ts';
import { chartShips } from '../../src/render/chart.ts';
import { WorldView } from '../../src/render/world.ts';
import { step } from '../../src/sim/match.ts';
import * as THREE from 'three';
import { CompactChart } from '../../src/render/compactchart.ts';
import { cellDir, R, TERRITORY } from '../../src/sim/sphere.ts';
import { TICK } from '../../src/sim/state.ts';
import { world } from '../sim/vectors.ts';
import { helm, scripted } from './territory.match.ts';

const q = new URLSearchParams(location.search);
const [top, right, bottom, left] = (q.get('safe') ?? '0,0,0,0').split(',').map(Number);
const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const W = world(), view = new WorldView(pipeline, W), camera = view.camera, rig = view.rig;
view.drive = true;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight, { top, right, bottom, left });
const { sea, state } = scripted();
const info = pipeline.renderer.info;
info.autoReset = false;
let clock = 0, ticks = 0;
const compactChart = new CompactChart(innerHeight < 500 ? 96 : 132), compact = compactChart.canvas;
Object.assign(compact.style, { position: 'fixed', left: `${left + 12}px`, top: `${top + 12}px`, display: 'none', zIndex: '5' });
document.body.appendChild(compact);

function frame(dt: number, render: boolean): void {
  clock += rig.chartOpen ? 0 : dt;
  view.frame({ state, dt, clock, alpha: 1 });
  if (compact.style.display !== 'none') compactChart.draw(state, W, view.sight(state), ++ticks / 60);
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
  breakdown(lift: number) {
    const base = this.stop(lift).tris, out: [string, number][] = [];
    for (const o of view.scene.children) {
      if (!o.visible) continue;
      o.visible = false;
      const t = this.stop(lift).tris;
      o.visible = true;
      out.push([String(o.userData.module ?? o.type), base - t]);
    }
    const sum = new Map<string, number>();
    for (const [k, v] of out) sum.set(k, (sum.get(k) ?? 0) + v);
    return { base, top: [...sum].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)}k`) };
  },
  stop(lift: number) {
    rig.zoom.set(lift);
    for (let k = 0; k < 45; k++) frame(1 / 60, false);
    info.reset();
    frame(1 / 60, true);
    const z = rig.z, alt = z < 0.5 ? camera.position.length() - R : camera.position.dot(view.chart.net.normal) - R;
    return { calls: info.render.calls, tris: info.render.triangles, z, drawn: view.chart.drawn, expected: chartShips(state, view.sight(state)), alt, cap: view.chart.capPx };
  },
  d(name: string) {
    const c = rig.cine, [kind, arg] = name.split(':'), w = Number(arg ?? 1);
    Object.assign(c, { hold: false, open: 0, sink: 0, pull: 0, want: 0, crow: 0 });
    if (kind === 'swap') return this.stop(w);
    if (kind === 'chart') return this.stop(2);
    if (kind === 'compact') {
      compact.style.display = 'block';
      const r = this.stop(0.35);
      return { ...r, shown: compactChart.shown, expected: chartShips(state, view.sight(state)) & ~1 };
    }
    if (kind !== 'opening') Object.assign(c, { hold: true, [kind]: kind === 'crow' ? 9 * w : w });
    return this.stop(0.35);
  },
  closeup(target: string, f = 2.6) {
    this.d('chart');
    const net = view.chart.net, me = state.ships[0].pos, dir = new THREE.Vector3(me.x, me.y, me.z).normalize();
    if (target === 'current') { const p = sea.current.points, i = 3 * Math.floor(p.length / 6); dir.set(p[i], p[i + 1], p[i + 2]).normalize(); }
    if (target === 'landmark') {
      let best = -2;
      const from = dir.clone(), d = new THREE.Vector3();
      for (let k = 0; k < sea.marks.length; k++) {
        cellDir(TERRITORY, sea.marks[k], d);
        const cs = d.normalize().dot(from);
        if (cs > best) { best = cs; dir.copy(d); }
      }
    }
    const k = net.sheetOf(dir), at = dir.clone().multiplyScalar(R / Math.max(0.2, dir.dot(net.centres[k]))).applyMatrix4(net.mats[k]);
    const dist = camera.position.clone().sub(at).dot(net.normal);
    camera.position.copy(at).addScaledVector(net.normal, dist / f);
    camera.updateMatrixWorld();
    info.reset();
    pipeline.render(view.scene, camera, 0);
    return { calls: info.render.calls, tris: info.render.triangles, z: rig.z };
  },
  swapMatch() {
    const read = () => {
      const c = document.createElement('canvas'), g = c.getContext('2d')!;
      c.width = c.height = 64;
      g.drawImage(canvas, 0, 0, 64, 64);
      const d = g.getImageData(16, 16, 32, 32).data, m = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let ch = 0; ch < 3; ch++) m[ch] += d[i + ch] / (d.length / 4);
      return m.map((v) => Math.round(v));
    };
    this.stop(1.335);
    const before = read();
    this.stop(1.4);
    const mid = read();
    this.stop(1.47);
    return { before, mid, late: read() };
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
