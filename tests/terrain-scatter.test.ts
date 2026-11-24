import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planetOf } from '../src/world/land.ts';
import { distance, fromChart } from '../src/world/sphere.ts';
import { between, locate, taps } from '../src/world/terrain-grid.ts';
import { createTerrain } from '../src/world/terrain.ts';
import {
  WADE,
  onRock,
  scatterTerrain,
  type Tile,
} from '../src/world/terrain-scatter.ts';

const SHAPES = { shrubs: 4, big: 3, boulders: 3 };
const terrain = createTerrain(3);
const planet = planetOf(3, terrain);
const tiles = scatterTerrain(terrain, planet, 3, SHAPES);
const at = taps();
const shoreAt = (t: Tile, x: number, z: number) => {
  locate(fromChart(t.chart, x, z), at);
  return between(terrain.shore, at);
};
const each = <T>(of: (t: Tile) => T[]) =>
  tiles.flatMap((t) => of(t).map((thing) => ({ t, thing })));
const things = {
  palms: each((t) => t.palms),
  shrubs: each((t) => t.shrubs),
  rocks: each((t) => t.rocks),
};
const all = <K extends keyof typeof things>(kind: K): (typeof things)[K] =>
  things[kind];

test('the same terrain and seed scatter the same things', () => {
  assert.deepEqual(scatterTerrain(terrain, planet, 3, SHAPES), tiles);
  assert.ok(
    all('palms').length > 500 &&
      all('shrubs').length > 1000 &&
      all('rocks').length > 100
  );
});

test('palms and shrubs stand on land, each within its own tile', () => {
  for (const kind of ['palms', 'shrubs'] as const)
    for (const { t, thing } of all(kind)) {
      const p = fromChart(t.chart, thing.x, thing.z);
      assert.ok(planet.height(p) > 0, `${kind} in the sea`);
      assert.ok(
        distance(p, t.chart.at) <= t.reach + 1e-6,
        `${kind} outside its tile`
      );
    }
});

test('no rock reaches where a ship could sail', () => {
  for (const { t, thing: r } of all('rocks'))
    assert.ok(shoreAt(t, r.x, r.z) + 0.8 * r.size <= WADE - 1 + 1e-9);
});

test('no palm stands on a rock', () => {
  for (const t of tiles)
    for (const p of t.palms) assert.ok(!onRock(t.rocks, p.x, p.z, 1));
});

test('palms are thickest along the top of the beach, and thin inland', () => {
  // palms per cell of land in each band of shore distance
  const band = (lo: number, hi: number) => {
    let cells = 0;
    for (let c = 0; c < terrain.shore.length; c++)
      if (terrain.shore[c] >= lo && terrain.shore[c] < hi) cells++;
    const palms = all('palms').filter(({ t, thing }) => {
      const s = shoreAt(t, thing.x, thing.z);
      return s >= lo && s < hi;
    }).length;
    return palms / cells;
  };
  const beach = band(-16, -4),
    inland = band(-80, -40);
  assert.ok(
    beach > 2 * inland,
    `beach ${beach.toFixed(3)} inland ${inland.toFixed(3)}`
  );
});

test('palms lean out toward the sea', () => {
  let toward = 0,
    n = 0;
  for (const { t, thing: p } of all('palms')) {
    const s = shoreAt(t, p.x, p.z),
      gx = shoreAt(t, p.x + 1, p.z) - s,
      gz = shoreAt(t, p.x, p.z + 1) - s;
    if (Math.hypot(gx, gz) < 0.5) continue;
    toward += Math.cos(p.heading - Math.atan2(gz, gx));
    n++;
  }
  // headings spread ±0.7 rad about seaward: their mean cosine is sin(0.7)/0.7
  assert.ok(toward / n > 0.85, `mean ${(toward / n).toFixed(3)}`);
});
