// The planet's islands: sand mounds rising from the banks, each worked out flat on its own chart (sphere.ts) and laid
// into the sea floor by planet.ts. Four kinds, all low (no cliffs anywhere):
//   island  25–60 m round, a dome to 3.5–8 m, palms and shrubs and outcrops of rock
//   islet   9–20 m round, 1.5–3 m high, a palm or two
//   rocks   a knoll 5–8 m round and a metre or so high, heaped with rock (world/scatter.ts), its shallows reaching well
//           out round it
//   shoal   a sand bar 15–45 m round whose top lies 0.5–1.6 m under the sea: pale water, too shallow for a ship
//
// An island: a wandering coast; a beach at about 1:8 at the waterline, easing inland into a berm and seaward into a
// shallow apron a metre or two deep; inland a dome with one or two lesser mounds (saddles between them) and fine dune
// relief. Past the apron its flank falls gently to the depth of the banks islands stand on, then steeply on past the
// deepest floor (it meets the bank's floor wherever it gets there first), so by its reach it is below every floor and
// the sea floor there is the bank's alone. The others are the same shape, smaller and lower; a shoal is one sunk.
//
// Where they lie: as many of each kind as the planet's area holds at its density, most gathered into archipelagos (a
// few places spread over the planet, on its shallowest banks), the rest wherever the banks are shallow; each clear of
// deep water and of the others by at least `gap` metres of sailable water between their aprons, so a ship can thread
// between any two (some keep a wider berth, up to `gap` again, so the channels vary), and the water between
// archipelagos is left open. Kind by kind in ORDER, each kind's largest first, as they need the most room.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { R, add, cross, distance, dot, frameAt, scale, type Chart, type Vec3 } from './sphere.ts';
import { random } from './random.ts';
import type { Noise3 } from './noise3.ts';

export type Kind = 'island' | 'islet' | 'rocks' | 'shoal';

/** One kind: how many per square metre of the planet; mean coast radii and summits (before a shoal is sunk), metres,
 *  the smallest's and the largest's; how far drawn out long its coast may be (its second harmonic, a share of the
 *  radius); the apron's width as a share of the radius; the flank's slope past it, down to the bank; how far it keeps
 *  clear of the deeps' edge beyond its apron, metres; and for a shoal, how far under the sea its top lies. */
interface KindOf {
  density: number; radius: readonly [number, number]; summit: readonly [number, number]; long: readonly [number, number];
  apronWidth: readonly [number, number]; flank: number; clearance: number; under?: readonly [number, number];
}

export const KINDS: Record<Kind, KindOf> = {
  island: { density: 3.6e-6, radius: [25, 60], summit: [3.5, 8], long: [0.05, 0.25], apronWidth: [0.45, 0.8], flank: 0.22, clearance: 40 },
  islet: { density: 6.5e-6, radius: [9, 20], summit: [1.5, 3], long: [0.05, 0.4], apronWidth: [0.6, 1], flank: 0.3, clearance: 20 },
  rocks: { density: 4e-6, radius: [5, 8], summit: [0.9, 1.4], long: [0.05, 0.3], apronWidth: [1.4, 2], flank: 0.35, clearance: 15 },
  shoal: { density: 4e-6, radius: [15, 45], summit: [1, 1.8], long: [0.25, 0.5], apronWidth: [0.3, 0.6], flank: 0.25, clearance: 15, under: [0.5, 1.6] },
};

/** The order they are placed in: those that need the most room first. */
export const ORDER: readonly Kind[] = ['island', 'shoal', 'islet', 'rocks'];

export const ISLANDS = {
  /** Archipelagos per square metre (about 9 at R = 554); the share of each kind's that gather into them, and how
   *  strongly (a metre nearer an archipelago's middle counts as this many metres shallower water). */
  archipelagos: 2.3e-6, gathered: 0.75, pull: 1 / 25,
  /** The beach's slope at the waterline, both sides. */
  beach: 1 / 8,
  /** How high the berm behind the beach rises, metres (it rises at `beach` and levels at this). */
  berm: [1.2, 2],
  /** The apron's depth, metres (the beach runs down at `beach` and levels at this). */
  apron: [1.2, 2.2],
  /** How far the apron's edge wanders in lobes and bays, as a share of its width; the lobes' size, metres plus a share of the radius. */
  lobes: { depth: 0.4, size: [25, 0.6] },
  /** How far the flank eases into its slope, metres. */
  flankEase: 8,
  /** Fine dune relief inland, metres high and across. */
  dunes: { height: 0.45, size: 9 },
  /** At least this much water between any two aprons, metres: a channel a ship can thread. */
  gap: 45,
  /** How deep the bank under an island may be at most, metres: the flank falls gently this far. */
  floor: 17,
  /** The flank's slope below `floor`. */
  steep: 0.6,
} as const;

/** A lesser mound on an island: where on its chart, how wide (Gaussian σ) and how high, metres. */
interface Mound { x: number; z: number; sigma: number; height: number }

export interface IslandSite {
  kind: Kind;
  /** The island's chart: `at` its centre, `axis` its x. */
  chart: Chart;
  /** The coast's mean distance from the centre, metres. */
  radius: number;
  /** How far from the centre the apron reaches at most, metres. */
  shelf: number;
  /** How far from the centre the island touches the sea floor at all, metres. */
  reach: number;
  /** Its highest point, metres (under the sea, negative, for a shoal). */
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

/** Steps round the full turn at which an island's coast and apron are tabulated. */
const TURN = 720;

/** A function of the angle round an island tabulated at TURN steps, read back between them. */
function tabulate(f: (t: number) => number): (t: number) => number {
  const table = Float64Array.from({ length: TURN + 1 }, (_, k) => f((k / TURN) * 2 * Math.PI));
  return (t) => {
    const u = ((((t / (2 * Math.PI)) % 1) + 1) % 1) * TURN, k = Math.floor(u), f = u - k;
    return table[k] + (table[k + 1] - table[k]) * f;
  };
}

/** One island of a kind on `chart`, its coast `radius` metres out on average (before a shoal is sunk); no sea floor
 *  is deeper than `deepest` metres. */
function createIslandSite(kind: Kind, chart: Chart, radius: number, noise: Noise3, seed: number, deepest: number): IslandSite {
  const rand = random(seed * 7919 + 101);
  const I = ISLANDS, K = KINDS[kind];
  const size = (radius - K.radius[0]) / (K.radius[1] - K.radius[0]);
  // the coast and the apron wander with the angle: a few harmonics with random phases, smaller the finer
  const shore = harmonics(rand, [2, 3, 4, 5, 7], 0.16, 0.8);
  // drawn out long, some of them, by the coarsest
  shore[0].a = lerp(K.long[0], K.long[1], rand() ** 1.5);
  const shelf = harmonics(rand, [1, 2, 3, 5], 0.3, 1);
  const coast = tabulate((t) => radius * (1 + wave(shore, t)));
  // (a berm no higher than a low islet's summit allows)
  const berm = Math.min(lerp(I.berm[0], I.berm[1], rand()), K.summit[0] * 0.6), apron = lerp(I.apron[0], I.apron[1], rand());
  const width = radius * lerp(K.apronWidth[0], K.apronWidth[1], rand());
  const apronWidth = (t: number) => width * (1 + wave(shelf, t));
  // the apron's edge wanders on in lobes and bays (noise read along it)
  const lobeSize = I.lobes.size[0] + I.lobes.size[1] * radius, lobesAt: Vec3 = [rand() * 256, rand() * 256, rand() * 256];
  const edge = tabulate((t) => {
    const r = coast(t) + apronWidth(t);
    return apronWidth(t) + I.lobes.depth * width * noise.value((Math.cos(t) * r) / lobeSize + lobesAt[0], (Math.sin(t) * r) / lobeSize + lobesAt[1], lobesAt[2]);
  });
  // the dome makes up the summit with the berm; one or two lesser mounds off the centre, a saddle between (all
  // scaled by `relief` once measured, to bring the summit to its target)
  const target = Math.max(K.summit[0], lerp(K.summit[0], K.summit[1], size) * lerp(0.9, 1.1, rand()));
  const dome = target - berm;
  /** How far a shoal is sunk: its top that far under the sea. */
  const sink = K.under ? target + lerp(K.under[0], K.under[1], rand()) : 0;
  let relief = 1;
  const mounds: Mound[] = Array.from({ length: 1 + Math.floor(rand() * 2) }, () => {
    const t = rand() * 2 * Math.PI, at = lerp(0.35, 0.6, rand()) * coast(t);
    return { x: Math.cos(t) * at, z: Math.sin(t) * at, sigma: radius * lerp(0.2, 0.32, rand()), height: dome * lerp(0.35, 0.65, rand()) };
  });
  const dunesAt: Vec3 = [rand() * 256, rand() * 256, rand() * 256];

  /** The depth of the flank `past` metres beyond the apron, below the beach's `beach`. */
  const flankDepth = (beach: number, past: number) => {
    const e = I.flankEase, fall = past <= 0 ? 0 : past < e ? (past * past) / (2 * e) : past - e / 2;
    const depth = beach + K.flank * fall;
    return depth <= I.floor ? depth : I.floor + (depth - I.floor) * (I.steep / K.flank);
  };

  const raw = (x: number, z: number) => {
    const r = Math.hypot(x, z), t = Math.atan2(z, x), c = coast(t);
    const d = r - c;
    if (d >= 0) {
      // the beach runs on down and levels into the apron; past the apron the flank falls, easing in
      const beach = apron * (1 - Math.exp(-(d * I.beach) / apron));
      const past = d - edge(t);
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

  const mound = (x: number, z: number) => raw(x, z) - sink;

  /** The highest point, sampled on rings out to the coast, a couple of metres apart at most. */
  const highest = () => {
    let top = -Infinity;
    const round = Math.max(48, Math.ceil(radius * 2)), out = Math.max(12, Math.ceil(radius / 2.5));
    for (let i = 0; i < round; i++) for (let j = 0; j < out; j++) {
      const t = (i / round) * 2 * Math.PI, r = (j / out) * coast(t);
      top = Math.max(top, mound(Math.cos(t) * r, Math.sin(t) * r));
    }
    return top;
  };
  relief = (target - berm) / (highest() + sink - berm);
  const summit = highest();
  // how far it reaches: the farthest apron, then the flank carried down past the deepest floor
  let most = 0;
  for (let i = 0; i < 360; i++) {
    const t = (i / 180) * Math.PI;
    most = Math.max(most, coast(t) + edge(t));
  }
  const reach = most + I.flankEase + (I.floor - apron) / K.flank + (deepest - I.floor) / I.steep;
  // past the farthest apron, the flank is at least r − most beyond it
  const ceiling = (r: number) => (r <= most ? Infinity : -flankDepth(0, r - most) - sink);
  return { kind, chart, radius, shelf: most, reach, summit, coast, mound, ceiling };
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

/** The islands for a planet whose banks and deeps are `ground`, its floor nowhere deeper than `deepest` metres: every
 *  kind's in ORDER, each kind's largest first. */
export function placeIslands(ground: Ground, noise: Noise3, seed: number, deepest: number): IslandSite[] {
  const rand = random(seed * 15485863 + 7);
  const area = 4 * Math.PI * R * R;
  // candidates about a rock knoll's diameter apart, each with its bank's depth (a little jittered, so the very
  // shallowest spot doesn't always win) and its clear water
  const spacing = KINDS.rocks.radius[0] * 5;
  const candidates = lattice(Math.ceil(area / (spacing * spacing))).map((p) => {
    const { depth, clearance } = ground(p);
    return { p, depth: depth + rand() * 3, clear: clearance };
  });
  // the archipelagos' middles: the shallowest banks well clear of the deeps, each next the farthest from those before
  const banks = candidates.filter((c) => c.clear > 120).sort((a, b) => a.depth - b.depth);
  const shallow = banks.slice(0, Math.max(1, Math.ceil(banks.length / 3)));
  const middles: Vec3[] = [];
  const nearest = shallow.map(() => Infinity);
  for (let k = 0, next = 0; k < Math.max(1, Math.round(area * ISLANDS.archipelagos)) && shallow.length; k++) {
    middles.push(shallow[next].p);
    let far = -1;
    shallow.forEach((c, i) => {
      nearest[i] = Math.min(nearest[i], distance(shallow[next].p, c.p));
      if (nearest[i] > far) [next, far] = [i, nearest[i]];
    });
  }
  // the order each kind looks through them in: gathered, by the bank's depth and the nearest archipelago; or by the
  // bank's depth alone
  const toMiddle = (p: Vec3) => Math.acos(Math.min(1, Math.max(...middles.map((m) => dot(m, p))))) * R;
  const gathered = candidates.map((c) => ({ c, score: c.depth + ISLANDS.pull * toMiddle(c.p) }))
    .sort((a, b) => a.score - b.score).map((g) => g.c);
  const loose = [...candidates].sort((a, b) => a.depth - b.depth);
  const placed: (IslandSite & { room: number })[] = [];
  let n = 0;
  for (const kind of ORDER) {
    const K = KINDS[kind], count = Math.max(kind === 'island' ? 1 : 0, Math.round(area * K.density));
    const radii = Array.from({ length: count }, () => lerp(K.radius[0], K.radius[1], rand() ** 1.4)).sort((a, b) => b - a);
    for (const radius of radii) {
      // the island's shape is its own; only its chart says where it lies. Its own room: more water than the least
      const shape = createIslandSite(kind, { at: [0, 1, 0], axis: [1, 0, 0] }, radius, noise, seed * 31 + ++n, deepest);
      const room = ISLANDS.gap * 1.4 * rand() ** 2;
      // (apart: the dot product of their centres under the cosine of the least angle between them)
      const apart = placed.map((o) => Math.cos((shape.shelf + o.shelf + ISLANDS.gap + Math.max(room, o.room)) / R));
      const spot = (rand() < ISLANDS.gathered ? gathered : loose).find((c) => c.clear > shape.shelf + K.clearance &&
        placed.every((o, k) => dot(o.chart.at, c.p) < apart[k]));
      if (!spot) continue;
      const { up, east, north } = frameAt(spot.p), turn = rand() * 2 * Math.PI;
      placed.push({ ...shape, room, chart: { at: up, axis: add(scale(east, Math.cos(turn)), north, Math.sin(turn)) } });
    }
  }
  return placed.map(({ room: _, ...site }) => site);
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
