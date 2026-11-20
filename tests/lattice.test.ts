import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FREQUENCY,
  anchors,
  band,
  blend,
  cover,
  geodesic,
  icosphere,
  near,
  neighbours,
  overlap,
  spacing,
  stretch,
  weigh,
  type Anchor,
} from '../src/world/lattice.ts';
import {
  R,
  along,
  cross,
  distance,
  dot,
  length,
  normalize,
  type Vec3,
} from '../src/world/sphere.ts';
import { createWind } from '../src/world/wind.ts';
import { likeness } from '../src/world/spectrum.ts';
import { BANDS, CASCADES, SIZE } from '../src/world/cascades.ts';

/** A deterministic spread of points over the sphere (Fibonacci). */
const points = (n: number): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n,
      r = Math.sqrt(1 - y * y),
      a = i * Math.PI * (3 - Math.sqrt(5));
    return [r * Math.cos(a), y, r * Math.sin(a)] as Vec3;
  });

const FETCH = 300_000;
const quick = [5, 10, 15, 20].flatMap((wind) =>
  CASCADES.map((L, c) => likeness(SIZE, L, { wind, fetch: FETCH }, BANDS[c]))
);
const wind = createWind(3);
const all: Anchor[] = anchors(icosphere(FREQUENCY), wind, CASCADES[0], (x, z) =>
  Math.max(...quick.map((f) => Math.abs(f(x, z))))
);
const width = band(FREQUENCY);
const sorted = (p: Vec3) =>
  all.map((a) => distance(a.at, p)).sort((a, b) => a - b);

test('an icosphere of frequency F has 10F² + 2 points, about the spacing apart', () => {
  for (const F of [1, 2, 3, 4]) {
    const { points: ps, triangles } = geodesic(F);
    assert.equal(ps.length, 10 * F * F + 2);
    assert.equal(triangles.length, 20 * F * F);
    for (const [a, b] of triangles) {
      const d = distance(ps[a], ps[b]);
      assert.ok(
        d > 0.8 * spacing(F) && d < 1.2 * spacing(F),
        `edge ${d} vs ${spacing(F)}`
      );
    }
  }
});

test('every point of the sphere lies within the cover of an anchor, and no chart stretches 1% within its cell', () => {
  let most = 0;
  for (const p of points(20000)) most = Math.max(most, sorted(p)[0]);
  assert.ok(most <= cover(FREQUENCY) + 1e-6, `${most} > ${cover(FREQUENCY)}`);
  assert.ok(
    most > cover(FREQUENCY) * 0.95,
    `the cover is tight: ${most} vs ${cover(FREQUENCY)}`
  );
  assert.ok(stretch(cover(FREQUENCY)) < 1.01, `${stretch(cover(FREQUENCY))}`);
});

test('at most three anchors weigh in anywhere: the fourth is always further than the band', () => {
  let gap = Infinity;
  for (const p of points(40000)) {
    const d = sorted(p);
    gap = Math.min(gap, d[3] - d[0]);
  }
  assert.ok(
    gap > width * 1.2,
    `the fourth anchor comes within ${gap} m, the band is ${width} m`
  );
});

test('weights: Σw² = 1, one anchor alone away from the borders, at most three anywhere', () => {
  let alone = 0;
  for (const p of points(5000)) {
    const { index, weight } = weigh(all, p, width);
    assert.ok(index.length >= 1 && index.length <= 3);
    assert.ok(Math.abs(weight.reduce((s, w) => s + w * w, 0) - 1) < 1e-12);
    const d = sorted(p);
    if (d[1] - d[0] >= width) {
      alone++;
      assert.deepEqual(weight, [1]);
      assert.equal(distance(all[index[0]].at, p), d[0]);
    }
  }
  assert.ok(alone > 2500, `${alone} of 5000 alone`);
  for (const a of all) assert.equal(weigh(all, a.at, width).index.length, 1);
  assert.deepEqual(
    blend([10, 10 + width / 2, 10 + 2 * width], width).map((w) =>
      Number(w.toFixed(6))
    ),
    [0.894427, 0.447214, 0]
  );
});

test('weights change smoothly along great circles, across every border they cross', () => {
  const step = 0.25;
  let crossings = 0;
  for (const start of points(6)) {
    const t0 = normalize(cross(start, [0.3, 0.5, 0.8]));
    let p = start,
      t = t0;
    let last = new Map<number, number>();
    for (let s = 0; s < (2 * Math.PI * R) / step; s++) {
      const { index, weight } = weigh(all, p, width);
      const now = new Map(index.map((i, k) => [i, weight[k]]));
      if (s > 0) {
        for (const i of new Set([...now.keys(), ...last.keys()])) {
          const dw = Math.abs((now.get(i) ?? 0) - (last.get(i) ?? 0));
          assert.ok(
            dw < 0.03,
            `weight of anchor ${i} jumps by ${dw} over ${step} m`
          );
        }
        if (index[0] !== [...last.keys()][0]) crossings++;
      }
      last = now;
      ({ p, t } = along(p, t, step));
    }
  }
  assert.ok(crossings > 50, `${crossings} borders crossed`);
});

test("anchors: axes are unit tangents along the prevailing wind; neighbours' offsets differ", () => {
  for (const a of all) {
    assert.ok(
      Math.abs(length(a.axis) - 1) < 1e-12 &&
        Math.abs(dot(a.axis, a.at)) < 1e-12
    );
    assert.ok(dot(a.axis, wind(a.at)) > 0.999999);
  }
  const next = neighbours(all.map((a) => a.at));
  next.forEach((ns, i) => {
    assert.ok(ns.length === 5 || ns.length === 6, `${ns.length} neighbours`);
    for (const j of ns) {
      const dx = Math.abs(all[i].offset[0] - all[j].offset[0]),
        dz = Math.abs(all[i].offset[1] - all[j].offset[1]);
      const torus = Math.hypot(
        Math.min(dx, CASCADES[0] - dx),
        Math.min(dz, CASCADES[0] - dz)
      );
      assert.ok(
        torus > 10,
        `anchors ${i} and ${j} read the patches ${torus} m apart`
      );
    }
  });
});

test('neighbouring charts read nearly independent seas along their borders, at any wind', () => {
  const next = neighbours(all.map((a) => a.at));
  for (const wind of [5, 7.6, 12, 20]) {
    CASCADES.forEach((L, c) => {
      // more of the spectrum than the anchors were chosen with
      const alike = likeness(SIZE, L, { wind, fetch: FETCH }, BANDS[c], 1500);
      let worst = 0;
      next.forEach((ns, i) =>
        ns.forEach((j) => {
          if (j > i) worst = Math.max(worst, overlap(all[i], all[j], alike));
        })
      );
      assert.ok(
        worst < 0.25,
        `wind ${wind}, ${L} m patch: neighbours correlate by ${worst}`
      );
    });
  }
});

test('the anchors and weights at a point depend on the point alone, not on where the eye is', () => {
  // the shaders' choice (charts.ts): from the eye's list, the three with the largest dot product, then blend
  const margin = cover(FREQUENCY) + width;
  const gpu = (eye: Vec3, reach: number, p: Vec3) => {
    const list = near(all, eye, Math.PI * R).slice(
      0,
      Math.max(3, near(all, eye, reach + margin).length)
    );
    const best = list
      .map((i) => ({ i, c: dot(all[i].at, normalize(p)) }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 3);
    const w = blend(
      best.map((b) => R * Math.acos(Math.min(1, b.c))),
      width
    );
    return best.map((b, k) => ({ i: b.i, w: w[k] })).filter((x) => x.w > 0);
  };
  for (const p of points(300)) {
    const { index, weight } = weigh(all, p, width);
    const truth = index.map((i, k) => ({ i, w: weight[k] }));
    // eyes all round p, near and far, low and high, with the sea drawn out to p and beyond
    for (const [k, eye] of points(12).entries()) {
      const e = along(p, normalize(cross(p, eye)), (k / 12) * 300).p;
      const reach = distance(e, p) + 20 * k;
      const seen = gpu(e, reach, p);
      assert.deepEqual(
        seen.map((x) => x.i),
        truth.map((x) => x.i)
      );
      seen.forEach((x, n) => assert.ok(Math.abs(x.w - truth[n].w) < 1e-6));
    }
  }
});
