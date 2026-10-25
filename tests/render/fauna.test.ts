// WP23 offline (no GPU): life is placed the same every time, every species present and seated on the sea or the
// land it lives on; each ship's gull follows its sim flight (perched exactly on its truck, wheeling, out, home with its
// chest, holding over its prey in the dive) with its cues for WP28; gold-leaf wingtips only at the top of every
// trait; life reacts (puffins lift from a ship, whales sound at gunfire, dolphins come to the bow); the same frames
// draw the same instances; and life's share of the frame over every region and from the chart (A9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStyle } from '../../src/style/glsl.ts';
import { createMatch, emit, EVENT, FLIGHT, type MatchState } from '../../src/sim/state.ts';
import { cellOf, localFrame, R, TERRITORY } from '../../src/sim/sphere.ts';
import { GULL } from '../../src/sim/tables.ts';
import { toWorld } from '../../src/sim/world/geography.ts';
import { ACT, Fauna, KIND, LIFE, placeLife, SPECIES } from '../../src/render/fauna.ts';
import { gilded, GULL_FLY, GULL_FOOT, gullAim, newAim, type GullCue } from '../../src/render/gull.ts';
import type { RenderContext } from '../../src/render/world.ts';
import { world } from '../sim/vectors.ts';

const style = createStyle(), w = world();
const height = (d: THREE.Vector3) => w.geo.heights[cellOf(TERRITORY, d)];
const context = (): RenderContext =>
  ({ pipeline: { style }, world: w, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 956 / 440, 0.1, 2000) }) as unknown as RenderContext;
const V = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
function runner(fa: Fauna, st: MatchState) {
  let clock = 0;
  return (sec: number) => { for (let k = 0; k < Math.round(sec * 60); k++) { clock += 1 / 60; fa.frame({ state: st, dt: 1 / 60, clock, alpha: 1 }); } return clock; };
}
function moveShip(st: MatchState, i: number, to: THREE.Vector3): void {
  const s = st.ships[i];
  s.pos.x = s.was.x = to.x; s.pos.y = s.was.y = to.y; s.pos.z = s.was.z = to.z;
}

test('life is placed the same every time, every species present, seated on the sea or the land it lives on', () => {
  const a = placeLife(height), b = placeLife(height);
  assert.equal(a.length, b.length);
  assert.ok(a.length > 150, `${a.length} creatures`);
  a.forEach((c, i) => assert.ok(c.home.equals(b[i].home) && c.seed === b[i].seed));
  for (const k of SPECIES.keys()) assert.ok(a.some((c) => c.kind === k), SPECIES[k]);
  for (const c of a) {
    assert.ok(Number.isFinite(c.home.x + c.home.y + c.home.z + c.seat) && Math.abs(c.home.length() - 1) < 1e-9);
    assert.ok(Math.abs(c.ground - height(c.home)) < 1e-9);
    if (['otter', 'turtle', 'dolphin'].includes(SPECIES[c.kind])) assert.ok(c.ground < -0.3 && !c.land);
    if (SPECIES[c.kind] === 'whale') assert.ok(c.ground < -3 && !c.land);
    if (['wader', 'heron'].includes(SPECIES[c.kind])) assert.ok(c.ground > -1.5 && c.ground < 1.5, 'at the water’s edge');
    if (c.land) assert.ok(c.ground > 0 && c.seat === c.ground); else assert.equal(c.seat, 0);
  }
  assert.ok(a.some((c) => c.kind === KIND.puffin && c.land), 'puffins up on the stacks');
});

test('each gull follows its sim flight: on its truck, wheeling, out, home with its chest, the dive; cues; nothing NaN', () => {
  const ctx = context(), fa = new Fauna(ctx), st = createMatch({ seed: 11 }), s = st.ships[0], g = s.gull, aim = newAim(), cues: GullCue[] = [];
  const up = V(s.pos).normalize(), head = V(s.head);
  fa.gulls.cue = (c) => cues.push(c);
  ctx.camera.position.copy(up).multiplyScalar(R + 20);
  const run = runner(fa, st);
  let since = 0, clock = 0;
  const fly = (flight: number, sec: number) => { g.flight = flight; since = sec; clock = run(sec); };
  const near = (tol: number, what: string) => {
    gullAim(st, 0, 1, null, since, clock, aim);
    const p = fa.gulls.at(0);
    assert.ok(p, what);
    assert.ok(p.distanceTo(aim.p) < tol, `${what}: ${p.distanceTo(aim.p).toFixed(2)} u off`);
  };
  fly(FLIGHT.mast, 1);
  near(1e-6, 'perched');
  assert.ok(Math.abs(fa.gulls.at(0)!.length() - (R + GULL_FLY.mast + GULL_FOOT)) < 1e-6);
  fly(FLIGHT.wheel, 3);
  near(1.5, 'wheeling');
  assert.ok(Math.abs(fa.gulls.at(0)!.length() - R - GULL_FLY.wheel) < 0.6);
  g.span = GULL.flight[g.wings];
  g.time = g.span * GULL.legs.out * 0.5;
  const at = up.clone().multiplyScalar(R).addScaledVector(head, 30).normalize();
  Object.assign(g.at, { x: at.x, y: at.y, z: at.z });
  Object.assign(g.dir, { x: head.x, y: head.y, z: head.z });
  fly(FLIGHT.out, 2.5);
  near(0.05, 'out along the bow');
  g.tier = 3;
  g.time = g.span * GULL.legs.back * 0.5;
  fly(FLIGHT.back, 2.5);
  near(0.05, 'home with the chest');
  assert.equal(fa.gulls.carrying(0), 3);
  g.prey = 3;
  fly(FLIGHT.dive, 3);
  near(1.6, 'holding over its prey');
  assert.ok(Math.abs(fa.gulls.at(0)!.distanceTo(V(st.ships[3].pos).normalize().multiplyScalar(R)) - Math.hypot(GULL_FLY.hold, GULL_FLY.holdR)) < 1.6);
  fly(FLIGHT.mast, 2);
  near(1e-6, 'back on its truck');
  for (const c of ['takeoff', 'dive', 'land'] as GullCue[]) assert.ok(cues.includes(c), c);
  assert.ok(fa.gulls.finite());
});

test('plumage: gold-leaf wingtips only at the top of every trait, and every trait reaches the shader', () => {
  const ctx = context(), fa = new Fauna(ctx), st = createMatch({ seed: 11 }), top = GULL.levels;
  Object.assign(st.ships[1].gull, top);
  Object.assign(st.ships[2].gull, { ...top, beak: top.beak - 1 });
  assert.ok(gilded(st.ships[1].gull) && !gilded(st.ships[2].gull) && !gilded(st.ships[0].gull));
  runner(fa, st)(0.1);
  const aT = fa.gulls.mesh.geometry.getAttribute('aT').array as Float32Array, aD = fa.gulls.mesh.geometry.getAttribute('aD').array as Float32Array;
  assert.deepEqual([...aT.slice(4, 8), aD[4]], [top.talons, top.wings, top.eye, top.beak, top.dive]);
  assert.deepEqual([aD[2], aD[6], aD[10]], [0, 1, 0]);
});

test('life reacts: puffins lift from a ship, whales sound at gunfire, dolphins come to the bow', () => {
  const ctx = context(), fa = new Fauna(ctx), st = createMatch({ seed: 11 }), run = runner(fa, st);
  const puffin = fa.creatures.find((c) => c.kind === KIND.puffin && c.land)!;
  ctx.camera.position.copy(puffin.home).multiplyScalar(R + 15);
  run(0.5);
  assert.equal(puffin.act, ACT.idle);
  moveShip(st, 0, puffin.home);
  run(2);
  assert.equal(puffin.act, ACT.alarm);
  assert.ok(puffin.lift > 0.6 && puffin.at.distanceTo(puffin.home) * R > 5, 'aloft and off');
  const whale = fa.creatures.find((c) => c.kind === KIND.whale)!;
  ctx.camera.position.copy(whale.home).multiplyScalar(R + 30);
  run(0.5);
  assert.equal(whale.act, ACT.idle);
  emit(st, EVENT.broadside, 1, -1, toWorld(whale.ri, 0, 0, new THREE.Vector3()), 0);
  st.tick++;
  run(1 / 60);
  st.events.length = 0;
  assert.equal(whale.act, ACT.alarm, 'sounding');
  const dolphin = fa.creatures.find((c) => c.kind === KIND.dolphin)!;
  ctx.camera.position.copy(dolphin.home).multiplyScalar(R + 20);
  moveShip(st, 0, dolphin.home);
  const east = new THREE.Vector3();
  localFrame(dolphin.home, east, new THREE.Vector3());
  Object.assign(st.ships[0].head, { x: east.x, y: east.y, z: east.z });
  run(6);
  const bow = dolphin.home.clone().multiplyScalar(R).addScaledVector(V(st.ships[0].head), LIFE.bow);
  assert.ok(dolphin.at.clone().multiplyScalar(R).distanceTo(bow) < 3, 'riding the bow');
});

test('the same frames draw the same instances', () => {
  const draw = () => {
    const ctx = context(), fa = new Fauna(ctx), st = createMatch({ seed: 5 });
    ctx.camera.position.copy(toWorld(2, 0, 0, new THREE.Vector3())).multiplyScalar(R + 10);
    runner(fa, st)(1);
    return ['aP', 'aF', 'aA'].map((n) => [...(fa.mesh.geometry.getAttribute(n).array as Float32Array)]).concat(['aP', 'aQ', 'aW'].map((n) => [...(fa.gulls.mesh.geometry.getAttribute(n).array as Float32Array)]));
  };
  assert.deepEqual(draw(), draw());
});

test('budgets: full flocks over every region stay a sliver of the frame, and thin out from the chart (A9)', () => {
  const ctx = context(), fa = new Fauna(ctx), st = createMatch({ seed: 11 }), run = runner(fa, st), rows: string[] = [];
  let most = 0;
  for (let ri = 0; ri < 12; ri++) {
    ctx.camera.position.copy(toWorld(ri, 0, 0, new THREE.Vector3())).multiplyScalar(R + 12);
    run(0.2);
    assert.ok(fa.draws <= 2 && fa.cards <= LIFE.cap && fa.gulls.finite());
    most = Math.max(most, fa.triangles);
    rows.push(`${ri}:${fa.cards}c/${fa.gulls.count}g/${fa.triangles}t`);
  }
  assert.ok(most < 25000, `${most} triangles`);
  ctx.camera.position.copy(toWorld(6, 0, 0, new THREE.Vector3())).multiplyScalar(R + 12);
  run(0.2);
  const close = fa.cards;
  ctx.camera.position.multiplyScalar((R + 260) / (R + 12));
  run(0.2);
  assert.ok(fa.cards < close, `chart ${fa.cards} vs ${close}`);
  console.log(`life per region (cards/gulls/triangles): ${rows.join(' ')}; most ${most} tris in ≤2 draws; chart ${fa.cards} cards`);
});
