import * as THREE from 'three';
import { Pipeline } from '../../src/render/pipeline.ts';
import { skies } from '../../src/render/sky.ts';
import { storms } from '../../src/render/storm.ts';
import { fogAngle, weathers } from '../../src/render/weather.ts';
import { WorldView } from '../../src/render/world.ts';
import { over } from '../../src/sim/end.ts';
import { seaFor } from '../../src/sim/environment.ts';
import { FLAG, idleInput, type ShipInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { R } from '../../src/sim/sphere.ts';
import { afloat, createMatch, TICK, type MatchState, type Spell } from '../../src/sim/state.ts';
import { calmNow } from '../../src/sim/storm.ts';
import { DAY, SPELL } from '../../src/sim/tables.ts';
import { hourOf, inFog, veiled, vigour } from '../../src/sim/weather.ts';
import { heightAt } from '../../src/sim/world/geography.ts';
import { unarmed, world } from '../sim/vectors.ts';
import { helm, SEED } from './territory.match.ts';

const scene = new URLSearchParams(location.search).get('scene') ?? 'fog';
const canvas = document.querySelector('canvas')!;
const pipeline = new Pipeline(canvas);
pipeline.pinScale(1);
const W = world(), view = new WorldView(pipeline, W), camera = view.camera;
pipeline.setSize(innerWidth, innerHeight, devicePixelRatio);
view.layout(innerWidth, innerHeight);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const dirOf = (p: { x: number; y: number; z: number }) => V(p.x, p.y, p.z).normalize();
function toward(a: THREE.Vector3, b: THREE.Vector3, u: number): THREE.Vector3 {
  const t = b.clone().addScaledVector(a, -a.dot(b));
  if (t.lengthSq() < 1e-12) t.set(a.y, -a.x, 0.3).addScaledVector(a, -a.dot(t));
  t.normalize();
  return a.clone().multiplyScalar(Math.cos(u / R)).addScaledVector(t, Math.sin(u / R)).normalize();
}
function place(eye: THREE.Vector3, height: number, at: THREE.Vector3, atHeight: number): void {
  camera.position.copy(eye).multiplyScalar(R + height);
  camera.up.copy(eye);
  camera.lookAt(at.clone().multiplyScalar(R + atHeight));
}
function open(p: THREE.Vector3, u: number): boolean {
  const t = V(p.y, -p.x, 0.3).normalize();
  for (let k = 0; k < 8; k++) if (heightAt(W.geo, toward(p, t.clone().applyAxisAngle(p, (k * Math.PI) / 4), u)) > -1) return false;
  return heightAt(W.geo, p) < -1;
}
function eyeFrom(c: THREE.Vector3, b: THREE.Vector3, u: number): THREE.Vector3 {
  for (const d of [0, 12, 28, 48]) {
    for (const a of [0, 0.3, -0.3, 0.6, -0.6, 1, -1, 1.5, -1.5]) {
      const e = toward(c, b.clone().applyAxisAngle(c, a), u + (u < 0 ? -d : d));
      if (open(e, 10)) return e;
    }
  }
  return toward(c, b, u);
}
function findSeed(test: (s: MatchState) => Spell | null, pre: (s: MatchState) => boolean = () => true, limit = 4000): { seed: number; state: MatchState; spell: Spell } {
  for (let seed = 1; seed <= limit; seed++) {
    const state = createMatch({ seed });
    if (!pre(state)) continue;
    step(seaFor(W, seed), state, idleInput());
    const spell = test(state);
    if (spell) return { seed, state, spell };
  }
  throw new Error(`no seed for ${scene}`);
}
function fogMatch(): { seed: number; state: MatchState; spell: Spell } {
  const s = unarmed(createMatch({ seed: SEED })), sea = seaFor(W, SEED);
  while (s.tick < Math.round(400 / TICK)) {
    step(sea, s, helm(s));
    if (s.tick % 15 !== 0) continue;
    const ship = s.ships.find((sh) => inFog(s, sh.pos));
    const spell = ship && s.weather.find((w) => fogAngle(w) > 0 && dirOf(w.at).angleTo(dirOf(ship.pos)) < fogAngle(w));
    if (spell) return { seed: SEED, state: s, spell };
  }
  throw new Error('no ship in fog');
}
const prime = (kind: number, v: number) => (s: MatchState) => s.weather.find((w) => w.kind === kind && vigour(w) >= v) ?? null;

let state: MatchState, clock = 0, seed = SEED;
function play(ticks: number, input: (s: MatchState) => ReturnType<typeof idleInput>): void {
  const sea = seaFor(W, seed);
  for (let k = 0; k < ticks; k++) {
    step(sea, state, input(state));
    clock = state.tick * TICK;
    if (k % 30 === 29) view.frame({ state, dt: 1, clock, alpha: 1 });
  }
}
const lamps: THREE.Vector3[] = [];
function blueHour(): { seed: number; state: MatchState; spell: Spell } {
  for (let s = 1; s <= 400; s++) {
    const m = createMatch({ seed: s }), wait = ((19.4 - hourOf(m) + 24) % 24) / DAY.rate;
    if (wait > 400) continue;
    seed = s;
    state = m;
    play(Math.round(wait / TICK), () => idleInput());
    const calm = calmNow(state), heart = dirOf(calm.at);
    let best: Spell | null = null, score = 0;
    for (const w of state.weather) {
      if (w.kind !== SPELL.squall || vigour(w) <= 0.3 || calm.r * R - dirOf(w.at).angleTo(heart) * R < 0.8 * w.r + 60) continue;
      const v = vigour(w) + 0.2 * Math.min(2, state.weather.filter((f) => fogAngle(f) > 0 && dirOf(f.at).angleTo(dirOf(w.at)) * R < 220).length);
      if (v > score) {
        best = w;
        score = v;
      }
    }
    if (best) return { seed: s, state, spell: best };
  }
  throw new Error('no blue-hour squall');
}

function seek(s: MatchState): ShipInput {
  const input = helm(s);
  if (s.tick * TICK < 60) return input;
  const ship = s.ships[0], up = dirOf(ship.pos), heart = dirOf(calmNow(s).at), h = V(ship.head.x, ship.head.y, ship.head.z);
  const d = heart.addScaledVector(up, -up.dot(heart));
  input.flags = FLAG.breakOff;
  input.steer = Math.round(THREE.MathUtils.clamp(-200 * Math.atan2(h.clone().cross(d).dot(up), h.dot(d)), -127, 127));
  return input;
}
function finalCalm(): { seed: number; state: MatchState } {
  for (let s = 1; s <= 60; s++) {
    const m = unarmed(createMatch({ seed: s })), sea = seaFor(W, s);
    while (m.tick < Math.round(556 / TICK) && !over(m)) step(sea, m, seek(m));
    if (!over(m) && m.ships.filter(afloat).length >= 2) return { seed: s, state: m };
  }
  throw new Error('no match lasting to the final calm');
}

if (scene === 'fog' || scene === 'squall' || scene === 'calm') {
  const found = scene === 'fog'
    ? fogMatch()
    : scene === 'squall'
      ? blueHour()
      : findSeed(prime(SPELL.calm, 0.9));
  seed = found.seed;
  state = found.state;
  play(30, () => idleInput());
  const sp = found.spell, c = dirOf(sp.at);
  if (scene === 'fog') {
    const inside = state.ships.find((sh) => inFog(state, sh.pos)) ?? state.ships[0], ship = dirOf(inside.pos);
    const eye = eyeFrom(c, ship, fogAngle(sp) * R + 16);
    place(eye, 4, ship, 2);
    for (const sh of state.ships) if (!veiled(W.geo, state, eye, sh.pos)) lamps.push(dirOf(sh.pos));
  } else if (scene === 'squall') {
    const fog = state.weather.find((w) => fogAngle(w) > 0 && dirOf(w.at).angleTo(c) * R < 220);
    const eye = eyeFrom(c, fog ? dirOf(fog.at) : V(0, 1, 0), fog ? -(0.8 * sp.r + 30) : 0.8 * sp.r + 30);
    place(eye, 4, c, 9);
  } else place(c, 3, toward(c, V(0, 1, 0), 40), 1);
} else if (scene === 'ring') {
  ({ seed, state } = finalCalm());
  play(30, seek);
  const calm = calmNow(state), at = dirOf(calm.at), ship = dirOf(state.ships[0].pos);
  place(toward(at, ship, -0.6 * calm.r * R), 70, toward(at, ship, 0.4 * calm.r * R), 0);
} else if (scene === 'sea') {
  state = unarmed(createMatch({ seed }));
  play(Math.round(60 / TICK), helm);
  const sh = state.ships[0], ship = dirOf(sh.pos), ahead = V(sh.head.x, sh.head.y, sh.head.z);
  place(toward(ship, ahead, -30), 22, toward(ship, ahead, 24), 0);
} else {
  state = unarmed(createMatch({ seed }));
  const until = { bruise: 2, outside: 350, inside: 350 }[scene] ?? 2;
  play(Math.round(until / TICK), helm);
  const calm = calmNow(state), at = dirOf(calm.at), ship = dirOf(state.ships[0].pos);
  if (scene === 'bruise') {
    const origin = at.clone().negate(), eye = toward(ship, origin, -9);
    place(eye, 3.5, toward(ship, origin, 60), 6);
  } else {
    const edge = toward(at, ship, calm.r * R);
    if (scene === 'outside') place(toward(at, ship, calm.r * R - 60), 6, edge, 20);
    else place(toward(at, ship, calm.r * R + 14), 5, toward(at, ship, calm.r * R - 30), 4);
  }
}
for (let k = 0; k < 12; k++) view.frame({ state, dt: 1, clock, alpha: 1 });
const lights = skies.get(view.scene)!.lights;
for (const d of lamps) lights.add({ pos: d.clone().multiplyScalar(R + 3), reach: 9 });

function draw(): void {
  view.frame({ state, dt: 0, clock, alpha: 1 });
  pipeline.render(view.scene, camera, 1 / 60);
}
const weather = weathers.get(view.scene)!, storm = storms.get(view.scene)!;
const hook = {
  ready: false, scene, seed, hour: +hourOf(state).toFixed(2), tick: state.tick, lamps: lamps.length,
  stats: () => ({
    calls: pipeline.stats.calls, triangles: pipeline.stats.triangles, weatherTris: weather.triangles, stormTris: storm.triangles,
    storm: +storm.storm.toFixed(2), textureMB: +(pipeline.stats.textureBytes / 2 ** 20).toFixed(1),
  }),
  strike() {
    clock = Math.min(storm.lightning.next(clock, 2.6), weather.lightning.next(clock, 4.5)) + 0.03;
    draw();
    return hook.stats();
  },
  budget() {
    pipeline.render(view.scene, camera, 1 / 60);
    const total = pipeline.stats.triangles, out: Record<string, number> = { total };
    const named = new Map<THREE.Object3D, string>([[weather.group, 'weather'], [storm.group, 'storm']]);
    view.scene.children.forEach((c, k) => {
      if (!c.visible) return;
      c.visible = false;
      pipeline.render(view.scene, camera, 1 / 60);
      c.visible = true;
      const tris = total - pipeline.stats.triangles;
      if (tris > 1000) out[named.get(c) ?? `${k}:${c.name || c.type}/${c.children.length}`] = tris;
    });
    pipeline.render(view.scene, camera, 1 / 60);
    return out;
  },
  async profile(frames = 30, quantile = 0.5) {
    const gl = pipeline.renderer.getContext() as WebGL2RenderingContext, ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    const r = pipeline.renderer, plain = r.render.bind(r), next = () => new Promise((done) => requestAnimationFrame(done));
    let open = false, capture: [string, WebGLQuery][] | null = null;
    r.render = (s: THREE.Object3D, c: THREE.Camera) => {
      if (open || !capture) return plain(s, c);
      const q = gl.createQuery()!, quads = capture.filter(([k]) => k !== 'scene' && k !== 'ui').length;
      open = true;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      plain(s, c);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      open = false;
      capture.push([s === view.scene ? 'scene' : s === pipeline.ui ? 'ui' : (['edges', 'mask', 'composite', 'present'][quads] ?? 'other'), q]);
    };
    const run = async (n: number) => {
      const per: Record<string, number[]> = {};
      for (let k = 0; k < n; k++) {
        capture = [];
        pipeline.render(view.scene, camera, 1 / 60);
        const qs: [string, WebGLQuery][] = capture;
        capture = null;
        for (let w = 0; w < 30 && !gl.getQueryParameter(qs[qs.length - 1][1], gl.QUERY_RESULT_AVAILABLE); w++) await next();
        const ok = !gl.getParameter(ext.GPU_DISJOINT_EXT);
        for (const [name, q] of qs) {
          if (ok && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) (per[name] ??= []).push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(q);
        }
      }
      const med: Record<string, number> = {};
      let total = 0;
      for (const [name, v] of Object.entries(per)) {
        v.sort((x, y) => x - y);
        med[name] = +v[Math.min(v.length - 1, Math.floor(v.length * quantile))].toFixed(2);
        total += med[name];
      }
      med.total = +total.toFixed(2);
      return med;
    };
    const passes = await run(frames), groups: Record<string, number> = {};
    const named = new Map<THREE.Object3D, string>([[weather.group, 'weather'], [storm.group, 'storm']]);
    for (const [k, c] of view.scene.children.entries()) {
      if (!c.visible) continue;
      c.visible = false;
      const without = await run(Math.ceil(frames / 2));
      c.visible = true;
      const ms = +(passes.scene - without.scene).toFixed(2);
      if (Math.abs(ms) >= 0.05) groups[named.get(c) ?? `${k}:${c.name || c.type}/${c.children.length}`] = ms;
    }
    r.render = plain;
    return { passes, groups };
  },
  async gpu(frames = 40) {
    const gl = pipeline.renderer.getContext() as WebGL2RenderingContext, ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const ms: number[] = [], next = () => new Promise((done) => requestAnimationFrame(done));
    for (let k = 0; k < frames; k++) {
      if (ext) {
        const q = gl.createQuery()!;
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        pipeline.render(view.scene, camera, 1 / 60);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        for (let w = 0; w < 30 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); w++) await next();
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
      } else {
        const px = new Uint8Array(4), t = performance.now();
        pipeline.render(view.scene, camera, 1 / 60);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        ms.push(performance.now() - t);
      }
    }
    ms.sort((x, y) => x - y);
    return { timer: !!ext, median: +ms[ms.length >> 1].toFixed(2), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(2), p10: +ms[Math.floor(ms.length * 0.1)].toFixed(2) };
  },
};
(window as unknown as { __weather: typeof hook }).__weather = hook;
draw();
hook.ready = true;
