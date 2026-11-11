// Where things stand on the island: pure arithmetic over terrain.ts, so it runs in node for the tests.
//
// Shrubs: beach shrubs in a broken hedge along the top of the beach, where the spray lets nothing taller grow, and
// in clumps under the palms. Most waist- to chest-high, a few taller.
//
// Litter: fallen fronds and leaves lie under the palms and round the shrubs, thinning out past their crowns.
//
// Palms: coconut palms in groves, thickest along the top of the beach where the nuts wash up and take root, thinning
// inland. They lean out toward the sea and the open light, the nearer the coast the more; the lean recurves upward.
//
// Rocks: outcrops of beach rock along stretches of the coast, from a few metres inland to a few out, where the sand
// has been washed off the reef rock beneath. Each outcrop a cluster: a few large blocks with many small ones round
// them, sunk into the sand by a third of their height.

import { random } from './random.ts';
import { fbm, type Island } from './terrain.ts';

export interface Rock {
  x: number;
  /** The rock's centre's height: the ground's under it, less how deep it is sunk. */
  y: number;
  z: number;
  /** Its radius, metres, before its shape's own stretching. */
  size: number;
  /** Turned about the vertical, radians. */
  yaw: number;
  /** Which of the shapes it is. */
  shape: number;
}

/** How many outcrops, and the rocks in each. */
const OUTCROPS = 7;
const PER_OUTCROP = [5, 14];
/** Rock radii, metres: most small, a few large. */
const SMALLEST = 0.3, LARGEST = 4.5;
/** How far from the waterline the rocks lie, metres (negative inland). */
const INLAND = -4, OUT = 5;
/** How deep a rock is sunk, as a share of its radius. */
const SUNK = 0.35;

export function scatterRocks(island: Island, shapes: number, seed = 1): Rock[] {
  const rand = random(seed * 7919 + 17);
  const rocks: Rock[] = [];
  const clear = (x: number, z: number, size: number) =>
    rocks.every((r) => Math.hypot(r.x - x, r.z - z) > (r.size + size) * 0.8);
  for (let o = 0; o < OUTCROPS; o++) {
    const centre = rand() * 2 * Math.PI, d0 = INLAND + rand() * (OUT - INLAND);
    const count = PER_OUTCROP[0] + Math.floor(rand() * (PER_OUTCROP[1] - PER_OUTCROP[0]));
    for (let i = 0, tries = 0; i < count && tries < count * 20; tries++) {
      // the largest near the outcrop's middle, smaller ones spread along the coast round them
      const big = i < 3, u = rand();
      const size = big ? LARGEST * (0.5 + 0.5 * rand()) : SMALLEST + (LARGEST * 0.5 - SMALLEST) * u ** 3;
      const along = (rand() * 2 - 1) * (big ? 6 : 16), across = d0 + (rand() * 2 - 1) * (big ? 1.5 : 4);
      const d = Math.min(Math.max(across, INLAND), OUT);
      const t = centre + along / island.coast(centre);
      const r = island.coast(t) + d;
      const x = island.centre[0] + Math.cos(t) * r, z = island.centre[1] + Math.sin(t) * r;
      if (!clear(x, z, size)) continue;
      rocks.push({ x, z, y: island.height(x, z) - SUNK * size, size, yaw: rand() * 2 * Math.PI, shape: Math.floor(rand() * shapes) });
      i++;
    }
  }
  return rocks;
}

export interface Palm {
  x: number;
  /** The trunk's foot: the ground's height, less a little where it is sunk. */
  y: number;
  z: number;
  /** Metres from the foot to the crown. */
  height: number;
  /** How far the trunk leans at its foot, radians from the vertical. */
  lean: number;
  /** Which way it leans, radians about the vertical (atan2(z, x)). */
  heading: number;
}

/** How many palms, at least how far apart, metres, and where: from the beach's top to well inland (from the waterline). */
const PALMS = 60;
const SPACING = 3.5;
const BEACH_TOP = -4, INNERMOST = -50;

export function scatterPalms(island: Island, seed = 1): Palm[] {
  const rand = random(seed * 104729 + 3);
  const palms: Palm[] = [];
  for (let tries = 0; palms.length < PALMS && tries < PALMS * 200; tries++) {
    const t = rand() * 2 * Math.PI, d = BEACH_TOP + rand() * (INNERMOST - BEACH_TOP);
    const r = island.coast(t) + d;
    if (r < 5) continue;
    const x = island.centre[0] + Math.cos(t) * r, z = island.centre[1] + Math.sin(t) * r;
    // groves, and the beach's top more than inland
    const grove = Math.min(Math.max((fbm(x / 28, z / 28, seed + 71, 3) - 0.02) / 0.25, 0), 1) ** 2;
    const coastal = Math.exp(d / 15);
    if (rand() > grove * (0.25 + 0.75 * coastal)) continue;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < SPACING)) continue;
    palms.push({
      x, z, y: island.height(x, z) - 0.2,
      height: 7 + rand() * 6,
      lean: 0.06 + (0.1 + 0.35 * coastal) * rand(),
      heading: t + (rand() * 2 - 1) * 0.7,
    });
  }
  return palms;
}

export interface Shrub {
  x: number;
  y: number;
  z: number;
  /** Across, metres. */
  size: number;
  yaw: number;
  /** Which of the shapes it is. */
  shape: number;
  /** 0…1: a little paler or darker than the rest. */
  tint: number;
}

/** How many shrubs, at least how far apart (by their sizes), and where: the hedge's band, and how far inland they go. */
const SHRUBS = 120;
const HEDGE = [-14, -5], INMOST_SHRUB = -45;

export function scatterShrubs(island: Island, shapes: number, seed = 1): Shrub[] {
  const rand = random(seed * 15485863 + 5);
  const shrubs: Shrub[] = [];
  for (let tries = 0; shrubs.length < SHRUBS && tries < SHRUBS * 200; tries++) {
    const t = rand() * 2 * Math.PI, d = HEDGE[1] + rand() * (INMOST_SHRUB - HEDGE[1]);
    const r = island.coast(t) + d;
    if (r < 3) continue;
    const x = island.centre[0] + Math.cos(t) * r, z = island.centre[1] + Math.sin(t) * r;
    // the hedge, broken into stretches; inland, clumps where the noise says
    const hedge = d > HEDGE[0] ? Math.min(Math.max((fbm(x / 14, z / 14, seed + 83, 2) + 0.25) / 0.3, 0), 1) : 0;
    const clump = Math.min(Math.max((fbm(x / 10, z / 10, seed + 89, 3) - 0.1) / 0.2, 0), 1) * 0.6;
    if (rand() > Math.max(hedge, clump)) continue;
    const size = 1.8 + 3.2 * rand() ** 2;
    if (shrubs.some((s) => Math.hypot(s.x - x, s.z - z) < (s.size + size) * 0.35)) continue;
    shrubs.push({ x, z, y: island.height(x, z), size, yaw: rand() * 2 * Math.PI, shape: Math.floor(rand() * shapes), tint: rand() });
  }
  return shrubs;
}

/** How far past a palm's foot its litter reaches (about its crown's reach), and past a shrub's middle (by its size). */
const PALM_LITTER = 4.5, SHRUB_LITTER = 0.4;

/** 0…1: how thickly litter covers the ground at (x, z). */
export function litter(palms: Palm[], shrubs: Shrub[]): (x: number, z: number) => number {
  const spots = [
    ...palms.map((p) => ({ x: p.x, z: p.z, r: PALM_LITTER })),
    ...shrubs.map((s) => ({ x: s.x, z: s.z, r: s.size * SHRUB_LITTER })),
  ];
  return (x, z) => {
    let sum = 0;
    for (const s of spots) {
      const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d2 < 9 * s.r * s.r) sum += Math.exp(-d2 / (2 * s.r * s.r));
    }
    return Math.min(sum, 1);
  };
}
