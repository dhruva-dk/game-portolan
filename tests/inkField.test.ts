// The captains' ink as baked for the sea's shader, without a GPU.
//   node --test tests/inkField.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID, TERRITORY, cellDir, cellOf, faceDir } from '../src/sim/sphere.ts';
import { v3 } from '../src/sim/math.ts';
import { BN, GOING, InkField, RANGE, TILE, placeIn } from '../src/render/ocean/inkField.ts';

const N = GRID, NN = N * N, CELLS = 6 * NN;
const cell = (f: number, i: number, j: number) => f * NN + j * N + i;
const texel = (f: number, x: number, y: number) => ((f * TILE + y) * TILE + x) * 4;
const P = v3();

/** A disc of cells owned by `owner`, added to `grid`. */
function disc(grid: Uint8Array, c: number, radius: number, owner: number): number[] {
  const out: number[] = [], A = v3(), B = v3();
  cellDir(TERRITORY, c, A);
  const cos = Math.cos(radius);
  for (let x = 0; x < CELLS; x++) {
    cellDir(TERRITORY, x, B);
    if (A.x * B.x + A.y * B.y + A.z * B.z >= cos) {
      grid[x] = owner;
      out.push(x);
    }
  }
  return out;
}

test('a point on the planet is placed in any face it can be seen from', () => {
  const at = { u: 0, v: 0 };
  for (let f = 0; f < 6; f++) {
    for (const [u, v] of [[0, 0], [0.5, -0.7], [-0.99, 0.99], [0.2, 0.9]]) {
      faceDir(f, u, v, P);
      placeIn(f, P, at);
      assert.ok(Math.abs(at.u - u) < 1e-9 && Math.abs(at.v - v) < 1e-9, `face ${f} (${u}, ${v}) came back (${at.u}, ${at.v})`);
    }
  }
});

test('open water stays flat and cheap', () => {
  const ink = new InkField();
  ink.rects.length = 0;
  ink.update(new Uint8Array(CELLS), [], 0);
  assert.equal(ink.rects.length, 0);
  const o = texel(2, 100, 100);
  assert.deepEqual([...ink.a.subarray(o, o + 4)], [0, 0, 255, 0]);
});

test('held water is flat within, and its border lies on the cells\' edge', () => {
  const ink = new InkField(), grid = new Uint8Array(CELLS);
  // half of a face: columns from 128 on, away from every face edge in the middle rows
  for (let j = 0; j < N; j++) for (let i = 128; i < N; i++) grid[cell(4, i, j)] = 3;
  ink.update(grid, [], 0);
  const inside = texel(4, 2 * 200 + 1, 2 * 128 + 1), outside = texel(4, 2 * 60 + 1, 2 * 128 + 1);
  assert.deepEqual([...ink.a.subarray(inside, inside + 4)], [3, 3, 255, 0]);
  assert.deepEqual([...ink.a.subarray(outside, outside + 4)], [0, 0, 255, 0]);
  // cells 127 and 128 meet between texels 256 and 257: the pair is (0, 3) and the field crosses over between them
  const y = 2 * 128 + 1, a = ink.a, left = texel(4, 256, y), right = texel(4, 257, y);
  assert.deepEqual([a[left], a[left + 1]], [0, 3]);
  assert.deepEqual([a[right], a[right + 1]], [0, 3]);
  assert.ok(a[left + 2] > 127.5 && a[right + 2] < 127.5, `field ${a[left + 2]} then ${a[right + 2]}`);
  assert.ok(Math.abs(a[left + 2] + a[right + 2] - 255) <= 2, 'the border is halfway between them');
  // and it is straight: the same a little way along
  const along = texel(4, 256, y + 30);
  assert.ok(Math.abs(a[along + 2] - a[left + 2]) <= 1);
});

test('a border keeps its place over a cube edge', () => {
  const ink = new InkField(), grid = new Uint8Array(CELLS), at = { u: 0, v: 0 };
  // a disc on an edge of face 4
  faceDir(4, 1, 0, P);
  disc(grid, cellOf(TERRITORY, P), 0.12, 5);
  ink.update(grid, [], 0);
  // a point just inside the disc read from both faces gives the same owners
  const Q = v3();
  faceDir(4, 0.999, 0, Q);
  const other = [0, 1, 2, 3, 5].find((f) => {
    placeIn(f, Q, at);
    return Math.abs(at.u) <= 1.02 && Math.abs(at.v) <= 1.02;
  })!;
  placeIn(other, Q, at);
  const x = Math.round((at.u + 1) * (BN / 2) + 0.5), y = Math.round((at.v + 1) * (BN / 2) + 0.5), o = texel(other, x, y);
  assert.equal(ink.a[o + 1], 5);
});

test('a flood reaches the far side of what it took last, and the old water is kept until then', () => {
  const ink = new InkField(), grid = new Uint8Array(CELLS);
  const c = cell(4, 128, 128);
  disc(grid, c, 0.15, 2);
  const [{ len, delay }] = ink.update(grid, [{ ship: 1, kind: 'claim', from: [cell(4, 128, 150)] }], 10);
  assert.ok(len >= 1 && len <= 2);
  assert.equal(delay, 0);
  const near = texel(4, 2 * 128 + 1, 2 * 150 + 1), far = texel(4, 2 * 128 + 1, 2 * 110 + 1);
  assert.equal(ink.a[near + 3], 2);
  assert.ok(ink.b[near + 3] < ink.b[far + 3], `front ${ink.b[near + 3]} then ${ink.b[far + 3]}`);
  // before the flood this was open sea
  assert.deepEqual([ink.b[far], ink.b[far + 1], ink.b[far + 2]], [0, 0, 255]);
  ink.settle(10 + len + 10);
  assert.equal(ink.a[near + 3], 0, 'a settled flood costs a texel one read');
});

test('a trail lays a line, and takes up after itself', () => {
  const ink = new InkField(), trail: number[] = [];
  const empty: number[][] = Array.from({ length: 4 }, () => []);
  for (let i = 100; i < 140; i++) trail.push(cell(4, i, 128));
  const laid = empty.map((e, s) => (s === 1 ? trail : e));
  ink.trails(laid);
  const y = 2 * 128 + 1, x = 2 * 120 + 1, o = texel(4, x, y), t = ink.t;
  assert.equal(t[o], 2);
  assert.ok((t[o + 1] / 255) * RANGE < 1.5, `distance ${(t[o + 1] / 255) * RANGE}`);
  // the far side of the range is not stamped
  assert.equal(t[texel(4, x, y + 16)], 0);
  ink.rects.length = 0;
  trail.push(cell(4, 140, 128));
  ink.trails(laid);
  const sent = ink.rects.filter((r) => r.tex === 't');
  assert.equal(sent.length, 1);
  assert.ok(sent[0].w <= 16, `only the new stretch goes up (${sent[0].w} wide)`);
  // cut, then taken up
  ink.go(1, GOING.broken, 20);
  assert.equal(t[o] & 31, 2);
  assert.equal(t[o] >> 5, GOING.broken);
  ink.rects.length = 0;
  ink.gone(1);
  assert.equal(t[o], 0);
  assert.equal(t[o + 1], 255);
  assert.ok(ink.rects.some((r) => r.tex === 't' && r.w > 60), 'the whole of it goes up');
});

test('a trail going leaves another captain\'s trail over it alone', () => {
  const ink = new InkField();
  const a: number[] = [], b: number[] = [];
  for (let i = 100; i < 140; i++) a.push(cell(4, i, 128));
  for (let j = 108; j < 148; j++) b.push(cell(4, 120, j));
  ink.trails([a, []]);
  ink.go(0, GOING.absorbed, -1);
  ink.trails([[], b]);
  const o = texel(4, 2 * 120 + 1, 2 * 128 + 1);
  assert.equal(ink.t[o], 2);
  ink.gone(0);
  assert.equal(ink.t[o], 2);
});

test('a big claim bakes in a moment', () => {
  const ink = new InkField(), grid = new Uint8Array(CELLS);
  const taken = disc(grid, cell(4, 128, 128), 0.5, 2);
  const t0 = performance.now();
  ink.update(grid, [{ ship: 1, kind: 'claim', from: taken.slice(0, 40) }], 0);
  const ms = performance.now() - t0;
  assert.ok(ms < 60, `${taken.length} cells took ${ms.toFixed(1)} ms`);
});
