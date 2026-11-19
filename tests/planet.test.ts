// The planet (world/planet.ts, as world/planet-terrain.ts makes it from the terrain): its rises, where she starts, its
// cover, its baked faces and its remembered heights. The terrain's own shape is terrain.test.ts's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, along, bearingAt, distance, dot, faceDir, type Vec3 } from '../src/world/sphere.ts';
import { START, SEED, bakeFaces, remembered } from '../src/world/planet.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { CELL, between, locate, taps } from '../src/world/terrain-grid.ts';
import { WADE } from '../src/world/terrain-scatter.ts';
import { SHIP } from '../src/sim/handling.ts';
import { random } from '../src/world/random.ts';

const land = landOf(SEED), planet = planetOf(SEED, land);

/** Points spread evenly over the sphere (a Fibonacci lattice): each stands for an equal share of its area. */
const lattice = (count: number): Vec3[] =>
  Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count, s = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    return [Math.cos(a) * s, y, Math.sin(a) * s] as Vec3;
  });
/** Metres in from the coast at p (negative on the water). */
const at = taps();
const inland = (p: Vec3) => (locate(p, at), -between(land.shore, at));

test('the land stands only within its rises: under the top of every rise whose reach it is in, and under the sea past them all', () => {
  const rises = planet.rises, draw = random(7);
  const topAt = (q: Vec3) => {
    let top = -Infinity;
    for (const r of rises) if (r.top > top && distance(q, r.at) < r.reach) top = r.top;
    return top;
  };
  // all over the sphere, and close round the rises' edges
  const points = lattice(20000);
  for (let k = 0; k < 10000; k++) {
    const r = rises[Math.floor(draw() * rises.length)], a = draw() * 2 * Math.PI;
    points.push(along(r.at, bearingAt(r.at, a), r.reach * (0.8 + 0.4 * draw())).p);
  }
  let worst = -Infinity;
  for (const q of points) {
    const top = topAt(q), h = planet.height(q);
    if (top === -Infinity) assert.ok(h < 0, `land past every rise at ${q}`);
    else worst = Math.max(worst, h - Math.max(top, 0));
  }
  assert.ok(worst <= 1e-9, `the ground ${worst.toFixed(3)} m over the top of its rises`);
});

test('the same land and seed make the same planet; another seed only another cover', () => {
  const again = planetOf(SEED, land), other = planetOf(SEED + 1, land);
  const points = lattice(500);
  assert.deepEqual(points.map((p) => again.height(p)), points.map((p) => planet.height(p)));
  assert.deepEqual(points.map((p) => again.cover(p)), points.map((p) => planet.cover(p)));
  assert.deepEqual([again.rises, again.start, again.heart], [planet.rises, planet.start, planet.heart]);
  assert.deepEqual(points.map((p) => other.height(p)), points.map((p) => planet.height(p)));
  const differ = points.filter((p) => Math.abs(other.cover(p).mottle - planet.cover(p).mottle) > 0.05).length;
  assert.ok(differ > points.length / 2, `${differ} of ${points.length} differ`);
});

test('she starts on the water START m off the coast, facing the land', () => {
  const { at: p, bearing } = planet.start;
  assert.ok(planet.height(p) < -SHIP.draught, `${planet.height(p).toFixed(2)} m under her`);
  assert.ok(Math.abs(-inland(p) - START) < 1.5 * CELL, `${(-inland(p)).toFixed(1)} m off the coast`);
  // the coast is ahead of her: within START and a little more along her heading
  const ahead = bearingAt(p, bearing);
  assert.ok(inland(along(p, ahead, START + 4 * CELL).p) > 0, 'no land ahead of her');
  assert.ok(Math.abs(dot(ahead, p)) < 1e-9);
});

test('no hidden shallows: water too shallow to sail lies only within WADE of the coast', () => {
  let shallow = 0, farthest = 0;
  for (const p of lattice(120000)) {
    const h = planet.height(p);
    if (h > 0 || h <= -SHIP.draught) continue;
    shallow++;
    farthest = Math.max(farthest, -inland(p));
    assert.ok(-inland(p) < WADE, `${(-h).toFixed(2)} m deep, ${(-inland(p)).toFixed(1)} m from the coast`);
  }
  console.log(`# shallows: ${shallow} points, the farthest ${farthest.toFixed(1)} m out`);
  assert.ok(shallow > 0);
});

test('cover: 0…1; no sea grass in the deeps, and the land\'s growth only inland past the beach', () => {
  for (const p of lattice(20000)) {
    const h = planet.height(p), c = planet.cover(p);
    for (const v of [c.grass, c.rubble, c.mottle, c.clump]) assert.ok(v >= 0 && v <= 1);
    if (h < -22 || (inland(p) > 0 && inland(p) <= 20)) assert.equal(c.grass, 0, `${h.toFixed(1)} m, ${inland(p).toFixed(1)} m in`);
  }
});

test('bakeFaces: the nodes are height() at faceDir, and the faces agree along their shared edges', () => {
  const n = 33;
  const { height, cover } = bakeFaces(planet, n);
  assert.equal(height.length, 6);
  const byDirection = new Map<string, number[]>();
  // on a cube face's edge the terrain is read from whichever face the point falls on, and the readings either side
  // of the edge, and at the cube's corners, are one (terrain-grid.ts locate): the faces' nodes there part only by the
  // rounding of their directions
  const SEAM = 1e-4;
  let seam = 0;
  for (let face = 0; face < 6; face++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = faceDir(face, (2 * i) / (n - 1) - 1, (2 * j) / (n - 1) - 1), k = j * n + i;
    const h = planet.height(p), rim = i === 0 || j === 0 || i === n - 1 || j === n - 1;
    if (rim) {
      seam = Math.max(seam, Math.abs(height[face][k] - h));
      const key = p.map((v) => v.toFixed(7)).join();
      byDirection.set(key, [...(byDirection.get(key) ?? []), height[face][k]]);
      continue;
    }
    const c = planet.cover(p), near = (ch: number, v: number) => Math.abs(cover[face][k * 4 + ch] - v * 255) <= 1;
    assert.ok(Math.abs(height[face][k] - h) < 1e-3 * (1 + Math.abs(h)), `face ${face} (${i}, ${j}): ${height[face][k]} vs ${h}`);
    assert.ok(near(0, c.grass) && near(1, c.rubble) && near(2, c.mottle) && near(3, c.clump), `face ${face} (${i}, ${j})`);
  }
  // each edge node but the corners lies on two faces, each corner on three
  const counts = [...byDirection.values()].map((v) => v.length).sort();
  assert.equal(counts.filter((c) => c === 2).length, 12 * (n - 2));
  assert.equal(counts.filter((c) => c === 3).length, 8);
  for (const v of byDirection.values()) seam = Math.max(seam, Math.max(...v) - Math.min(...v));
  console.log(`# the faces part along their edges by ${seam.toExponential(1)} m at most`);
  assert.ok(seam < SEAM, `${seam} m`);
});

test('bakeFaces at 768 takes a couple of seconds at most', () => {
  // timed as the best of three: the bake's own cost, not whatever else the machine is doing (the suite runs its files
  // side by side); stopping at the first within the budget, as the best would be
  let best = Infinity;
  for (let run = 0; run < 3 && best >= 4000; run++) {
    const t = performance.now();
    bakeFaces(planet, 768);
    best = Math.min(best, performance.now() - t);
  }
  assert.ok(best < 4000, `${best.toFixed(0)} ms`);
});

test('a height remembered is the height to the bit, read again or after its place in the table was taken', () => {
  const read = remembered(planet.height, 4);
  const points = lattice(200);
  for (let pass = 0; pass < 3; pass++) for (const p of points) assert.equal(Object.is(read(p), planet.height(p)), true);
  // the same point by another array, and points a bit apart, are told apart
  const p = points[7], q: Vec3 = [p[0], p[1], p[2] + 1e-16];
  assert.equal(read([p[0], p[1], p[2]]), planet.height(p));
  assert.equal(Object.is(read(q), planet.height(q)), true);
});

test('the planet is R = 554 across', () => assert.equal(R, 554));
