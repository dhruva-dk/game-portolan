import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CELLS,
  N,
  PLANET_QUANTA,
  adjacent,
  cellOf,
  centerOf,
  neighbor,
  wrapped,
} from '../src/world/cells.ts';
import {
  R,
  add,
  cross,
  distance,
  dot,
  faceDir,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';
import {
  TERRITORY,
  createTerritory,
  type Move,
  type Territory,
} from '../src/sim/territory.ts';
import { random } from '../src/world/random.ts';
import type { Cap } from '../src/sim/storm.ts';

const WHOLE: Cap = { center: [0, 1, 0], radius: Math.PI };
const PLANET = 4 * Math.PI * R * R;
const RHO = TERRITORY.home / R;
const STRIDE = 12 / 30;

const DIAGONAL = (() => {
  let worst = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = (k: number) => (k / N) * 2 - 1;
      worst = Math.max(
        worst,
        distance(faceDir(0, u(i), u(j)), faceDir(0, u(i + 1), u(j + 1))),
        distance(faceDir(0, u(i + 1), u(j)), faceDir(0, u(i), u(j + 1)))
      );
    }
  }
  return worst;
})();

function basis(u: Vec3): [Vec3, Vec3] {
  const e1 = normalize(cross(Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1], u));
  return [e1, cross(u, e1)];
}

function onCircle(pole: Vec3, theta: number, phi: number): Vec3 {
  const [e1, e2] = basis(pole);
  return normalize(
    add(
      scale(pole, Math.cos(theta)),
      add(scale(e1, Math.cos(phi)), e2, Math.sin(phi)),
      Math.sin(theta)
    )
  );
}

function patchOutsideCap(theta: number): number {
  const steps = 20000;
  let sum = 0;
  for (let n = 0; n < steps; n++) {
    const r = ((n + 0.5) / steps) * RHO;
    const k =
      (Math.cos(theta) * (1 - Math.cos(r))) / (Math.sin(theta) * Math.sin(r));
    sum +=
      Math.sin(r) * (2 * Math.PI - 2 * Math.acos(Math.max(-1, Math.min(1, k))));
  }
  return sum * (RHO / steps) * R * R;
}

function sail(t: Territory, path: readonly Vec3[], id = 0, cap = WHOLE) {
  const claimed: number[] = [];
  for (let k = 1; k < path.length; k++) {
    const o = t.step(
      [{ id, from: path[k - 1], to: path[k] }],
      (k * STRIDE) / 12,
      cap
    );
    for (const c of o.claimed) claimed.push(c.meters);
  }
  return { claimed };
}

function aside(p: Vec3, q: Vec3, m: number): Vec3 {
  const ahead = normalize(add(q, p, -dot(p, q))),
    left = cross(p, ahead);
  return normalize(add(p, left, m / R));
}

function circlePath(pole: Vec3, theta: number, phi0 = 0, turns = 1.05): Vec3[] {
  const steps = Math.ceil((turns * 2 * Math.PI * R * Math.sin(theta)) / STRIDE);
  return Array.from({ length: steps + 1 }, (_, k) =>
    onCircle(pole, theta, phi0 + (k / steps) * turns * 2 * Math.PI)
  );
}

function line(a: Vec3, b: Vec3): Vec3[] {
  const d = distance(a, b),
    n = Math.max(1, Math.ceil(d / STRIDE));
  const w = normalize(add(b, a, -dot(a, b))),
    th = d / R;
  return Array.from({ length: n + 1 }, (_, k) =>
    normalize(add(scale(a, Math.cos((th * k) / n)), w, Math.sin((th * k) / n)))
  );
}

test('the cells: 6·N² of them, neighbors across every face edge returning, the areas summing to the sphere', () => {
  assert.equal(CELLS, 6 * N * N);
  assert.ok(Math.abs(PLANET_QUANTA / (1 << 20) - PLANET) / PLANET < 1e-6);
  for (let c = 0; c < CELLS; c += 97) {
    for (let k = 0; k < 4; k++) {
      const n = neighbor(c, k);
      assert.ok(
        adjacent(n, c),
        `cell ${c}'s neighbor ${k} (${n}) has it as a neighbor`
      );
      assert.ok(
        distance(centerOf(c), centerOf(n)) < DIAGONAL,
        'neighbors are near'
      );
    }
    assert.equal(cellOf(centerOf(c)), c);
  }
  for (let f = 0; f < 6; f++) {
    assert.equal(wrapped(f, -1, 7), neighbor(f * N * N + 7 * N, 0));
    assert.equal(wrapped(f, 5, N), neighbor(f * N * N + (N - 1) * N + 5, 3));
  }
  console.log(`cells: ${CELLS}, largest diagonal ${DIAGONAL.toFixed(2)} m`);
});

const CIRCLES: [string, number, Vec3][] = [
  ['the north pole at 20° (one face)', 20, [0, 1, 0]],
  ['the north pole at 45° (across four face edges)', 45, [0, 1, 0]],
  ['the north pole at 70°', 70, [0, 1, 0]],
  ['the south pole at 30°', 30, [0, -1, 0]],
  [
    'a corner of the cube at 25° (three faces meeting)',
    25,
    normalize([1, 1, 1]),
  ],
  ['the middle of a face edge at 15°', 15, normalize([1, 0, 1])],
];
for (const [label, deg, pole] of CIRCLES) {
  test(`a loop round ${label} claims the spherical cap`, () => {
    const theta = (deg * Math.PI) / 180,
      path = circlePath(pole, theta);
    const t = createTerritory(1);
    t.begin([path[0]], 0);
    const { claimed } = sail(t, path);
    assert.equal(claimed.length, 1, 'the loop closed once');
    const P = 2 * Math.PI * R * Math.sin(theta),
      rim = Math.PI * TERRITORY.home * DIAGONAL,
      most = P * (TERRITORY.brush + DIAGONAL) + rim;
    const expected =
      2 * Math.PI * R * R * (1 - Math.cos(theta)) + patchOutsideCap(theta);
    const measured = t.share(0) * PLANET,
      err = measured - expected;
    console.log(
      `${label}: ${measured.toFixed(0)} m², expected ${expected.toFixed(0)} (error ${((100 * err) / expected).toFixed(3)}%),` +
        ` allowed [${(-rim).toFixed(0)}, ${most.toFixed(0)}]`
    );
    assert.ok(err >= -rim && err <= most, `error ${err.toFixed(0)} m²`);
  });
}

test('a loop wider than a hemisphere takes the smaller side, the other one', () => {
  const pole: Vec3 = [0, 0, 1],
    theta = (110 * Math.PI) / 180,
    path = circlePath(pole, theta);
  const t = createTerritory(1);
  t.begin([path[0]], 0);
  sail(t, path);
  const small = Math.PI - theta,
    expected =
      2 * Math.PI * R * R * (1 - Math.cos(small)) + patchOutsideCap(small);
  const err = t.share(0) * PLANET - expected,
    P = 2 * Math.PI * R * Math.sin(theta),
    rim = Math.PI * TERRITORY.home * DIAGONAL;
  assert.ok(
    err >= -rim && err <= P * (TERRITORY.brush + DIAGONAL) + rim,
    `error ${err.toFixed(0)} m²`
  );
  assert.ok(
    t.ownerAt(scale(pole, -1)) === 0 && t.ownerAt(pole) === -1,
    'the antipode is its own, the pole open sea'
  );
});

test('what a loop encloses is taken from others, islands and all; it floods from its strip', () => {
  const pole: Vec3 = normalize([0.3, 0.8, -0.5]),
    theta = 0.12,
    path = circlePath(pole, theta);
  const t = createTerritory(2);
  t.begin([path[0], pole], 0);
  assert.equal(t.ownerAt(pole), 1);
  sail(t, path);
  assert.equal(t.ownerAt(pole), 0, 'its water inside the loop is taken');
  assert.equal(t.holds(1), false);
  const claim = t.changes().find((c) => c.kind === 'claim');
  assert.ok(claim && claim.kind === 'claim' && claim.loop > 0);
  for (let k = 0; k < claim.loop; k++) {
    const off: number = distance(centerOf(claim.cells[k]), pole) - R * theta;
    assert.ok(
      Math.abs(off) <= TERRITORY.brush + DIAGONAL,
      `the flood starts from its strip (${off.toFixed(1)} m off its course)`
    );
  }
});

test('sailing paints a strip as wide as its beam, its own at once: no line to cut, nothing given up', () => {
  const start: Vec3 = normalize([0.2, -0.4, 0.9]),
    t = createTerritory(1);
  t.begin([start], 0);
  const before = t.share(0) * PLANET;
  const end = normalize(add(start, basis(start)[0], 120 / R)),
    path = line(start, end);
  sail(t, path);
  const painted = t.share(0) * PLANET - before,
    strip = (120 - TERRITORY.home) * 2 * TERRITORY.brush;
  assert.ok(
    painted > strip * 0.7 && painted < strip * 1.6,
    `painted ${painted.toFixed(0)} m², a strip of ${strip.toFixed(0)}`
  );
  for (const m of [50, 80, 110]) {
    const p = path[Math.round(m / STRIDE)];
    assert.equal(t.ownerAt(p), 0, `its own under its course, ${m} m out`);
    assert.equal(t.ownerAt(aside(p, end, 1)), 0, 'its own a meter to the side');
    assert.equal(t.ownerAt(aside(p, end, -1)), 0, 'and to the other');
    assert.equal(t.ownerAt(aside(p, end, 9)), -1, 'open sea 9 m off');
  }
  const paints = t.changes().filter((c) => c.kind === 'paint');
  assert.ok(paints.length > 0 && paints.every((c) => c.ship === 0));
  const seq = t.last();
  sail(t, line(end, path[Math.round(60 / STRIDE)]));
  assert.ok(
    t.changes().every((c) => c.seq <= seq || c.kind !== 'paint'),
    'nothing painted over its own water'
  );
});

test("its strip takes others' water as it passes; theirs is left smaller, not cut off", () => {
  const a: Vec3 = normalize([0.6, 0.6, 0.5]),
    t = createTerritory(2);
  const b = normalize(add(a, basis(a)[0], 70 / R));
  t.begin([a, b], 0);
  const theirs = t.share(1);
  const through = normalize(add(a, basis(a)[0], 140 / R));
  sail(t, line(a, through));
  assert.equal(t.ownerAt(b), 0, "the middle of ship 1's patch is ship 0's");
  assert.ok(t.share(1) < theirs && t.holds(1), "ship 1's is smaller");
  assert.ok(t.share(1) > theirs * 0.5);
});

test('crossing its own strip, far from where it painted it, closes a loop', () => {
  const pole: Vec3 = normalize([-0.4, 0.3, 0.85]),
    theta = 50 / R;
  const home = onCircle(pole, theta + 120 / R, 0),
    t = createTerritory(1);
  t.begin([home], 0);
  const enter = onCircle(pole, theta, 0);
  const path = [
    ...line(home, enter),
    ...circlePath(pole, theta, 0, 1.15).slice(1),
  ];
  const { claimed } = sail(t, path);
  assert.equal(claimed.length, 1, 'one loop closed, far from home');
  assert.equal(t.ownerAt(pole), 0, 'the middle of the loop is its own');
  assert.ok(claimed[0] > 0.8 * Math.PI * 50 * 50);
});

test("the storm takes the water outside its cap; a sunk ship's drains away; a ship with none paints on where it is", () => {
  const t = createTerritory(2),
    a: Vec3 = [0, 1, 0],
    b = normalize([0, 0.2, 1]);
  t.begin([a, b], 0);
  const cap: Cap = { center: a, radius: 0.5 };
  for (let k = 0; k < TERRITORY.sweep; k++) t.step([], k, cap);
  assert.ok(t.holds(0) && !t.holds(1), 'the storm took its own');
  const drain = t.changes().find((c) => c.kind === 'drain');
  assert.ok(
    drain &&
      drain.kind === 'drain' &&
      drain.ship === null &&
      drain.cells.length > 100
  );
  const path = line(b, normalize([0.1, 0.25, 1]));
  sail(t, path, 1, WHOLE);
  assert.ok(t.holds(1), 'water of its own again');
  assert.ok(!t.changes().some((c) => c.kind === 'home' && c.time > 0));
  t.sink(0, 50);
  assert.equal(t.share(0), 0);
  assert.equal(t.ownerAt(a), -1);
  const sunk = t.changes().findLast((c) => c.kind === 'drain');
  assert.ok(sunk && sunk.kind === 'drain' && sunk.ship === 0);
});

function wander(seed: number, steps: number, ships = 80) {
  const rand = random(seed),
    t = createTerritory(ships);
  const at: Vec3[] = [],
    heading: Vec3[] = [];
  for (let i = 0; i < ships; i++) {
    const z = 2 * rand() - 1,
      a = 2 * Math.PI * rand(),
      s = Math.sqrt(1 - z * z);
    at.push([s * Math.cos(a), z, s * Math.sin(a)]);
    heading.push(basis(at[i])[0]);
  }
  t.begin(at, 0);
  const turn = new Float64Array(ships);
  let worst = 0,
    total = 0,
    claims = 0;
  for (let k = 0; k < steps; k++) {
    const moves: Move[] = at.map((p, i) => {
      if (rand() < 1 / 60) turn[i] = (rand() * 2 - 1) * 0.42;
      const port = cross(p, heading[i]),
        h = normalize(
          add(
            scale(heading[i], Math.cos(turn[i] / 30)),
            port,
            Math.sin(turn[i] / 30)
          )
        );
      const to = normalize(add(p, h, STRIDE / R));
      heading[i] = normalize(add(h, to, -dot(h, to)));
      return { id: i, from: p, to };
    });
    const t0 = performance.now();
    const o = t.step(moves, k / 30, WHOLE);
    const ms = performance.now() - t0;
    worst = Math.max(worst, ms);
    total += ms;
    claims += o.claimed.length;
    moves.forEach((m, i) => (at[i] = m.to));
  }
  return { t, worst, mean: total / steps, claims };
}

test('determinism: the same moves give the same grid, to the bit', () => {
  const a = wander(7, 1800),
    b = wander(7, 1800);
  assert.equal(a.t.hash(), b.t.hash());
  assert.deepEqual(
    a.t.changes().map((c) => [c.seq, c.kind]),
    b.t.changes().map((c) => [c.seq, c.kind])
  );
  assert.ok(a.claims > 0, `claims ${a.claims}`);
  console.log(
    `80 ships, 60 s: ${a.claims} loops closed;` +
      ` a step ${a.mean.toFixed(3)} ms on average, ${a.worst.toFixed(2)} ms at worst`
  );
});

test('the worst loop to close (half the planet) takes half the planet', () => {
  const pole: Vec3 = [0, 0, 1],
    theta = Math.PI / 2 - 0.01,
    path = circlePath(pole, theta, 0, 1.02);
  const t = createTerritory(80);
  t.begin([path[0]], 0);
  for (let k = 1; k < path.length; k++)
    t.step([{ id: 0, from: path[k - 1], to: path[k] }], k, WHOLE);
  assert.ok(t.share(0) > 0.45 && t.share(0) < 0.55);
});
