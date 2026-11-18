// What stands on the terrain's land (terrain.ts): the islands' own palms, shrubs and rocks (scatter.ts has their
// kinds), placed by the land's two fields, how far in from the coast and how high, so every grove follows the land.
//
// The land is cut into tiles, BLOCK² cells each, and each tile's things are worked out on its own chart (sphere.ts),
// the way an island's are on its: whatever draws an island's things draws a tile's (land/site.ts). Candidates are
// drawn cell by cell, each cell in exactly one tile, so the tiles meet without a seam, a gap or a doubled grove; the
// fields that gather them into groves and clumps are noise in world metres, so they run on across the tiles' edges.
// Each tile has its own random stream from the seed and its index: a tile's things are the same whatever else is.
//
// Palms: in groves, thickest along the top of the beach and thinning inland and as the land rises; none high up.
//   Each leans out toward the sea (down the shore distance's slope), the nearer the coast the more.
// Shrubs: a broken hedge along the top of the beach; inland, clumps where the grass grows (planet-terrain.ts cover),
//   lower the higher they stand, where the wind keeps them down; none on the bare rock.
// Rocks: outcrops heaped on the tops, and on the shoulders above some beaches, never where a ship could sail; boulders
//   round them. None of the others stand on a rock.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { N } from './cells.ts';
import { createNoise3 } from './noise3.ts';
import type { Cover, Planet } from './planet.ts';
import { WADE } from './planet-islands.ts';
import { hash, random } from './random.ts';
import { onRock, type Palm, type Rock, type Shrub } from './scatter.ts';
import { R, add, distance, dot, faceDir, fromChart, normalize, toChart, type Chart, type Vec3 } from './sphere.ts';
import { CELL, between, locate, taps } from './terrain-grid.ts';
import { heightBounds, type Terrain } from './terrain.ts';

/** The cells along a side of a tile (as planet-terrain.ts's rises). */
export const BLOCK = 16;

export interface Tile {
  chart: Chart;
  /** How far from the chart's centre the tile's cells reach, metres; the highest ground in it, metres. */
  reach: number;
  top: number;
  palms: Palm[];
  shrubs: Shrub[];
  rocks: Rock[];
}

/** How many shapes each kind is drawn in (land/: shrubs.ts, rocks.ts). */
export interface Shapes { shrubs: number; big: number; boulders: number }

/** A tile whose ground rises no higher than this, metres, has nothing on it. */
const LOWEST = 0.5;
/** Palms: from the beach's top inland (shore distance, metres, negative inland); the chance of one in a cell where
 *  the grove is thickest at the coast; at least how far apart; how fast they thin inland (metres) and with height (the
 *  share of the summit between which they go). */
const BEACH_TOP = -4, PALM_RATE = 0.35, SPACING = 3.5, INLAND = 25, PALM_UP = [0.4, 0.75] as const;
/** Shrubs: the hedge's band; two candidates a cell, each kept at most this often; under the hedge's or clumps' cover. */
const HEDGE = [-14, -5] as const, SHRUB_RATE = 0.3, BARE = 0.7;
/** Rocks: tops are above this share of the summit; the chance of an outcrop in a top's cell, at most so many to a tile;
 *  the chance a tile with a beach has one on its shoulder; masses' and boulders' radii and counts, as on the islands. */
const TOP = 0.6, TOP_OUTCROP = 0.03, TOP_OUTCROPS = 2, COAST_OUTCROP = 0.3;
const BIG = [2.5, 5.5] as const, BIG_COUNT = [3, 6] as const, HEAPED = 0.6;
const BOULDER = [0.3, 1.6] as const, BOULDERS = [4, 10] as const, SUNK = { big: 0.15, boulder: 0.3 }, FOOT = 0.8;

const sat = (x: number) => Math.min(Math.max(x, 0), 1);
const smoothstep = (a: number, b: number, x: number) => {
  const k = sat((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

export function scatterTerrain(t: Terrain, planet: Planet, seed: number, shapes: Shapes): Tile[] {
  const blocks = N / BLOCK, tops = heightBounds(t, blocks).hi, summit = t.options.summit;
  const noise = createNoise3(seed + 7919), at = taps(), cover: Cover = { grass: 0, rubble: 0, mottle: 0, clump: 0 };
  /** Noise about −1…1 at unit direction p, features `size` metres across. */
  const read = (p: Vec3, size: number, shift: number) => noise.value((p[0] * R) / size + shift, (p[1] * R) / size, (p[2] * R) / size);
  const shoreAt = (p: Vec3) => {
    locate(p, at);
    return between(t.shore, at);
  };
  const tiles: Tile[] = [];

  for (let face = 0; face < 6; face++) for (let bj = 0; bj < blocks; bj++) for (let bi = 0; bi < blocks; bi++) {
    const k = (face * blocks + bj) * blocks + bi, top = tops[k];
    if (top < LOWEST) continue;
    const rand = random(hash(seed, k + 1));
    // the chart at the tile's middle, its x along the face's u
    const uv = (i: number) => -1 + (2 * i) / N;
    const [u0, v0, u1, v1] = [uv(bi * BLOCK), uv(bj * BLOCK), uv((bi + 1) * BLOCK), uv((bj + 1) * BLOCK)];
    const middle = faceDir(face, (u0 + u1) / 2, (v0 + v1) / 2), ahead = faceDir(face, (u0 + u1) / 2 + 1e-3, (v0 + v1) / 2);
    const chart: Chart = { at: middle, axis: normalize(add(ahead, middle, -dot(ahead, middle))) };
    const reach = Math.max(...[[u0, v0], [u1, v0], [u0, v1], [u1, v1]].map(([u, v]) => distance(middle, faceDir(face, u, v))));
    const groundAt = (x: number, z: number) => planet.height(fromChart(chart, x, z));
    /** A point somewhere in cell (i, j) of the tile, chosen at random. */
    const within = (i: number, j: number): Vec3 => faceDir(face, uv(bi * BLOCK + i + rand()), uv(bj * BLOCK + j + rand()));
    const cells = (visit: (c: number, i: number, j: number) => void) => {
      for (let j = 0; j < BLOCK; j++) for (let i = 0; i < BLOCK; i++) visit(face * N * N + (bj * BLOCK + j) * N + bi * BLOCK + i, i, j);
    };
    // (a point in a cell is no more than this much nearer the coast than the cell's middle)
    const slack = CELL * 0.75;

    // ---- rocks: an outcrop's masses heaped against each other, then boulders round their feet
    const rocks: Rock[] = [];
    const clear = (x: number, z: number, size: number, big: boolean) =>
      rocks.every((r) => Math.hypot(r.x - x, r.z - z) > (r.size + size) * (r.big && big ? HEAPED : 0.85));
    const seat = (x: number, z: number, size: number, sunk: number) => {
      let low = groundAt(x, z);
      for (let a = 0; a < 6; a++) low = Math.min(low, groundAt(x + Math.cos(a) * size * 0.7, z + Math.sin(a) * size * 0.7));
      return low - sunk * size;
    };
    const outcrop = (p: Vec3, most: number) => {
      const [cx, cz] = toChart(chart, p), masses: Rock[] = [];
      const count = BIG_COUNT[0] + Math.floor(rand() * (BIG_COUNT[1] - BIG_COUNT[0] + 1));
      for (let n = 0, tries = 0; n < count && tries < 40; tries++) {
        const size = BIG[0] + (most - BIG[0]) * (n === 0 ? 0.6 + 0.4 * rand() : rand() ** 0.8);
        let x = cx, z = cz;
        if (n > 0) {
          const m = masses[Math.floor(rand() * masses.length)], a = rand() * 2 * Math.PI, out = (m.size + size) * (HEAPED + 0.02 + 0.15 * rand());
          x = m.x + Math.cos(a) * out;
          z = m.z + Math.sin(a) * out;
        }
        // never out where a ship could sail: its foot short of the water too shallow for her
        if (shoreAt(fromChart(chart, x, z)) + FOOT * size > WADE - 1 || !clear(x, z, size, true)) continue;
        const r: Rock = { x, z, y: seat(x, z, size, SUNK.big), size, yaw: rand() * 2 * Math.PI, big: true, shape: Math.floor(rand() * shapes.big) };
        rocks.push(r);
        masses.push(r);
        n++;
      }
      const boulders = BOULDERS[0] + Math.floor(rand() * (BOULDERS[1] - BOULDERS[0] + 1));
      for (let n = 0, tries = 0; n < boulders && masses.length && tries < boulders * 20; tries++) {
        const m = masses[Math.floor(rand() * masses.length)], size = BOULDER[0] + (BOULDER[1] - BOULDER[0]) * rand() ** 2.5;
        const a = rand() * 2 * Math.PI, out = m.size * (0.9 + 0.5 * rand()) + size + rand() * 4;
        const x = m.x + Math.cos(a) * out, z = m.z + Math.sin(a) * out;
        if (!clear(x, z, size, false) || shoreAt(fromChart(chart, x, z)) + FOOT * size > WADE - 1) continue;
        rocks.push({ x, z, y: seat(x, z, size, SUNK.boulder), size, yaw: rand() * 2 * Math.PI, big: false, shape: Math.floor(rand() * shapes.boulders) });
        n++;
      }
    };
    let crowned = 0;
    const shoulders: [number, number][] = [];
    cells((c, i, j) => {
      if (t.height[c] > TOP * summit && crowned < TOP_OUTCROPS && rand() < TOP_OUTCROP) {
        outcrop(within(i, j), BIG[1]);
        crowned++;
      }
      if (t.shore[c] > HEDGE[0] && t.shore[c] < HEDGE[1]) shoulders.push([i, j]);
    });
    if (shoulders.length > 0 && rand() < COAST_OUTCROP) {
      const [i, j] = shoulders[Math.floor(rand() * shoulders.length)];
      outcrop(within(i, j), BIG[1] * 0.8);
    }

    // ---- palms: one candidate a cell
    const palms: Palm[] = [];
    cells((c, i, j) => {
      if (t.shore[c] - slack > BEACH_TOP) return;
      const p = within(i, j), s = shoreAt(p);
      if (s > BEACH_TOP) return;
      const grove = sat((read(p, 16, 0.5) + 0.5 * read(p, 8, 9.1) - 0.1) / 0.3) ** 2;
      const coastal = Math.exp((s - BEACH_TOP) / INLAND), up = sat(t.height[c] / summit);
      if (rand() > PALM_RATE * grove * (0.12 + 0.88 * coastal) * (1 - smoothstep(PALM_UP[0], PALM_UP[1], up))) return;
      const [x, z] = toChart(chart, p), y = planet.height(p);
      if (y < LOWEST || palms.some((q) => Math.hypot(q.x - x, q.z - z) < SPACING) || onRock(rocks, x, z, 1)) return;
      // out toward the sea: up the shore distance's slope
      const gx = shoreAt(fromChart(chart, x + 1, z)) - s, gz = shoreAt(fromChart(chart, x, z + 1)) - s;
      palms.push({
        x, z, y: y - 0.2,
        height: 7 + rand() * 6,
        lean: 0.06 + (0.1 + 0.35 * coastal) * rand(),
        heading: Math.atan2(gz, gx) + (rand() * 2 - 1) * 0.7,
      });
    });

    // ---- shrubs: two candidates a cell
    const shrubs: Shrub[] = [];
    cells((c, i, j) => {
      if (t.shore[c] - slack > HEDGE[1]) return;
      for (let n = 0; n < 2; n++) {
        const p = within(i, j), s = shoreAt(p);
        if (s > HEDGE[1]) continue;
        // the hedge, broken into stretches; inland, clumps where the noise says, kept where the grass grows
        const hedge = s > HEDGE[0] ? sat((read(p, 14, 3.3) + 0.2) / 0.3) : 0;
        const clump = sat((read(p, 10, 5.5) - 0.05) / 0.25) * 0.6;
        if (rand() > SHRUB_RATE * Math.max(hedge, clump)) continue;
        const y = planet.sample(p, cover);
        if (y < 0.6 || cover.rubble > BARE || (hedge < clump && rand() > 0.2 + 0.8 * cover.grass)) continue;
        const up = sat(y / summit), size = (1.8 + 3.2 * rand() ** 2) * (1 - 0.45 * up);
        const [x, z] = toChart(chart, p);
        if (shrubs.some((b) => Math.hypot(b.x - x, b.z - z) < (b.size + size) * 0.35) || onRock(rocks, x, z, size * 0.3)) continue;
        if (palms.some((q) => Math.hypot(q.x - x, q.z - z) < 0.6 + size * 0.3)) continue;
        shrubs.push({ x, z, y, size, yaw: rand() * 2 * Math.PI, shape: Math.floor(rand() * shapes.shrubs), tint: rand() });
      }
    });

    if (palms.length + shrubs.length + rocks.length > 0) tiles.push({ chart, reach, top, palms, shrubs, rocks });
  }
  return tiles;
}
