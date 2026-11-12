import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BERTHS, CLOTH_REACH, FADE, SETTLE, moor, type Berth } from '../src/ship/berths.ts';
import { buildShip } from '../src/ship/build.ts';
import { cutCanvas, lashed } from '../src/ship/canvas.ts';
import { CLOTH } from '../src/ship/kit.ts';
import { BRACED, feeling, hauled, moved, trim, type Motion } from '../src/ship/motion.ts';
import type { ShipPose } from '../src/world/pose.ts';
import { R, cross, dot, length, normalize, scale, type Vec3 } from '../src/world/sphere.ts';

const canvas = cutCanvas();
const vec = (a: Float32Array, k: number): Vec3 => [a[k * 4], a[k * 4 + 1], a[k * 4 + 2]];
const apart = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

test('the canvas is the finest level\'s cloth, a particle a vertex, cut where it is drawn', () => {
  const cloth = buildShip(0).cloth;
  assert.equal(canvas.count, cloth.vertices);
  for (let k = 0; k < canvas.count; k++) for (let c = 0; c < 3; c++) assert.equal(canvas.rest[k * 4 + c], cloth.position[k * 3 + c]);
  assert.deepEqual(canvas.grids.map((g) => g.kind), [0, 0, 0, 0, CLOTH.lateen, CLOTH.pennant, CLOTH.pennant, CLOTH.pennant]);
});

test('each sail is lashed along its yard and at its clews, a pennant at its truck; the rest is free', () => {
  for (const g of canvas.grids) {
    const free = (i: number, j: number) => canvas.rest[(g.first + j * (g.columns + 1) + i) * 4 + 3];
    for (let j = 0; j <= g.rows; j++) for (let i = 0; i <= g.columns; i++) {
      assert.equal(free(i, j), lashed(g.kind, i, j, g.columns, g.rows) ? 0 : 1, `${g.name} (${i}, ${j})`);
    }
    if (g.kind === CLOTH.square) {
      assert.equal(free(g.columns >> 1, 0), 0, `${g.name}: its head`);
      assert.equal(free(0, g.rows) + free(g.columns, g.rows), 0, `${g.name}: its clews`);
      assert.equal(free(g.columns >> 1, g.rows), 1, `${g.name}: its foot between them`);
    }
    if (g.kind === CLOTH.pennant) assert.equal(free(g.columns, 0), 1, `${g.name}: its tip`);
  }
});

test('every free particle is held within the cloth\'s reach of a lashing on its own sail, no nearer than straight', () => {
  for (const g of canvas.grids) for (let k = g.first; k < g.first + (g.columns + 1) * (g.rows + 1); k++) {
    if (canvas.rest[k * 4 + 3] === 0) { assert.equal(canvas.cell[k * 4 + 2], -1); continue; }
    const anchor = canvas.cell[k * 4 + 2], reach = canvas.cell[k * 4 + 3];
    assert.ok(anchor >= g.first && anchor < g.first + (g.columns + 1) * (g.rows + 1), `${g.name}: particle ${k}'s anchor ${anchor}`);
    assert.equal(canvas.rest[anchor * 4 + 3], 0, `${g.name}: particle ${k}'s anchor is lashed`);
    const straight = apart(vec(canvas.rest, k), vec(canvas.rest, anchor));
    assert.ok(reach >= straight - 1e-4 && reach < straight * 1.6 + 0.5, `${g.name}: particle ${k} reach ${reach} vs ${straight}`);
  }
});

test('a square sail hangs before its mast and is braced about it; the lateen before the mizzen; a pennant before none', () => {
  for (const g of canvas.grids) {
    const k = g.first, [mz, mr, pivot] = [canvas.mast[k * 4], canvas.mast[k * 4 + 1], canvas.mast[k * 4 + 2]];
    if (g.kind === CLOTH.pennant) { assert.equal(mr, 0); continue; }
    assert.ok(mr > 0.1 && mr < 0.4, `${g.name}: mast radius ${mr}`);
    // its head (the yard) lies just before the mast's axis
    const head = vec(canvas.rest, g.first + (g.columns >> 1));
    assert.ok(Math.hypot(head[0] * (g.kind === CLOTH.lateen ? 0 : 1), head[2] - mz) < 2, `${g.name}: head ${head} vs mast at ${mz}`);
    if (g.kind === CLOTH.square) assert.ok(Math.abs(pivot - mz) < 1, `${g.name}: braced about ${pivot}, mast at ${mz}`);
    else assert.equal(pivot, 0);
  }
});

const ships = (n: number, metres: (i: number) => number) => Array.from({ length: n }, (_, i) => metres(i));
const run = (berths: (Berth | null)[], metres: number[], own: number, seconds: number, dt = 1 / 30) => {
  let b = berths;
  for (let t = 0; t < seconds; t += dt) b = moor(b, metres, own, dt);
  return b;
};
const held = (b: (Berth | null)[]) => b.flatMap((x) => (x ? [x.ship] : [])).sort((p, q) => p - q);

test('the berths go to the player and the nearest within reach, the cloth settling unseen before it is shown', () => {
  const metres = ships(10, (i) => 20 + i * 15);
  metres[7] = 5; // a near ship far down the list
  const empty = new Array(BERTHS).fill(null);
  const first = moor(empty, metres, 9, 1 / 30);
  assert.deepEqual(held(first), [0, 1, 7, 9]);
  assert.ok(first.every((b) => b && b.fresh && b.share === 0));
  const settling = run(first, metres, 9, SETTLE * 0.9);
  assert.ok(settling.every((b) => b && !b.fresh && b.share === 0), 'unseen while it settles');
  const shown = run(first, metres, 9, SETTLE + FADE + 0.1);
  assert.ok(shown.every((b) => b && b.share === 1), 'shown in full after it fades in');
  // nobody past reach
  assert.deepEqual(held(moor(empty, ships(3, () => CLOTH_REACH + 1), -1, 1 / 30)), []);
});

test('a ship that is no longer among the nearest fades out before her berth goes to another, with no jump', () => {
  const metres = ships(5, (i) => 20 + i * 10);
  let b = run(new Array(BERTHS).fill(null), metres, -1, SETTLE + FADE + 0.1);
  assert.deepEqual(held(b), [0, 1, 2, 3]);
  // ship 4 comes close and ship 3 sails off
  const after = [...metres];
  after[4] = 10;
  after[3] = 100;
  let last = b.find((x) => x?.ship === 3)!.share;
  for (let t = 0; t < FADE + 0.1; t += 1 / 30) {
    b = moor(b, after, -1, 1 / 30);
    const three = b.find((x) => x?.ship === 3);
    if (!three) break;
    assert.ok(three.share <= last && last - three.share <= 1 / 30 / FADE + 1e-9, 'fading out a little a frame');
    last = three.share;
  }
  b = run(b, after, -1, 0.2);
  assert.deepEqual(held(b), [0, 1, 2, 4]);
  assert.ok(b.find((x) => x?.ship === 4)!.share < 1, 'and the new one fades in');
});

test('two ships at about the same distance don\'t trade a berth back and forth', () => {
  const metres = ships(BERTHS + 1, (i) => 20 + i * 10);
  let b = run(new Array(BERTHS).fill(null), metres, -1, 3);
  const last = BERTHS - 1;
  // the one outside is now a little nearer than the last one in
  metres[BERTHS] = metres[last] - 2;
  b = run(b, metres, -1, 3);
  assert.ok(held(b).includes(last) && !held(b).includes(BERTHS));
});

const pose = (forward: Vec3, up: Vec3, at: Vec3 = [0, R, 0]): ShipPose => ({ position: at, forward: normalize(forward), up: normalize(up) });

test('her motion: still, she feels gravity alone, straight down her mast', () => {
  let m: Motion | null = null;
  const p = pose([0, 0, 1], [0, 1, 0]);
  for (let i = 0; i < 60; i++) m = moved(m, p, 1 / 30);
  const f = feeling(m!);
  assert.ok(Math.abs(f.weight[1] + 9.81) < 1e-6 && Math.abs(f.weight[0]) < 1e-6 && Math.abs(f.weight[2]) < 1e-6);
  assert.ok(length(f.spin) < 1e-9);
});

test('her motion: rolling, she feels the roll about her fore-and-aft axis; heeled, gravity across her', () => {
  let m: Motion | null = null;
  const rate = 0.1, dt = 1 / 30;
  for (let i = 0; i <= 90; i++) {
    const a = rate * i * dt;
    m = moved(m, pose([0, 0, 1], [-Math.sin(a), Math.cos(a), 0]), dt);
  }
  const f = feeling(m!);
  // rolling to starboard (her up toward −x, the world's starboard): a turn about +z, forward
  assert.ok(Math.abs(f.spin[2] - rate) < 0.01 && Math.abs(f.spin[0]) < 1e-3 && Math.abs(f.spin[1]) < 1e-3, `spin ${f.spin}`);
  assert.ok(f.weight[0] < -2, `heeled to starboard, gravity pulls her canvas to starboard: ${f.weight}`);
});

test('her motion: gathering way, her canvas is thrown aft; a jump is not a jolt', () => {
  let m: Motion | null = null;
  const dt = 1 / 30, north: Vec3 = [0, 0, 1];
  let v = 0, z = 0;
  for (let i = 0; i < 60; i++) {
    v += 1 * dt;
    z += v * dt;
    m = moved(m, pose(north, [0, 1, 0], [0, R, z]), dt);
  }
  assert.ok(feeling(m!).weight[2] < -0.8, `thrown aft: ${feeling(m!).weight}`);
  m = moved(m, pose(north, [0, 1, 0], [0, R, z + 500]), dt);
  assert.deepEqual([m.velocity, m.accel, m.spin], [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
});

test('her yards are trimmed to the wind: square to it from astern, hard round when it is forward of the beam', () => {
  // the way it blows, her frame: from right astern, from the starboard quarter, from the port bow
  assert.equal(trim([0, 0, 5], 0), 0);
  const quarter = trim([3, 0, 3], 0);
  assert.ok(Math.abs(quarter - Math.PI / 4) > 0 && quarter === Math.min(BRACED, Math.PI / 4));
  assert.equal(trim([-4, 0, -2], 0), -BRACED);
  // near dead ahead, they stay on the side they were
  assert.equal(trim([0.1, 0, -5], -BRACED), -BRACED);
  assert.equal(trim([-0.1, 0, -5], BRACED), BRACED);
  // and are hauled round over a few seconds, not at once
  let b = 0;
  for (let t = 0; t < 1; t += 0.1) b = hauled(b, [3, 0, 3], 0.1);
  assert.ok(b > 0.2 && b < quarter);
  for (let t = 0; t < 5; t += 0.1) b = hauled(b, [3, 0, 3], 0.1);
  assert.ok(Math.abs(b - quarter) < 1e-9);
  // the sail they set then faces into the wind's way: it fills
  const n: Vec3 = [Math.sin(b), 0, Math.cos(b)];
  assert.ok(dot(n, normalize([3, 0, 3])) > 0.95);
  assert.ok(length(cross(scale(n, 1), [0, 1, 0])) > 0.99);
});
