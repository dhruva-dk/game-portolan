import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FREQUENCY,
  geodesic,
  icosphere,
  neighbors,
  spacing,
} from '../src/world/lattice.ts';
import {
  add,
  along,
  cross,
  distance,
  dot,
  length,
  normalize,
  scale,
  transport,
  type Vec3,
} from '../src/world/sphere.ts';
import { calms, createWind } from '../src/world/wind.ts';

const points = (n: number): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n,
      r = Math.sqrt(1 - y * y),
      a = i * Math.PI * (3 - Math.sqrt(5));
    return [r * Math.cos(a), y, r * Math.sin(a)] as Vec3;
  });

const turn = (w: (p: Vec3) => Vec3, a: Vec3, b: Vec3) => {
  const t = transport(w(a), a, b),
    v = w(b);
  return (Math.atan2(length(cross(t, v)), dot(t, v)) * 180) / Math.PI;
};

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

test('the wind is a unit tangent everywhere, and depends on the seed and the point alone', () => {
  for (const seed of SEEDS) {
    const w = createWind(seed),
      again = createWind(seed);
    for (const p of points(2000)) {
      const v = w(scale(p, 554 + 37 * p[0]));
      assert.ok(Math.abs(length(v) - 1) < 1e-12);
      assert.ok(Math.abs(dot(v, p)) < 1e-12);
      assert.ok(
        length(add(v, w(p), -1)) < 1e-12,
        'only the direction to the point counts'
      );
      assert.deepEqual(w(p), again(p));
    }
  }
  const p = normalize([0.3, 0.2, -0.7]);
  assert.notDeepEqual(createWind(1)(p), createWind(2)(p));
});

test('the calms are antipodal triangle centers within 40° of the poles, and the wind vanishes there only', () => {
  const { points: ps, triangles } = geodesic(FREQUENCY);
  const centers = triangles.map(([i, j, k]) =>
    normalize(add(add(ps[i], ps[j]), ps[k]))
  );
  for (const seed of SEEDS) {
    const [north, south] = calms(seed);
    assert.ok(north[1] > Math.cos((40 * Math.PI) / 180));
    for (const c of [north, south])
      assert.ok(centers.some((x) => distance(x, c) < 1e-6));
    for (const a of icosphere(FREQUENCY))
      assert.ok(
        Math.min(distance(a, north), distance(a, south)) >
          0.5 * spacing(FREQUENCY)
      );
    const w = createWind(seed);
    for (const c of [north, south]) {
      const t0 = normalize(cross(c, [0.1, 0.2, 0.3]));
      let total = 0;
      const ring = Array.from(
        { length: 64 },
        (_, k) =>
          along(
            c,
            add(
              scale(t0, Math.cos((k * Math.PI) / 32)),
              cross(c, t0),
              Math.sin((k * Math.PI) / 32)
            ),
            5
          ).p
      );
      ring.forEach((p, k) => (total += turn(w, p, ring[(k + 1) % 64])));
      assert.ok(
        Math.abs(total - 360) < 5,
        `seed ${seed}: the wind turns ${total}° round a calm`
      );
    }
    for (const p of points(3000)) {
      if (Math.min(distance(p, north), distance(p, south)) < 40) continue;
      const q = along(p, normalize(cross(p, [0.3, 0.5, 0.8])), 1).p;
      assert.ok(
        turn(w, p, q) < 1.5,
        `seed ${seed}: the wind turns ${turn(w, p, q)}° over a meter`
      );
    }
  }
});

test("neighboring anchors' winds differ by no more than 30°, but round the calms", () => {
  const ps = icosphere(FREQUENCY),
    next = neighbors(ps);
  for (const seed of SEEDS) {
    const w = createWind(seed),
      cs = calms(seed);
    let rough = 0;
    next.forEach((ns, i) =>
      ns.forEach((j) => {
        if (j < i) return;
        const a = turn(w, ps[i], ps[j]);
        const near = Math.min(
          ...[ps[i], ps[j]].flatMap((p) => cs.map((c) => distance(p, c)))
        );
        assert.ok(a < 135, `seed ${seed}: anchors ${i}, ${j} differ by ${a}°`);
        if (near > 0.75 * spacing(FREQUENCY))
          assert.ok(a < 60, `seed ${seed}: anchors ${i}, ${j} differ by ${a}°`);
        if (near > 1.8 * spacing(FREQUENCY))
          assert.ok(
            a < 30,
            `seed ${seed}: anchors ${i}, ${j} differ by ${a}°, ${near} m from a calm`
          );
        if (a > 30) rough++;
      })
    );
    assert.ok(
      rough < 40,
      `seed ${seed}: ${rough} of 270 neighboring pairs differ by more than 30°`
    );
  }
});
