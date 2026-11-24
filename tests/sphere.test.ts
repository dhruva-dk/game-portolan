import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FACES,
  R,
  add,
  along,
  apart,
  chartBasis,
  cross,
  distance,
  dot,
  faceDir,
  faceUV,
  frameAt,
  fromChart,
  fromLatLon,
  horizonDip,
  length,
  normalize,
  scale,
  skyElevation,
  toChart,
  toSky,
  transport,
  type Axis,
  type Chart,
  type Vec3,
} from '../src/world/sphere.ts';
import {
  CELLS,
  N,
  centreOf,
  columnOf,
  faceOf,
  rowOf,
} from '../src/world/cells.ts';

const near = (a: number, b: number, eps: number, what = '') =>
  assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b}`);
const nearV = (a: Vec3, b: Vec3, eps: number, what = '') =>
  near(length(add(a, b, -1)), 0, eps, what);

const points = (n: number): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n,
      r = Math.sqrt(1 - y * y),
      a = i * Math.PI * (3 - Math.sqrt(5));
    return [r * Math.cos(a), y, r * Math.sin(a)] as Vec3;
  });

const island: Chart = (() => {
  const at = fromLatLon(0.21, 0.4);
  return { at, axis: frameAt(at).east };
})();

test('frames are right-handed and orthonormal, with east × up = south', () => {
  for (const p of points(50)) {
    const f = frameAt(p);
    near(length(f.east), 1, 1e-12);
    near(dot(f.east, f.up), 0, 1e-12);
    nearV(cross(f.east, f.north), f.up, 1e-12);
  }
});

test('chart round trips, and distances from the anchor are kept', () => {
  for (const p of points(200)) {
    const [x, z] = toChart(island, p);
    if (Math.hypot(x, z) > R * 3) continue;
    nearV(fromChart(island, x, z), normalize(p), 1e-9, 'round trip');
    near(Math.hypot(x, z), distance(island.at, p), 1e-7, 'distance');
  }
  for (const [x, z] of [
    [0, 0],
    [10, -3],
    [-250, 400],
    [1000, 200],
  ]) {
    const back = toChart(island, fromChart(island, x, z));
    near(back[0], x, 1e-7);
    near(back[1], z, 1e-7);
  }
});

test('near the anchor the chart is the tangent plane: x along the axis, z along axis × at', () => {
  const f = frameAt(island.at);
  const east = fromChart(island, 1, 0),
    south = fromChart(island, 0, 1);
  nearV(scale(add(east, island.at, -1), R), f.east, 1e-3);
  nearV(scale(add(south, island.at, -1), R), scale(f.north, -1), 1e-3);
});

test("the chart basis is the chart's own axes, carried to the point", () => {
  for (const p of points(100)) {
    if (distance(island.at, p) > R * 2.5) continue;
    const [e1, e2] = chartBasis(island, p);
    const up = normalize(p);
    near(length(e1), 1, 1e-9);
    near(length(e2), 1, 1e-9);
    near(dot(e1, up), 0, 1e-9);
    near(dot(e1, e2), 0, 1e-9);
    nearV(cross(e1, up), e2, 1e-9, 'e1 × up = e2');
    const [x0, z0] = toChart(island, p);
    const [x1, z1] = toChart(island, add(scale(up, R), e1, 0.01));
    const theta = Math.hypot(x0, z0) / R,
      stretch = theta > 1e-6 ? theta / Math.sin(theta) : 1;
    const dx = (x1 - x0) / 0.01,
      dz = (z1 - z0) / 0.01;
    assert.ok(dx > 0.99 && dx < stretch * 1.01, `dx ${dx}`);
    assert.ok(Math.abs(dz) < stretch, `dz ${dz}`);
  }
  const [e1, e2] = chartBasis(island, island.at);
  nearV(e1, island.axis, 1e-12);
  nearV(e2, cross(island.axis, island.at), 1e-12);
});

test('transport keeps tangents tangent and their length', () => {
  const ps = points(40);
  for (let i = 0; i + 1 < ps.length; i++) {
    const a = ps[i],
      b = ps[(i * 7 + 3) % ps.length];
    if (dot(a, b) < -0.999) continue;
    const t = scale(frameAt(a).east, 2.5);
    const u = transport(t, a, b);
    near(length(u), 2.5, 1e-9, 'length');
    near(dot(u, normalize(b)), 0, 1e-9, 'tangent');
  }
  const a = fromLatLon(0.1, 0.3),
    b = fromLatLon(0.7, 0.3);
  nearV(transport(frameAt(a).east, a, b), frameAt(b).east, 1e-12);
});

test('along a great circle a full lap returns to the start', () => {
  for (const p of points(12)) {
    const start = normalize(p);
    let s = { p: start, t: frameAt(p).north };
    const steps = 997;
    for (let i = 0; i < steps; i++)
      s = along(s.p, s.t, (2 * Math.PI * R) / steps);
    nearV(s.p, start, 1e-9, 'point');
    nearV(s.t, frameAt(p).north, 1e-9, 'tangent');
  }
  const p = fromLatLon(0, 0),
    step = along(p, frameAt(p).east, 100);
  near(distance(p, step.p), 100, 1e-9);
});

test('faceUV and faceDir round trip on all six faces, and meet without a gap across an edge', () => {
  for (let face = 0; face < 6; face++)
    for (const u of [-0.99, -0.5, 0, 0.3, 0.97])
      for (const v of [-0.9, 0, 0.6]) {
        const d = faceDir(face, u, v);
        const back = faceUV(d);
        assert.equal(back.face, face);
        near(back.u, u, 1e-12);
        near(back.v, v, 1e-12);
      }
  for (const p of points(300)) {
    const { face, u, v } = faceUV(p);
    nearV(faceDir(face, u, v), normalize(p), 1e-12);
  }
  for (let face = 0; face < 6; face++)
    for (const [u, v] of [
      [1, 0.2],
      [-1, -0.4],
      [0.3, 1],
      [-0.6, -1],
    ]) {
      const edge = faceDir(face, u, v);
      const inside = faceDir(face, u * (1 - 1e-6), v * (1 - 1e-6));
      near(distance(edge, inside), 0, 1e-3);
      const next = faceUV(add(edge, edge, 1e-9));
      nearV(faceDir(next.face, next.u, next.v), edge, 1e-6, 'continuous');
    }
});

test('the horizon dips by acos(R / (R + h))', () => {
  for (const h of [0, 0.5, 2, 10, 35, 400, 5000])
    near(horizonDip(h), Math.acos(R / (R + h)), 1e-7, `h = ${h}`);
  near((horizonDip(10) * 180) / Math.PI, 10.8, 0.05);
});

test("the sky puts its horizon on the sea's and keeps the zenith", () => {
  const dip = horizonDip(10);
  near(skyElevation(-dip, dip), 0, 1e-12);
  near(skyElevation(Math.PI / 2, dip), Math.PI / 2, 1e-12);
  const f = frameAt(fromLatLon(0.3, 1));
  const ray = add(scale(f.north, Math.cos(dip)), f.up, -Math.sin(dip));
  nearV(toSky(f, dip, ray), [0, 0, -1], 1e-12);
  nearV(toSky(f, dip, f.up), [0, 1, 0], 1e-6);
  nearV(toSky(f, 0, f.east), [1, 0, 0], 1e-12);
});

test("the cube's faces are FACES's (the table the shaders' view/cube.ts is built from): faceUV's, faceDir's and the cells'", () => {
  const signed = (q: Vec3, [axis, sign]: Axis) => sign * q[axis];
  const table = (p: Vec3) => {
    const a = p.map(Math.abs),
      axis = a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2;
    const face = FACES.findIndex(
      (f) => f.across[0] === axis && f.across[1] === (p[axis] >= 0 ? 1 : -1)
    );
    const g = (k: Axis) =>
      (Math.atan(signed(p, k) / signed(p, FACES[face].across)) * 4) / Math.PI;
    return { face, u: g(FACES[face].u), v: g(FACES[face].v) };
  };
  const ties: Vec3[] = [
    [1, 1, 0],
    [-1, 1, 1],
    [0, -1, 1],
    [1, 0, -1],
    [0, 0, -1],
    [-1, -1, -1],
  ];
  for (const p of [...points(2000), ...ties]) {
    const t = table(p),
      f = faceUV(p);
    assert.equal(f.face, t.face, `${p}`);
    near(f.u, t.u, 1e-15, 'u');
    near(f.v, t.v, 1e-15, 'v');
    const d = faceDir(t.face, t.u, t.v);
    assert.ok(signed(d, FACES[t.face].across) > 0);
    nearV(d, normalize(p), 1e-12, 'faceDir');
  }
  for (let c = 0; c < CELLS; c += 997) {
    const t = table(centreOf(c));
    assert.equal(t.face, faceOf(c));
    near(((t.u + 1) / 2) * N - 0.5, columnOf(c), 1e-9, 'column');
    near(((t.v + 1) / 2) * N - 0.5, rowOf(c), 1e-9, 'row');
  }
});

test('apart never says so of points within the distance, and says so of nearly all those well beyond it', () => {
  let missed = 0,
    beyond = 0;
  for (let i = 0; i < 4000; i++) {
    const a = scale(
      fromLatLon(Math.asin(2 * ((i * 0.618) % 1) - 1), i * 2.4),
      1 + (i % 3)
    );
    const b = fromLatLon(Math.asin(2 * ((i * 0.377) % 1) - 1), i * 1.7);
    for (const metres of [5, 90, 370, 700]) {
      const d = distance(a, b);
      if (d <= metres)
        assert.ok(!apart(a, b, metres), `${d} m within ${metres}`);
      else if (d > metres * 1.01 + 1) {
        beyond++;
        if (!apart(a, b, metres)) missed++;
      }
    }
  }
  assert.ok(missed < 0.02 * beyond, `${missed} of ${beyond}`);
});
