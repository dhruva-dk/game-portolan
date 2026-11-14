// The planet's islands: sand islands rising from the banks into rounded hills, each worked out flat on its own chart
// (sphere.ts) and laid into the sea floor by planet.ts. Five kinds, every one standing out of the sea, their hills
// no steeper than a palm stands on but for the cliffs raised on an island's: round its headland and along stretches
// of its coast behind the beach, and on some the hill stepped in terraces (bare rock on their faces, nothing standing
// there):
//   island  18–55 m round, a hill 7–22 m high by its size, palms and shrubs and outcrops of rock; now and then a
//           lagoon or an offshore rock or two
//   atoll   28–40 m round, a low ring of sand 8–12 m broad and 1.6–2.6 m high round a shallow lagoon, palms along it
//   mesa    15–30 m round, a flat top 11–18 m up behind a cliff all round it, shrubs on it, no palms
//   islet   7–15 m round, a hump 2.5–6 m high, a palm or two
//   rocks   a knoll 4–7 m round and a metre or so high, heaped with rock (world/scatter.ts)
// Nothing lies hidden under open-looking water: the only water too shallow for a ship is the last few metres off a
// beach (WADE), and the banks between are all deeper than her draught.
//
// Each is shaped by island-shape.ts (a lobed, worn coast; its lagoon and offshore rocks) and its ground laid by
// distance from the water's edge: a beach at about 1:8 at the waterline, easing inland into a berm and a hill (a dome,
// a ridge, two hills and a saddle, or a peak off the middle; fine dune relief over it), and seaward to a ledge a couple
// of metres down, which steps down into a wide clear apron 4.2–7.5 m deep, deepening outward, where a ship sails over
// pale sand; past the apron's edge (wandering in lobes and bays) its flank falls gently to the depth of the banks, then
// steeply on past the deepest floor, so by its reach it is below every floor and the sea floor there is the bank's
// alone. A lagoon is shallow. Where they lie is island-place.ts.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import type { Chart, Vec3 } from './sphere.ts';
import { random } from './random.ts';
import type { Noise3 } from './noise3.ts';
import { blob, coastline, distanceField, radiusAt, within, type Loop } from './island-shape.ts';

export type Kind = 'island' | 'atoll' | 'mesa' | 'islet' | 'rocks';

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
  island: { density: 4.4e-6, radius: [18, 55], skew: 2.2, summit: [7, 22], long: [0.05, 0.35], wear: [0.12, 0.22], apron: [24, 48], flank: 0.22, clearance: 40 },
  atoll: { density: 1.1e-6, radius: [28, 40], skew: 1.2, summit: [1.6, 2.6], long: [0.03, 0.12], wear: [0.1, 0.16], apron: [18, 28], flank: 0.25, clearance: 25 },
  mesa: { density: 1.3e-6, radius: [15, 30], skew: 1.5, summit: [11, 18], long: [0.05, 0.3], wear: [0.08, 0.14], apron: [16, 28], flank: 0.25, clearance: 25 },
  islet: { density: 4.4e-6, radius: [7, 15], skew: 1.3, summit: [2.8, 6], long: [0.05, 0.4], wear: [0.1, 0.18], apron: [15, 24], flank: 0.3, clearance: 20 },
  rocks: { density: 1.6e-6, radius: [4, 7], skew: 1, summit: [0.9, 1.4], long: [0.05, 0.3], wear: [0.05, 0.09], apron: [10, 15], flank: 0.35, clearance: 15 },
};

/** The order they are placed in: those that need the most room first. */
export const ORDER: readonly Kind[] = ['island', 'atoll', 'mesa', 'islet', 'rocks'];

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
  apron: { inner: [4.2, 5], outer: [5.5, 7.5] },
  /** How far the apron's edge wanders in lobes and bays, as a share of its width; the lobes' size, metres. */
  lobes: { depth: 0.35, size: 30 },
  /** The share of the larger islands (`from` to `to` metres: the largest keep their hills whole) with a lagoon, how deep
   *  it is, and how broad (a share of the radius). */
  lagoon: { share: 0.35, from: 30, to: 45, depth: [1, 1.8], radius: [0.2, 0.32] },
  /** An atoll's ring of land round its lagoon: how broad at its narrowest, metres. */
  atoll: { ring: [8, 12] },
  /** The share of islands and islets with an offshore rock or two; their radii, and how far out past the beach, metres. */
  offshore: {
    share: 0.45, radius: [2.5, 4.5], out: [9, 18],
    /** Sea stacks: the share of a mesa's with offshore rocks (all of them stacks), and of an island's offshore rocks
     *  that are; how wide and high they stand, metres, rising to it over `rise` metres in from their waterline. */
    stacks: { mesa: 0.8, share: 0.5, radius: [4, 6], height: [6, 9], rise: 3 },
  },
  /** The share of islands with a long spit, and of islands and islets bent round a broad bay. */
  spit: 0.25, bent: 0.3,
  /** How far the flank eases into its slope, metres. */
  flankEase: 8,
  /** Fine dune relief inland, metres high and across. */
  dunes: { height: 0.4, size: 9 },
  /** The steepest the hills may be (a palm stands on it), rise over run, among all but the steepest hundredth of the
   *  land: a hill that would be steeper is brought lower. An islet's hump may be a little steeper. Measured before
   *  the cliffs and terraces are cut into it. */
  steepest: { island: 0.8, atoll: 0.8, mesa: 0.8, islet: 0.85, rocks: 0.75 },
  /** Ground steeper than this (rise over run) is a cliff's face: bare rock, nothing standing on it. */
  bare: 1.2,
  /** Cliffed headlands: round an island's headland (where its coast reaches farthest out, a share `cape` of its radius
   *  either side),
   *  and along stretches of its coast where a noise over it (`around` metres across) passes `above` (and full height
   *  `ends` past that: the cliff's ends sloping down to the beach), the ground is raised in a cliff behind the beach
   *  from `foot` metres inland: `height` metres (no more than a share `most` of its summit), over `run` metres for
   *  each metre high (its face at its steepest 1.5 / run, rise over run), its top falling back to the hill between
   *  `back` and twice that inland, metres. */
  cliffs: { cape: 0.6, above: 0.1, ends: 0.35, around: 40, height: [3, 8], most: 0.7, foot: 3, run: 0.9, back: 14 },
  /** A mesa: its top rising no more than `top` metres over the berm, and its cliff all the way round, `run` metres for
   *  each metre high, up to its summit. */
  mesa: { top: 2, run: 0.5 },
  /** The share of islands whose hill rises in terraces: steps `step` metres high, a share `riser` of each its riser. */
  terraces: { share: 0.45, step: [2.5, 4], riser: 0.5 },
  /** At least this much water between any two aprons, metres. */
  gap: 45,
  /** How deep the bank under an island may be at most, metres: the flank falls gently this far. */
  floor: 17,
  /** The flank's slope below `floor`. */
  steep: 0.6,
} as const;

/** A lesser mound on an island: where on its chart, how wide (Gaussian σ) and how high, metres. */
/** A hill on the land: its crest on the island's chart, how far its foot spreads round it and its height (a share
 *  of the whole), metres. */
interface Mound { x: number; z: number; foot: number; height: number }

/** A hillside's rise, 0 at the foot to 1 at the crest, `t` of the way up: an even slope, eased in over the lowest
 *  `foot` of the way and rounded over the highest `crest` (a smoothstep's steepest is half as steep again as its
 *  mean; this, by a quarter to a half). */
function slope(t: number, foot = 0.25, crest = 0.25): number {
  const m = 1 / (1 - foot / 2 - crest / 2);
  if (t < foot) return (m * t * t) / (2 * foot);
  if (t > 1 - crest) return 1 - (m * (1 - t) * (1 - t)) / (2 * crest);
  return m * (t - foot / 2);
}

/** A hill's form: one dome on the island's middle, a ridge along it, two hills with a saddle between, or one peak
 *  off the middle. */
type Form = 'dome' | 'ridge' | 'saddle' | 'offset';
const FORMS: readonly Form[] = ['dome', 'ridge', 'saddle', 'offset'];

/** An offshore rock: its centre on the island's chart and its radius, metres. */
/** An offshore rock: a low hump, or a sea stack standing up sheer out of the water. */
export interface Offshore { x: number; z: number; radius: number; stack: boolean }

export interface IslandSite {
  kind: Kind;
  /** The island's chart: `at` its centre, `axis` its x. */
  chart: Chart;
  /** The coast's mean distance from the centre (the radius of a circle of its area), metres. */
  radius: number;
  /** How far from the centre the apron reaches at most, metres. */
  shelf: number;
  /** Metres of clear apron round it, from the waterline. */
  apron: number;
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
  /** Whether chart (x, z) is on a cliff's face (steeper than ISLANDS.bare): nothing stands there. */
  face(x: number, z: number): boolean;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 below 0, then easing over `e` into a slope of 1. */
const ramp = (x: number, e: number) => (x <= 0 ? 0 : x < e ? (x * x) / (2 * e) : x - e / 2);

/** One island of a kind on `chart`, its coast `radius` metres out on average; no sea floor is deeper than `deepest` metres. */
export function createIslandSite(kind: Kind, chart: Chart, radius: number, noise: Noise3, seed: number, deepest: number): IslandSite {
  const rand = random(seed * 7919 + 101);
  const I = ISLANDS, K = KINDS[kind];
  const size = (radius - K.radius[0]) / (K.radius[1] - K.radius[0]);
  const at: Vec3 = [rand() * 256, rand() * 256, rand() * 256];
  const main = coastline(radius, {
    long: lerp(K.long[0], K.long[1], rand() ** 1.5),
    headlands: kind === 'island' ? 1 + Math.floor(rand() * 3) : kind === 'islet' || kind === 'mesa' ? Math.floor(rand() * 3) : 0,
    coves: kind === 'island' ? 1 + Math.floor(rand() * 3) : kind === 'islet' || kind === 'mesa' ? Math.floor(rand() * 2) : 0,
    bent: kind !== 'rocks' && kind !== 'atoll' && rand() < I.bent,
    spit: kind === 'island' && rand() < I.spit,
    wear: lerp(K.wear[0], K.wear[1], rand()),
    size: Math.min(Math.max(radius * 0.8, 4), 32),
  }, rand, noise, at);
  const coast = (t: number) => radiusAt(main, t);
  const width = lerp(K.apron[0], K.apron[1], size) * lerp(0.85, 1.15, rand());
  // a lagoon well inside the land where it is broadest, drawn out along the coast, clear of the centre (which stays
  // land): shrunk until it is, or none. An atoll's is round its centre, all but a ring of land.
  let lagoon: Loop | null = null;
  // (the headland: where the coast reaches farthest out)
  let cape = 0;
  for (let k = 0; k < 64; k++) if (coast((k / 64) * 2 * Math.PI) > coast(cape)) cape = (k / 64) * 2 * Math.PI;
  const atoll = kind === 'atoll';
  if (atoll || (kind === 'island' && radius >= I.lagoon.from && radius <= I.lagoon.to && rand() < I.lagoon.share)) {
    const t = cape, ring = atoll ? lerp(I.atoll.ring[0], I.atoll.ring[1], rand()) : 10;
    let lr = atoll ? radius - ring : radius * lerp(I.lagoon.radius[0], I.lagoon.radius[1], rand());
    for (; lr >= 5 && !lagoon; lr *= atoll ? 0.95 : 0.9) {
      const out = atoll ? 0 : 10 + lr * 0.8, cx = Math.cos(t) * out, cz = Math.sin(t) * out;
      const l = blob(cx, cz, lr, rand, { long: atoll ? 0.1 : 0.3, turn: t + Math.PI / 2 });
      const inside = Array.from({ length: 64 }, (_, k) => (k / 64) * 2 * Math.PI).every((a) => {
        const r = radiusAt(l, a), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        return Math.hypot(x, z) < coast(Math.atan2(z, x)) - ring && (atoll || Math.hypot(x, z) > 8);
      });
      if (inside) lagoon = l;
    }
  }
  // offshore rocks out in the apron, past the beach's shallows
  const offshore: Offshore[] = [], mesa = kind === 'mesa';
  if (kind !== 'rocks' && rand() < (mesa ? I.offshore.stacks.mesa : I.offshore.share)) {
    for (let k = 0, n = 1 + +(rand() < 0.3); k < n; k++) {
      const stack = mesa || (kind === 'island' && rand() < I.offshore.stacks.share);
      const [r0, r1] = stack ? I.offshore.stacks.radius : I.offshore.radius;
      const t = rand() * 2 * Math.PI, r = lerp(r0, r1, rand());
      const out = Math.min(lerp(I.offshore.out[0], I.offshore.out[1], rand()), width - r - 10);
      if (out < I.offshore.out[0]) continue;
      const d = coast(t) + r + out;
      if (offshore.some((o) => Math.hypot(o.x - Math.cos(t) * d, o.z - Math.sin(t) * d) < o.radius + r + 12)) continue;
      offshore.push({ x: Math.cos(t) * d, z: Math.sin(t) * d, radius: r, stack });
    }
  }
  const rocks = offshore.map((o) => blob(o.x, o.z, o.radius, rand));
  const dry = (x: number, z: number) =>
    (Math.hypot(x, z) < coast(Math.atan2(z, x)) && !(lagoon && within(lagoon, x, z))) || rocks.some((l) => within(l, x, z));
  let far = Math.max(...main.table);
  for (const o of offshore) far = Math.max(far, Math.hypot(o.x, o.z) + o.radius * 1.3);
  const most = far + width * (1 + I.lobes.depth);
  // (the grid out over the apron's inner part; past it the distance runs on from its edge, near enough out there)
  const field = distanceField([main, ...(lagoon ? [lagoon] : []), ...rocks], dry, far + width * 0.6 + 6, kind === 'rocks' ? 0.5 : 1, radius * 0.2);
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

  // inland: the berm, then the hill rising from it to the summit by its form (the ridge along the land's middle, and
  // the form's mounds, each faded in from the beach), scaled by `relief` once measured to bring the summit to its
  // target, unless that would be too steep; each offshore rock a hump. (A mesa's hill is its top's low rise: its
  // cliff raises it to its summit.)
  const peak = Math.max(K.summit[0], lerp(K.summit[0], K.summit[1], size) * lerp(0.9, 1.1, rand()));
  const berm = Math.min(lerp(I.berm[0], I.berm[1], rand()), K.summit[0] * 0.6);
  const target = mesa ? berm + I.mesa.top : peak;
  const dome = target - berm;
  let relief = 1;
  // (the largest, seen from farthest off, one broad hill: a dome or a ridge)
  const form = kind === 'rocks' || mesa || atoll ? 'dome' : FORMS[Math.floor(rand() * (radius >= 45 ? 2 : FORMS.length))];
  /** How much of the hill is the ridge along the land's middle, the rest the form's mounds. */
  const along = { dome: 0.35, ridge: 1, saddle: 0.25, offset: 0.3 }[form];
  const land = Array.from({ length: field.land.length / 2 }, (_, k) => ({ x: field.land[2 * k], z: field.land[2 * k + 1] }))
    .map((p) => ({ ...p, u: -field.at(p.x, p.z) }))
    .filter((p) => !rocks.some((l) => within(l, p.x, p.z)));
  const middle = land.reduce((a, b) => (b.u > a.u ? b : a));
  const pick = (ok: (p: { x: number; z: number; u: number }) => boolean) => {
    for (let tries = 0; tries < 60; tries++) {
      const p = land[Math.floor(rand() * land.length)];
      if (ok(p)) return p;
    }
    return middle;
  };
  const apart = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  const mounds: Mound[] = [];
  // (each spreading to the nearest water's edge from its crest, or short of it)
  const spread = (p: { u: number }, k: number) => p.u * k * lerp(0.9, 1, rand());
  if (form === 'dome') mounds.push({ ...middle, foot: spread(middle, 1), height: 1 });
  if (form === 'ridge') {
    for (let n = 0; n < 2; n++) {
      const p = pick((q) => q.u > 0.6 * inmost);
      mounds.push({ ...p, foot: spread(p, 0.6), height: 0.25 });
    }
  }
  if (form === 'saddle') {
    const a = pick((p) => p.u > 0.55 * inmost && apart(p, middle) > 0.4 * inmost);
    const b = pick((p) => p.u > 0.55 * inmost && apart(p, a) > 1.2 * inmost);
    mounds.push({ ...a, foot: spread(a, 1), height: 1 }, { ...b, foot: spread(b, 1), height: lerp(0.6, 0.9, rand()) });
  }
  if (form === 'offset') {
    const p = pick((q) => q.u > 0.6 * inmost && q.u < 0.85 * inmost && apart(q, middle) > 0.35 * inmost);
    mounds.push({ ...p, foot: spread(p, 1), height: 1 });
  }
  /** The hill's shape at a point `u` metres inland, 0 at the beach to about 1. */
  const hill = (x: number, z: number, u: number) => {
    const t = Math.min(Math.max(-field.soft(x, z), 0) / field.inmost, 1);
    let v = along * slope(t) * smoothstep(0, 5, u);
    for (const m of mounds) v += (1 - along) * m.height * slope(Math.max(1 - Math.hypot(x - m.x, z - m.z) / m.foot, 0), 0.2, 0.45);
    return v;
  };
  const S = I.offshore.stacks;
  const humps = offshore.map((o) => ({ ...o, height: o.stack ? lerp(S.height[0], S.height[1], rand()) : lerp(0.7, 1.2, rand()) }));
  const dunesAt: Vec3 = [rand() * 256, rand() * 256, rand() * 256];

  /** The ground before the cliffs and terraces are cut into it. */
  const plain = (x: number, z: number) => {
    const exact = field.at(x, z);
    if (exact >= 0) {
      if (lagoon && within(lagoon, x, z)) return -shelve(exact, shallow);
      // (out past the ledge, the softened distance: no crease running out from an inward corner of the coast)
      const s = exact <= 8 ? exact : Math.max(8, exact + (field.soft(x, z) - exact) * smoothstep(8, 16, exact));
      const w = apronWidth(x, z);
      return -flankDepth(shelve(s, inner + (outer - inner) * smoothstep(0, w, s)), s - w);
    }
    const u = -exact, raised = hill(x, z, u), ridge = Math.min(raised * 4, 1);
    let h = berm * (1 - Math.exp((-u * I.beach) / berm)) + relief * dome * raised;
    for (const o of humps) {
      const d2 = ((x - o.x) ** 2 + (z - o.z) ** 2) / (o.radius * o.radius);
      // (a stack rising sheer from its waterline to its flat top)
      if (d2 < 1.5) h += o.height * (o.stack ? smoothstep(0, S.rise, u) : Math.max(1 - d2 / 1.5, 0) ** 2 * smoothstep(0, 1.5, u));
    }
    const ds = I.dunes.size;
    const dunes = noise.value(x / ds + dunesAt[0], z / ds + dunesAt[1], dunesAt[2]) + 0.5 * noise.value((2 * x) / ds + dunesAt[1], (2 * z) / ds + dunesAt[2], dunesAt[0]);
    return h + I.dunes.height * dunes * ridge * smoothstep(0, 6, u);
  };

  // the cliffs along stretches of the coast (a mesa's all round), and the terraces, if it has them
  const C = I.cliffs, T = I.terraces;
  const cliffAt: Vec3 = [rand() * 256, rand() * 256, rand() * 256];
  const cliffTop = kind === 'island' ? Math.min(lerp(C.height[0], C.height[1], rand()), target * C.most) : mesa ? peak - target : 0;
  const run = (mesa ? I.mesa.run : C.run) * cliffTop;
  const step = rand() < T.share && kind === 'island' ? lerp(T.step[0], T.step[1], rand()) : 0;
  // (the cliff round the headland, or across from it if the lagoon lies there)
  const cliffSide = lagoon ? cape + Math.PI : cape;
  const capeX = Math.cos(cliffSide) * coast(cliffSide), capeZ = Math.sin(cliffSide) * coast(cliffSide);
  /** 0…1: how much of a cliff the coast has near chart (x, z): round the headland, and where the noise says. */
  const cliffy = (x: number, z: number) => mesa ? 1 : Math.max(
    smoothstep(C.above, C.above + C.ends, noise.value(x / C.around + cliffAt[0], z / C.around + cliffAt[1], cliffAt[2])),
    1 - smoothstep(C.cape * 0.4 * radius, C.cape * radius, Math.hypot(x - capeX, z - capeZ)),
  );
  /** Height h stepped: flat treads, and between them risers a share T.riser of each step. */
  const terraced = (h: number) => {
    const f = h / step, k = Math.floor(f);
    return step * (k + smoothstep(1 - T.riser, 1, f - k));
  };
  const mound = (x: number, z: number) => {
    const h = plain(x, z), u = -field.at(x, z);
    if (u <= 0 || rocks.some((l) => within(l, x, z))) return h;
    // (the terraces begin behind the beach, where a cliff would)
    let out = step > 0 && h > berm ? lerp(h, berm + terraced(h - berm), smoothstep(C.foot, 2 * C.foot, u)) : h;
    if (cliffTop > 0) out += cliffTop * cliffy(x, z) * smoothstep(C.foot, C.foot + run, u) * (mesa ? 1 : 1 - smoothstep(C.back, 2 * C.back, u));
    return out;
  };

  /** The highest point, over every node on land (or only `nodes`). */
  const highest = (ground = mound, nodes: ArrayLike<number> = field.land) => {
    let top = -Infinity;
    for (let k = 0; k < nodes.length; k += 2) top = Math.max(top, ground(nodes[k], nodes[k + 1]));
    return top;
  };
  // the hill is fitted on the island itself, not its offshore rocks (a sea stack is steep, and may stand higher)
  const ashore: number[] = [];
  for (let k = 0; k < field.land.length; k += 2) {
    if (!rocks.some((l) => within(l, field.land[k], field.land[k + 1]))) ashore.push(field.land[k], field.land[k + 1]);
  }
  // (solved over a few rounds: the dunes' share doesn't scale with it)
  for (let round = 0; round < 3; round++) relief = Math.min(Math.max((relief * (target - berm)) / Math.max(highest(plain, ashore) - berm, 0.1), 0.2), 5);
  // no steeper than a palm stands on: the hill brought lower until it isn't (the berm's own rise is the beach's)
  for (let round = 0; round < 3; round++) {
    const slopes: number[] = [];
    for (let k = 0; k < ashore.length; k += 2) {
      const x = ashore[k], z = ashore[k + 1], e = 0.5;
      slopes.push(Math.hypot(plain(x + e, z) - plain(x - e, z), plain(x, z + e) - plain(x, z - e)) / (2 * e));
    }
    slopes.sort((p, q) => p - q);
    const steep = slopes[Math.floor(slopes.length * 0.99)] ?? 0;
    if (steep <= I.steepest[kind]) break;
    relief *= (I.steepest[kind] / steep) * 0.98;
  }
  const summit = highest();
  // how far it reaches: the farthest apron, then the flank carried down past the deepest floor
  const reach = most + I.flankEase + (I.floor - outer) / K.flank + (deepest - I.floor) / I.steep;
  // past the farthest apron, the water's edge is at least r − far away and the flank at least r − most beyond it
  const ceiling = (r: number) => (r <= most ? Infinity : -flankDepth(0, r - most));
  const face = (x: number, z: number) => {
    const e = 0.25;
    return Math.hypot(mound(x + e, z) - mound(x - e, z), mound(x, z + e) - mound(x, z - e)) / (2 * e) > I.bare;
  };
  return { kind, chart, radius, shelf: most, apron: width, reach, summit, offshore, coast, shore: field.at, mound, ceiling, face };
}
