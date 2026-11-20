// The planet's ground: one function of direction, metres above sea level, seeded and the same every time; what lies on
// it; where land can stand, where she starts and where the land's heart is. The terrain makes it (planet-terrain.ts).
//
// Pure arithmetic: no three, so it runs in node for the tests.

import type { Vec3 } from './sphere.ts';

/** Metres off the coast she lies at the start. */
export const START = 80;

export interface Cover {
  /** 0…1: sea grass patches. */
  grass: number;
  /** 0…1: rock and coral rubble. */
  rubble: number;
  /** 0…1: the sand's large-scale mottling, damp and dark (0) to dry and pale (1). */
  mottle: number;
  /** 0…1: fine lumpy noise, features a couple of metres across, that breaks the grass into clumps. */
  clump: number;
}

/** Where the land can stand above the sea: within `reach` m of `at` (a unit vector), no higher than `top` m. */
export interface Rise { at: Vec3; reach: number; top: number }

export interface Planet {
  /** Where land can stand above the sea, for the sights (sim/sight.ts): wherever there is land, a rise holds it. */
  rises: Rise[];
  /** Where her ship lies at the start: on the water START metres off a coast, heading (bearing, radians clockwise from
   *  north) toward the land. */
  start: { at: Vec3; bearing: number };
  /** The land's heart, a unit vector: its point farthest in from the coast a quarter of the way round the planet or
   *  more from the start, where no ship comes (world/sun.ts hides the sun's one undefined point there). */
  heart: Vec3;
  /** Metres above sea level at direction p (negative under water). */
  height(p: Vec3): number;
  /** What lies on the ground at direction p. */
  cover(p: Vec3): Cover;
  /** Both at once: the height, and what lies there written into `cover`. */
  sample(p: Vec3, cover: Cover): number;
}

/**
 * The planet baked onto the six cube faces (sphere.ts faceDir), n × n nodes each from corner to corner (so
 * neighbouring faces share their edge nodes), row j at v = 2j/(n−1) − 1, column i at u likewise: heights in
 * metres, and cover as RGBA8 (grass, rubble, mottle, clump).
 */
export function bakeFaces(planet: Planet, n: number): { height: Float32Array[]; cover: Uint8Array[] } {
  const height: Float32Array[] = [], cover: Uint8Array[] = [];
  // faceDir's arithmetic, without its allocations: the gnomonic coordinates of each row and column
  const t = Float64Array.from({ length: n }, (_, i) => Math.tan(((2 * i) / (n - 1) - 1) * (Math.PI / 4)));
  const p: [number, number, number] = [0, 0, 0], cv: Cover = { grass: 0, rubble: 0, mottle: 0, clump: 0 };
  for (let face = 0; face < 6; face++) {
    const h = new Float32Array(n * n), c = new Uint8Array(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gu = t[i], gv = t[j];
      if (face === 0) { p[0] = 1; p[1] = gv; p[2] = -gu; }
      else if (face === 1) { p[0] = -1; p[1] = gv; p[2] = gu; }
      else if (face === 2) { p[0] = gu; p[1] = 1; p[2] = -gv; }
      else if (face === 3) { p[0] = gu; p[1] = -1; p[2] = gv; }
      else if (face === 4) { p[0] = gu; p[1] = gv; p[2] = 1; }
      else { p[0] = -gu; p[1] = gv; p[2] = -1; }
      const l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      p[0] /= l; p[1] /= l; p[2] /= l;
      const k = j * n + i;
      h[k] = planet.sample(p, cv);
      c[k * 4] = Math.round(cv.grass * 255);
      c[k * 4 + 1] = Math.round(cv.rubble * 255);
      c[k * 4 + 2] = Math.round(cv.mottle * 255);
      c[k * 4 + 3] = Math.round(cv.clump * 255);
    }
    height.push(h);
    cover.push(c);
  }
  return { height, cover };
}
