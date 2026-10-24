// src/sim/sphere.ts: the cube-sphere mapping round-trips, every grid cell knows its four neighbours across face
// edges, cell areas match an independent spherical-excess computation and sum to 4πR², and the great-circle
// helpers keep ships on the sphere over a whole match.
//   node --test tests/sim/sphere.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dot, length, rngFrom, rngRange, rngInt, v3, type V3 } from '../../src/sim/math.ts';
import {
  AREA_Q, GRID, R, TERRITORY, advance, angleBetween, bearingOf, cellArea, cellDir, cellOf, cubeGrid, faceDir, faceUV,
  fromLatLon, gnomonicDir, horizonDistance, localFrame, neighbor, surfaceDistance, tangentAt, tangentToward, type CubeGrid,
} from '../../src/sim/sphere.ts';

const rng = rngFrom(2026);
function randomDir(): V3 {
  for (;;) {
    const p = v3(rngRange(rng, -1, 1), rngRange(rng, -1, 1), rngRange(rng, -1, 1)), l = length(p);
    if (l > 0.1 && l <= 1) return v3(p.x / l, p.y / l, p.z / l);
  }
}
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('faceUV and faceDir are inverse', () => {
  const uv = { face: 0, u: 0, v: 0 }, q = v3();
  for (let i = 0; i < 100_000; i++) {
    const p = randomDir();
    faceUV(p, uv);
    assert.ok(Math.abs(uv.u) <= 1 && Math.abs(uv.v) <= 1);
    assert.ok(dist(faceDir(uv.face, uv.u, uv.v, q), p) < 1e-15);
  }
  // The faces are where the table in sphere.ts says.
  const axes: [V3, number][] = [[v3(1, 0, 0), 0], [v3(-1, 0, 0), 1], [v3(0, 1, 0), 2], [v3(0, -1, 0), 3], [v3(0, 0, 1), 4], [v3(0, 0, -1), 5]];
  for (const [p, face] of axes) assert.equal(faceUV(p, uv).face, face);
  assert.deepEqual(gnomonicDir(0, 0, 0, q), { x: 1, y: 0, z: -0 });
});

function checkGrid(grid: CubeGrid) {
  const { n, cells } = grid, centre = new Float64Array(3 * cells), p = v3();
  for (let c = 0; c < cells; c++) {
    cellDir(grid, c, p);
    assert.equal(cellOf(grid, p), c, `cell ${c} contains its centre`);
    centre[3 * c] = p.x; centre[3 * c + 1] = p.y; centre[3 * c + 2] = p.z;
  }
  // The largest cell is at a face centre: its side is 2R·tan(π/4/n)·… ≈ (π/2)R/n; a neighbour's centre is one
  // side away, never more than 1.5 sides across a face edge.
  const side = ((Math.PI / 2) * R) / n;
  for (let c = 0; c < cells; c++) {
    const seen = new Set<number>();
    for (let k = 0; k < 4; k++) {
      const nb = neighbor(grid, c, k);
      assert.ok(nb >= 0 && nb < cells && nb !== c);
      seen.add(nb);
      let back = false;
      for (let j = 0; j < 4; j++) back ||= neighbor(grid, nb, j) === c;
      assert.ok(back, `cell ${c} is a neighbour of its neighbour ${nb}`);
      const d = R * Math.hypot(centre[3 * c] - centre[3 * nb], centre[3 * c + 1] - centre[3 * nb + 1], centre[3 * c + 2] - centre[3 * nb + 2]);
      assert.ok(d < 1.5 * side && d > 0.5 * side, `neighbour ${nb} of ${c} is ${d} u away`);
    }
    assert.equal(seen.size, 4, `cell ${c} has four distinct neighbours`);
  }
}

test('every cell of a small grid and of the territory grid has the right centre and four mutual neighbours', () => {
  checkGrid(cubeGrid(16));
  checkGrid(TERRITORY);
  assert.equal(TERRITORY.n, GRID);
  assert.throws(() => cubeGrid(48), RangeError);
});

/** Area of the spherical triangle abc on the unit sphere (Van Oosterom–Strackee), in Math.* arithmetic. */
const triangle = (a: V3, b: V3, c: V3) => {
  const det = a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
  return 2 * Math.atan2(Math.abs(det), 1 + dot(a, b) + dot(b, c) + dot(c, a));
};

test('cell areas are exact spherical areas and sum to 4πR²', (t) => {
  // Cell edges are great-circle arcs (gnomonic lines), so a cell is exactly two spherical triangles.
  const corner = (f: number, i: number, j: number) => faceDir(f, (i / GRID) * 2 - 1, (j / GRID) * 2 - 1, v3());
  let worst = 0;
  for (let s = 0; s < 20_000; s++) {
    const c = rngInt(rng, TERRITORY.cells), f = Math.floor(c / GRID ** 2), i = c % GRID, j = Math.floor(c / GRID) % GRID;
    const a = corner(f, i, j), b = corner(f, i + 1, j), cc = corner(f, i + 1, j + 1), d = corner(f, i, j + 1);
    const exact = (triangle(a, b, cc) + triangle(a, cc, d)) * R * R * AREA_Q;
    worst = Math.max(worst, Math.abs(cellArea(TERRITORY, c) - exact));
  }
  t.diagnostic(`worst cell area error ${worst.toFixed(3)} quanta (${(worst / AREA_Q).toExponential(2)} u²)`);
  assert.ok(worst < 1, 'within rounding to whole quanta (plus the reference’s own rounding)');

  const sphere = 4 * Math.PI * R * R * AREA_Q;
  t.diagnostic(`total ${TERRITORY.totalArea} quanta, 4πR² = ${sphere.toFixed(0)}, difference ${(TERRITORY.totalArea - sphere).toFixed(0)}`);
  assert.ok(Math.abs(TERRITORY.totalArea - sphere) <= TERRITORY.cells / 2, 'within half a quantum per cell');
  let min = Infinity, max = 0, sum = 0;
  for (let c = 0; c < TERRITORY.cells; c++) {
    const a = cellArea(TERRITORY, c);
    assert.ok(Number.isInteger(a));
    min = Math.min(min, a);
    max = Math.max(max, a);
    sum += a;
  }
  assert.equal(sum, TERRITORY.totalArea);
  t.diagnostic(`cell areas ${(min / AREA_Q).toFixed(4)}–${(max / AREA_Q).toFixed(4)} u², ratio ${(max / min).toFixed(3)}`);
  assert.ok(max / min < 1.42);
});

test('latitude, longitude and the local frame', () => {
  const close = (a: V3, b: V3) => assert.ok(dist(a, b) < 1e-15, `${JSON.stringify(a)} ≈ ${JSON.stringify(b)}`);
  close(fromLatLon(0, 0, v3()), v3(1, 0, 0));
  close(fromLatLon(Math.PI / 2, 1, v3()), v3(0, 1, 0));
  const east = v3(), north = v3(), up = v3(), q = v3();
  for (let i = 0; i < 1000; i++) {
    const lat = rngRange(rng, -1.5, 1.5), lon = rngRange(rng, -3, 3), p = fromLatLon(lat, lon, v3());
    localFrame(p, east, north);
    // Orthonormal and right-handed: east × north = up.
    assert.ok(Math.abs(length(east) - 1) < 1e-15 && Math.abs(length(north) - 1) < 1e-15);
    assert.ok(Math.abs(dot(east, north)) < 1e-15 && Math.abs(dot(east, p)) < 1e-15 && Math.abs(dot(north, p)) < 1e-15);
    up.x = east.y * north.z - east.z * north.y; up.y = east.z * north.x - east.x * north.z; up.z = east.x * north.y - east.y * north.x;
    close(up, p);
    // East is the way longitude grows; north the way latitude grows.
    const e = fromLatLon(lat, lon + 1e-7, v3()), nn = fromLatLon(lat + 1e-7, lon, v3());
    assert.ok(dot(east, v3(e.x - p.x, e.y - p.y, e.z - p.z)) > 0 && dot(north, v3(nn.x - p.x, nn.y - p.y, nn.z - p.z)) > 0);
    // Bearings round-trip.
    const b = rngRange(rng, -Math.PI, Math.PI);
    assert.ok(Math.abs(bearingOf(p, tangentAt(p, b, q)) - b) < 1e-14);
  }
  // At the poles the frame is the limit of the one along longitude 0.
  for (const pole of [v3(0, 1, 0), v3(0, -1, 0)]) {
    localFrame(pole, east, north);
    const near = fromLatLon(Math.sign(pole.y) * (Math.PI / 2 - 1e-9), 0, v3()), e2 = v3(), n2 = v3();
    localFrame(near, e2, n2);
    assert.ok(dist(east, e2) < 1e-8 && dist(north, n2) < 1e-8);
  }
});

test('advance keeps a ship on the sphere and on its great circle for a whole match', () => {
  const p = randomDir(), t = tangentAt(p, 1.1, v3()), start = v3(p.x, p.y, p.z);
  // 18 000 ticks at 0.12 u (3.5 u/s) is 2160 u: once round the planet (1256.6 u) and on.
  const step = 0.12, ticks = 18_000;
  for (let i = 0; i < ticks; i++) advance(p, t, step, p, t);
  assert.ok(Math.abs(length(p) - 1) < 1e-15 && Math.abs(length(t) - 1) < 1e-15 && Math.abs(dot(p, t)) < 1e-15);
  const along = (step * ticks) % (2 * Math.PI * R), apart = Math.min(along, 2 * Math.PI * R - along);
  assert.ok(Math.abs(surfaceDistance(start, p) - apart) < 1e-9, `error ${surfaceDistance(start, p) - apart}`);

  // Sailing toward a point for the distance to it arrives there.
  for (let i = 0; i < 1000; i++) {
    const a = randomDir(), b = randomDir(), dir = tangentToward(a, b, v3()), at = v3();
    advance(a, dir, surfaceDistance(a, b), at, v3());
    assert.ok(dist(at, b) < 1e-14);
  }
});

test('angles and the horizon', () => {
  for (let i = 0; i < 10_000; i++) {
    const a = randomDir(), b = randomDir();
    assert.ok(Math.abs(angleBetween(a, b) - Math.acos(Math.min(1, dot(a, b)))) < 1e-7); // acos is the inaccurate one near 0 and π
  }
  const p = v3(1, 0, 0), t = v3(0, 0, -1), q = v3(), tq = v3();
  advance(p, t, 1e-6, q, tq);
  assert.ok(Math.abs(surfaceDistance(p, q) - 1e-6) < 1e-20, 'tiny angles stay exact');
  advance(p, t, Math.PI * R - 1e-6, q, tq);
  assert.ok(Math.abs(surfaceDistance(p, q) - (Math.PI * R - 1e-6)) < 1e-11, 'near-antipodal angles too');

  for (const h of [0.01, 1, 3, 10, 100, 1000]) {
    const exact = R * Math.acos(R / (R + h));
    assert.ok(Math.abs(horizonDistance(h) - exact) < 1e-12 * R + 1e-6 * exact);
    // √(2Rh) is the same to first order in h/R.
    assert.ok(Math.abs(horizonDistance(h) / Math.sqrt(2 * R * h) - 1) < h / R);
  }
  assert.equal(horizonDistance(0), 0);
});
