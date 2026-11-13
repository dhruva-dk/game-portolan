// The territory (sim/territory.ts, sim/enclose.ts, world/cells.ts): the first game's checks (agent-initial
// tests/territory.test.ts) and the battle royale's rules.
//
// Geometry, as the first game derived it: a ship sails once round a circle at angle θ from a pole, starting and ending
// in her home patch, and closes the loop. Her water must then be the spherical cap 2πR²(1 − cos θ) plus the part of the
// home patch outside it. With P the circle's length, d the largest cell diagonal and ρ the patch's radius, the cells
// claimed are those the path touched (within d of the circle), those enclosed, and the patch's (centres in it), so
// measured − expected lies in [−πρd, P·d + πρd] (the path here is the circle itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, N, PLANET_QUANTA, adjacent, cellOf, centreOf, neighbor, wrapped } from '../src/world/cells.ts';
import { R, add, cross, distance, dot, faceDir, normalize, scale, type Vec3 } from '../src/world/sphere.ts';
import { TERRITORY, createTerritory, type Move, type Territory } from '../src/sim/territory.ts';
import { random } from '../src/world/random.ts';
import type { Cap } from '../src/sim/storm.ts';

const WHOLE: Cap = { centre: [0, 1, 0], radius: Math.PI };
const PLANET = 4 * Math.PI * R * R;
const RHO = TERRITORY.home / R;
/** Metres a step at a ship's top speed. */
const STRIDE = 12 / 30;

/** The largest cell diagonal, metres. */
const DIAGONAL = (() => {
  let worst = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = (k: number) => (k / N) * 2 - 1;
      worst = Math.max(worst, distance(faceDir(0, u(i), u(j)), faceDir(0, u(i + 1), u(j + 1))), distance(faceDir(0, u(i + 1), u(j)), faceDir(0, u(i), u(j + 1))));
    }
  }
  return worst;
})();

/** Two unit tangents at u, square to it. */
function basis(u: Vec3): [Vec3, Vec3] {
  const e1 = normalize(cross(Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1], u));
  return [e1, cross(u, e1)];
}

/** The point at angle φ round the circle θ from `pole`. */
function onCircle(pole: Vec3, theta: number, phi: number): Vec3 {
  const [e1, e2] = basis(pole);
  return normalize(add(scale(pole, Math.cos(theta)), add(scale(e1, Math.cos(phi)), e2, Math.sin(phi)), Math.sin(theta)));
}

/** The area of the home patch (radius ρ, centred on the circle) outside the cap of angle θ (the first game's integral). */
function patchOutsideCap(theta: number): number {
  const steps = 20000;
  let sum = 0;
  for (let n = 0; n < steps; n++) {
    const r = ((n + 0.5) / steps) * RHO;
    const k = (Math.cos(theta) * (1 - Math.cos(r))) / (Math.sin(theta) * Math.sin(r));
    sum += Math.sin(r) * (2 * Math.PI - 2 * Math.acos(Math.max(-1, Math.min(1, k))));
  }
  return sum * (RHO / steps) * R * R;
}

/** Sails ship 0 of `t` along `path` (unit vectors), a step from each to the next; returns every outcome. */
function sail(t: Territory, path: readonly Vec3[], id = 0, cap = WHOLE) {
  const claimed: number[] = [], cut: (number | null)[] = [];
  for (let k = 1; k < path.length; k++) {
    const o = t.step([{ id, from: path[k - 1], to: path[k] }], k * STRIDE / 12, cap);
    for (const c of o.claimed) claimed.push(c.metres);
    for (const c of o.cut) cut.push(c.by);
  }
  return { claimed, cut };
}

/** Points along the circle θ from `pole`, from φ0 round `turns` times, STRIDE metres apart. */
function circlePath(pole: Vec3, theta: number, phi0 = 0, turns = 1.05): Vec3[] {
  const steps = Math.ceil((turns * 2 * Math.PI * R * Math.sin(theta)) / STRIDE);
  return Array.from({ length: steps + 1 }, (_, k) => onCircle(pole, theta, phi0 + (k / steps) * turns * 2 * Math.PI));
}

/** Points along the great circle from a to b, STRIDE apart. */
function line(a: Vec3, b: Vec3): Vec3[] {
  const d = distance(a, b), n = Math.max(1, Math.ceil(d / STRIDE));
  const w = normalize(add(b, a, -dot(a, b))), th = d / R;
  return Array.from({ length: n + 1 }, (_, k) => normalize(add(scale(a, Math.cos((th * k) / n)), w, Math.sin((th * k) / n))));
}

test('the cells: 6·N² of them, neighbours across every face edge returning, the areas summing to the sphere', () => {
  assert.equal(CELLS, 6 * N * N);
  assert.ok(Math.abs(PLANET_QUANTA / (1 << 20) - PLANET) / PLANET < 1e-6);
  for (let c = 0; c < CELLS; c += 97) {
    for (let k = 0; k < 4; k++) {
      const n = neighbor(c, k);
      assert.ok(adjacent(n, c), `cell ${c}'s neighbour ${k} (${n}) has it as a neighbour`);
      assert.ok(distance(centreOf(c), centreOf(n)) < DIAGONAL, 'neighbours are near');
    }
    assert.equal(cellOf(centreOf(c)), c);
  }
  // past an edge, wrapped is the neighbour across it; at a corner one of the three cells there, the same from each face
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
  ['a corner of the cube at 25° (three faces meeting)', 25, normalize([1, 1, 1])],
  ['the middle of a face edge at 15°', 15, normalize([1, 0, 1])],
];
for (const [label, deg, pole] of CIRCLES) {
  test(`a loop round ${label} claims the spherical cap`, () => {
    const theta = (deg * Math.PI) / 180, path = circlePath(pole, theta);
    const t = createTerritory(1);
    t.begin([path[0]], 0);
    const { claimed, cut } = sail(t, path);
    assert.equal(claimed.length, 1, 'the loop closed once');
    assert.deepEqual(cut, []);
    const P = 2 * Math.PI * R * Math.sin(theta), rim = Math.PI * TERRITORY.home * DIAGONAL;
    const expected = 2 * Math.PI * R * R * (1 - Math.cos(theta)) + patchOutsideCap(theta);
    const measured = t.share(0) * PLANET, err = measured - expected;
    console.log(`${label}: ${measured.toFixed(0)} m², expected ${expected.toFixed(0)} (error ${((100 * err) / expected).toFixed(3)}%), allowed [${(-rim).toFixed(0)}, ${(P * DIAGONAL + rim).toFixed(0)}]`);
    assert.ok(err >= -rim && err <= P * DIAGONAL + rim, `error ${err.toFixed(0)} m²`);
  });
}

test('a loop wider than a hemisphere takes the smaller side, the other one', () => {
  const pole: Vec3 = [0, 0, 1], theta = (110 * Math.PI) / 180, path = circlePath(pole, theta);
  const t = createTerritory(1);
  t.begin([path[0]], 0);
  sail(t, path);
  // the side taken is the cap of 70° round the antipode, with the patch's part beyond it
  const small = Math.PI - theta, expected = 2 * Math.PI * R * R * (1 - Math.cos(small)) + patchOutsideCap(small);
  const err = t.share(0) * PLANET - expected, P = 2 * Math.PI * R * Math.sin(theta), rim = Math.PI * TERRITORY.home * DIAGONAL;
  assert.ok(err >= -rim && err <= P * DIAGONAL + rim, `error ${err.toFixed(0)} m²`);
  assert.ok(t.ownerAt(scale(pole, -1)) === 0 && t.ownerAt(pole) === -1, 'the antipode is hers, the pole open sea');
});

test('the closed trail is an unbroken chain of cells, and what it encloses is taken from others, islands and all', () => {
  const pole: Vec3 = normalize([0.3, 0.8, -0.5]), theta = 0.12, path = circlePath(pole, theta);
  const t = createTerritory(2);
  // ship 1's home lies inside the circle ship 0 sails round
  t.begin([path[0], pole], 0);
  assert.equal(t.ownerAt(pole), 1);
  sail(t, path);
  assert.equal(t.ownerAt(pole), 0, 'her water inside the loop is taken');
  assert.equal(t.holds(1), false);
  const claim = t.changes().find((c) => c.kind === 'claim');
  assert.ok(claim && claim.kind === 'claim');
  for (let k = 1; k < claim.loop; k++) assert.ok(adjacent(claim.cells[k - 1], claim.cells[k]) || claim.cells[k - 1] === claim.cells[k], `trail cells ${k - 1}→${k}`);
});

test('another ship crossing her open trail cuts it: no water gained, and she must go home before laying another', () => {
  const pole: Vec3 = [1, 0, 0], theta = 0.15, path = circlePath(pole, theta);
  const t = createTerritory(2);
  const far = onCircle(pole, theta + 0.3, Math.PI);
  t.begin([path[0], far], 0);
  const half = Math.floor(path.length / 2);
  sail(t, path.slice(0, half));
  assert.ok(t.trail(0).points.length > 10, 'her trail is open');
  // ship 1 sails straight across the circle's middle, through her trail
  const across = line(onCircle(pole, theta + 0.05, Math.PI * 0.3), onCircle(pole, theta + 0.05, Math.PI * 1.3));
  const cuts = sail(t, across, 1).cut;
  assert.deepEqual(cuts, [1], 'cut by ship 1');
  assert.equal(t.trail(0).points.length, 0, 'her trail is gone');
  const before = t.share(0);
  const rest = sail(t, path.slice(half - 1));
  assert.deepEqual(rest.claimed, [], 'coming home closes nothing');
  assert.equal(t.share(0), before);
  assert.ok(t.holds(0) && t.holds(1), 'nobody sinks of it');
  // out again from her water, she lays a new trail
  sail(t, line(path[0], onCircle(pole, theta + 0.1, 0.1)));
  assert.ok(t.trail(0).points.length > 0);
});

test('crossing her own open trail cuts it too; and two ships crossing each other in one step both lose theirs', () => {
  const t = createTerritory(3);
  const pole: Vec3 = [0, -1, 0], theta = 0.4;
  const start = onCircle(pole, theta, 0);
  t.begin([start, onCircle(pole, theta + 0.5, 2), onCircle(pole, theta + 0.5, 4)], 0);
  // a figure of eight: out, round a loop and back across her own path
  const a = onCircle(pole, theta, 0.4), b = onCircle(pole, theta - 0.1, 0.6), c = onCircle(pole, theta + 0.1, 0.6);
  const path = [...line(start, a), ...line(a, b).slice(1), ...line(b, c).slice(1), ...line(c, onCircle(pole, theta - 0.05, 0.3)).slice(1)];
  assert.deepEqual(sail(t, path).cut, [0], 'she cut her own');

  // two ships each a trail, then each across the other's in the same step
  const u = createTerritory(2), A = normalize([1, 0.2, 0.1]), B = normalize([1, -0.2, 0.1]);
  u.begin([A, B], 0);
  const pa = line(A, normalize([1, 0.2, -0.15])), pb = line(B, normalize([1, -0.2, -0.15]));
  for (let k = 1; k < Math.min(pa.length, pb.length); k++) u.step([{ id: 0, from: pa[k - 1], to: pa[k] }, { id: 1, from: pb[k - 1], to: pb[k] }], k, WHOLE);
  const ta = u.trail(0), tb = u.trail(1);
  const ca = ta.points[Math.floor(ta.points.length / 2)], cb = tb.points[Math.floor(tb.points.length / 2)];
  const ea = pa[pa.length - 1], eb = pb[pb.length - 1];
  const xa = line(ea, cb), xb = line(eb, ca), moves: Move[][] = [];
  for (let k = 1; k < Math.max(xa.length, xb.length); k++) {
    moves.push([{ id: 0, from: xa[Math.min(k - 1, xa.length - 1)], to: xa[Math.min(k, xa.length - 1)] }, { id: 1, from: xb[Math.min(k - 1, xb.length - 1)], to: xb[Math.min(k, xb.length - 1)] }]);
  }
  const cuts = moves.flatMap((m, k) => u.step(m, 100 + k, WHOLE).cut);
  assert.ok(cuts.some((c) => c.id === 0 && c.by === 1) && cuts.some((c) => c.id === 1 && c.by === 0), JSON.stringify(cuts));
});

test('the storm takes the water outside its cap; a sunk ship\'s drains away; a ship with none lays a new home', () => {
  const t = createTerritory(2), a: Vec3 = [0, 1, 0], b = normalize([0, 0.2, 1]);
  t.begin([a, b], 0);
  const cap: Cap = { centre: a, radius: 0.5 };
  for (let k = 0; k < TERRITORY.sweep; k++) t.step([], k, cap);
  assert.ok(t.holds(0) && !t.holds(1), 'the storm took hers');
  const drain = t.changes().find((c) => c.kind === 'drain');
  assert.ok(drain && drain.kind === 'drain' && drain.ship === null && drain.cells.length > 100);
  // not sunk: sailing on, she lays a new home patch where she is
  const path = line(b, normalize([0.1, 0.25, 1]));
  sail(t, path, 1, cap);
  assert.ok(t.holds(1), 'a new home');
  t.sink(0, 50);
  assert.equal(t.share(0), 0);
  assert.equal(t.ownerAt(a), -1);
  const sunk = t.changes().findLast((c) => c.kind === 'drain');
  assert.ok(sunk && sunk.kind === 'drain' && sunk.ship === 0);
});

/** 80 ships wandering for `steps` steps from berths spread over the planet, each turning at random. */
function wander(seed: number, steps: number, ships = 80) {
  const rand = random(seed), t = createTerritory(ships);
  const at: Vec3[] = [], heading: Vec3[] = [];
  for (let i = 0; i < ships; i++) {
    const z = 2 * rand() - 1, a = 2 * Math.PI * rand(), s = Math.sqrt(1 - z * z);
    at.push([s * Math.cos(a), z, s * Math.sin(a)]);
    heading.push(basis(at[i])[0]);
  }
  t.begin(at, 0);
  const turn = new Float64Array(ships);
  let worst = 0, total = 0, claims = 0, cuts = 0;
  for (let k = 0; k < steps; k++) {
    const moves: Move[] = at.map((p, i) => {
      if (rand() < 1 / 60) turn[i] = (rand() * 2 - 1) * 0.42;
      const port = cross(p, heading[i]), h = normalize(add(scale(heading[i], Math.cos(turn[i] / 30)), port, Math.sin(turn[i] / 30)));
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
    cuts += o.cut.length;
    moves.forEach((m, i) => (at[i] = m.to));
  }
  return { t, worst, mean: total / steps, claims, cuts };
}

test('determinism: the same moves give the same grid, to the bit; 80 ships cost little a step', () => {
  const a = wander(7, 1800), b = wander(7, 1800);
  assert.equal(a.t.hash(), b.t.hash());
  assert.deepEqual(a.t.changes().map((c) => [c.seq, c.kind]), b.t.changes().map((c) => [c.seq, c.kind]));
  assert.ok(a.claims > 0 && a.cuts > 0, `claims ${a.claims}, cuts ${a.cuts}`);
  console.log(`80 ships, 60 s: ${a.claims} loops closed, ${a.cuts} cut; a step ${a.mean.toFixed(3)} ms on average, ${a.worst.toFixed(2)} ms at worst`);
  assert.ok(a.mean < 2, `${a.mean} ms a step`);
});

test('the worst loop to close (half the planet) costs tens of milliseconds, not hundreds', () => {
  const pole: Vec3 = [0, 0, 1], theta = Math.PI / 2 - 0.01, path = circlePath(pole, theta, 0, 1.02);
  // the best of three (one alone: 30 to 55 ms; the others' tests running beside can double it)
  let best = Infinity;
  for (let run = 0; run < 3; run++) {
    const t = createTerritory(80);
    t.begin([path[0]], 0);
    let worst = 0;
    for (let k = 1; k < path.length; k++) {
      const t0 = performance.now();
      t.step([{ id: 0, from: path[k - 1], to: path[k] }], k, WHOLE);
      worst = Math.max(worst, performance.now() - t0);
    }
    assert.ok(t.share(0) > 0.45 && t.share(0) < 0.55);
    best = Math.min(best, worst);
  }
  console.log(`a hemisphere's loop: its step ${best.toFixed(1)} ms`);
  assert.ok(best < 80, `${best} ms`);
});
