// WP20's territory: a big loop from a real headless match floods in from the trail that closed it and dries flat, its
// claim announced once and sent as one bounded partial upload; the border is a smoothed contour, doubled where rival
// waters meet; and in the browser the inked borders hold still under a slow camera move, console clean.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type * as THREE from 'three';
import { DRY_TIME, MOMENT_SLOTS, Territory, type Claim } from '../../src/render/territory.ts';
import { step } from '../../src/sim/match.ts';
import { TERRITORY } from '../../src/sim/sphere.ts';
import { createMatch, EVENT, TICK } from '../../src/sim/state.ts';
import { launch, openGame, serve, type Launched, type Server } from '../harness.ts';
import { bigLoop, helm, scripted } from './territory.match.ts';

const N = TERRITORY.n, NN = N * N;
const loop = bigLoop();
const face = (cube: THREE.CubeTexture, f: number): Uint8Array => (cube.images[f] as THREE.DataTexture).image.data as Uint8Array;
const texel = (c: number): [number, number] => {
  const f = Math.floor(c / NN), row = Math.floor((c - f * NN) / N);
  return [f, ((N - 1 - row) * N + (c - f * NN - row * N)) * 4];
};

test('a big loop floods in from its trail, then dries; its claim is announced once and costs one partial upload', () => {
  assert.ok(loop.tick > 0 && loop.area >= 300, `the scripted helm closes a big loop (${loop.area.toFixed(0)} u²)`);
  const { sea, state } = scripted(), t = new Territory(null), claims: Claim[] = [];
  t.onClaim((c) => claims.push(c));
  let clock = 0;
  const play = () => {
    step(sea, state, helm(state));
    clock += TICK;
    t.sync(state, clock);
    t.frame(clock);
  };
  while (state.tick < loop.tick - 1) play();
  const sent = t.uploaded, before = claims.length;
  play();
  const ev = state.events.find((e) => e.kind === EVENT.loop && e.ship === 0)!, claim = claims.at(-1)!;
  assert.equal(claims.length, before + 1);
  assert.equal(claim.kind, 'loop');
  assert.equal(claim.area, ev.amount);
  const cost = t.uploaded - sent;
  console.log(`claim of ${ev.amount.toFixed(0)} u², reach ${claim.reach.toFixed(1)} u, wash ${claim.duration.toFixed(2)} s: ${(cost / 1024).toFixed(0)} KiB uploaded`);
  assert.ok(cost < 3 * 2 ** 20, `a claim's partial upload stays under 3 MiB (${cost} B)`);
  const slot = t.slots.findIndex((s) => s.x === 1);
  assert.ok(slot > 0 && slot < MOMENT_SLOTS, 'the flood holds a moment slot');
  // the trail's own cells are the wet start; the sea farthest from it is the last reached
  let trail = 0, n = 0, all = 0, m = 0;
  for (const c of ev.cells) {
    const [f, o] = texel(c), mo = face(t.moments, f);
    if (state.owner[c] === 1 && mo[o + 2] === 255) { trail += mo[o]; n++; }
  }
  for (let c = 0; c < state.owner.length; c++) {
    if (state.owner[c] !== 1) continue;
    const [f, o] = texel(c), mo = face(t.moments, f);
    if (mo[o + 1] === slot * 32) { all += mo[o]; m++; }
  }
  assert.ok(n > 0 && m > n && trail / n < 0.25 * (all / m), `the wash starts at the trail (trail ${(trail / n).toFixed(1)}, claim ${(all / m).toFixed(1)})`);
  for (let k = 0; k < Math.ceil((claim.duration + DRY_TIME + 0.2) / TICK); k++) {
    clock += TICK;
    t.frame(clock);
  }
  assert.equal(t.slots[slot].x, 0, 'the wash has dried and its slot is free');
  const [f, o] = texel(ev.cells[0]);
  assert.equal(face(t.moments, f)[o + 2], 0, 'its cells left the moment');
});

test('the border is a smooth contour between cells, and rival waters meeting show two borders', () => {
  const s = createMatch({ seed: 7 }), t = new Territory(null);
  t.sync(s, 0);
  const cell = (x: number, y: number) => (N - 1 - y) * N + x; // face 0, texel (x, y)
  for (let y = 100; y < 200; y++) for (let x = 100; x < 300; x++) s.owner[cell(x, y)] = x < 200 ? 1 : 2; // two waters side by side
  s.ships[0].held = s.ships[1].held = 1;
  s.tick++;
  t.sync(s, 0);
  t.frame(100); // past every moment
  const a = (x: number, y: number) => face(t.wash, 0)[(y * N + x) * 4 + 3] / 255;
  assert.ok(a(99, 150) < 0.5 && a(100, 150) > 0.5, 'nobody | waters: the contour falls between the cells');
  assert.ok(a(199, 150) < 0.5 && a(200, 150) < 0.5 && a(198, 150) > 0.5 && a(201, 150) > 0.5, 'rival | rival: a border each side');
  assert.ok(a(150, 98) < 0.1 && a(150, 99) > 0.2 && a(150, 100) < 0.8 && a(150, 101) > 0.9, 'the ownership ramps over the kernel, so the contour is smooth');
});

let server: Server, launched: Launched;
before(async () => {
  server = await serve();
  launched = await launch();
});
after(async () => {
  await launched.browser.close();
  await server.close();
});

test('the inked borders hold still under a slow camera move, console clean', async () => {
  const game = await openGame(launched.browser, `${server.url}tests/render/territory.html`, {
    device: 'iphone', hook: '__territory', query: { scene: 'border', at: String(loop.tick) },
  });
  await game.until((g) => g.ready, undefined, 240000);
  const r = await game.page.evaluate(() => (window as unknown as { __territory: { flicker(n: number, du: number): { mean: number; worst: number; pixels: number } } }).__territory.flicker(20, 0.03));
  console.log(`border flicker over a slow move: ${JSON.stringify(r)}`);
  assert.ok(r.pixels > 500, `the view holds territory (${r.pixels} px)`);
  assert.ok(r.mean < 0.02 && r.worst < 0.05, `border pixels hold still (mean ${r.mean.toFixed(4)}, worst ${r.worst.toFixed(4)})`);
  game.assertClean();
});
