import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, N, centreOf } from '../src/world/cells.ts';
import {
  R,
  add,
  faceDir,
  faceUV,
  normalize,
  type Vec3,
} from '../src/world/sphere.ts';
import {
  CELL,
  centres,
  components,
  shoreOf,
} from '../src/world/terrain-grid.ts';
import {
  TERRAIN,
  createTerrain,
  heightAt,
  profile,
} from '../src/world/terrain.ts';

const SEEDS = [1, 2];
const terrains = new Map(SEEDS.map((s) => [s, createTerrain(s)]));
const random = (seed: number) => () =>
  (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;

test('land is its share of the planet, and the sailable sea is one body', () => {
  for (const [seed, t] of terrains) {
    assert.ok(
      Math.abs(t.stats.landAfter - TERRAIN.land) < 0.01,
      `seed ${seed}: land ${t.stats.landAfter}`
    );
    const sail = Uint8Array.from(
      { length: CELLS },
      (_, c) => +(t.water[c] && t.shore[c] >= TERRAIN.clear)
    );
    assert.equal(components(sail).area.length, 1, `seed ${seed}`);
  }
});

test('the same seed makes the same terrain, to the bit', () => {
  const again = createTerrain(1);
  assert.deepEqual(again.height, terrains.get(1)!.height);
});

test('the distance to the coast is to a smooth contour, within a fraction of a cell', () => {
  const a = 0.3,
    p = centres(),
    field = Float32Array.from({ length: CELLS }, (_, c) => p[3 * c + 1]);
  const shore = shoreOf(field, a);
  let worst = 0,
    sum = 0;
  for (let c = 0; c < CELLS; c++) {
    const e = Math.abs(shore[c] - R * (Math.asin(a) - Math.asin(p[3 * c + 1])));
    worst = Math.max(worst, e);
    sum += e;
  }
  assert.ok(
    worst < 0.15 * CELL,
    `worst ${worst.toFixed(3)} m, a cell ${CELL.toFixed(2)} m`
  );
  assert.ok(sum / CELLS < 0.01 * CELL, `mean ${(sum / CELLS).toFixed(4)} m`);
});

test("read at a cell's centre, the height is the cell's own", () => {
  const t = terrains.get(1)!,
    h = heightAt(t),
    next = random(7);
  const cells = [
    0,
    N - 1,
    N * N - 1,
    3 * N * N + N * (N - 1),
    5 * N * N + 2 * N + 1,
  ];
  for (let k = 0; k < 400; k++) cells.push(Math.floor(next() * CELLS));
  for (const c of cells)
    assert.ok(Math.abs(h(centreOf(c)) - t.height[c]) < 1e-3, `cell ${c}`);
});

test('the height is continuous and gentle everywhere, across faces too', () => {
  const t = terrains.get(2)!,
    h = heightAt(t),
    next = random(11),
    step = 0.25;
  const sign = () => (next() < 0.5 ? -1 : 1);
  const nearEdge = (): Vec3 => {
    const v = [sign(), sign() * (1 + (next() - 0.5) * 0.02), next() * 2 - 1],
      r = Math.floor(next() * 3);
    return normalize([v[r], v[(r + 1) % 3], v[(r + 2) % 3]]);
  };
  let steepest = 0;
  for (let k = 0; k < 40000; k++) {
    const p =
      k % 2
        ? nearEdge()
        : normalize([next() * 2 - 1, next() * 2 - 1, next() * 2 - 1]);
    const q = normalize([
      p[0] + (next() - 0.5) * (step / R),
      p[1] + (next() - 0.5) * (step / R),
      p[2] + (next() - 0.5) * (step / R),
    ]);
    const run = R * Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (run > 1e-3) steepest = Math.max(steepest, Math.abs(h(q) - h(p)) / run);
  }
  assert.ok(
    steepest < 0.0375 * t.options.summit,
    `steepest ${steepest.toFixed(2)}`
  );
});

test('the height runs on across every edge of the cube without a step, to its corners', () => {
  const edges = new Set<string>();
  let worst = 0,
    where = '';
  for (const [seed, t] of terrains) {
    const h = heightAt(t);
    for (let face = 0; face < 6; face++)
      for (let side = 0; side < 4; side++) {
        const sign = side % 2 ? 1 : -1;
        const on = (s: number, k: number) =>
          side < 2 ? faceDir(face, sign * s, k) : faceDir(face, k, sign * s);
        edges.add([face, faceUV(on(1.01, 0)).face].sort().join());
        for (let n = 0; n <= 2000; n++) {
          const k = n / 1000 - 1,
            e = on(1, k),
            out = normalize(add(e, on(0.999, k), -1));
          const a = normalize(add(e, out, -1e-9)),
            b = normalize(add(e, out, 1e-9));
          assert.notEqual(faceUV(a).face, faceUV(b).face);
          const step = Math.abs(h(a) - h(b));
          if (step > worst)
            [worst, where] = [
              step,
              `seed ${seed}, face ${face} side ${side} at ${k}`,
            ];
        }
      }
  }
  assert.equal(edges.size, 12);
  assert.ok(worst < 1e-4, `${worst} m at ${where}`);
});

test('the profile meets the sea at 0 from either side, and rises inland and falls offshore', () => {
  const t = terrains.get(1)!;
  for (const f of [t.level - 0.1, t.level, t.level + 0.1]) {
    assert.ok(Math.abs(profile(t, f, 1e-6)) < 1e-3);
    assert.ok(Math.abs(profile(t, f, -1e-6)) < 1e-3);
  }
  for (let s = -60; s < 60; s += 0.5)
    assert.ok(
      profile(t, t.level + 0.2, s + 0.5) < profile(t, t.level + 0.2, s),
      `at ${s}`
    );
});
