// Acceptance check 1 (PROMPT.md): territory geometry, and the claim's cost.
//   node --test tests/acceptance/check1-territory.test.ts
//
// A scripted ship sails once round a circle of latitude at angle θ from a pole, starting and ending in its home disc,
// and closes the loop. Its pose is scripted on the exact circle at the reference speed, one 30 Hz tick at a time,
// through chart(), the step's territory system (scripted, so the check measures the territory rules rather than a
// helmsman; territory never reads the land). Its sea must then equal the spherical cap 2πR²(1 − cos θ) plus the part
// of the home disc (the cells whose centres lie within ρ = HOME.radius of the start) that lies outside the cap.
//
// Tolerance, derived rather than tuned. Let d be the largest cell diagonal on the grid (computed), δ the largest
// distance of the ship's path (the chords between ticks) from the circle (measured: their sagitta), P_out(w) and P_in(w)
// the areas of the bands of width w just outside and just inside the circle, and R_out(w), R_in(w) those of the rings
// of width w just outside and just inside the disc's rim (exact cap differences). The claim is the disc cells, the
// trail cells (every cell the path enters, and a corner cell bridging each diagonal step) and every cell of each region
// the barrier cuts off from the largest. So:
//   • a cell claimed beyond cap ∪ disc is a trail or an enclosed cell, both within d + δ of the circle, or a disc cell,
//     within d/2 of the rim: the excess is at most P_out(d + δ) + R_out(d);
//   • a cell of cap ∪ disc left unclaimed straddles the circle, within d + δ of it (a cell wholly inside the barrier is
//     enclosed), or is a rim cell of the disc whose centre lies outside it: the shortfall is at most P_in(d + δ) + R_in(d).
// So measured − expected must lie in [−(P_in(d + δ) + R_in(d)), P_out(d + δ) + R_out(d)]. Nothing else is allowed for.
// θ runs over 10° (one cube face), 30°, 50° and 70° (four faces and their edges) about both poles.
//
// The same runs time the claim: the closing tick is replayed on five copies of the state and the median kept; every
// loop must close in ≤ 3 ms. The flood races the regions either side of a loop and stops once the outside is known,
// so it visits about twice the enclosed side: the most it ever visits is the whole planet, for a loop halving it, timed
// at θ = 89° (which also passes the geometry check).
import { cpuNow } from '../cpu.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cross, normalize, v3, type V3 } from '../../src/sim/math.ts';
import { AREA_Q, GRID, R, TERRITORY, cellOf, faceDir } from '../../src/sim/sphere.ts';
import { EVENT, TICK, createMatch, type MatchState } from '../../src/sim/state.ts';
import { HOME, REFERENCE } from '../../src/sim/tables.ts';
import { chart, inkHome } from '../../src/sim/territory.ts';

const RHO = HOME.radius / R;

/** The largest cell diagonal on the grid, u (every face shares one layout; the chord, the arc to a part in 10⁶). */
function maxDiagonal(): number {
  const a = v3(), b = v3(), c = v3(), e = v3();
  let worst = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const u0 = (i / GRID) * 2 - 1, u1 = ((i + 1) / GRID) * 2 - 1, v0 = (j / GRID) * 2 - 1, v1 = ((j + 1) / GRID) * 2 - 1;
      faceDir(0, u0, v0, a);
      faceDir(0, u1, v1, b);
      faceDir(0, u1, v0, c);
      faceDir(0, u0, v1, e);
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), Math.hypot(c.x - e.x, c.y - e.y, c.z - e.z));
    }
  }
  return worst * R;
}
const D = maxDiagonal();

/** The area of a cap of angular radius a, u². */
const cap = (a: number): number => 2 * Math.PI * R * R * (1 - Math.cos(a));

/** The area of the home disc (angular radius RHO, centred on the circle) lying outside the cap of angle θ, u². */
function discOutsideCap(theta: number): number {
  // In polar coordinates (r, β) about the disc's centre a point is outside the cap when
  // cos θ cos r + sin θ sin r cos β < cos θ, that is cos β < k(r) = cos θ (1 − cos r) / (sin θ sin r).
  const steps = 20000;
  let sum = 0;
  for (let n = 0; n < steps; n++) {
    const r = ((n + 0.5) / steps) * RHO, k = (Math.cos(theta) * (1 - Math.cos(r))) / (Math.sin(theta) * Math.sin(r));
    sum += Math.sin(r) * (2 * Math.PI - 2 * Math.acos(Math.max(-1, Math.min(1, k))));
  }
  return sum * (RHO / steps) * R * R;
}

/** The bounds measured − expected must lie within (see above), u². */
function tolerance(theta: number, delta: number): [number, number] {
  const w = (D + delta) / R, r = D / R, k = 2 * Math.PI * R * R;
  const pOut = k * (Math.cos(theta) - Math.cos(theta + w)), pIn = k * (Math.cos(theta - w) - Math.cos(theta));
  const rOut = k * (Math.cos(RHO) - Math.cos(RHO + r)), rIn = k * (Math.cos(RHO - r) - Math.cos(RHO));
  return [-(pIn + rIn), pOut + rOut];
}

/** The median of five timings of this tick's chart on copies of the state, all made before the clock starts, ms. */
function timeClaim(s: MatchState): number {
  const copies = Array.from({ length: 5 }, () => structuredClone(s));
  const times = copies.map((copy) => {
    const t0 = cpuNow();
    chart(copy);
    return cpuNow() - t0;
  });
  return times.sort((a, b) => a - b)[2];
}

interface Run { area: number; expected: number; delta: number; cost: number }

/** Ship 0 once round the circle at angle θ from `pole`, from its home disc back into it, closing the loop. */
function sailRound(theta: number, pole: V3): Run {
  const side = normalize(cross(v3(), pole, Math.abs(pole.x) < 0.9 ? v3(1, 0, 0) : v3(0, 0, 1))), other = cross(v3(), pole, side);
  const on = (phi: number): V3 => {
    const h = Math.cos(theta), x = Math.cos(phi) * Math.sin(theta), y = Math.sin(phi) * Math.sin(theta);
    return normalize(v3(pole.x * h + side.x * x + other.x * y, pole.y * h + side.y * x + other.y * y, pole.z * h + side.z * x + other.z * y));
  };
  const s = createMatch({ seed: 1 }), ship = s.ships[0], dphi = (REFERENCE * TICK) / (R * Math.sin(theta));
  ship.pos = on(0);
  ship.was = on(0);
  inkHome(s, 0);
  let delta = 0, cost = 0;
  for (let k = 1; k * dphi < 2 * Math.PI + 1; k++) {
    const next = on(k * dphi), m = normalize(v3(ship.pos.x + next.x, ship.pos.y + next.y, ship.pos.z + next.z));
    delta = Math.max(delta, Math.abs(Math.acos(Math.min(1, m.x * pole.x + m.y * pole.y + m.z * pole.z)) - theta) * R);
    ship.was = ship.pos;
    ship.pos = next;
    if (ship.laid.length > 0 && s.owner[cellOf(TERRITORY, next)] === 1) cost = timeClaim(s);
    s.events.length = 0;
    chart(s);
    if (s.events.some((e) => e.kind === EVENT.loop)) {
      assert.ok(cost > 0, 'the closing tick was timed');
      return { area: ship.held / AREA_Q, expected: cap(theta) + discOutsideCap(theta), delta, cost };
    }
  }
  throw new Error(`θ = ${theta}: the loop never closed`);
}

/** Every run's claim cost, ms. */
const costs: number[] = [];

function check(name: string, pole: V3, deg: number): void {
  const theta = (deg * Math.PI) / 180, run = sailRound(theta, pole), [lo, hi] = tolerance(theta, run.delta);
  const off = run.area - run.expected;
  console.log(
    `check 1, ${name} θ=${deg}°: claimed ${run.area.toFixed(1)} u², expected ${run.expected.toFixed(1)}, Δ ${off.toFixed(1)}`
      + ` (${((100 * off) / run.expected).toFixed(3)} %) within [${lo.toFixed(1)}, ${hi.toFixed(1)}];`
      + ` d ${D.toFixed(3)} u, δ ${run.delta.toExponential(1)} u; claim ${run.cost.toFixed(2)} ms`,
  );
  assert.ok(off >= lo && off <= hi, `Δ ${off} u² outside [${lo}, ${hi}]`);
  costs.push(run.cost);
}

const POLES: [string, V3][] = [['north', v3(0, 1, 0)], ['south', v3(0, -1, 0)]];
for (const [name, pole] of POLES) {
  for (const deg of [10, 30, 50, 70]) test(`check 1: θ = ${deg}° from the ${name} pole`, () => check(name, pole, deg));
}
test('check 1 at θ = 89°: the loop that halves the planet, the most the flood ever visits', () => check('north', v3(0, 1, 0), 89));
// CPU time of this thread (tests/cpu.ts), median of five, so a loaded machine cannot fail it; 2.1–2.4 ms at worst.
test('claim cost ≤ 3 ms for every loop', () => {
  assert.ok(Math.max(...costs) <= 3, `the slowest claim took ${Math.max(...costs)} ms`);
});
