// The rookery's ground (D19): a crew's campus on a planet of its own, built from the crew's seed as any planet is
// (planet.ts), but with one main island and a few islets round it instead of a race's islands spread over the whole
// sphere; and on the main island the nine buildings' plots and the crew's quay, each where it stands for good.
//
// The plots ring the main island just inside its coast, each facing the sea (its z axis out over the water, its x along
// the coast), in widths shared out round the coast by how wide each building grows at its third level (FOOTPRINT), so
// no two meet. The two that work the water (the sailing school and the fish market) stand at the waterline with their
// piers running out over it; the crew's quay is a jetty running out past the shallows, its two berths on either side.
// Every plot is levelled into a terrace: its top the highest of the ground under it, its foot the lowest.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { R, add, chartBasis, cross, dot, frameAt, fromChart, normalize, scale, type Chart, type Vec3 } from './sphere.ts';
import { random } from './random.ts';
import type { Noise3 } from './noise3.ts';
import { ISLANDS, KINDS, createIslandSite, type IslandSite } from './planet-islands.ts';
import type { Ground } from './island-place.ts';

/** The nine buildings of a crew's rookery (Phase B's, office.ts Building), in their order everywhere. */
export const BUILDINGS = ['factory', 'drawingLoft', 'testTank', 'foundry', 'sailingSchool', 'flightLoft', 'crowsNest', 'fishMarket', 'landingPad'] as const;
export type Building = (typeof BUILDINGS)[number];

/**
 * How much ground each building takes at its third level, metres, in its own axes (x along the coast, z out to sea):
 * half its width, how far it reaches back inland of its origin and how far forward of it; and whether it works the water
 * (its origin at the waterline, all of `front` a pier over the sea). Every level's form stands inside it (campus/).
 */
export const FOOTPRINT: Readonly<Record<Building, { half: number; back: number; front: number; water: boolean }>> = {
  factory: { half: 12.5, back: 7.5, front: 7.5, water: false },
  drawingLoft: { half: 7, back: 5, front: 5, water: false },
  testTank: { half: 12.5, back: 6.5, front: 6.5, water: false },
  foundry: { half: 11.5, back: 7.5, front: 7.5, water: false },
  sailingSchool: { half: 11, back: 7, front: 16, water: true },
  flightLoft: { half: 6.5, back: 6.5, front: 6.5, water: false },
  crowsNest: { half: 5, back: 5, front: 5, water: false },
  fishMarket: { half: 11, back: 6, front: 16, water: true },
  landingPad: { half: 11, back: 7, front: 7, water: false },
};

/** The crew's quay: a jetty this wide (half), running out this far from the waterline, its berths this far out and to
 *  either side of its line. */
export const QUAY = { half: 2.2, back: 3, front: 34, berth: { out: 20, side: 7.2 } } as const;

/** The campus planet's land: the main island's coast radius, metres, and how far its coast may come in or go out from
 *  that (shares of it); how many islets (at least, at most) and how far out from the main island's apron they lie; the
 *  gap between plots round the coast, a land plot's front's inset from the waterline and a water plot's origin's,
 *  metres; how much of the hill a terrace is cut into at its back at most, metres; of how many main islands drawn the
 *  one whose terraces stand lowest is taken, and of how many orders of the plots round its coast. */
export const CAMPUS = {
  radius: [50, 55], round: [0.6, 1.35], islets: [3, 8], out: [15, 90], gap: 3, inset: 1.5, water: 2.5, cut: 2.5, draws: 3, orders: 16,
} as const;

/** A plot: its chart (centre at its origin, axis its x along the coast; its z, axis × at, out to sea), the terrace's
 *  top and the lowest ground under it (metres over the sea), and its footprint. */
export interface Site {
  chart: Chart;
  top: number;
  low: number;
  half: number; back: number; front: number; water: boolean;
}
/** A building's plot. */
export interface Plot extends Site { building: Building }

/** The campus: the main island's centre and how far its apron reaches, metres; the nine plots in BUILDINGS' order;
 *  the crew's quay (a plot of its own), and its two berths (where a ship lies, the way her bow points). */
export interface Campus {
  centre: Vec3;
  reach: number;
  plots: readonly Plot[];
  quay: Site;
  berths: readonly { at: Vec3; heading: Vec3 }[];
}

/** A circle kept clear of rocks, palms and shrubs on an island's chart (planet-islands.ts IslandSite clearings). */
export interface Clearing { x: number; z: number; radius: number }

/** What stands round the coast: the nine, then the quay; its footprint by name. */
type Stand = Building | 'quay';
const footprintOf = (s: Stand) => (s === 'quay' ? { half: QUAY.half, back: QUAY.back, front: QUAY.front, water: true } : FOOTPRINT[s]);

/** Where each of the nine and the quay stand on the main island's chart: the angle round its centre, the plot's origin
 *  (x, z) and its seaward direction (unit, on the chart). Seeded: which goes where round the coast, of a few orders
 *  drawn the one whose highest terrace is lowest. */
export function standsOn(site: IslandSite, seed: number): Stood[] {
  const rand = random(seed * 2654435761 + 17);
  let best: Stood[] = [], lowest = Infinity;
  for (let k = 0; k < CAMPUS.orders; k++) {
    const order: Stand[] = [...BUILDINGS, 'quay'];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const stood = laid(site, order, rand() * 2 * Math.PI), boxes = stood.map(box);
    const meet = boxes.some((a, i) => boxes.some((b, j) => j > i && !apart(a, b)));
    const high = meet ? Infinity : Math.max(...stood.map((s) => {
      const t = terrace(site, s, footprintOf(s.stand));
      return t.top - t.low;
    }));
    if (k === 0 || high < lowest) [best, lowest] = [stood, high];
  }
  return best;
}

/** A stand's footprint's corners on the main island's chart, a gap's half round it. */
function box(s: Stood): (readonly [number, number])[] {
  const f = footprintOf(s.stand), g = CAMPUS.gap / 2, along = [-s.out[1], s.out[0]];
  return [[-f.half - g, -f.back - g], [f.half + g, -f.back - g], [f.half + g, f.front + g], [-f.half - g, f.front + g]]
    .map(([a, b]) => [s.x + along[0] * a + s.out[0] * b, s.z + along[1] * a + s.out[1] * b] as const);
}

/** Whether two convex quadrilaterals lie apart: some edge of either separates them. */
function apart(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): boolean {
  return [a, b].some((q) => q.some((v, i) => {
    const w = q[(i + 1) % q.length], n = [w[1] - v[1], v[0] - w[0]];
    const span = (r: readonly (readonly [number, number])[]) => r.map((c) => c[0] * n[0] + c[1] * n[1]);
    return Math.max(...span(a)) <= Math.min(...span(b)) || Math.max(...span(b)) <= Math.min(...span(a));
  }));
}

/** A stand where it stands on the main island's chart. */
interface Stood { stand: Stand; t: number; x: number; z: number; out: readonly [number, number] }

/** The stands in `order` round the coast from angle `from`. */
function laid(site: IslandSite, order: readonly Stand[], from: number): Stood[] {
  // each its share of the coast by its width at the ring the plots stand on, the slack spread evenly between them
  const ring = site.radius - 10, widths = order.map((s) => 2 * footprintOf(s).half + CAMPUS.gap);
  const slack = Math.max(0, 2 * Math.PI * ring - widths.reduce((a, b) => a + b, 0)) / order.length;
  let angle = from;
  return order.map((stand, i) => {
    const t = angle + (widths[i] / 2 + slack / 2) / ring;
    angle += (widths[i] + slack) / ring;
    // the coast there, and the way out to sea across it (the shore's distance rising)
    const c = site.coast(t), cx = Math.cos(t) * c, cz = Math.sin(t) * c, e = 0.5;
    const gx = site.shore(cx + e, cz) - site.shore(cx - e, cz), gz = site.shore(cx, cz + e) - site.shore(cx, cz - e);
    const g = Math.hypot(gx, gz) || 1, out = [gx / g, gz / g] as const;
    const f = footprintOf(stand), inset = f.water ? CAMPUS.water : f.front + CAMPUS.inset;
    return { stand, t, x: cx - out[0] * inset, z: cz - out[1] * inset, out };
  });
}

/** The ground kept clear on the main island for the plots and the quay: round each, as far as it reaches. */
export function clearingsOf(site: IslandSite, seed: number): Clearing[] {
  return standsOn(site, seed).map((s) => {
    const f = footprintOf(s.stand), reach = f.water ? f.back : Math.max(f.back, f.front);
    return { x: s.x, z: s.z, radius: Math.hypot(f.half, reach) + 2.5 };
  });
}

/**
 * The campus planet's islands (planet.ts in place of island-place.ts placeIslands): its main island where the banks
 * leave it the most room, a seeded number of islets spread round it past its apron, each where the most water is left
 * between it and the rest. The main island is drawn again from the seed until it has no offshore rock (a pier or the
 * quay would run into one); it carries its plots' clearings.
 */
export function placeCampus(ground: Ground, noise: Noise3, seed: number, deepest: number): IslandSite[] {
  const rand = random(seed * 7368787 + 11);
  // the candidates: points spread evenly over the sphere, 20 m apart, with the deeps' clearance at each
  const count = Math.ceil((4 * Math.PI * R * R) / 400), golden = Math.PI * (3 - Math.sqrt(5));
  const candidates = Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count, s = Math.sqrt(1 - y * y), a = i * golden;
    const p: Vec3 = [Math.cos(a) * s, y, Math.sin(a) * s];
    return { p, clear: ground(p).clearance };
  });
  const radius = CAMPUS.radius[0] + (CAMPUS.radius[1] - CAMPUS.radius[0]) * rand();
  // the main island: of a few drawn round enough to ring with plots (no long spit or deep bay) and with no offshore
  // rock, the one whose plots' terraces stand lowest
  const round = (s: IslandSite) => Array.from({ length: 72 }, (_, i) => s.coast((i / 36) * Math.PI) / s.radius).every((k) => k > CAMPUS.round[0] && k < CAMPUS.round[1]);
  const steepest = (s: IslandSite) => Math.max(...standsOn(s, seed).map((k) => {
    const t = terrace(s, k, footprintOf(k.stand));
    return t.top - t.low;
  }));
  let main: IslandSite | null = null, lowest = Infinity;
  for (let n = 0, fit = 0; fit < CAMPUS.draws && n < 24; n++) {
    const s = createIslandSite('island', { at: [0, 1, 0], axis: [1, 0, 0] }, radius, noise, seed * 31 + 1 + 977 * n, deepest);
    if (s.offshore.length > 0 || !round(s)) continue;
    fit++;
    const h = steepest(s);
    if (h < lowest) [main, lowest] = [s, h];
  }
  if (!main) throw new Error(`no campus island for seed ${seed}`);
  const best = candidates.reduce((a, b) => (b.clear > a.clear ? b : a));
  const turn = rand() * 2 * Math.PI, { up, east, north } = frameAt(best.p);
  const home: IslandSite = { ...main, chart: { at: up, axis: add(scale(east, Math.cos(turn)), north, Math.sin(turn)) } };
  const placed: IslandSite[] = [{ ...home, clearings: clearingsOf(home, seed) }];
  const arc = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * R;
  const islets = CAMPUS.islets[0] + Math.floor(rand() * (CAMPUS.islets[1] - CAMPUS.islets[0] + 1));
  const K = KINDS.islet;
  for (let i = 0; i < islets; i++) {
    const r = K.radius[0] + (K.radius[1] - K.radius[0]) * rand() ** K.skew;
    const shape = createIslandSite('islet', { at: [0, 1, 0], axis: [1, 0, 0] }, r, noise, seed * 31 + 100 + i, deepest);
    let spot: Vec3 | null = null, most = -Infinity;
    for (const c of candidates) {
      const fromHome = arc(c.p, home.chart.at) - home.shelf - shape.shelf;
      if (fromHome < CAMPUS.out[0] || fromHome > CAMPUS.out[1] || c.clear <= shape.shelf + K.clearance) continue;
      const room = Math.min(...placed.slice(1).map((s) => arc(c.p, s.chart.at) - s.shelf - shape.shelf), Infinity) + rand() * 20;
      if (room > most && room > ISLANDS.gap / 2) [spot, most] = [c.p, room];
    }
    if (!spot) continue;
    const f = frameAt(spot), a = rand() * 2 * Math.PI;
    placed.push({ ...shape, chart: { at: f.up, axis: add(scale(f.east, Math.cos(a)), f.north, Math.sin(a)) } });
  }
  return placed;
}

/** The terrace under a footprint on the main island at chart (x, z) facing `out`, by the island's own mound (the
 *  planet's ground there: no bank stands over it): its top the middle of the ground under it, or no more than CAMPUS.cut
 *  under the highest (cut into the hill at its back, built up at its front); and the lowest ground under it. */
function terrace(site: IslandSite, s: { x: number; z: number; out: readonly [number, number] }, f: { half: number; back: number; front: number; water: boolean }) {
  const heights: number[] = [];
  const ahead = f.water ? 0 : f.front;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const a = -f.half + (2 * f.half * i) / 6, b = -f.back + ((f.back + ahead) * j) / 6;
    // (x along the coast: the seaward direction turned a quarter)
    heights.push(site.mound(s.x + s.out[0] * b - s.out[1] * a, s.z + s.out[1] * b + s.out[0] * a));
  }
  heights.sort((a, b) => a - b);
  const middle = Math.max(heights[heights.length >> 1], heights[heights.length - 1] - CAMPUS.cut);
  return { top: Math.max(middle, f.water ? 1.6 : 0.8) + 0.25, low: heights[0] };
}

/** A stand's chart on the sphere: its centre at its origin, its x along the coast, its z out to sea. */
function chartOf(site: IslandSite, s: { x: number; z: number; out: readonly [number, number] }): Chart {
  const at = fromChart(site.chart, s.x, s.z), [e1, e2] = chartBasis(site.chart, at);
  const seaward = normalize(add(scale(e1, s.out[0]), e2, s.out[1]));
  return { at, axis: normalize(cross(at, seaward)) };
}

/** The campus on a campus planet (its first island the main one: placeCampus) of this seed. */
export function campusOf(islands: readonly IslandSite[], seed: number): Campus {
  const site = islands[0], stands = standsOn(site, seed);
  const siteOf = (stand: Stand): Site => {
    const s = stands.find((k) => k.stand === stand)!, f = footprintOf(stand);
    return { chart: chartOf(site, s), ...terrace(site, s, f), ...f };
  };
  const plots = BUILDINGS.map((building) => ({ building, ...siteOf(building) }));
  const quay = siteOf('quay');
  const berths = [-1, 1].map((side) => {
    const at = fromChart(quay.chart, side * QUAY.berth.side, QUAY.berth.out);
    return { at, heading: chartBasis(quay.chart, at)[1] };
  });
  return { centre: site.chart.at, reach: site.shelf, plots, quay, berths };
}
