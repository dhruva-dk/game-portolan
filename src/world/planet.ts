// The whole planet's ground: one function of direction, metres above sea level, seeded and the same every time.
//
// Most of the planet is a shallow bank of pale sand, 3–15 m down, rising and falling broadly, crossed in stretches
// by long sand waves, and everywhere by small ripples. Deep channels wind between the banks and open here and
// there into basins, 30–60 m down: the channels follow the zero line of a noise field (so they join up into a
// network rather than lying about as specks), their width measured in metres by the field's own gradient, wider
// where they are deeper; their sides fall over tens of metres. Islands (planet-islands.ts) stand on the shallowest
// banks, clear of the deeps.
//
// Every field reads 3D noise at the point's position in metres (direction × R), so there are no seams or poles,
// and sizes are metres whatever R is; how many islands there are follows the planet's area.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { R, distance, type Vec3 } from './sphere.ts';
import { createNoise3 } from './noise3.ts';
import { charter, placeIslands, type IslandSite } from './planet-islands.ts';
import { random } from './random.ts';

export type { IslandSite } from './planet-islands.ts';

/** The sea floor, metres. */
export const SEA = {
  /** The banks' depth, shallowest to deepest, and how broad their rises and falls. */
  bank: { depth: [3, 15], size: 380 },
  /** Long sand waves: how far apart the bands' bends are, how many bands across one, how high. */
  sandWaves: { size: 260, bands: 5, height: 0.7 },
  /** Small ripples of relief on every floor under water, not on the beaches. */
  ripples: { size: 14, height: 0.25 },
  /** The channels: how far apart they wind, their floor's mean half-width, and how wide each side's fall is. */
  channel: { size: 520, half: 4, side: 80 },
  /** How far the deeps' edges wander in and out along their length, metres (by the banks' finer swell). */
  ragged: 20,
  /** How deep the deeps are, shallowest to deepest, and how broad their changes. */
  deep: { depth: [32, 58], size: 600 },
  /** The basins: where the deeps' field is deepest (its noise above this), and their sides. */
  basin: { above: 0.42, side: 80 },
  /** How smoothly an island's flank meets the bank, metres. */
  meet: 1.5,
} as const;

/**
 * The planet the game opens on: one whose largest island lies in the tropics, lit all day by the solstice's sun
 * (environment.ts), where the first seed's lies in the polar night.
 */
export const SEED = 3;

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

export interface Planet {
  islands: IslandSite[];
  /** Metres above sea level at direction p (negative under water). */
  height(p: Vec3): number;
  /** What lies on the ground at direction p. */
  cover(p: Vec3): Cover;
  /** Both at once: the height, and what lies there written into `cover`. */
  sample(p: Vec3, cover: Cover): number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const sat = (x: number) => Math.min(Math.max(x, 0), 1);
/** The larger of a and b, rounded over within k of each other. */
const smax = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
/** p as a unit vector, itself if it already is one. */
const unit = (p: Vec3): Vec3 => {
  const l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  return Math.abs(l - 1) < 1e-12 ? p : [p[0] / l, p[1] / l, p[2] / l];
};

/** The clumps' noise's feature size, metres: about two baked texels (ground.ts bakes 1.1 m texels). */
const CLUMP = 2.6;

/** Rubble round an island's foot thins out between these distances from its coast, metres. */
const FOOT = [15, 35] as const;

/** Cells along each cube face's edge, for finding the islands near a point. */
const CELLS = 32;

/** The unit vector at gnomonic (gu, gv), −1…1, on a cube face (sphere.ts faceDir's faces, without the angles). */
const gnomonic = (face: number, gu: number, gv: number): Vec3 =>
  unit(([[1, gv, -gu], [-1, gv, gu], [gu, 1, -gv], [gu, -1, gv], [gu, gv, 1], [-gu, gv, -1]] as Vec3[])[face]);

/** The cell (of CELLS a side on each cube face, gnomonic) unit direction (x, y, z) lies in. */
function cellOf(x: number, y: number, z: number): number {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let face: number, gu: number, gv: number;
  if (ax >= ay && ax >= az) [face, gu, gv] = [x >= 0 ? 0 : 1, (x >= 0 ? -z : z) / ax, y / ax];
  else if (ay >= az) [face, gu, gv] = [y >= 0 ? 2 : 3, x / ay, (y >= 0 ? -z : z) / ay];
  else [face, gu, gv] = [z >= 0 ? 4 : 5, (z >= 0 ? x : -x) / az, y / az];
  const at = (g: number) => Math.min(CELLS - 1, Math.max(0, Math.floor(((g + 1) / 2) * CELLS)));
  return (face * CELLS + at(gv)) * CELLS + at(gu);
}

/** What the sea floor's fields give at a point before any island. */
interface Floor { height: number; depth: number; deep: number; clearance: number }

export function createPlanet(seed: number): Planet {
  const noise = createNoise3(seed);
  const rand = random(seed * 92821 + 13);
  // each field reads the noise from its own place in it
  const shift = () => [rand() * 256, rand() * 256, rand() * 256] as const;
  const at = { bank: shift(), bank2: shift(), sand: shift(), ripple: shift(), channel: shift(), channel2: shift(), deep: shift(), grass: shift(), grass2: shift(), rubble: shift(), rubble2: shift(), mottle: shift(), clump: shift() };
  type At = readonly [number, number, number];
  // the point being worked on: its direction, and its position in metres from the centre (direction × R)
  let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
  const read = (size: number, o: At) => noise.value(qx / size + o[0], qy / size + o[1], qz / size + o[2]);
  const g = new Float64Array(3), g2 = new Float64Array(3);
  /** The noise's value at the last toLevel. */
  let level = 0;
  /**
   * Metres from the point to where noise of `size` crosses `level`, by its value over its gradient along the
   * surface (kept from vanishing); signed, positive above the level. Two octaves if `fine`.
   */
  const toLevel = (size: number, o: At, to: number, fine: At | null) => {
    let v = noise.withGradient(qx / size + o[0], qy / size + o[1], qz / size + o[2], g);
    if (fine) {
      v += 0.5 * noise.withGradient((2 * qx) / size + fine[0], (2 * qy) / size + fine[1], (2 * qz) / size + fine[2], g2);
      for (let i = 0; i < 3; i++) g[i] += g2[i];
    }
    const radial = g[0] * px + g[1] * py + g[2] * pz;
    const slope = Math.sqrt(Math.max(g[0] * g[0] + g[1] * g[1] + g[2] * g[2] - radial * radial, 0) + 0.36);
    level = v;
    return ((v - to) * size) / slope;
  };

  const f: Floor = { height: 0, depth: 0, deep: 0, clearance: 0 };
  /** The sea floor at unit direction p, before any island, into f. */
  const floor = (p: Vec3) => {
    px = p[0]; py = p[1]; pz = p[2];
    qx = px * R; qy = py * R; qz = pz * R;
    const { bank, sandWaves, channel, basin, deep } = SEA;
    const fine = read(bank.size / 2, at.bank2);
    const bankDepth = bank.depth[0] + (bank.depth[1] - bank.depth[0]) * sat(0.5 + 0.75 * (read(bank.size, at.bank) + 0.5 * fine));
    // the deeps: deeper where they are wider, and deepest in the basins
    const toBasin = -toLevel(deep.size, at.deep, basin.above, null) + SEA.ragged * fine;
    const deepness = sat(0.5 + 1.2 * level);
    const deepDepth = deep.depth[0] + (deep.depth[1] - deep.depth[0]) * deepness;
    // the channels' floor about the zero line, its sides beyond
    const toChannel = Math.abs(toLevel(channel.size, at.channel, 0, at.channel2)) - channel.half * (0.4 + 1.2 * deepness) + SEA.ragged * fine;
    const deepShare = Math.max(1 - smoothstep(0, channel.side, toChannel), 1 - smoothstep(0, basin.side, toBasin));
    f.depth = bankDepth + (deepDepth - bankDepth) * deepShare;
    // the sand waves, in stretches (where the banks' finer swell is up), none in the deeps
    const stretch = sat(0.5 + 2 * fine) * (1 - deepShare);
    const waves = stretch > 0 ? sandWaves.height * stretch * Math.sin(2 * Math.PI * sandWaves.bands * read(sandWaves.size, at.sand)) : 0;
    f.height = waves - f.depth;
    f.deep = deepShare;
    f.clearance = Math.min(toChannel - channel.side, toBasin - basin.side);
    return f;
  };

  const islands = placeIslands((p) => floor(unit(p)), noise, seed, SEA.deep.depth[1] + SEA.meet);
  const near = islands.map((s) => Math.cos(s.reach / R)), charts = islands.map((s) => charter(s.chart));
  /** Within this of an island's centre (as a dot product), the rubble round its foot. */
  const feet = islands.map((s) => Math.cos((s.shelf + FOOT[1]) / R));
  /** For each cell of the cube's faces, the islands whose reach comes into it. */
  const nearby = Array.from({ length: 6 * CELLS * CELLS }, (_, c) => {
    const face = Math.floor(c / (CELLS * CELLS)), j = Math.floor(c / CELLS) % CELLS, i = c % CELLS;
    const g = (k: number) => (2 * k) / CELLS - 1;
    const centre = gnomonic(face, g(i + 0.5), g(j + 0.5));
    const corner = Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => distance(centre, gnomonic(face, g(i + a), g(j + b)))));
    return islands.flatMap((s, k) => (distance(centre, s.chart.at) < s.reach + corner ? [k] : []));
  });
  const xzr = new Float64Array(3);

  /** The ground at unit direction p, and (if `cover`) what lies on it. */
  const ground = (p: Vec3, cover: Cover | null): number => {
    floor(p);
    let h = f.height, shore = Infinity;
    for (const i of nearby[cellOf(px, py, pz)]) {
      const s = islands[i], c = s.chart.at;
      const d = px * c[0] + py * c[1] + pz * c[2];
      if (d < near[i]) continue;
      // (where the mound is surely below the floor, the floor is the ground: known from how far out, before the chart)
      const below = s.ceiling(Math.acos(Math.min(d, 1)) * R) < h - SEA.meet;
      if (below && !(cover && d > feet[i])) continue;
      charts[i](p, xzr);
      const x = xzr[0], z = xzr[1], r = xzr[2];
      if (!below) h += (smax(h, s.mound(x, z), SEA.meet) - h) * smoothstep(s.reach, s.reach * 0.8, r);
      if (cover && r < s.shelf + FOOT[1]) shore = Math.min(shore, r - s.coast(Math.atan2(z, x)));
    }
    const depth = -h;
    if (depth > 0.5) h += SEA.ripples.height * read(SEA.ripples.size, at.ripple) * smoothstep(0.5, 3, depth);
    if (cover) {
      const where = smoothstep(1.5, 3, depth) * (1 - smoothstep(14, 22, depth)) * (1 - f.deep);
      cover.grass = where > 0 ? where * smoothstep(0.1, 0.35, read(9, at.grass) + 0.5 * read(60, at.grass2)) : 0;
      // rubble on the deeps' shoulders, round the islands' feet past the beach, and scattered over the banks
      const shoulder = smoothstep(0.02, 0.15, f.deep) * (1 - smoothstep(0.35, 0.6, f.deep));
      const foot = smoothstep(2, 5, shore) * (1 - smoothstep(FOOT[0], FOOT[1], shore));
      const rubble = Math.max(shoulder, foot, smoothstep(0.45, 0.65, read(30, at.rubble2))) * smoothstep(0, 0.5, depth);
      cover.rubble = rubble > 0 ? rubble * smoothstep(-0.1, 0.25, read(7, at.rubble)) : 0;
      cover.mottle = sat(0.5 + 1.1 * read(12, at.mottle));
      cover.clump = sat(0.5 + 0.9 * read(CLUMP, at.clump));
    }
    return h;
  };

  return {
    islands,
    height: (p) => ground(unit(p), null),
    cover: (p) => {
      const c: Cover = { grass: 0, rubble: 0, mottle: 0, clump: 0 };
      ground(unit(p), c);
      return c;
    },
    sample: (p, cover) => ground(unit(p), cover),
  };
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
