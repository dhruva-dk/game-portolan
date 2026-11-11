// The planet's islands: sand mounds rising from the shallowest parts of the banks, each worked out flat on its own
// chart (sphere.ts) and laid into the sea floor by planet.ts.
//
// An island: a wandering coast; a beach at about 1:8 at the waterline, easing inland into a berm and seaward into a
// shallow apron a metre or two deep; inland a dome to 5–12 m with one or two lesser mounds (saddles between them)
// and fine dune relief. Past the apron its flank falls gently to the depth of the banks islands stand on, then
// steeply on past the deepest floor (it meets the bank's floor wherever it gets there first), so by its reach it is
// below every floor and the sea floor there is the bank's alone.
//
// Where they lie: as many as the planet's area holds at ISLANDS.density, each on the shallowest bank that is clear
// of deep water and far enough from the others; the largest placed first, as they need the most room.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { R, add, cross, distance, frameAt, scale, type Chart, type Vec3 } from './sphere.ts';
import { random } from './scatter.ts';
import type { Noise3 } from './noise3.ts';

export const ISLANDS = {
  /** Islands per square metre of the planet (about 8 at R = 554). */
  density: 2e-6,
  /** Mean coast radii, metres. */
  radius: [20, 70],
  /** Summits, metres, for the smallest and the largest islands (each varied a little round its own). */
  summit: [5, 11],
  /** The beach's slope at the waterline, both sides. */
  beach: 1 / 8,
  /** How high the berm behind the beach rises, metres (it rises at `beach` and levels at this). */
  berm: [1.2, 2],
  /** The apron's depth, metres (the beach runs down at `beach` and levels at this). */
  apron: [1.2, 2.2],
  /** The apron's width as a share of the radius, before it wanders. */
  apronWidth: [0.45, 0.8],
  /** How far the apron's edge wanders in lobes and bays, as a share of its width, and the lobes' size as a share of the radius. */
  lobes: { depth: 0.4, size: 0.7 },
  /** The flank's slope past the apron, down to the bank. */
  flank: 0.14,
  /** How far the flank eases into its slope, metres. */
  flankEase: 8,
  /** Fine dune relief inland, metres high and across. */
  dunes: { height: 0.45, size: 9 },
  /** At least this much clear water between islands' aprons, metres. */
  gap: 160,
  /** At least this far from the coast to the deep's edge, metres, beyond the apron. */
  clearance: 30,
  /** How deep the bank under an island may be at most, metres: the flank falls gently this far. */
  floor: 17,
  /** The flank's slope below `floor`. */
  steep: 0.6,
} as const;

/** A lesser mound on an island: where on its chart, how wide (Gaussian σ) and how high, metres. */
interface Mound { x: number; z: number; sigma: number; height: number }

export interface IslandSite {
  /** The island's chart: `at` its centre, `axis` its x. */
  chart: Chart;
  /** The coast's mean distance from the centre, metres. */
  radius: number;
  /** How far from the centre the apron reaches at most, metres. */
  shelf: number;
  /** How far from the centre the island touches the sea floor at all, metres. */
  reach: number;
  /** Its highest point, metres. */
  summit: number;
  /** The coast's distance from the centre at angle θ (atan2(z, x) on the chart). */
  coast(theta: number): number;
  /** The island's own ground at chart (x, z), before the bank: metres above the sea, falling without end past the apron. */
  mound(x: number, z: number): number;
  /** The highest the mound can be r metres from the centre (+Infinity within the apron's farthest reach). */
  ceiling(r: number): number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Harmonic = { n: number; a: number; phase: number };
const harmonics = (rand: () => number, orders: number[], size: number, fall: number): Harmonic[] =>
  orders.map((n) => ({ n, a: size / n ** fall, phase: rand() * 2 * Math.PI }));
const wave = (h: Harmonic[], t: number) => {
  let s = 0;
  for (let i = 0; i < h.length; i++) s += h[i].a * Math.cos(h[i].n * t + h[i].phase);
  return s;
};

/** One island on `chart`, its coast `radius` metres out on average; no sea floor is deeper than `deepest` metres. */
export function createIslandSite(chart: Chart, radius: number, noise: Noise3, seed: number, deepest: number): IslandSite {
  const rand = random(seed * 7919 + 101);
  const I = ISLANDS;
  const size = (radius - I.radius[0]) / (I.radius[1] - I.radius[0]);
  // the coast and the apron wander with the angle: a few harmonics with random phases, smaller the finer
  const shore = harmonics(rand, [2, 3, 4, 5, 7], 0.16, 0.8);
  const shelf = harmonics(rand, [1, 2, 3, 5], 0.3, 1);
  const coast = (t: number) => radius * (1 + wave(shore, t));
  const berm = lerp(I.berm[0], I.berm[1], rand()), apron = lerp(I.apron[0], I.apron[1], rand());
  const width = radius * lerp(I.apronWidth[0], I.apronWidth[1], rand());
  const apronWidth = (t: number) => width * (1 + wave(shelf, t));
  // the dome makes up the summit with the berm; one or two lesser mounds off the centre, a saddle between (all
  // scaled by `relief` once measured, to bring the summit to its target)
  const target = Math.max(I.summit[0], lerp(I.summit[0], I.summit[1], size) * lerp(0.9, 1.1, rand()));
  const dome = target - berm;
  let relief = 1;
  const mounds: Mound[] = Array.from({ length: 1 + Math.floor(rand() * 2) }, () => {
    const t = rand() * 2 * Math.PI, at = lerp(0.35, 0.6, rand()) * coast(t);
    return { x: Math.cos(t) * at, z: Math.sin(t) * at, sigma: radius * lerp(0.2, 0.32, rand()), height: dome * lerp(0.35, 0.65, rand()) };
  });
  const dunesAt: Vec3 = [rand() * 256, rand() * 256, rand() * 256];

  /** The depth of the flank `past` metres beyond the apron, below the beach's `beach`. */
  const flankDepth = (beach: number, past: number) => {
    const e = I.flankEase, fall = past <= 0 ? 0 : past < e ? (past * past) / (2 * e) : past - e / 2;
    const depth = beach + I.flank * fall;
    return depth <= I.floor ? depth : I.floor + (depth - I.floor) * (I.steep / I.flank);
  };

  const mound = (x: number, z: number) => {
    const r = Math.hypot(x, z), t = Math.atan2(z, x), c = coast(t);
    const d = r - c;
    if (d >= 0) {
      // the beach runs on down and levels into the apron; past the apron the flank falls, easing in
      const beach = apron * (1 - Math.exp(-(d * I.beach) / apron));
      const l = I.lobes.size * radius, lobes = I.lobes.depth * width * noise.value(x / l + dunesAt[2], z / l + dunesAt[0], dunesAt[1]);
      const past = d - apronWidth(t) - lobes;
      return -flankDepth(beach, past);
    }
    const rho = r / c, inside = (1 - rho * rho) ** 2;
    // the berm: up at the beach's slope from the waterline; at the centre (where the coast's angle means nothing) level
    const level = 1 - Math.exp((d * I.beach) / berm) * smoothstep(0, 0.5, rho);
    let raised = dome;
    for (const m of mounds) raised += m.height * Math.exp(-((x - m.x) ** 2 + (z - m.z) ** 2) / (m.sigma * m.sigma));
    const h = berm * level + relief * raised * inside;
    const s = I.dunes.size;
    const dunes = noise.value(x / s + dunesAt[0], z / s + dunesAt[1], dunesAt[2]) + 0.5 * noise.value((2 * x) / s + dunesAt[1], (2 * z) / s + dunesAt[2], dunesAt[0]);
    return h + I.dunes.height * dunes * inside * smoothstep(0, 0.4, 1 - rho);
  };

  /** The highest point, sampled on rings out to the coast. */
  const highest = () => {
    let top = 0;
    for (let i = 0; i < 180; i++) for (let j = 0; j < 32; j++) {
      const t = (i / 90) * Math.PI, r = (j / 32) * coast(t);
      top = Math.max(top, mound(Math.cos(t) * r, Math.sin(t) * r));
    }
    return top;
  };
  relief = (target - berm) / (highest() - berm);
  const summit = highest();
  // how far it reaches: the farthest apron, then the flank carried down past the deepest floor
  let most = 0;
  for (let i = 0; i < 360; i++) {
    const t = (i / 180) * Math.PI;
    most = Math.max(most, coast(t) + apronWidth(t) + I.lobes.depth * width);
  }
  const reach = most + I.flankEase + (I.floor - apron) / I.flank + (deepest - I.floor) / I.steep;
  // past the farthest apron, the flank is at least r − most beyond it
  const ceiling = (r: number) => (r <= most ? Infinity : -flankDepth(0, r - most));
  return { chart, radius, shelf: most, reach, summit, coast, mound, ceiling };
}

/** The sea floor at unit direction p before any island: how deep, and how far from the deep water's edge (negative inside it), metres. */
export type Ground = (p: Vec3) => { depth: number; clearance: number };

/** Points spread evenly over the sphere, `count` of them (a Fibonacci lattice). */
function lattice(count: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count, s = Math.sqrt(1 - y * y), a = i * golden;
    return [Math.cos(a) * s, y, Math.sin(a) * s] as Vec3;
  });
}

/** The islands for a planet whose banks and deeps are `ground`, its floor nowhere deeper than `deepest` metres. */
export function placeIslands(ground: Ground, noise: Noise3, seed: number, deepest: number): IslandSite[] {
  const rand = random(seed * 15485863 + 7);
  const area = 4 * Math.PI * R * R;
  const count = Math.max(1, Math.round(area * ISLANDS.density));
  const radii = Array.from({ length: count }, () => lerp(ISLANDS.radius[0], ISLANDS.radius[1], rand() ** 1.4)).sort((a, b) => b - a);
  // candidates about the smallest island's diameter apart, each with its bank's depth (a little jittered, so the
  // very shallowest spot doesn't always win) and its clear water
  const spacing = ISLANDS.radius[0] * 1.5;
  const candidates = lattice(Math.ceil(area / (spacing * spacing))).map((p) => {
    const { depth, clearance } = ground(p);
    return { p, depth: depth + rand() * 3, clear: clearance };
  }).sort((a, b) => a.depth - b.depth);
  const placed: IslandSite[] = [];
  for (const [i, radius] of radii.entries()) {
    // the island's shape is its own; only its chart says where it lies
    const shape = createIslandSite({ at: [0, 1, 0], axis: [1, 0, 0] }, radius, noise, seed * 31 + i + 1, deepest);
    const spot = candidates.find((c) => c.clear > shape.shelf + ISLANDS.clearance &&
      placed.every((o) => distance(o.chart.at, c.p) > shape.shelf + o.shelf + ISLANDS.gap));
    if (!spot) continue;
    const { up, east, north } = frameAt(spot.p), turn = rand() * 2 * Math.PI;
    placed.push({ ...shape, chart: { at: up, axis: add(scale(east, Math.cos(turn)), north, Math.sin(turn)) } });
  }
  return placed;
}

/**
 * sphere.ts toChart for one chart, without its allocations: where unit vector p lies on the chart, and how far
 * from its centre, metres, written into `out` as x, z, r.
 */
export function charter(chart: Chart): (p: Vec3, out: Float64Array) => void {
  const [ax, ay, az] = chart.at, [ex, ey, ez] = chart.axis, [fx, fy, fz] = cross(chart.axis, chart.at);
  return (p, out) => {
    const c = p[0] * ax + p[1] * ay + p[2] * az;
    const dx = p[0] - ax * c, dy = p[1] - ay * c, dz = p[2] - az * c;
    const s = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (s < 1e-12) { out[0] = out[1] = out[2] = 0; return; }
    const k = (Math.atan2(s, c) * R) / s;
    out[0] = (dx * ex + dy * ey + dz * ez) * k;
    out[1] = (dx * fx + dy * fy + dz * fz) * k;
    out[2] = s * k;
  };
}
