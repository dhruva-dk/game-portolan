// A captain weighing a rival's reach against its own way home.
//   node --test tests/exposure.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exposure, haven } from '../src/sim/captains/exposure.ts';
import { TERRITORY, R, cellDir, neighbor } from '../src/sim/sphere.ts';
import { PHASE, SHIPS, type MatchState } from '../src/sim/state.ts';

const up = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
};

/** Twenty ships far away and idle; a trail of `laid` cells for ship 0, which sits at the first of them. */
function world(laid: number[]): MatchState {
  const ships = Array.from({ length: SHIPS }, () => ({ pos: up(0, 0, -1), vel: { x: 0, y: 0, z: 0 }, laid: [] as number[], phase: PHASE.sea }));
  const at = { x: 0, y: 0, z: 0 };
  cellDir(TERRITORY, laid[0], at);
  ships[0].pos = { ...at };
  ships[0].vel = { x: 8, y: 0, z: 0 };
  ships[0].laid = laid;
  return { ships, owner: new Int32Array(TERRITORY.cells) } as unknown as MatchState;
}

/** A rival `metres` off along the sphere, sailing at the ship (or, if `away`, directly from it). */
function rival(s: MatchState, metres: number, away = false) {
  const me = s.ships[0].pos, a = metres / R;
  const pos = up(me.x * Math.cos(a) + Math.sin(a), me.y * Math.cos(a), me.z * Math.cos(a));
  // pointed at the part of the trail nearest it, or directly from that
  const c = { x: 0, y: 0, z: 0 };
  let near = { x: 0, y: 0, z: 0 }, best = Infinity;
  for (const cell of s.ships[0].laid) {
    cellDir(TERRITORY, cell, c);
    const d = Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z);
    if (d < best) { best = d; near = { ...c }; }
  }
  const sign = away ? -10 : 10;
  s.ships[1].pos = pos;
  s.ships[1].vel = { x: sign * (near.x - pos.x) / best, y: sign * (near.y - pos.y) / best, z: sign * (near.z - pos.z) / best };
}

const TRAIL = (() => {
  const start = Math.floor(TERRITORY.cells / 2);
  const laid = [start];
  for (let i = 0; i < 40; i++) laid.push(neighbor(TERRITORY, laid[laid.length - 1], 0));
  return laid;
})();

test('no trail, no exposure', () => {
  const s = world(TRAIL);
  s.ships[0].laid = [];
  assert.equal(exposure(s, 0, 100), -Infinity);
});

test('a rival far off leaves the trail safe', () => {
  const s = world(TRAIL);
  rival(s, 800);
  assert.ok(exposure(s, 0, 40) < 0);
});

test('a rival bearing down reaches the trail first', () => {
  const s = world(TRAIL);
  rival(s, 12);
  assert.ok(exposure(s, 0, 200) > 0);
});

test('being nearer home lowers the danger', () => {
  const s = world(TRAIL);
  rival(s, 60);
  assert.ok(exposure(s, 0, 10) < exposure(s, 0, 200));
});

test('a rival sailing away is later than one sailing in', () => {
  const a = world(TRAIL), b = world(TRAIL);
  rival(a, 60);
  rival(b, 60, true);
  assert.ok(exposure(a, 0, 40) > exposure(b, 0, 40));
});

test('a sunk rival does not count', () => {
  const s = world(TRAIL);
  rival(s, 12);
  s.ships[1].phase = PHASE.sunk;
  assert.ok(exposure(s, 0, 40) < 0);
});

test('the haven is own water touching the trail, or nothing', () => {
  const s = world(TRAIL);
  const out = { x: 0, y: 0, z: 0 };
  assert.equal(haven(s, 0, out), null);
  const own = neighbor(TERRITORY, TRAIL[0], 2);
  (s as unknown as { owner: Int32Array }).owner[own] = 1;
  assert.ok(haven(s, 0, out));
  const at = { x: 0, y: 0, z: 0 };
  cellDir(TERRITORY, own, at);
  assert.ok(Math.hypot(out.x - at.x, out.y - at.y, out.z - at.z) < 1e-6);
});
