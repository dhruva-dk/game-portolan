// Where things stand on the island: pure arithmetic over terrain.ts, so it runs in node for the tests.
//
// Rocks: outcrops of beach rock along stretches of the coast, from a few metres inland to a few out, where the sand
// has been washed off the reef rock beneath. Each outcrop a cluster: a few large blocks with many small ones round
// them, sunk into the sand by a third of their height.

import type { Island } from './terrain';

/** A seeded generator, 0…1 (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
