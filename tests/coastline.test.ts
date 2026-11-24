import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, neighbor } from '../src/world/cells.ts';
import { BLOCK, coastLines } from '../src/world/coastline.ts';
import { distance, type Vec3 } from '../src/world/sphere.ts';
import { CELL, between, locate, taps } from '../src/world/terrain-grid.ts';
import { createTerrain } from '../src/world/terrain.ts';

const terrain = createTerrain(4);
const lines = coastLines(terrain.shore);

test('every side between a land cell and a sea cell is crossed once, across the faces too', () => {
  let sides = 0;
  for (let c = 0; c < CELLS; c++) {
    for (let k = 0; k < 4; k++) {
      const n = neighbor(c, k);
      if (c < n && terrain.shore[c] < 0 !== terrain.shore[n] < 0) sides++;
    }
  }
  const points = new Set<Vec3>(lines.flat());
  assert.equal(points.size, sides);
});

test('the lines run along the coast, unbroken, each within its block', () => {
  const at = taps();
  let worst = 0;
  for (const line of lines) {
    assert.ok(line.length >= 2);
    for (let i = 0; i < line.length; i++) {
      locate(line[i], at);
      worst = Math.max(worst, Math.abs(between(terrain.shore, at)));
      if (i) assert.ok(distance(line[i - 1], line[i]) < 2 * CELL);
      assert.ok(distance(line[0], line[i]) < 1.5 * BLOCK * CELL);
    }
  }
  assert.ok(worst < 0.25 * CELL, `worst ${worst.toFixed(3)} m off the coast`);
});
