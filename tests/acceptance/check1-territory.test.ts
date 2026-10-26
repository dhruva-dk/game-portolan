import { cpuNow } from '../cpu.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cross, normalize, v3, type V3 } from '../../src/sim/math.ts';
import { AREA_Q, GRID, R, TERRITORY, cellOf, faceDir } from '../../src/sim/sphere.ts';
import { EVENT, TICK, createMatch, type MatchState } from '../../src/sim/state.ts';
import { HOME, REFERENCE } from '../../src/sim/tables.ts';
import { chart, inkHome } from '../../src/sim/territory.ts';

const RHO = HOME.radius / R;

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

const cap = (a: number): number => 2 * Math.PI * R * R * (1 - Math.cos(a));

function discOutsideCap(theta: number): number {
  const steps = 20000;
  let sum = 0;
  for (let n = 0; n < steps; n++) {
    const r = ((n + 0.5) / steps) * RHO, k = (Math.cos(theta) * (1 - Math.cos(r))) / (Math.sin(theta) * Math.sin(r));
    sum += Math.sin(r) * (2 * Math.PI - 2 * Math.acos(Math.max(-1, Math.min(1, k))));
  }
  return sum * (RHO / steps) * R * R;
}

function tolerance(theta: number, delta: number): [number, number] {
  const w = (D + delta) / R, r = D / R, k = 2 * Math.PI * R * R;
  const pOut = k * (Math.cos(theta) - Math.cos(theta + w)), pIn = k * (Math.cos(theta - w) - Math.cos(theta));
  const rOut = k * (Math.cos(RHO) - Math.cos(RHO + r)), rIn = k * (Math.cos(RHO - r) - Math.cos(RHO));
  return [-(pIn + rIn), pOut + rOut];
}

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
test('claim cost ≤ 3 ms for every loop', () => {
  assert.ok(Math.max(...costs) <= 3, `the slowest claim took ${Math.max(...costs)} ms`);
});
