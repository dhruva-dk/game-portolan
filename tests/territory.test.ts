// A ship sails once round a circle of latitude at angle θ from a pole, starting and ending in its home water, and closes
// the loop. It must then hold the spherical cap 2πR²(1 − cos θ) plus the part of the home disc outside the cap, exactly
// integrable.
//   node --test tests/territory.test.ts
//
// The tolerance is derived, not tuned. P = 2πR sin θ is the circle's length, d the largest cell diagonal on the grid and
// ρ the home disc's radius. The ship follows the circle exactly, so what it claims beyond the cap lies in cells the path
// touched (within d of the circle) or in cells straddling the disc's rim, at most P·d + 2πρ·d; what it misses of the cap
// lies only in rim cells, at most 2πρ·d.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID, R, TERRITORY, cellDir, cellOf, faceDir } from '../src/sim/sphere.ts';
import { INK } from '../src/sim/tables.ts';
import { v3, type V3 } from '../src/sim/math.ts';
import { PHASE, SHIPS, createMatch, type MatchState } from '../src/sim/match.ts';
import { chart, inkHome, squareMetres } from '../src/sim/territory.ts';

const RHO = INK.home / R;

/** The longest diagonal of any cell, in metres. */
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

/** The share of the home disc (centred on the circle) outside the cap of angle θ, in square radians. */
function discOutsideCap(theta: number): number {
  const steps = 20000;
  let sum = 0;
  for (let n = 0; n < steps; n++) {
    const r = ((n + 0.5) / steps) * RHO;
    const k = (Math.cos(theta) * (1 - Math.cos(r))) / (Math.sin(theta) * Math.sin(r));
    sum += Math.sin(r) * (2 * Math.PI - 2 * Math.acos(Math.max(-1, Math.min(1, k))));
  }
  return sum * (RHO / steps);
}

const normal = (a: V3) => {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const cross = (a: V3, b: V3) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

function sail(pole: V3, theta: number): { state: MatchState; held: number; length: number } {
  const state = createMatch({ seed: 11, fleet: [{ captain: false }] });
  for (let i = 1; i < SHIPS; i++) state.ships[i].phase = PHASE.gale;
  state.owner.fill(0);
  state.trail.fill(0);
  const ship = state.ships[0];
  ship.phase = PHASE.sea;
  ship.laid.length = 0;
  ship.held = 0;
  const n = normal(pole), side = normal(cross(n, Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), up = cross(n, side);
  const at = (a: number): V3 => normal({
    x: n.x * Math.cos(theta) + (side.x * Math.cos(a) + up.x * Math.sin(a)) * Math.sin(theta),
    y: n.y * Math.cos(theta) + (side.y * Math.cos(a) + up.y * Math.sin(a)) * Math.sin(theta),
    z: n.z * Math.cos(theta) + (side.z * Math.cos(a) + up.z * Math.sin(a)) * Math.sin(theta),
  });
  const set = (to: V3, p: V3) => {
    to.x = p.x; to.y = p.y; to.z = p.z;
  };
  set(ship.pos, at(0));
  inkHome(state, 0);
  const length = 2 * Math.PI * R * Math.sin(theta), steps = Math.ceil(length / 1.5);
  // a stride beyond the start, so it comes back into its home water
  for (let k = 1; k <= steps + 8; k++) {
    set(ship.was, ship.pos);
    set(ship.pos, at((k / steps) * 2 * Math.PI));
    chart(state);
  }
  let held = 0;
  const a = TERRITORY.area;
  for (let c = 0; c < state.owner.length; c++) if (state.owner[c] === 1) held += a[c & (GRID * GRID - 1)];
  return { state, held: squareMetres(held), length };
}

const places: [string, V3][] = [
  ['in the middle of a face', faceDir(0, 0.3, 0.2, v3())],
  ['on an edge of the cube', faceDir(4, 1, 0.1, v3())],
  ['on a corner of the cube', faceDir(2, 1, 1, v3())],
];

for (const [name, pole] of places) {
  test(`a sailed loop holds the water inside it, ${name}`, () => {
    const theta = 0.15, d = maxDiagonal();
    const { state, held, length } = sail(pole, theta);
    assert.equal(state.ships[0].laid.length, 0, 'the loop has closed');
    const expected = (2 * Math.PI * (1 - Math.cos(theta)) + discOutsideCap(theta)) * R * R;
    const over = length * d + 2 * Math.PI * INK.home * d, under = 2 * Math.PI * INK.home * d;
    assert.ok(held <= expected + over && held >= expected - under,
      `held ${held.toFixed(0)} m², expected ${expected.toFixed(0)} (−${under.toFixed(0)}, +${over.toFixed(0)})`);
  });
}

test('the cell of a point holds that point', () => {
  const p = v3(), q = v3();
  faceDir(3, -0.41, 0.77, p);
  cellDir(TERRITORY, cellOf(TERRITORY, p), q);
  assert.ok(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) * R < maxDiagonal());
});
