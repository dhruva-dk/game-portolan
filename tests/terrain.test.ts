import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISLAND, createIsland } from '../src/world/terrain.ts';
import { scatterPalms, scatterRocks, scatterShrubs } from '../src/world/scatter.ts';

const island = createIsland([0, -300], 1);
const at = (t: number, r: number): [number, number] => [island.centre[0] + Math.cos(t) * r, island.centre[1] + Math.sin(t) * r];

test('the waterline is the coast', () => {
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * 2 * Math.PI, c = island.coast(t);
    assert.ok(Math.abs(island.height(...at(t, c))) < 1e-9);
    assert.ok(island.height(...at(t, c - 2)) > 0, 'dry just inland');
    assert.ok(island.height(...at(t, c + 2)) < 0, 'wet just out');
  }
});

test('the beach slopes gently and without a step at the waterline', () => {
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * 2 * Math.PI, c = island.coast(t);
    const inland = island.height(...at(t, c - 0.5)) - island.height(...at(t, c));
    const seaward = island.height(...at(t, c)) - island.height(...at(t, c + 0.5));
    for (const s of [inland / 0.5, seaward / 0.5]) assert.ok(s > 0.08 && s < 0.16, `slope ${s}`);
  }
});

test('the lagoon is shallow, and the open sea deep', () => {
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * 2 * Math.PI, c = island.coast(t);
    const lagoon = island.height(...at(t, c + 40));
    assert.ok(lagoon < -1 && lagoon > -ISLAND.lagoonDepth - 1.5, `lagoon ${lagoon}`);
    const open = island.height(...at(t, island.reach));
    assert.ok(open < -ISLAND.deep + 2, `open ${open}`);
  }
});

test('the dunes stay low', () => {
  let top = -Infinity;
  for (let i = 0; i < 4000; i++) top = Math.max(top, island.height(...at(i * 2.39996, Math.sqrt(i / 4000) * 60)));
  assert.ok(top > 1.5 && top < ISLAND.dunes + 2, `top ${top}`);
});

test('the reef\'s crest shelters the lagoon', () => {
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * 2 * Math.PI, c = island.coast(t);
    const inside = island.passage(...at(t, c + 30));
    assert.ok(inside >= ISLAND.crest - 1e-9 && inside <= ISLAND.lagoonDepth + 1e-9, `passage ${inside}`);
    assert.equal(island.passage(...at(t, island.reach)), Infinity);
    // the water a wave crosses on its way in is never deeper than that
    let shallowest = Infinity;
    for (let r = c + 30; r < island.reach; r += 0.5) shallowest = Math.min(shallowest, -island.height(...at(t, r)));
    assert.ok(shallowest <= inside + 0.3, `crossed ${shallowest} vs passage ${inside}`);
  }
});

test('the rocks lie along the coast, apart, sunk into the ground', () => {
  const rocks = scatterRocks(island, 6);
  assert.ok(rocks.length > 40 && rocks.length < 100, `count ${rocks.length}`);
  for (const r of rocks) {
    const t = Math.atan2(r.z - island.centre[1], r.x - island.centre[0]);
    const d = Math.hypot(r.x - island.centre[0], r.z - island.centre[1]) - island.coast(t);
    assert.ok(d > -5 && d < 6, `from the waterline ${d}`);
    assert.ok(r.y < island.height(r.x, r.z), 'sunk');
    for (const o of rocks) if (o !== r) assert.ok(Math.hypot(o.x - r.x, o.z - r.z) > (o.size + r.size) * 0.79, 'apart');
  }
  assert.deepEqual(scatterRocks(island, 6), rocks, 'the same every time');
});

test('the palms stand on dry land, apart, leaning seaward', () => {
  const palms = scatterPalms(island);
  assert.ok(palms.length > 30, `count ${palms.length}`);
  let seaward = 0;
  for (const p of palms) {
    assert.ok(island.height(p.x, p.z) > 0.3, 'dry');
    for (const o of palms) if (o !== p) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) >= 3.5, 'apart');
    const out = Math.atan2(p.z - island.centre[1], p.x - island.centre[0]);
    if (Math.cos(p.heading - out) > 0) seaward++;
  }
  assert.ok(seaward > palms.length * 0.9, `seaward ${seaward}/${palms.length}`);
  assert.deepEqual(scatterPalms(island), palms, 'the same every time');
});

test('the shrubs stand on dry land behind the beach', () => {
  const shrubs = scatterShrubs(island, 4);
  assert.ok(shrubs.length > 100, `count ${shrubs.length}`);
  for (const s of shrubs) {
    assert.ok(island.height(s.x, s.z) > 0.4, 'dry');
    assert.ok(s.shape >= 0 && s.shape < 4);
  }
  assert.deepEqual(scatterShrubs(island, 4), shrubs, 'the same every time');
});
