// The land and the sea floor, on the CPU: one function, height(x, z), metres above sea level, which everything that
// needs the ground reads — the island's mesh, the water (how deep it is), and later the ships (where they run aground).
//
// One coral island: a low sand cay on a reef. Inland the sand rises in dunes to a few metres; the beach runs down
// at about 1:8 into a lagoon a few metres deep. The lagoon is ringed by the reef's crest, a ridge that comes up to
// within a metre or so of the surface (lower where channels cut it), and beyond the crest the reef's wall falls away
// to the open sea's depths. The coast wanders with the angle round the island; so do the lagoon's width and the crest.
//
// Pure arithmetic: no three, so it runs in node for the tests.

/** A seeded hash of an integer lattice point, 0…1. */
function hash(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, −1…1, with features about one unit apart. */
export function noise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Fractal noise: octaves of value noise, each half the size and height of the last. About −1…1. */
export function fbm(x: number, z: number, seed: number, octaves = 4): number {
  let sum = 0, amp = 0.5, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * f, z * f, seed + o * 101) * amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** The island's shape, in metres. */
export const ISLAND = {
  /** The coast's mean distance from the centre. */
  radius: 70,
  /** The dunes' height far inland. */
  dunes: 3.5,
  /** How far inland the dunes rise: the beach's slope at the waterline is dunes / rise. */
  rise: 25,
  /** The lagoon's mean width, from the waterline to the reef's edge. */
  lagoon: 120,
  /** The lagoon's depth at the reef's edge. */
  lagoonDepth: 5,
  /** The water's depth over the reef's crest, where it is whole. */
  crest: 0.8,
  /** The crest's width, metres. */
  crestWidth: 14,
  /** How far out the reef's wall has fallen most (1 − 1/e) of the way to the deep. */
  wall: 35,
  /** The open sea's depth beyond the wall. */
  deep: 100,
} as const;

export interface Island {
  /** World position of the island's centre, (x, z). */
  centre: [number, number];
  /** How far from the centre the ground is anything but the open sea's floor. */
  reach: number;
  /** The coast's distance from the centre at angle θ (atan2(z, x) about the centre). */
  coast(theta: number): number;
  /** The ground's height above sea level at world (x, z), metres. */
  height(x: number, z: number): number;
  /** 0…1: where the lagoon's floor is patched with sea grass rather than bare sand. */
  patches(x: number, z: number): number;
  /** 0…1: coral and rubble, on the reef's crest and down the top of its wall. */
  reef(x: number, z: number): number;
  /** About −1…1: the sand's large-scale variation, damper and darker or drier and paler. */
  mottle(x: number, z: number): number;
  /**
   * The shallowest water a wave crosses coming in from the open sea to (x, z), not counting (x, z) itself: inside
   * the reef, the crest's depth; outside it, Infinity. (Waves come in from every side: swell bends round an island.)
   */
  passage(x: number, z: number): number;
}

export function createIsland(centre: [number, number], seed = 1): Island {
  // the coast and the lagoon wander with the angle: a few harmonics with random phases, smaller the finer
  const harmonics = [2, 3, 4, 5, 7].map((n, i) => ({ n, a: 0.16 / n ** 0.8, phase: hash(i, 0, seed) * 2 * Math.PI }));
  const reefs = [1, 2, 3, 5].map((n, i) => ({ n, a: 0.14 / n, phase: hash(i, 1, seed) * 2 * Math.PI }));
  const wave = (h: { n: number; a: number; phase: number }[], t: number) => h.reduce((s, { n, a, phase }) => s + a * Math.cos(n * t + phase), 0);
  const coast = (t: number) => ISLAND.radius * (1 + wave(harmonics, t));
  const lagoon = (t: number) => ISLAND.lagoon * (1 + wave(reefs, t));
  // the water over the crest: a metre or so, but channels cut it to the lagoon's depth here and there
  const crestDepth = (t: number) => {
    const channel = smoothstep(0.55, 0.8, noise(Math.cos(t) * 2.5 + 9, Math.sin(t) * 2.5 + 9, seed + 41) * 0.5 + 0.5);
    return ISLAND.crest + (ISLAND.lagoonDepth - ISLAND.crest) * channel;
  };

  const height = (x: number, z: number) => {
    const dx = x - centre[0], dz = z - centre[1];
    const t = Math.atan2(dz, dx);
    // metres out from the waterline (negative inland)
    const d = Math.hypot(dx, dz) - coast(t);
    if (d < 0) {
      const dunes = ISLAND.dunes * (1 - Math.exp(d / ISLAND.rise));
      return dunes + fbm(x / 30, z / 30, seed + 7) * 1.6 * smoothstep(-5, -30, d);
    }
    const L = lagoon(t);
    // the beach carries on down at its own slope, levels into the lagoon, then the reef's wall falls to the deep
    const beach = 1.8 * (1 - Math.exp((-d * ISLAND.dunes) / ISLAND.rise / 1.8));
    // the fore-reef: steep just past the crest (about 60°), easing as it nears the deep
    const out = Math.max(d - L, 0);
    const wall = (ISLAND.deep - ISLAND.lagoonDepth) * (1 - Math.exp(-out / ISLAND.wall)) * smoothstep(0, 6, out);
    const floor = (ISLAND.lagoonDepth - 1.8) * smoothstep(0, L, d) + wall;
    // the crest: a ridge on the lagoon's outer edge, coming up to crestDepth
    const w = ISLAND.crestWidth, top = L - w / 2;
    const ridge = (ISLAND.lagoonDepth - crestDepth(t)) * Math.exp(-(((d - top) / (w / 2)) ** 2));
    const rough = fbm(x / 20, z / 20, seed + 13) * 0.8 * smoothstep(5, 30, d) * (1 - smoothstep(0.5 * w, 0, Math.abs(d - top)) * 0.8);
    return -(beach + floor) + ridge + rough;
  };

  const passage = (x: number, z: number) => {
    const dx = x - centre[0], dz = z - centre[1], t = Math.atan2(dz, dx);
    const d = Math.hypot(dx, dz) - coast(t);
    return d < lagoon(t) - ISLAND.crestWidth / 2 ? crestDepth(t) : Infinity;
  };

  const patches = (x: number, z: number) => smoothstep(0.15, 0.4, fbm(x / 9, z / 9, seed + 29, 4) + fbm(x / 60, z / 60, seed + 31, 2) * 0.5);

  const most = Math.max(...Array.from({ length: 360 }, (_, i) => coast((i / 180) * Math.PI) + lagoon((i / 180) * Math.PI)));
  const mottle = (x: number, z: number) => fbm(x / 12, z / 12, seed + 53, 4) * 1.4;

  const reef = (x: number, z: number) => {
    const dx = x - centre[0], dz = z - centre[1], t = Math.atan2(dz, dx);
    const d = Math.hypot(dx, dz) - coast(t), L = lagoon(t), w = ISLAND.crestWidth;
    const band = smoothstep(L - 2.5 * w, L - w, d) * (1 - smoothstep(L + 20, L + 45, d));
    return band * smoothstep(-0.25, 0.15, fbm(x / 6, z / 6, seed + 61, 4));
  };

  return { centre, reach: most + ISLAND.wall * 4, coast, height, patches, reef, passage, mottle };
}
