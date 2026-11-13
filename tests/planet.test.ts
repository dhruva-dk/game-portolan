import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, along, distance, faceDir, frameAt, fromChart, normalize, toChart, type Vec3 } from '../src/world/sphere.ts';
import { bakeFaces, createPlanet, remembered, risesOf } from '../src/world/planet.ts';
import { ISLANDS, KINDS, ORDER, WADE } from '../src/world/planet-islands.ts';
import { SHIP } from '../src/sim/handling.ts';
import { random } from '../src/world/random.ts';

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

test('the land stands only within its rises: under the top of every rise whose reach it is in, and under the sea past them all', () => {
  for (const [seed, p] of planets) {
    const rises = risesOf(p.islands), draw = random(seed * 31 + 7);
    const topAt = (q: Vec3) => Math.max(-Infinity, ...rises.filter((r) => distance(q, r.at) < r.reach).map((r) => r.top));
    let worst = -Infinity;
    // over each island's whole reach (its flank down to the deeps): under the top of the rises it is in, and under the
    // sea where it is in none
    for (const s of p.islands) {
      for (let k = 0; k < 1500; k++) {
        const q = onIsland(s, draw() * 2 * Math.PI, Math.sqrt(draw()) * s.reach), top = topAt(q);
        worst = Math.max(worst, p.height(q) - Math.max(top, 0));
      }
    }
    assert.ok(worst < 0, `seed ${seed}: the ground ${worst.toFixed(3)} m over the top of its rises, or the sea past them`);
    // past every reach, under the sea
    for (const q of lattice(20000)) if (topAt(q) === -Infinity) assert.ok(p.height(q) < 0, `seed ${seed}: land past every rise at ${q}`);
  }
});

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

test('the planet\'s shares at R = 554: banks, deeps, land, and what a ship can\'t sail', () => {
  assert.equal(R, 554, 'these ranges are for R = 554');
  const points = lattice(60000);
  for (const [seed, pl] of planets) {
    let deep = 0, shallow = 0, land = 0, aground = 0, top = -Infinity, bottom = Infinity;
    for (const p of points) {
      const h = pl.height(p);
      if (h < -30) deep++;
      if (h <= 0 && h > -15) shallow++;
      if (h > 0) land++;
      if (h > -SHIP.draught) aground++;
      top = Math.max(top, h);
      bottom = Math.min(bottom, h);
    }
    const share = (n: number) => n / points.length;
    const say = `seed ${seed}: deep ${share(deep)}, shallow ${share(shallow)}, land ${share(land)}, aground ${share(aground)}, top ${top}, bottom ${bottom}`;
    assert.ok(share(deep) > 0.14 && share(deep) < 0.36, say);
    assert.ok(share(shallow) > 0.42 && share(shallow) < 0.7, say);
    assert.ok(share(land) > 0.012 && share(land) < 0.04, say);
    assert.ok(share(aground) > share(land) && share(aground) < share(land) * 2 && share(aground) < 0.05, say);
    assert.ok(top > 14 && top < 26, say);
    assert.ok(bottom > -61 && bottom < -45, say);
  }
});

test('islands of every kind: counted by the area, in ORDER, apart, spread evenly, and never in a channel', () => {
  const points = lattice(20000);
  for (const [seed, pl] of planets) {
    const n = pl.islands.length;
    assert.ok(n >= 30 && n <= 60, `seed ${seed}: ${n} in all`);
    assert.deepEqual([...new Set(pl.islands.map((s) => s.kind))], ORDER, `seed ${seed}: kinds in order`);
    assert.equal(pl.islands[0].kind, 'island');
    for (const kind of ORDER) {
      const radii = pl.islands.filter((s) => s.kind === kind).map((s) => s.radius), K = KINDS[kind];
      assert.ok(radii.length >= 4, `seed ${seed}: ${radii.length} ${kind}`);
      assert.ok(Math.min(...radii) >= K.radius[0] && Math.max(...radii) <= K.radius[1], `${kind} radii ${radii}`);
      assert.ok(radii.every((r, i) => i === 0 || r <= radii[i - 1]), `${kind}: largest first`);
    }
    // a few large, more small
    const large = pl.islands.filter((s) => s.radius > 35).length, small = pl.islands.filter((s) => s.radius < 20).length;
    assert.ok(large >= 2 && small > 2 * large, `seed ${seed}: ${large} large, ${small} small`);
    for (const a of pl.islands) {
      for (const b of pl.islands) if (a !== b) {
        const d = distance(a.chart.at, b.chart.at);
        assert.ok(d > a.shelf + b.shelf + ISLANDS.gap - 1e-6, `seed ${seed}: islands ${d.toFixed(0)} m apart`);
      }
      // nowhere in its apron is as deep as a channel
      for (let i = 0; i < 2000; i++) {
        const t = i * 2.39996, r = Math.sqrt(i / 2000) * a.shelf;
        if (a.shore(Math.cos(t) * r, Math.sin(t) * r) > a.apron) continue;
        const h = pl.height(onIsland(a, t, r));
        assert.ok(h > -20, `seed ${seed}: ${h.toFixed(1)} m within an island's apron`);
      }
    }
    // spread over the whole planet, not gathered: nowhere is far from an island (the deeps' channels have none), and no
    // hemisphere has most of them
    let farthest = 0;
    for (const p of points) farthest = Math.max(farthest, Math.min(...pl.islands.map((s) => distance(p, s.chart.at) - s.shelf)));
    assert.ok(farthest < 350, `seed ${seed}: open water ${farthest.toFixed(0)} m from any apron`);
    for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]) {
      const north = pl.islands.filter((s) => s.chart.at[0] * axis[0] + s.chart.at[1] * axis[1] + s.chart.at[2] * axis[2] > 0).length;
      assert.ok(north > n * 0.3 && north < n * 0.7, `seed ${seed}: ${north} of ${n} on one side`);
    }
  }
});

test('each above the sea: the waterline is its coast, the beach about 1:8 there, a hill by its kind and size', () => {
  for (const [seed, pl] of planets) for (const s of pl.islands) {
    const at = (x: number, z: number) => pl.height(fromChart(s.chart, x, z));
    let off = 0, checked = 0;
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * 2 * Math.PI, c = s.coast(t), x = Math.cos(t) * c, z = Math.sin(t) * c;
      // the ground is read from its distance to the coast sampled on a grid (1 m; 0.5 m for rocks) and blended between
      // (planet-islands.ts, island-shape.ts): its zero lies within some 0.25 m of the coast drawn, at the beach's slope
      // a few centimetres of height (0.031 m the most, over these planets)
      assert.ok(Math.abs(at(x, z)) < 0.3 * ISLANDS.beach, `seed ${seed}: waterline ${at(x, z)}`);
      // the beach's fall, whichever way the coast runs there (on the small ones the dome comes nearer: steeper, no cliff)
      const e = 0.3, k = Math.hypot(at(x + e, z) - at(x - e, z), at(x, z + e) - at(x, z - e)) / (2 * e);
      checked++;
      // never steeper; gentler only at a sharp headland or spit, where the blend flattens the distance's fold (some
      // 1 in 700 of these, down to 0.074)
      assert.ok(k <= (s.kind === 'island' ? 0.17 : 0.27) && k > 0.07, `seed ${seed}: ${s.kind} beach ${k.toFixed(3)}`);
      if (k < 0.09) off++;
    }
    assert.ok(off <= checked * 0.05, `seed ${seed}: ${s.kind} beach gentler than 1:11 at ${off} of ${checked}`);
    let top = 0;
    for (let i = 0; i < 3000; i++) top = Math.max(top, pl.height(onIsland(s, i * 2.39996, Math.sqrt(i / 3000) * s.radius)));
    // within its kind's range, unless the land is too narrow for so high a hill at a palm's slope: then brought lower
    // until its steepest (all but the steepest hundredth) is at that slope
    const [low, high] = KINDS[s.kind].summit;
    assert.ok(top >= s.summit - 0.15, `seed ${seed}: ${s.kind} summit ${s.summit}, sampled ${top}`);
    if (s.summit < low - 0.05) {
      const slopes: number[] = [], e = 0.5;
      for (let x = -s.radius * 1.5; x <= s.radius * 1.5; x += 1) for (let z = -s.radius * 1.5; z <= s.radius * 1.5; z += 1) {
        if (Math.hypot(x, z) >= s.coast(Math.atan2(z, x))) continue;
        slopes.push(Math.hypot(s.mound(x + e, z) - s.mound(x - e, z), s.mound(x, z + e) - s.mound(x, z - e)) / (2 * e));
      }
      slopes.sort((p, q) => p - q);
      const steep = slopes[Math.floor(slopes.length * 0.99)];
      assert.ok(steep > 0.9 * ISLANDS.steepest[s.kind], `seed ${seed}: ${s.kind} summit ${s.summit} under ${low}, its slope ${steep.toFixed(2)}`);
    }
    assert.ok(s.summit <= high * 1.15, `seed ${seed}: ${s.kind} summit ${s.summit}`);
  }
  // the largest a hill to hide behind, the islets a clear hump; the larger the higher
  for (const [seed, pl] of planets) {
    const summits = (kind: string) => pl.islands.filter((s) => s.kind === kind).map((s) => s.summit);
    assert.ok(Math.max(...summits('island')) > 15, `seed ${seed}: highest ${Math.max(...summits('island'))}`);
    assert.ok(Math.min(...summits('islet')) > 2, `seed ${seed}: islets ${summits('islet')}`);
    const big = pl.islands.filter((s) => s.radius > 35), small = pl.islands.filter((s) => s.kind === 'island' && s.radius < 22);
    const mean = (l: typeof big) => l.reduce((a, s) => a + s.summit, 0) / l.length;
    assert.ok(mean(big) > mean(small) + 4, `seed ${seed}: large ${mean(big)}, small ${mean(small)}`);
  }
});

test('the hills: no cliffs, slopes a palm stands on', () => {
  for (const [seed, pl] of planets) for (const s of pl.islands) {
    const slopes: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const t = i * 2.39996, r = Math.sqrt(i / 4000) * s.radius * 1.6, x = Math.cos(t) * r, z = Math.sin(t) * r;
      if (s.shore(x, z) > -0.5) continue;
      const e = 0.4, at = (a: number, b: number) => pl.height(fromChart(s.chart, a, b));
      slopes.push(Math.hypot(at(x + e, z) - at(x - e, z), at(x, z + e) - at(x, z - e)) / (2 * e));
    }
    slopes.sort((a, b) => a - b);
    const p99 = slopes[Math.floor(slopes.length * 0.99)], worst = slopes.at(-1)!;
    assert.ok(p99 < ISLANDS.steepest[s.kind] + 0.08 && worst < 1.1, `seed ${seed}: ${s.kind} ${s.radius.toFixed(0)} m slopes p99 ${p99.toFixed(2)}, worst ${worst.toFixed(2)}`);
  }
});

test('no hidden shallows: water too shallow to sail lies only within WADE of a waterline, or in a lagoon', () => {
  const points = lattice(120000);
  for (const [seed, pl] of planets) {
    let shallow = 0;
    for (const p of points) {
      const h = pl.height(p);
      if (h > 0 || h <= -SHIP.draught) continue;
      shallow++;
      const near = Math.min(...pl.islands.map((s) => {
        const [x, z] = toChart(s.chart, p);
        if (Math.hypot(x, z) > s.reach) return Infinity;
        // (a lagoon is inside its island's coast, shut in by land)
        return Math.hypot(x, z) < s.coast(Math.atan2(z, x)) ? 0 : s.shore(x, z);
      }));
      assert.ok(near < WADE, `seed ${seed}: ${(-h).toFixed(2)} m deep, ${near.toFixed(1)} m from any waterline`);
    }
    assert.ok(shallow > 0);
  }
});

test('each island\'s apron: clear water a ship can sail well, to 8.5 m deep, from the beach\'s shallows out', () => {
  for (const [seed, pl] of planets) for (const s of pl.islands) {
    let sailable = 0, n = 0;
    for (let i = 0; i < 1500; i++) {
      const t = i * 2.39996, r = Math.sqrt(i / 1500) * s.shelf, x = Math.cos(t) * r, z = Math.sin(t) * r, d = s.shore(x, z);
      if (d <= WADE + 4 || d > s.apron) continue;
      const h = pl.height(fromChart(s.chart, x, z));
      n++;
      if (h < -SHIP.draught - 0.5 && h > -8.5) sailable++;
    }
    assert.ok((n > 0 || s.kind === 'rocks') && sailable >= n * 0.8, `seed ${seed}: ${s.kind} apron sailable at ${sailable} of ${n}`);
  }
});

test('cover: 0…1, no sea grass on land or in the deeps', () => {
  for (const p of lattice(20000)) {
    const h = planet.height(p), c = planet.cover(p);
    for (const v of [c.grass, c.rubble, c.mottle, c.clump]) assert.ok(v >= 0 && v <= 1);
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
    assert.ok(Math.abs(cover[face][k * 4] - c.grass * 255) <= 1 && Math.abs(cover[face][k * 4 + 1] - c.rubble * 255) <= 1 && Math.abs(cover[face][k * 4 + 2] - c.mottle * 255) <= 1 && Math.abs(cover[face][k * 4 + 3] - c.clump * 255) <= 1);
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
