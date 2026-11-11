import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, along, distance, faceDir, frameAt, fromChart, normalize, type Vec3 } from '../src/world/sphere.ts';
import { bakeFaces, createPlanet } from '../src/world/planet.ts';
import { ISLANDS } from '../src/world/planet-islands.ts';
import { random } from '../src/world/scatter.ts';

const SEEDS = [1, 2, 3];
const planets = new Map(SEEDS.map((s) => [s, createPlanet(s)]));
const planet = planets.get(1)!;

/** Points spread evenly over the sphere (a Fibonacci lattice): each stands for an equal share of its area. */
const lattice = (count: number): Vec3[] =>
  Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count, s = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    return [Math.cos(a) * s, y, Math.sin(a) * s] as Vec3;
  });
const onIsland = (s: (typeof planet.islands)[number], t: number, r: number) => fromChart(s.chart, Math.cos(t) * r, Math.sin(t) * r);

test('the same for a seed, different across seeds', () => {
  const again = createPlanet(1), other = createPlanet(2);
  const points = lattice(500);
  assert.deepEqual(points.map((p) => again.height(p)), points.map((p) => planet.height(p)));
  assert.deepEqual(again.islands.map((s) => s.chart.at), planet.islands.map((s) => s.chart.at));
  const differ = points.filter((p) => Math.abs(other.height(p) - planet.height(p)) > 0.5).length;
  assert.ok(differ > points.length / 2, `${differ} of ${points.length} differ`);
});

test('the ground is continuous: no steps anywhere, and steep only on a channel\'s side', () => {
  const step = 0.1, rand = random(99);
  for (const seed of SEEDS) {
    const pl = planets.get(seed)!;
    const slopes: number[] = [];
    const pair = (p: Vec3) => {
      const f = frameAt(p), a = rand() * 2 * Math.PI;
      const t: Vec3 = [0, 1, 2].map((i) => f.east[i] * Math.cos(a) + f.north[i] * Math.sin(a)) as unknown as Vec3;
      slopes.push(Math.abs(pl.height(along(p, t, step).p) - pl.height(p)) / step);
    };
    // all over the sphere, along the cube faces' edges and corners, and round each island out past its reach
    for (let i = 0; i < 40000; i++) pair(normalize([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]));
    for (let i = 0; i < 4000; i++) {
      const u = rand() * 2 - 1, s = rand() < 0.5 ? 1 : -1, k = Math.floor(rand() * 3);
      const p: [number, number, number] = [u, u, u];
      p[k] = s;
      p[(k + 1) % 3] = s * (rand() < 0.5 ? 1 : -1);
      pair(normalize(p));
    }
    for (const isl of pl.islands) for (let i = 0; i < 3000; i++) pair(onIsland(isl, rand() * 2 * Math.PI, rand() * isl.reach * 1.1));
    slopes.sort((a, b) => a - b);
    const worst = slopes[slopes.length - 1], p99 = slopes[Math.floor(slopes.length * 0.99)];
    assert.ok(worst < 2.5, `seed ${seed}: steepest ${worst.toFixed(2)} over ${step} m`);
    assert.ok(p99 < 1, `seed ${seed}: 99th percentile slope ${p99.toFixed(2)}`);
  }
});

test('an island\'s centre has no seam where its coast\'s angle wraps', () => {
  for (const s of planet.islands) {
    const top = planet.height(s.chart.at);
    for (let i = 0; i < 32; i++) {
      const h = planet.height(onIsland(s, (i / 32) * 2 * Math.PI, 0.05));
      assert.ok(Math.abs(h - top) < 0.05, `centre ${top} vs ${h}`);
    }
  }
});

test('the planet\'s shares at R = 554: banks, deeps, land', () => {
  assert.equal(R, 554, 'these ranges are for R = 554');
  const points = lattice(60000);
  for (const [seed, pl] of planets) {
    let deep = 0, shallow = 0, land = 0, top = -Infinity, bottom = Infinity;
    for (const p of points) {
      const h = pl.height(p);
      if (h < -30) deep++;
      if (h <= 0 && h > -15) shallow++;
      if (h > 0) land++;
      top = Math.max(top, h);
      bottom = Math.min(bottom, h);
    }
    const share = (n: number) => n / points.length;
    const say = `seed ${seed}: deep ${share(deep)}, shallow ${share(shallow)}, land ${share(land)}, top ${top}, bottom ${bottom}`;
    assert.ok(share(deep) > 0.25 && share(deep) < 0.36, say);
    assert.ok(share(shallow) > 0.42 && share(shallow) < 0.65, say);
    assert.ok(share(land) > 0.004 && share(land) < 0.025, say);
    assert.ok(top > 5 && top < 12.5, say);
    assert.ok(bottom > -61 && bottom < -45, say);
  }
});

test('islands: counted by the area, apart, on the banks and never in a channel', () => {
  for (const [seed, pl] of planets) {
    const n = pl.islands.length;
    assert.ok(n >= 6 && n <= 9, `seed ${seed}: ${n} islands`);
    const radii = pl.islands.map((s) => s.radius);
    assert.ok(Math.min(...radii) >= ISLANDS.radius[0] && Math.max(...radii) <= ISLANDS.radius[1], `radii ${radii}`);
    assert.ok(Math.max(...radii) - Math.min(...radii) > 20, `varied sizes ${radii}`);
    for (const a of pl.islands) {
      for (const b of pl.islands) if (a !== b) {
        const d = distance(a.chart.at, b.chart.at);
        assert.ok(d > a.shelf + b.shelf + ISLANDS.gap - 1e-6, `seed ${seed}: islands ${d.toFixed(0)} m apart`);
      }
      // nowhere out to its apron's farthest edge is as deep as a channel
      for (let i = 0; i < 2000; i++) {
        const h = pl.height(onIsland(a, i * 2.39996, Math.sqrt(i / 2000) * a.shelf));
        assert.ok(h > -20, `seed ${seed}: ${h.toFixed(1)} m within an island's apron`);
      }
    }
  }
});

test('each island: the waterline is its coast, the beach about 1:8 there, the summit 5 m or more', () => {
  for (const [seed, pl] of planets) for (const s of pl.islands) {
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * 2 * Math.PI, c = s.coast(t);
      const at = (r: number) => pl.height(onIsland(s, t, r));
      assert.ok(Math.abs(at(c)) < 1e-6, `seed ${seed}: waterline ${at(c)}`);
      const inland = (at(c - 1) - at(c)) / 1, seaward = (at(c) - at(c + 1)) / 1;
      for (const k of [inland, seaward]) assert.ok(k > 0.09 && k < 0.17, `seed ${seed}: beach slope ${k.toFixed(3)}`);
    }
    let top = 0;
    for (let i = 0; i < 3000; i++) top = Math.max(top, pl.height(onIsland(s, i * 2.39996, Math.sqrt(i / 3000) * s.radius)));
    assert.ok(s.summit >= 5 && top >= 4.9, `seed ${seed}: summit ${s.summit}, sampled ${top}`);
    assert.ok(s.summit <= 12.5, `seed ${seed}: summit ${s.summit}`);
  }
});

test('cover: 0…1, no sea grass on land or in the deeps', () => {
  for (const p of lattice(20000)) {
    const h = planet.height(p), c = planet.cover(p);
    for (const v of [c.grass, c.rubble, c.mottle]) assert.ok(v >= 0 && v <= 1);
    if (h > 0 || h < -25) assert.equal(c.grass, 0);
  }
});

test('bakeFaces: the nodes are height() at faceDir, and the faces agree along their shared edges', () => {
  const n = 33;
  const { height, cover } = bakeFaces(planet, n);
  assert.equal(height.length, 6);
  const byDirection = new Map<string, number[]>();
  for (let face = 0; face < 6; face++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = faceDir(face, (2 * i) / (n - 1) - 1, (2 * j) / (n - 1) - 1), k = j * n + i;
    const h = planet.height(p), c = planet.cover(p);
    assert.ok(Math.abs(height[face][k] - h) < 1e-3 * (1 + Math.abs(h)), `face ${face} (${i}, ${j}): ${height[face][k]} vs ${h}`);
    assert.ok(Math.abs(cover[face][k * 4] - c.grass * 255) <= 1 && Math.abs(cover[face][k * 4 + 1] - c.rubble * 255) <= 1 && Math.abs(cover[face][k * 4 + 2] - c.mottle * 255) <= 1);
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1) {
      const key = p.map((v) => v.toFixed(7)).join();
      byDirection.set(key, [...(byDirection.get(key) ?? []), height[face][k]]);
    }
  }
  // each edge node but the corners lies on two faces, each corner on three
  const counts = [...byDirection.values()].map((v) => v.length).sort();
  assert.equal(counts.filter((c) => c === 2).length, 12 * (n - 2));
  assert.equal(counts.filter((c) => c === 3).length, 8);
  for (const v of byDirection.values()) assert.ok(Math.max(...v) - Math.min(...v) < 1e-3, `edge ${v}`);
});

test('bakeFaces at 768 takes a couple of seconds at most', () => {
  const t = performance.now();
  bakeFaces(planet, 768);
  const ms = performance.now() - t;
  assert.ok(ms < 4000, `${ms.toFixed(0)} ms`);
});
