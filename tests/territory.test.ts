// Acceptance check 1 (territory geometry) and a headless determinism self-check.
//   node --test tests/territory.test.ts
//
// A scripted ship (rudder inputs only, open ocean) sails once around a circle of latitude at angle θ from a
// pole, starting and ending in its home disc, and closes the loop. Its territory must then equal the spherical
// cap 2πR²(1 − cos θ) plus the part of the home disc that lies outside the cap (exactly integrable).
//
// Tolerance, derived rather than tuned. Let P = 2πR·sin θ be the circle's length, δ the largest distance of the
// ship's centre from the circle during the run (measured), d the largest cell diagonal on the grid (computed),
// ρ the home-disc radius. The claimed cells are: cells the path touched (the trail), cells enclosed by it, and
// the home disc (cells whose centres lie in it). Hence
//   • extra area outside the cap lies in trail cells (within δ + d of the circle) or enclosed cells (within δ),
//     plus disc cells straddling the disc rim: at most P·(δ + d) + πρ·d;
//   • missing area inside the cap lies between the circle and the path (width ≤ δ), plus disc-rim cells:
//     at most P·δ + πρ·d.
// So measured − expected must lie in [−(P·δ + πρd), P·(δ + d) + πρd]. Nothing else is allowed for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Sim, R, GRID, HANDLING, HOME_RADIUS, PLANET_AREA, Rng, faceDir, neighbor, v3, cross, dot, normalize, type V3,
} from '../src/sim.ts';
import { createWorld, type World } from '../src/world.ts';

const RHO = HOME_RADIUS / R; // home disc angular radius

/** Largest cell diagonal on the grid, world units (every face shares the same layout). */
function maxDiagonal(): number {
  const a = v3(), b = v3(), c = v3(), e = v3();
  let worst = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const u0 = (i / GRID) * 2 - 1, u1 = ((i + 1) / GRID) * 2 - 1, v0 = (j / GRID) * 2 - 1, v1 = ((j + 1) / GRID) * 2 - 1;
      faceDir(0, u0, v0, a); faceDir(0, u1, v1, b); faceDir(0, u1, v0, c); faceDir(0, u0, v1, e);
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), Math.hypot(c.x - e.x, c.y - e.y, c.z - e.z));
    }
  }
  return worst * R;
}

/** Area of the home disc (angular radius RHO, centred on the circle) lying outside the cap of angle θ. */
function discOutsideCap(theta: number): number {
  // In polar coordinates (r, β) about the disc centre, a point is outside the cap when
  // cos θ cos r + sin θ sin r cos β < cos θ, i.e. cos β < k(r) = cos θ (1 − cos r) / (sin θ sin r).
  const steps = 20000;
  let sum = 0;
  for (let n = 0; n < steps; n++) {
    const r = ((n + 0.5) / steps) * RHO;
    const k = (Math.cos(theta) * (1 - Math.cos(r))) / (Math.sin(theta) * Math.sin(r));
    sum += Math.sin(r) * (2 * Math.PI - 2 * Math.acos(Math.max(-1, Math.min(1, k))));
  }
  return sum * (RHO / steps) * R * R;
}

/** Sail once around the circle at angle θ from `pole` and close the loop. */
function sailLoop(theta: number, pole: V3) {
  // start on the circle, heading along it with the pole to port
  const side = normalize(cross(pole, Math.abs(pole.x) < 0.9 ? v3(1, 0, 0) : v3(0, 0, 1), v3()));
  const start = normalize(v3(
    pole.x * Math.cos(theta) + side.x * Math.sin(theta),
    pole.y * Math.cos(theta) + side.y * Math.sin(theta),
    pole.z * Math.cos(theta) + side.z * Math.sin(theta),
  ));
  const sim = new Sim({ seed: 1, world: null, ships: 1, spawns: [start] });
  const s = sim.ships[0], h = HANDLING[s.cls];
  normalize(cross(pole, s.pos, s.fwd));
  Object.assign(s.prevFwd, s.fwd);
  const kappa = 1 / (Math.tan(theta) * R); // geodesic curvature of the circle
  const along = v3(), toPole = v3(), want = v3(), c = v3();
  let deviation = 0, claim = null;
  const extra: string[] = [];
  const limit = Math.ceil((2 * Math.PI * R * Math.sin(theta)) / 5 / (1 / 30)); // generous: below 5 u/s average
  for (let t = 0; t < limit && !claim; t++) {
    // steering controller: look ahead to the circle, feed forward its curvature
    const p = s.pos, cosc = dot(p, pole), err = (Math.acos(Math.max(-1, Math.min(1, cosc))) - theta) * R;
    deviation = Math.max(deviation, Math.abs(err));
    normalize(cross(pole, p, along));
    toPole.x = pole.x - p.x * cosc; toPole.y = pole.y - p.y * cosc; toPole.z = pole.z - p.z * cosc;
    normalize(toPole);
    const phi = Math.atan(err / 6);
    want.x = along.x * Math.cos(phi) + toPole.x * Math.sin(phi);
    want.y = along.y * Math.cos(phi) + toPole.y * Math.sin(phi);
    want.z = along.z * Math.cos(phi) + toPole.z * Math.sin(phi);
    const psi = Math.atan2(dot(cross(s.fwd, want, c), p), dot(s.fwd, want));
    const rate = kappa * s.speed + 2.5 * psi;
    sim.step([Math.max(-1, Math.min(1, rate / (s.speed / h.radius)))]);
    for (const e of sim.events) {
      if (e.type === 'claim') claim = e;
      else if (e.type !== 'trail') extra.push(e.type);
    }
    sim.events.length = 0;
  }
  return { sim, claim, deviation, extra };
}

let diagonal = 0;
for (const [label, deg, pole] of [
  ['north 20°', 20, v3(0, 1, 0)],
  ['north 45°', 45, v3(0, 1, 0)],
  ['north 70°', 70, v3(0, 1, 0)],
  ['south 30°', 30, v3(0, -1, 0)],
] as const) {
  test(`territory geometry: loop around the ${label} circle claims the spherical cap`, () => {
    diagonal ||= maxDiagonal();
    const theta = (deg * Math.PI) / 180;
    const { sim, claim, deviation, extra } = sailLoop(theta, pole);
    assert.ok(claim, 'the loop closed');
    assert.deepEqual(extra, [], 'nothing but the trail and the claim happened');
    // the closed trail is a gap-free 4-connected chain
    for (let k = 1; k < claim.loop.length; k++) {
      const a = claim.loop[k - 1], b = claim.loop[k];
      assert.ok([0, 1, 2, 3].some((n) => neighbor(a, n) === b), `trail cells ${k - 1}→${k} are 4-adjacent`);
    }
    const P = 2 * Math.PI * R * Math.sin(theta), rim = Math.PI * HOME_RADIUS * diagonal;
    const cap = 2 * Math.PI * R * R * (1 - Math.cos(theta));
    const expected = cap + discOutsideCap(theta);
    const measured = sim.ships[0].share * PLANET_AREA;
    const lo = -(P * deviation + rim), hi = P * (deviation + diagonal) + rim;
    const err = measured - expected;
    console.log(
      `${label}: measured ${measured.toFixed(1)} u², expected ${expected.toFixed(1)} u² (cap ${cap.toFixed(1)}), ` +
        `error ${err.toFixed(1)} u² (${((100 * err) / expected).toFixed(3)} %), allowed [${lo.toFixed(1)}, ${hi.toFixed(1)}] ` +
        `from P=${P.toFixed(1)} u, δ=${deviation.toFixed(3)} u, d=${diagonal.toFixed(3)} u`,
    );
    assert.ok(err >= lo && err <= hi, `error ${err.toFixed(1)} u² outside [${lo.toFixed(1)}, ${hi.toFixed(1)}]`);
  });
}

/** A few thousand ticks among islands with seeded random helms; returns the ownership hash and event tally. */
function scriptedMatch(seed: number, world: World, ticks: number) {
  const sim = new Sim({ seed, world });
  const rng = new Rng(seed ^ 0x7e57), helm = new Float32Array(sim.ships.length);
  const tally: Record<string, number> = {};
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < helm.length; i++) if (rng.next() < 1 / 45) helm[i] = rng.range(-1, 1);
    sim.step(helm);
    for (const e of sim.events) tally[e.type] = (tally[e.type] ?? 0) + 1;
    sim.events.length = 0;
  }
  return { hash: sim.hash(), tally };
}

test('determinism: same seed and inputs give the same territory hash', () => {
  const world = createWorld(3);
  const a = scriptedMatch(3, world, 4000), b = scriptedMatch(3, world, 4000);
  console.log(`hash ${a.hash}, events ${JSON.stringify(a.tally)}`);
  assert.ok((a.tally.claim ?? 0) > 0 && (a.tally.sink ?? 0) > 0, 'the match exercised claims and sinkings');
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.tally, b.tally);
});
