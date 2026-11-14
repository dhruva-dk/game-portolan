// Where things stand on an island (planet-islands.ts), worked out flat on its chart: x and z metres from its centre,
// over its ground there (planet.ts, read through the chart). Pure arithmetic, so it runs in node for the tests.
//
// How many of each follows the island's area (its mean coast radius squared), at the densities of a 70 m island.
//
// Shrubs: beach shrubs in a broken hedge along the top of the beach, where the spray lets nothing taller grow, and
// in clumps under the palms. Most waist- to chest-high, a few taller.
//
// Litter: fallen fronds and leaves lie under the palms and round the shrubs, thinning out past their crowns.
//
// Palms: coconut palms in small groves of a few, thickest along the top of the beach where the nuts wash up and take root, thinning
// inland. They lean out toward the sea and the open light, the nearer the coast the more; the lean recurves upward.
//
// Rocks: outcrops of weathered rock: big masses, 5–12 m across, heaped against each other into piles 10–25 m long, on
// the island's shoulders above the beach and at the waterline, where the sand has been washed off the rock beneath —
// some of the waterline's out in the shallows, but never past the water too shallow for a ship (planet-islands.ts
// WADE), so no rock stands where a ship could sail through it — and heaped on its offshore rocks; sunk in the sand;
// and smaller boulders round them. None stand in a palm's or a shrub's place.

import { createNoise3 } from './noise3.ts';
import { WADE, type IslandSite } from './planet-islands.ts';
import { hash, random } from './random.ts';
import { fromChart, type Vec3 } from './sphere.ts';

/** An island and its ground on its chart: metres above the sea at (x, z). */
export interface Isle {
  site: IslandSite;
  height(x: number, z: number): number;
}

/** The island `site` with the ground `height` (planet.height: metres above the sea at a direction) on its chart. */
export const isle = (site: IslandSite, height: (p: Vec3) => number): Isle =>
  ({ site, height: (x, z) => height(fromChart(site.chart, x, z)) });

export interface Rock {
  x: number;
  /** The rock's centre's height: the ground's under it, less how deep it is sunk. */
  y: number;
  z: number;
  /** Its radius, metres, before its shape's own stretching. */
  size: number;
  /** Turned about the vertical, radians. */
  yaw: number;
  /** One of the big masses (else a boulder round them). */
  big: boolean;
  /** Which of its kind's shapes it is. */
  shape: number;
}

/** A 70 m island's counts, scaled for each island by its area. */
const REFERENCE_RADIUS = 70;
const perArea = (site: IslandSite, count: number) => Math.max(1, Math.round(count * (site.radius / REFERENCE_RADIUS) ** 2));

/** Outcrops: one per this many metres of coast, at least one. */
const COAST_PER_OUTCROP = 55;
/** Big masses' radii, metres (5–12 m across); per outcrop, how many, heaped against each other. */
const BIG = [2.5, 6] as const, BIG_COUNT = [4, 7] as const;
/** How far apart two masses' centres may come, as a share of their radii's sum: they overlap into one heap. */
const HEAPED = 0.6;
/** Boulders' radii, metres, most small; per outcrop, how many. */
const BOULDER = [0.3, 1.6] as const, BOULDERS = [3, 7] as const;
/** Where outcrops lie, metres from the waterline (negative inland): on the shoulders, or at the waterline reaching
 * out into the shallows. */
const SHOULDER = [-14, -5] as const, WATERLINE = [-3, 3] as const, KNOLL = [-4, -1] as const;
/** How far a rock's foot reaches out past its centre, as a share of its radius. */
const FOOT = 0.8;
/** How deep a rock is sunk below the lowest ground under it, as a share of its radius. */
const SUNK = { big: 0.15, boulder: 0.3 };

/** Where on the chart: angle t round the centre, d metres out from the coast there (negative inland). */
const onCoast = (site: IslandSite, t: number, d: number): [number, number] => {
  const r = Math.max(site.coast(t) + d, 0);
  return [Math.cos(t) * r, Math.sin(t) * r];
};

/** Sunk into the ground: its centre `sunk` of its radius below the lowest ground under its footprint. */
const seat = (isle: Isle, x: number, z: number, size: number, sunk: number) => {
  let low = isle.height(x, z);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * 2 * Math.PI;
    low = Math.min(low, isle.height(x + Math.cos(a) * size * 0.7, z + Math.sin(a) * size * 0.7));
  }
  return low - sunk * size;
};

/** bigShapes, boulderShapes: how many shapes each kind of rock comes in. */
export function scatterRocks(isle: Isle, bigShapes: number, boulderShapes: number, seed = 1): Rock[] {
  const { site } = isle;
  const rand = random(hash(seed, 0x726f636b)); // "rock": a stream of its own
  const rocks: Rock[] = [];
  const clear = (x: number, z: number, size: number, big: boolean) =>
    rocks.every((r) => Math.hypot(r.x - x, r.z - z) > (r.size + size) * (r.big && big ? HEAPED : 0.85));
  /** Whether a rock there reaches no farther out than the water too shallow for a ship. */
  const ashore = (x: number, z: number, size: number) => site.shore(x, z) + FOOT * size < WADE - 1;
  // (an atoll's ring is sand and coral: one)
  const outcrops = site.kind === 'atoll' ? 1 : Math.max(1, Math.round((2 * Math.PI * site.radius) / COAST_PER_OUTCROP));
  // the coast's outcrops, then one heaped on each offshore rock but a sea stack (centre, smallest and largest mass)
  const heaps = [
    ...Array.from({ length: outcrops }, (_, o) => ({ centre: ((o + 0.3 + rand() * 0.4) / outcrops) * 2 * Math.PI, at: null as [number, number] | null, most: BIG[1] })),
    ...site.offshore.filter((o) => !o.stack).map((o) => ({ centre: 0, at: [o.x, o.z] as [number, number], most: Math.max(BIG[0], Math.min(BIG[1], o.radius)) })),
  ];
  for (const heap of heaps) {
    // (a rock knoll and an offshore rock are all outcrop: heaped on the crown, out no farther than the waterline's shallows)
    // (on an islet the shoulder comes no farther in than a third of the way to its middle)
    const knoll = site.kind === 'rocks' || heap.at !== null;
    const kind = knoll ? KNOLL : rand() < 0.5 ? SHOULDER : WATERLINE;
    const band = [Math.max(kind[0], -site.radius / 3), Math.max(kind[1], -site.radius / 3 + 1)] as const;
    const masses: Rock[] = [];
    const count = heap.at ? 2 + Math.floor(rand() * 2) : BIG_COUNT[0] + Math.floor(rand() * (BIG_COUNT[1] - BIG_COUNT[0] + 1));
    for (let i = 0, tries = 0; i < count && tries < 60; tries++) {
      // the largest first, at the outcrop's middle; each of the rest heaped against one already there
      const size = BIG[0] + (heap.most - BIG[0]) * (i === 0 ? 0.6 + 0.4 * rand() : rand() ** 0.8);
      let x: number, z: number;
      if (i === 0) [x, z] = heap.at ?? onCoast(site, heap.centre, band[0] + rand() * (band[1] - band[0]));
      else {
        const m = masses[Math.floor(rand() * masses.length)], a = rand() * 2 * Math.PI, out = (m.size + size) * (HEAPED + 0.02 + 0.15 * rand());
        x = m.x + Math.cos(a) * out;
        z = m.z + Math.sin(a) * out;
      }
      const d = site.shore(x, z);
      if (d < SHOULDER[0] - 2 || d > (knoll ? KNOLL[1] + 3 : WATERLINE[1] + 2) || !ashore(x, z, size)) continue;
      if ((i > 0 && Math.hypot(x, z) < size) || !clear(x, z, size, true)) continue;
      const r: Rock = { x, z, y: seat(isle, x, z, size, SUNK.big), size, yaw: rand() * 2 * Math.PI, big: true, shape: Math.floor(rand() * bigShapes) };
      rocks.push(r);
      masses.push(r);
      i++;
    }
    const boulders = BOULDERS[0] + Math.floor(rand() * (BOULDERS[1] - BOULDERS[0] + 1));
    for (let i = 0, tries = 0; i < boulders && masses.length && tries < boulders * 20; tries++) {
      // round the masses' feet, and a little beyond
      const m = masses[Math.floor(rand() * masses.length)];
      const size = BOULDER[0] + (BOULDER[1] - BOULDER[0]) * rand() ** 2.5;
      const a = rand() * 2 * Math.PI, out = m.size * (0.9 + 0.5 * rand()) + size + rand() * 4;
      const x = m.x + Math.cos(a) * out, z = m.z + Math.sin(a) * out;
      if (!clear(x, z, size, false) || !ashore(x, z, size)) continue;
      rocks.push({ x, z, y: seat(isle, x, z, size, SUNK.boulder), size, yaw: rand() * 2 * Math.PI, big: false, shape: Math.floor(rand() * boulderShapes) });
      i++;
    }
  }
  return rocks;
}

/** Whether (x, z) lies within `margin` metres of a rock's footprint. */
const onRock = (rocks: Rock[], x: number, z: number, margin: number) =>
  rocks.some((r) => Math.hypot(r.x - x, r.z - z) < r.size * 1.05 + margin);

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

/** How many palms (on a 70 m island), at least how far apart, metres, and where: from the beach's top to well
 * inland (from the waterline). */
export const PALMS = 20;
/** How many times as many on an atoll. */
const ATOLL_PALMS = 3;
const SPACING = 3.5;
const BEACH_TOP = -4, INNERMOST = -50;

/** Two octaves of noise over the chart, about −1…1. */
const field = (noise: ReturnType<typeof createNoise3>, x: number, z: number, size: number, k: number) =>
  noise.value(x / size, z / size, k) + 0.5 * noise.value((2 * x) / size, (2 * z) / size, k + 17.3);

export function scatterPalms(isle: Isle, rocks: Rock[], seed = 1): Palm[] {
  const { site } = isle;
  if (site.kind === 'rocks' || site.kind === 'mesa') return [];
  const rand = random(seed * 104729 + 3), noise = createNoise3(seed + 71);
  // (an atoll's ring, a narrow strip of its area, thick with them)
  const palms: Palm[] = [], count = perArea(site, PALMS) * (site.kind === 'atoll' ? ATOLL_PALMS : 1);
  for (let tries = 0; palms.length < count && tries < count * 200; tries++) {
    const t = rand() * 2 * Math.PI, [x, z] = onCoast(site, t, BEACH_TOP + rand() * (INNERMOST - BEACH_TOP)), d = site.shore(x, z);
    if (Math.hypot(x, z) < 5 || d > BEACH_TOP) continue;
    // groves, and the beach's top more than inland
    const grove = Math.min(Math.max((field(noise, x, z, 16, 0.5) - 0.2) / 0.3, 0), 1) ** 2;
    const coastal = Math.exp(d / 15);
    if (rand() > grove * (0.25 + 0.75 * coastal)) continue;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < SPACING) || onRock(rocks, x, z, 1) || site.face(x, z)) continue;
    const y = isle.height(x, z);
    if (y < 0.5) continue;
    palms.push({
      x, z, y: y - 0.2,
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

/** How many shrubs (on a 70 m island), and where: the hedge's band, and how far inland they go (from the waterline). */
export const SHRUBS = 50;
const HEDGE = [-14, -5], INMOST_SHRUB = -45;

export function scatterShrubs(isle: Isle, rocks: Rock[], shapes: number, seed = 1): Shrub[] {
  const { site } = isle;
  if (site.kind === 'rocks') return [];
  const rand = random(seed * 15485863 + 5), noise = createNoise3(seed + 83);
  const shrubs: Shrub[] = [], count = perArea(site, SHRUBS);
  for (let tries = 0; shrubs.length < count && tries < count * 200; tries++) {
    const t = rand() * 2 * Math.PI, [x, z] = onCoast(site, t, HEDGE[1] + rand() * (INMOST_SHRUB - HEDGE[1])), d = site.shore(x, z);
    if (Math.hypot(x, z) < 3 || d > HEDGE[1]) continue;
    // the hedge, broken into stretches; inland, clumps where the noise says
    const hedge = d > HEDGE[0] ? Math.min(Math.max((field(noise, x, z, 14, 0.5) + 0.2) / 0.3, 0), 1) : 0;
    const clump = Math.min(Math.max((field(noise, x, z, 10, 5.5) - 0.05) / 0.25, 0), 1) * 0.6;
    if (rand() > Math.max(hedge, clump)) continue;
    const size = 1.8 + 3.2 * rand() ** 2;
    if (shrubs.some((s) => Math.hypot(s.x - x, s.z - z) < (s.size + size) * 0.35) || onRock(rocks, x, z, size * 0.3) || site.face(x, z)) continue;
    const y = isle.height(x, z);
    if (y < 0.6) continue;
    shrubs.push({ x, z, y, size, yaw: rand() * 2 * Math.PI, shape: Math.floor(rand() * shapes), tint: rand() });
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
