// WP22 offline (no GPU): every event draws its effect and the same events draw the same particles; a heavy ten-ship
// fight holds the pool and the tail to their caps with nothing NaN; chest openings grade by tier (gold leaf only at the
// top); the Great Current's ribbon and stream arcs follow the eye and hide far off, its glow easing as the fleet peels;
// and the effects' share of the frame (A9: two draws, a fixed handful of triangles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStyle } from '../../src/style/glsl.ts';
import { createMatch, emit, EVENT, PHASE, type MatchState } from '../../src/sim/state.ts';
import { seaFor } from '../../src/sim/environment.ts';
import { R } from '../../src/sim/sphere.ts';
import { BATTERY, CONSUMABLE } from '../../src/sim/tables.ts';
import { Effects, FX, FX_CAP } from '../../src/render/fx.ts';
import { CURRENT, CurrentView } from '../../src/render/currents.ts';
import type { RenderContext } from '../../src/render/world.ts';
import { world } from '../sim/vectors.ts';

const style = createStyle();
const context = (): RenderContext =>
  ({ pipeline: { style }, world: world(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 956 / 440, 0.1, 2000) }) as unknown as RenderContext;
const NAMES = ['aP', 'aV', 'aK', 'aM', 'aC'];
const buffer = (fx: Effects, name: string) => fx.mesh.geometry.getAttribute(name).array as Float32Array;
const finite = (fx: Effects) => NAMES.every((n) => buffer(fx, n).every(Number.isFinite));
const draw = (fx: Effects, state: MatchState, tick: number, clock: number) => { state.tick = tick; fx.frame({ state, dt: 1 / 60, clock, alpha: 1 }); };
const shot = (s: MatchState, k: number) =>
  ({ ship: k % 10, kind: 0, from: { ...s.ships[k % 10].pos }, to: { ...s.ships[(k + 3) % 10].pos }, age: 0.3, time: 1.2, top: 0.12, power: 10,
    effect: k % 3, lasting: 0, blast: k % 5 === 0 ? 4 : 0 }) as unknown as MatchState['shots'][number];

const KINDS = [EVENT.broadside, EVENT.hit, EVENT.splash, EVENT.ram, EVENT.struck, EVENT.ablaze, EVENT.mortar, EVENT.shell, EVENT.kegBurst, EVENT.keg,
  EVENT.chest, EVENT.opened, EVENT.landed, EVENT.chestLost, EVENT.scoop, EVENT.find, EVENT.spill, EVENT.erupt, EVENT.loop, EVENT.bank, EVENT.broken,
  EVENT.dive, EVENT.breakOff, EVENT.thrown, EVENT.chosen];
const USED = [CONSUMABLE.patchKit, CONSUMABLE.ward, CONSUMABLE.gust, CONSUMABLE.fogFlask, CONSUMABLE.flare];

test('every event draws its effect, and the same events draw the same particles', () => {
  const runs = [0, 1].map(() => ({ fx: new Effects(context()), s: createMatch({ seed: 7 }) }));
  for (const { fx, s } of runs) {
    draw(fx, s, 0, 0);
    let tick = 1;
    for (const kind of [...KINDS, ...USED.map((u) => -u)]) {
      const before = fx.spawned;
      s.events.length = 0;
      if (kind < 0) emit(s, EVENT.used, 0, -kind, s.ships[0].pos, 1);
      else emit(s, kind, 0, 1, s.ships[1].pos, kind === EVENT.loop ? 900 : kind === EVENT.opened || kind === EVENT.chest || kind === EVENT.landed ? 3 : 2);
      draw(fx, s, tick++, tick * 0.1);
      assert.ok(fx.spawned > before, `event ${kind} drew nothing`);
    }
    assert.ok(finite(fx));
  }
  for (const n of NAMES) assert.deepEqual(buffer(runs[0].fx, n), buffer(runs[1].fx, n), `${n} differs between identical runs`);
});

test('a heavy ten-ship fight holds the pool and tail to their caps, all finite', () => {
  const fx = new Effects(context()), s = createMatch({ seed: 9 });
  let clock = 0;
  for (let t = 1; t <= 400; t++) {
    s.events.length = 0;
    for (let i = 0; i < 10; i++) {
      emit(s, EVENT.broadside, i, (i + 1) % 10, s.ships[i].pos, t % 2 ? BATTERY.port : BATTERY.starboard);
      emit(s, EVENT.hit, (i + 1) % 10, i, s.ships[(i + 1) % 10].pos, 20);
      emit(s, EVENT.splash, i, -1, s.ships[(i + 3) % 10].pos, 0);
    }
    s.ships[t % 10].fire = 3;
    clock += 0.1;
    draw(fx, s, t, clock);
  }
  s.shots.length = 0;
  for (let k = 0; k < 400; k++) s.shots.push(shot(s, k));
  s.events.length = 0;
  draw(fx, s, 401, clock + 0.05);
  const alive = fx.live(clock + 0.05);
  console.log(`heavy fight: ${fx.spawned} particles written, ${alive} alive, tail ${fx.tail}, ${fx.triangles} triangles in one draw`);
  assert.ok(fx.spawned > 3 * FX_CAP.pool, 'the ring buffer wrapped');
  assert.ok(alive <= FX_CAP.pool);
  assert.equal(fx.tail, FX_CAP.tail);
  assert.ok(fx.mesh.geometry instanceof THREE.InstancedBufferGeometry && fx.mesh.geometry.instanceCount <= fx.capacity);
  assert.ok(finite(fx));
  s.shots.length = 3;
  draw(fx, s, 402, clock + 0.1);
  assert.equal(fx.tail, 6, 'three shots and their shadows');
});

test('chest openings grade by tier; gold leaf only at the top', () => {
  const made = [0, 1, 2, 3, 4].map((tier) => {
    const fx = new Effects(context()), s = createMatch({ seed: 7 });
    draw(fx, s, 0, 0);
    emit(s, EVENT.opened, 0, -1, s.ships[0].pos, tier);
    draw(fx, s, 1, 0.1);
    return { n: fx.spawned, gilt: fx.live(0.4, FX.flourish), coins: fx.live(0.4, FX.coin) };
  });
  console.log(`chest bursts by tier: ${made.map((m) => m.n).join(' < ')} particles`);
  for (let k = 1; k < 5; k++) assert.ok(made[k].n > made[k - 1].n, `tier ${k} is no richer than tier ${k - 1}`);
  assert.deepEqual(made.map((m) => m.gilt), [0, 0, 0, 0, 1]);
  assert.equal(made[1].coins, 0);
});

test('the Great Current follows the eye, hides far off, and its glow eases as the fleet peels', () => {
  const ctx = context(), cur = new CurrentView(ctx), s = createMatch({ seed: 7 }), pts = seaFor(ctx.world, s.seed).current.points;
  const k = Math.floor(pts.length / 9);
  ctx.camera.position.set(pts[3 * k], pts[3 * k + 1], pts[3 * k + 2]).multiplyScalar(R + 25);
  cur.frame({ state: s, dt: 1 / 60, clock: 1, alpha: 1 });
  assert.ok(cur.mesh.visible);
  assert.equal(cur.arcs.length, CURRENT.arcs);
  assert.ok((cur.mesh.geometry.getAttribute('position').array as Float32Array).every(Number.isFinite));
  const riding = cur.uniforms.uCurGlow.value as number;
  s.ships.forEach((sh) => { sh.phase = PHASE.sailing; });
  for (let i = 0; i < 300; i++) cur.frame({ state: s, dt: 1 / 30, clock: 1 + i / 30, alpha: 1 });
  assert.ok(riding > CURRENT.glow + 0.5 * CURRENT.ride && Math.abs((cur.uniforms.uCurGlow.value as number) - CURRENT.glow) < 0.01);
  const away = (d: THREE.Vector3) => { let near = -1; for (let i = 0; i < pts.length; i += 3) near = Math.max(near, d.x * pts[i] + d.y * pts[i + 1] + d.z * pts[i + 2]); return near; };
  const dirs = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => new THREE.Vector3(x, y, z)))).filter((d) => d.lengthSq() > 0).map((d) => d.normalize());
  const far = dirs.reduce((a, b) => (away(a) < away(b) ? a : b));
  assert.ok(Math.acos(away(far)) * R > CURRENT.reach + 18, 'some direction lies clear of the route');
  ctx.camera.position.copy(far).multiplyScalar(R + 25);
  cur.frame({ state: s, dt: 1 / 60, clock: 12, alpha: 1 });
  assert.ok(!cur.mesh.visible);
  assert.equal(cur.arcs.length, 0);
});

test('the effects take two draws and a fixed handful of triangles (A9)', () => {
  const fx = new Effects(context()), cur = new CurrentView(context());
  const tris = 2 * fx.capacity + 2 * CURRENT.segments;
  console.log(`effects share: 2 draws, at most ${tris} triangles`);
  assert.ok(tris <= 8000);
  assert.ok(fx.triangles + cur.triangles <= tris);
});
