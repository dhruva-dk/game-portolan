// The planet's islands: low sand islands rising from the banks, each worked out flat on its own chart (sphere.ts) and
// laid into the sea floor by planet.ts. Three kinds, all low (no cliffs anywhere), every one standing out of the sea:
//   island  18–55 m round, a ridge to 3–7 m, palms and shrubs and outcrops of rock; now and then a lagoon or an
//           offshore rock or two
//   islet   7–15 m round, 1.5–3 m high, a palm or two
//   rocks   a knoll 4–7 m round and a metre or so high, heaped with rock (world/scatter.ts)
// Nothing lies hidden under open-looking water: the only water too shallow for a ship is the last few metres off a
// beach (WADE), and the banks between are all deeper than her draught.
//
// Each is shaped by island-shape.ts (a lobed, worn coast; its lagoon and offshore rocks) and its ground laid by
// distance from the water's edge: a beach at about 1:8 at the waterline, easing inland into a berm and a low ridge
// (one or two lesser mounds, fine dune relief), and seaward to a ledge a couple of metres down, which steps down into
// a wide clear apron 3.6–7.5 m deep, deepening outward, where a ship sails over pale sand; past the apron's edge
// (wandering in lobes and bays) its flank falls gently to the depth of the banks, then steeply on past the deepest
// floor, so by its reach it is below every floor and the sea floor there is the bank's alone. A lagoon is shallow.
//
// Where they lie: spread evenly over the whole planet, as many of each kind as its area holds at its density, the
// largest first, each where the most water is left between its apron and every other's (the farthest point, a
// little shaken by the seed so they don't fall in rows), on the banks clear of the deeps, and never nearer another's
// apron than `gap`. Each kind's radii are drawn more small than large.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { R, add, cross, dot, frameAt, scale, type Chart, type Vec3 } from './sphere.ts';
import { random } from './random.ts';
import type { Noise3 } from './noise3.ts';
import { blob, coastline, distanceField, radiusAt, within, type Loop } from './island-shape.ts';

export type Kind = 'island' | 'islet' | 'rocks';

/** One kind: how many per square metre of the planet; mean coast radii, metres, the smallest's and the largest's,
 *  and how strongly drawn toward the smallest (the power on a uniform draw); summits, metres; how far drawn out long
 *  (the body's eccentricity); how worn its coast (a share of the radius); the apron's width, metres, the smallest's
 *  and the largest's; the flank's slope past it, down to the bank; how far it keeps clear of the deeps' edge beyond
 *  its apron, metres. */
interface KindOf {
  density: number; radius: readonly [number, number]; skew: number; summit: readonly [number, number];
  long: readonly [number, number]; wear: readonly [number, number]; apron: readonly [number, number]; flank: number; clearance: number;
}

export const KINDS: Record<Kind, KindOf> = {
  island: { density: 4.4e-6, radius: [18, 55], skew: 2.2, summit: [3, 7], long: [0.05, 0.35], wear: [0.12, 0.22], apron: [24, 48], flank: 0.22, clearance: 40 },
  islet: { density: 4.4e-6, radius: [7, 15], skew: 1.3, summit: [1.5, 3], long: [0.05, 0.4], wear: [0.1, 0.18], apron: [15, 24], flank: 0.3, clearance: 20 },
  rocks: { density: 1.6e-6, radius: [4, 7], skew: 1, summit: [0.9, 1.4], long: [0.05, 0.3], wear: [0.05, 0.09], apron: [10, 15], flank: 0.35, clearance: 15 },
};

/** The order they are placed in: those that need the most room first. */
export const ORDER: readonly Kind[] = ['island', 'islet', 'rocks'];

/**
 * How far out from the waterline the water may be too shallow for a ship (a keel 2.2 m down: sim/handling.ts), metres,
 * at most: past it every island's water is deeper than her draught.
 */
export const WADE = 7;

export const ISLANDS = {
  /** The beach's slope at the waterline, both sides. */
  beach: 1 / 8,
  /** The ledge: from this many metres out it steepens, over `ease` metres, by `slope`, down to the apron. */
  ledge: { from: 2, ease: 2, slope: 0.7 },
  /** How high the berm behind the beach rises, metres (it rises at `beach` and levels at this). */
  berm: [1, 1.8],
  /** The apron's depth, metres: by the ledge, and at its outer edge. */
  apron: { inner: [3.6, 4.4], outer: [5.5, 7.5] },
  /** How far the apron's edge wanders in lobes and bays, as a share of its width; the lobes' size, metres. */
  lobes: { depth: 0.35, size: 30 },
  /** The share of the larger islands (over `from` metres) with a lagoon, how deep it is, and how broad (a share of the radius). */
  lagoon: { share: 0.35, from: 30, depth: [1, 1.8], radius: [0.2, 0.32] },
  /** The share of islands and islets with an offshore rock or two; their radii, and how far out past the beach, metres. */
  offshore: { share: 0.45, radius: [2.5, 4.5], out: [9, 18] },
  /** The share of islands with a long spit, and of islands and islets bent round a broad bay. */
  spit: 0.25, bent: 0.3,
  /** How far the flank eases into its slope, metres. */
  flankEase: 8,
  /** Fine dune relief inland, metres high and across. */
  dunes: { height: 0.4, size: 9 },
  /** At least this much water between any two aprons, metres. */
  gap: 45,
  /** How deep the bank under an island may be at most, metres: the flank falls gently this far. */
  floor: 17,
  /** The flank's slope below `floor`. */
  steep: 0.6,
} as const;

/** A lesser mound on an island: where on its chart, how wide (Gaussian σ) and how high, metres. */
interface Mound { x: number; z: number; sigma: number; height: number }

/** An offshore rock: its centre on the island's chart and its radius, metres. */
export interface Offshore { x: number; z: number; radius: number }

export interface IslandSite {
  kind: Kind;
  /** The island's chart: `at` its centre, `axis` its x. */
  chart: Chart;
  /** The coast's mean distance from the centre (the radius of a circle of its area), metres. */
  radius: number;
  /** How far from the centre the apron reaches at most, metres. */
  shelf: number;
  /** How far from the centre the island touches the sea floor at all, metres. */
  reach: number;
  /** Its highest point, metres. */
  summit: number;
  /** Its offshore rocks, if any. */
  offshore: readonly Offshore[];
  /** The coast's distance from the centre at angle θ (atan2(z, x) on the chart): the main shore, seen from the centre. */
  coast(theta: number): number;
  /** Metres from the water's edge at chart (x, z), negative on land: every edge, the lagoon's and the offshore rocks' too. */
  shore(x: number, z: number): number;
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
/** 0 below 0, then easing over `e` into a slope of 1. */
const ramp = (x: number, e: number) => (x <= 0 ? 0 : x < e ? (x * x) / (2 * e) : x - e / 2);

/** One island of a kind on `chart`, its coast `radius` metres out on average; no sea floor is deeper than `deepest` metres. */
function createIslandSite(kind: Kind, chart: Chart, radius: number, noise: Noise3, seed: number, deepest: number): IslandSite {
  const rand = random(seed * 7919 + 101);
  const I = ISLANDS, K = KINDS[kind];
  const size = (radius - K.radius[0]) / (K.radius[1] - K.radius[0]);
  const at: Vec3 = [rand() * 256, rand() * 256, rand() * 256];
  const main = coastline(radius, {
    long: lerp(K.long[0], K.long[1], rand() ** 1.5),
    headlands: kind === 'island' ? 1 + Math.floor(rand() * 3) : kind === 'islet' ? Math.floor(rand() * 3) : 0,
    coves: kind === 'island' ? 1 + Math.floor(rand() * 3) : kind === 'islet' ? Math.floor(rand() * 2) : 0,
    bent: kind !== 'rocks' && rand() < I.bent,
    spit: kind === 'island' && rand() < I.spit,
    wear: lerp(K.wear[0], K.wear[1], rand()),
    size: Math.min(Math.max(radius * 0.8, 4), 32),
  }, rand, noise, at);
  const coast = (t: number) => radiusAt(main, t);
  const width = lerp(K.apron[0], K.apron[1], size) * lerp(0.85, 1.15, rand());
  // a lagoon well inside the land where it is broadest, drawn out along the coast, clear of the centre (which stays
  // land): shrunk until it is, or none
  let lagoon: Loop | null = null;
  if (kind === 'island' && radius >= I.lagoon.from && rand() < I.lagoon.share) {
    let t = 0;
    for (let k = 0; k < 64; k++) if (coast((k / 64) * 2 * Math.PI) > coast(t)) t = (k / 64) * 2 * Math.PI;
    for (let lr = radius * lerp(I.lagoon.radius[0], I.lagoon.radius[1], rand()); lr >= 5 && !lagoon; lr *= 0.9) {
      const out = 10 + lr * 0.8, cx = Math.cos(t) * out, cz = Math.sin(t) * out;
      const l = blob(cx, cz, lr, rand, { long: 0.3, turn: t + Math.PI / 2 });
      const inside = Array.from({ length: 64 }, (_, k) => (k / 64) * 2 * Math.PI).every((a) => {
        const r = radiusAt(l, a), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        return Math.hypot(x, z) < coast(Math.atan2(z, x)) - 10 && Math.hypot(x, z) > 8;
      });
      if (inside) lagoon = l;
    }
  }
  // offshore rocks out in the apron, past the beach's shallows
  const offshore: Offshore[] = [];
  if (kind !== 'rocks' && rand() < I.offshore.share) {
    for (let k = 0, n = 1 + +(rand() < 0.3); k < n; k++) {
      const t = rand() * 2 * Math.PI, r = lerp(I.offshore.radius[0], I.offshore.radius[1], rand());
      const out = Math.min(lerp(I.offshore.out[0], I.offshore.out[1], rand()), width - r - 10);
      if (out < I.offshore.out[0]) continue;
      const d = coast(t) + r + out;
      if (offshore.some((o) => Math.hypot(o.x - Math.cos(t) * d, o.z - Math.sin(t) * d) < o.radius + r + 12)) continue;
      offshore.push({ x: Math.cos(t) * d, z: Math.sin(t) * d, radius: r });
    }
  }
  const rocks = offshore.map((o) => blob(o.x, o.z, o.radius, rand));
  const dry = (x: number, z: number) =>
    (Math.hypot(x, z) < coast(Math.atan2(z, x)) && !(lagoon && within(lagoon, x, z))) || rocks.some((l) => within(l, x, z));
  let far = Math.max(...main.table);
  for (const o of offshore) far = Math.max(far, Math.hypot(o.x, o.z) + o.radius * 1.3);
  const most = far + width * (1 + I.lobes.depth);
  // (the grid out over the apron's inner part; past it the distance runs on from its edge, near enough out there)
  const field = distanceField([main, ...(lagoon ? [lagoon] : []), ...rocks], dry, far + width * 0.6 + 6, kind === 'rocks' ? 0.5 : 1, radius * 0.35);
  const inmost = -field.deepest;

  // the apron: its depth by the ledge and at its edge, its width wandering in lobes
  const inner = lerp(I.apron.inner[0], I.apron.inner[1], rand()), outer = lerp(I.apron.outer[0], I.apron.outer[1], rand());
  const shallow = lerp(I.lagoon.depth[0], I.lagoon.depth[1], rand());
  const lobesAt: Vec3 = [rand() * 256, rand() * 256, rand() * 256];
  const apronWidth = (x: number, z: number) => width * (1 + I.lobes.depth * noise.value(x / I.lobes.size + lobesAt[0], z / I.lobes.size + lobesAt[1], lobesAt[2]));
  /** How deep `s` metres out from the waterline, toward an apron `depth` deep: the beach, the ledge, the apron. */
  const shelve = (s: number, depth: number) => {
    const q = s * I.beach + I.ledge.slope * ramp(s - I.ledge.from, I.ledge.ease);
    return depth * (1 - Math.exp(-q / depth));
  };
  /** The depth of the flank `past` metres beyond the apron, below the apron's `apron`. */
  const flankDepth = (apron: number, past: number) => {
    const e = I.flankEase, fall = past <= 0 ? 0 : past < e ? (past * past) / (2 * e) : past - e / 2;
    const depth = apron + K.flank * fall;
    return depth <= I.floor ? depth : I.floor + (depth - I.floor) * (I.steep / K.flank);
  };

  // inland: the berm, then a ridge rising with the distance from the water to `dome` over the berm, one or two lesser
  // mounds on it (all scaled by `relief` once measured, to bring the summit to its target); each offshore rock a hump
  const target = Math.max(K.summit[0], lerp(K.summit[0], K.summit[1], size) * lerp(0.9, 1.1, rand()));
  const berm = Math.min(lerp(I.berm[0], I.berm[1], rand()), K.summit[0] * 0.6);
  const dome = target - berm;
  let relief = 1;
  const mounds: Mound[] = [];
  for (let tries = 0, n = 1 + Math.floor(rand() * 2); mounds.length < n && tries < 40; tries++) {
    const k = Math.floor(rand() * (field.land.length / 2)), x = field.land[2 * k], z = field.land[2 * k + 1];
    if (-field.at(x, z) < 0.4 * inmost || rocks.some((l) => within(l, x, z))) continue;
    mounds.push({ x, z, sigma: radius * lerp(0.2, 0.32, rand()), height: dome * lerp(0.35, 0.65, rand()) });
  }
  const humps = offshore.map((o) => ({ ...o, height: lerp(0.7, 1.2, rand()) }));
  const dunesAt: Vec3 = [rand() * 256, rand() * 256, rand() * 256];

  const mound = (x: number, z: number) => {
    const exact = field.at(x, z);
    if (exact >= 0) {
      if (lagoon && within(lagoon, x, z)) return -shelve(exact, shallow);
      // (out past the ledge, the softened distance: no crease running out from an inward corner of the coast)
      const s = exact <= 8 ? exact : Math.max(8, exact + (field.soft(x, z) - exact) * smoothstep(8, 16, exact));
      const w = apronWidth(x, z);
      return -flankDepth(shelve(s, inner + (outer - inner) * smoothstep(0, w, s)), s - w);
    }
    const u = -exact, t = Math.min(Math.max(-field.soft(x, z), 0) / field.inmost, 1), ridge = t * t * (3 - 2 * t) * smoothstep(0, 5, u);
    let raised = dome;
    for (const m of mounds) raised += m.height * Math.exp(-((x - m.x) ** 2 + (z - m.z) ** 2) / (m.sigma * m.sigma));
    let h = berm * (1 - Math.exp((-u * I.beach) / berm)) + relief * raised * ridge;
    for (const o of humps) {
      const d2 = ((x - o.x) ** 2 + (z - o.z) ** 2) / (o.radius * o.radius);
      if (d2 < 1.5) h += o.height * Math.max(1 - d2 / 1.5, 0) ** 2 * smoothstep(0, 1.5, u);
    }
    const ds = I.dunes.size;
    const dunes = noise.value(x / ds + dunesAt[0], z / ds + dunesAt[1], dunesAt[2]) + 0.5 * noise.value((2 * x) / ds + dunesAt[1], (2 * z) / ds + dunesAt[2], dunesAt[0]);
    return h + I.dunes.height * dunes * ridge * smoothstep(0, 6, u);
  };

  /** The highest point, over every node on land. */
  const highest = () => {
    let top = -Infinity;
    for (let k = 0; k < field.land.length; k += 2) top = Math.max(top, mound(field.land[k], field.land[k + 1]));
    return top;
  };
  relief = Math.min(Math.max((target - berm) / Math.max(highest() - berm, 0.1), 0.3), 3);
  const summit = highest();
  // how far it reaches: the farthest apron, then the flank carried down past the deepest floor
  const reach = most + I.flankEase + (I.floor - outer) / K.flank + (deepest - I.floor) / I.steep;
  // past the farthest apron, the water's edge is at least r − far away and the flank at least r − most beyond it
  const ceiling = (r: number) => (r <= most ? Infinity : -flankDepth(0, r - most));
  return { kind, chart, radius, shelf: most, reach, summit, offshore, coast, shore: field.at, mound, ceiling };
}

/** The sea floor at unit direction p before any island: how far from the deep water's edge (negative inside it), metres. */
export type Ground = (p: Vec3) => { clearance: number };

/** Points spread evenly over the sphere, `count` of them (a Fibonacci lattice). */
function lattice(count: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count, s = Math.sqrt(1 - y * y), a = i * golden;
    return [Math.cos(a) * s, y, Math.sin(a) * s] as Vec3;
  });
}

/** Metres between the places looked at for an island, and how much the seed shakes each one's water left, metres. */
const SPACING = 20, SHAKE = 30;

/** The islands for a planet whose deeps are `ground`, its floor nowhere deeper than `deepest` metres: every kind's in
 *  ORDER, each kind's largest first, spread evenly. */
export function placeIslands(ground: Ground, noise: Noise3, seed: number, deepest: number): IslandSite[] {
  const rand = random(seed * 15485863 + 7);
  const area = 4 * Math.PI * R * R;
  const candidates = lattice(Math.ceil(area / (SPACING * SPACING))).map((p) => ({ p, clear: ground(p).clearance }));
  /** For each candidate, the water between it and the nearest apron placed, metres. */
  const room = new Float64Array(candidates.length).fill(Infinity);
  const placed: IslandSite[] = [];
  let n = 0;
  for (const kind of ORDER) {
    const K = KINDS[kind], count = Math.max(kind === 'island' ? 1 : 0, Math.round(area * K.density));
    const radii = Array.from({ length: count }, () => lerp(K.radius[0], K.radius[1], rand() ** K.skew)).sort((a, b) => b - a);
    for (const radius of radii) {
      // the island's shape is its own; only its chart says where it lies
      const shape = createIslandSite(kind, { at: [0, 1, 0], axis: [1, 0, 0] }, radius, noise, seed * 31 + ++n, deepest);
      let best = -1, most = -Infinity;
      candidates.forEach((c, i) => {
        const shaken = rand() * SHAKE;
        if (c.clear <= shape.shelf + K.clearance) return;
        const water = (placed.length ? room[i] - shape.shelf : 0) + shaken;
        if (water > most) [best, most] = [i, water];
      });
      if (best < 0 || (placed.length && most - SHAKE < ISLANDS.gap)) continue;
      const spot = candidates[best].p, { up, east, north } = frameAt(spot), turn = rand() * 2 * Math.PI;
      placed.push({ ...shape, chart: { at: up, axis: add(scale(east, Math.cos(turn)), north, Math.sin(turn)) } });
      candidates.forEach((c, i) => {
        room[i] = Math.min(room[i], Math.acos(Math.min(1, Math.max(-1, dot(c.p, spot)))) * R - shape.shelf);
      });
    }
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
