// The world's public face. Everything outside src/sim/world imports the planet from here and nowhere else:
// which region a point is in and how it blends into its neighbours, how high the ground is, the currents,
// and the fixed sites (landmarks, beacons, loot spots). Units are metres on a sphere of radius R.
//
// Everything here is deterministic: only + - * /, Math.sqrt, Math.floor, Math.abs, Math.min, Math.max and the
// helpers in ../math.ts (dsin, dcos, datan2, ...), never Math.sin or Math.random, so the simulation stays
// bit-identical in Node, Chromium and WebKit.
//
// Pass 1 contract: these names and signatures are what the simulation and the renderer code against.
// Each region's terrain is its own code, in ./regions/<id>.ts, written in that region's local chart. This file
// places the charts on the sphere, blends neighbours across their borders, carves the current lanes, and bakes
// heights into a grid for the simulation.
import { PI, dcos, dot, dsin, normalize, set, v3, type V3 } from '../math.ts';
import { R, faceDir, faceUV, fromLatLon, localFrame, type FaceUV } from '../sphere.ts';
import { smax, smin, smoothstep } from './kit.ts';
import type { LaneSpec, ObstacleKind, RegionSpec, ZoneKind } from './spec.ts';
import { iceCrown, FLOE_RINGS } from './regions/iceCrown.ts';
import { fjords } from './regions/fjords.ts';
import { mistwood } from './regions/mistwood.ts';
import { spires } from './regions/spires.ts';
import { narrows } from './regions/narrows.ts';
import { basaltStacks } from './regions/basaltStacks.ts';
import { kelpShallows } from './regions/kelpShallows.ts';
import { blossomRun } from './regions/blossomRun.ts';
import { glassSea } from './regions/glassSea.ts';
import { jadeShoals } from './regions/jadeShoals.ts';
import { coralAtolls } from './regions/coralAtolls.ts';
import { spiceIsles } from './regions/spiceIsles.ts';
import { fireArchipelago } from './regions/fireArchipelago.ts';
import { weepingIsle } from './regions/weepingIsle.ts';
import { mangroveLabyrinth } from './regions/mangroveLabyrinth.ts';
import { maelstrom, VORTEX_SPEC } from './regions/maelstrom.ts';

export type { LaneSpec, ObstacleKind, RegionSpec, ZoneKind } from './spec.ts';

export type RegionId =
  | 'iceCrown'
  | 'fjords' | 'mistwood' | 'spires' | 'narrows' | 'basaltStacks' | 'kelpShallows' | 'blossomRun'
  | 'glassSea' | 'jadeShoals' | 'coralAtolls' | 'spiceIsles' | 'fireArchipelago' | 'weepingIsle' | 'mangroveLabyrinth'
  | 'maelstrom';

export type PerkId =
  | 'frostShot' | 'fastRepair' | 'fogSight' | 'spotter' | 'longRange' | 'fastReload' | 'hiddenWake' | 'quickGust'
  | 'cheapDeliveries' | 'shallowDraft' | 'lootSense' | 'betterLoot' | 'fireShot' | 'quickHands' | 'tightTurns' | 'currentRider';

export type WeatherKind = 'clear' | 'fog' | 'rain' | 'thunder' | 'calm' | 'snow' | 'ash';

export interface RegionInfo {
  id: RegionId;
  name: string;
  /** Centre, in degrees. Increasing longitude runs east. */
  lat: number;
  lon: number;
  ring: 'pole' | 'north' | 'south';
  landmark: string;
  perk: PerkId;
  perkName: string;
  perkText: string;
  weather: readonly WeatherKind[];
  /** Indices of the regions that share a border with this one. */
  neighbours: readonly number[];
}

const RING = 360 / 7, RING_LAT = 31;

const north = (k: number) => ({ ring: 'north' as const, lat: RING_LAT, lon: k * RING });
const south = (k: number) => ({ ring: 'south' as const, lat: -RING_LAT, lon: k * RING - RING / 2 });

// Index layout: 0 the Ice Crown, 1–7 the northern ring, 8–14 the southern ring, 15 the Maelstrom.
// Southern region j sits between northern regions j-1 and j, so each ring region touches two in the other ring.
const N = (k: number) => 1 + ((k + 7) % 7), S = (k: number) => 8 + ((k + 7) % 7);
const ringNeighbours = (i: number): number[] =>
  i <= 7 ? [N(i - 2), N(i), 0, S(i - 1), S(i)] : [S(i - 9), S(i - 7), 15, N(i - 9), N(i - 8)];

const INFO: Omit<RegionInfo, 'neighbours'>[] = [
  { id: 'iceCrown', name: 'the Ice Crown', ring: 'pole', lat: 90, lon: 0, landmark: 'the Crown', perk: 'frostShot', perkName: 'Frost Shot', perkText: 'Your hits slow ships for a moment.', weather: ['snow', 'fog'] },
  { id: 'fjords', name: 'the Fjords', ...north(0), landmark: 'Thunder Falls', perk: 'fastRepair', perkName: 'Fast Repair', perkText: 'You repair twice as fast in your own water.', weather: ['fog', 'rain'] },
  { id: 'mistwood', name: 'Mistwood', ...north(1), landmark: 'the Hollow Cedar', perk: 'fogSight', perkName: 'Fog Sight', perkText: 'You see at full range through fog and at night.', weather: ['fog'] },
  { id: 'spires', name: 'the Spires', ...north(2), landmark: 'the Needle', perk: 'spotter', perkName: 'Spotter', perkText: 'Ships you hit show on the map for a few seconds.', weather: ['rain', 'thunder'] },
  { id: 'narrows', name: 'the Narrows', ...north(3), landmark: 'the Gorge', perk: 'longRange', perkName: 'Long Range', perkText: 'Your weapons reach about 15% further.', weather: ['calm', 'rain'] },
  { id: 'basaltStacks', name: 'the Basalt Stacks', ...north(4), landmark: 'Moonbow Arch', perk: 'fastReload', perkName: 'Fast Reload', perkText: 'You reload about 30% faster.', weather: ['fog', 'rain'] },
  { id: 'kelpShallows', name: 'the Kelp Shallows', ...north(5), landmark: 'the Kelp Cathedral', perk: 'hiddenWake', perkName: 'Hidden Wake', perkText: 'Your wake does not show, and you drop off the map.', weather: ['clear', 'calm'] },
  { id: 'blossomRun', name: 'Blossom Run', ...north(6), landmark: 'the Great Cherry', perk: 'quickGust', perkName: 'Quick Gust', perkText: 'Your gust recharges faster.', weather: ['clear', 'rain'] },
  { id: 'glassSea', name: 'the Glass Sea', ...south(0), landmark: 'Glasswater', perk: 'cheapDeliveries', perkName: 'Cheap Deliveries', perkText: 'Gull deliveries cost about 30% less.', weather: ['calm', 'clear'] },
  { id: 'jadeShoals', name: 'the Jade Shoals', ...south(1), landmark: 'the Sandbar Light', perk: 'shallowDraft', perkName: 'Shallow Draft', perkText: 'You can cross sandbars without running aground.', weather: ['clear', 'calm'] },
  { id: 'coralAtolls', name: 'the Coral Atolls', ...south(2), landmark: 'the Great Reef', perk: 'lootSense', perkName: 'Loot Sense', perkText: 'Nearby loot shows on your map.', weather: ['clear', 'rain'] },
  { id: 'spiceIsles', name: 'the Spice Isles', ...south(3), landmark: 'Spice Cove', perk: 'betterLoot', perkName: 'Better Loot', perkText: 'Loot you open rolls one rarity higher.', weather: ['rain', 'thunder'] },
  { id: 'fireArchipelago', name: 'the Fire Archipelago', ...south(4), landmark: 'Cinder Peak', perk: 'fireShot', perkName: 'Fire Shot', perkText: 'Your hits set ships burning.', weather: ['ash'] },
  { id: 'weepingIsle', name: 'the Weeping Isle', ...south(5), landmark: 'the Weeping Isle', perk: 'quickHands', perkName: 'Quick Hands', perkText: 'You use consumables about 30% faster.', weather: ['rain', 'fog'] },
  { id: 'mangroveLabyrinth', name: 'the Mangrove Labyrinth', ...south(6), landmark: 'the Root Gate', perk: 'tightTurns', perkName: 'Tight Turns', perkText: 'You turn much more sharply.', weather: ['rain', 'fog'] },
  { id: 'maelstrom', name: 'the Maelstrom', ring: 'pole', lat: -90, lon: 0, landmark: 'the Eye', perk: 'currentRider', perkName: 'Current Rider', perkText: 'Currents push you about 50% harder.', weather: ['rain', 'thunder'] },
];

export const REGION_COUNT = 16;

export const REGIONS: readonly RegionInfo[] = INFO.map((r, i) => ({
  ...r,
  neighbours: i === 0 ? [1, 2, 3, 4, 5, 6, 7] : i === 15 ? [8, 9, 10, 11, 12, 13, 14] : ringNeighbours(i),
}));

export const regionIndex = (id: RegionId): number => REGIONS.findIndex((r) => r.id === id);

/** Unit vectors to each region's centre. */
export const CENTRES: readonly V3[] = REGIONS.map((r) => fromLatLon(r.lat * (PI / 180), r.lon * (PI / 180), v3()));

/** The region that owns p (p is a unit vector from the planet's centre). */
export function regionAt(p: V3): number {
  let best = 0, bd = -2;
  for (let i = 0; i < REGION_COUNT; i++) {
    const d = dot(p, CENTRES[i]);
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}

/** The two nearest regions and how far p has crossed toward the second: t is 0 deep inside a, 0.5 on the border. */
export interface RegionMix { a: number; b: number; t: number }

/** Half-width of the blend band either side of a border, in metres. */
export const BLEND = 60;

export function regionMix(p: V3, out: RegionMix = { a: 0, b: 0, t: 0 }): RegionMix {
  let a = 0, b = 1, da = -2, db = -2;
  for (let i = 0; i < REGION_COUNT; i++) {
    const d = dot(p, CENTRES[i]);
    if (d > da) { b = a; db = da; a = i; da = d; }
    else if (d > db) { b = i; db = d; }
  }
  // Distance to the bisector between the two centres, along the surface (small-angle form).
  const ca = CENTRES[a], cb = CENTRES[b];
  const gx = ca.x - cb.x, gy = ca.y - cb.y, gz = ca.z - cb.z;
  const gap = Math.sqrt(gx * gx + gy * gy + gz * gz);
  const toBorder = ((da - db) / gap) * R;
  out.a = a;
  out.b = b;
  out.t = toBorder >= BLEND ? 0 : 0.5 * (1 - toBorder / BLEND);
  return out;
}

/** Tides move the sea level between -TIDE_AMPLITUDE and +TIDE_AMPLITUDE metres. The simulation owns the clock. */
export const TIDE_AMPLITUDE = 1;

/** A ship runs aground where the ground is less than DRAFT metres below the sea level. Tidal sills sit between -2.5 and -0.5 m. */
export const DRAFT = 1.5;

// ---------------------------------------------------------------------------------------------------------
// Charts: each region's local tangent frame. x = R (p · east), y = R (p · north), an orthographic projection.

const SPECS: readonly RegionSpec[] = [
  iceCrown, fjords, mistwood, spires, narrows, basaltStacks, kelpShallows, blossomRun,
  glassSea, jadeShoals, coralAtolls, spiceIsles, fireArchipelago, weepingIsle, mangroveLabyrinth, maelstrom,
];

export interface Chart { readonly c: V3; readonly e: V3; readonly n: V3 }

export const CHARTS: readonly Chart[] = CENTRES.map((c) => {
  const e = v3(), n = v3();
  localFrame(c, e, n);
  return { c, e, n };
});

export interface ChartPoint { x: number; y: number }

/** p in region ri's chart, metres east and north of its centre. */
export function toChart(ri: number, p: V3, out: ChartPoint = { x: 0, y: 0 }): ChartPoint {
  const k = CHARTS[ri];
  out.x = R * dot(p, k.e);
  out.y = R * dot(p, k.n);
  return out;
}

/** The point at (x, y) in region ri's chart, as a unit vector. */
export function fromChart(ri: number, x: number, y: number, out: V3 = v3()): V3 {
  const k = CHARTS[ri], s = x / R, t = y / R, w = Math.sqrt(Math.max(0, 1 - s * s - t * t));
  return normalize(set(out, k.e.x * s + k.n.x * t + k.c.x * w, k.e.y * s + k.n.y * t + k.c.y * w, k.e.z * s + k.n.z * t + k.c.z * w));
}

/** The unit tangent at p pointing along a chart bearing (degrees clockwise from the chart's north). */
export function chartTangent(ri: number, p: V3, bearing: number, out: V3 = v3()): V3 {
  const k = CHARTS[ri], a = bearing * (PI / 180), s = dsin(a), c = dcos(a);
  set(out, k.e.x * s + k.n.x * c, k.e.y * s + k.n.y * c, k.e.z * s + k.n.z * c);
  const d = dot(out, p);
  return normalize(set(out, out.x - d * p.x, out.y - d * p.y, out.z - d * p.z));
}

/** One region's own height function at p, unblended. For debugging and the renderer's region previews. */
export function regionHeight(ri: number, p: V3): number {
  const k = CHARTS[ri];
  return SPECS[ri].height(R * dot(p, k.e), R * dot(p, k.n));
}

// ---------------------------------------------------------------------------------------------------------
// Blending. Every region whose border is within 2·BLEND of chord distance takes part. Each region's weight w
// is 1 at its own border and inside it, falling to 0 a band's width into the neighbour; its landforms sink as
// they cross, and the highest wins (smoothly). So both regions' shapes reach across the band and mix there,
// and the height is continuous everywhere, including where three regions meet.

/**
 * How far a region's landforms have sunk s chord-metres past its border (about 2 m of s to a metre of ground).
 * They ease in over the first 20 m, then slope down at most 1.5 m a metre, like a steep shore rather than a wall
 * along the border, and only the last 15 m drop away fast, to bury whatever is still standing.
 */
function sink(s: number): number {
  const x = s / 2, u = smoothstep(0.75 * 2 * BLEND, 2 * BLEND, s);
  return 1.5 * (x < 20 ? (x * x) / 40 : x - 10) + 300 * u * u * u;
}
const CHORD = new Float64Array(REGION_COUNT);

/** Blend weights at p, one per region, summing to 1. For blending materials, water and sound at borders. */
export function regionWeights(p: V3, out: Float64Array = new Float64Array(REGION_COUNT)): Float64Array {
  let m = 9, sum = 0;
  for (let i = 0; i < REGION_COUNT; i++) {
    const c = CENTRES[i], ch = Math.sqrt(Math.max(0, 2 - 2 * (p.x * c.x + p.y * c.y + p.z * c.z)));
    CHORD[i] = ch;
    if (ch < m) m = ch;
  }
  for (let i = 0; i < REGION_COUNT; i++) {
    const w = 1 - smoothstep(0, 2 * BLEND, R * (CHORD[i] - m));
    out[i] = w;
    sum += w;
  }
  for (let i = 0; i < REGION_COUNT; i++) out[i] /= sum;
  return out;
}

function blended(p: V3): number {
  let m = 9;
  for (let i = 0; i < REGION_COUNT; i++) {
    const c = CENTRES[i], ch = Math.sqrt(Math.max(0, 2 - 2 * (p.x * c.x + p.y * c.y + p.z * c.z)));
    CHORD[i] = ch;
    if (ch < m) m = ch;
  }
  let h = -1e9;
  for (let i = 0; i < REGION_COUNT; i++) {
    const s = R * (CHORD[i] - m);
    if (s >= 2 * BLEND) continue;
    const k = CHARTS[i], term = SPECS[i].height(R * dot(p, k.e), R * dot(p, k.n)) - sink(s);
    h = h === -1e9 ? term : smax(h, term, 3);
  }
  return h;
}

// ---------------------------------------------------------------------------------------------------------
// Currents. The Great Current runs east along the equator; each region adds lanes that cross into a
// neighbour; the Maelstrom's vortex pulls toward the Eye. Lanes are carved into the ground so they stay open.

/** The Great Current: core half-width and speed, and where its flow fades out. */
export const GREAT_CURRENT = { half: 16, fade: 34, speed: 4 } as const;

export interface CurrentLane {
  name: string;
  /** The region whose module drew it. */
  region: number;
  /** Points along the lane, every few metres, from source to mouth. */
  pts: readonly V3[];
  width: number;
  speed: number;
  /** A cap around the lane, for quick rejection: its centre and the cosine of its angular radius. */
  centre: V3;
  cos: number;
}

function laneOf(ri: number, l: LaneSpec): CurrentLane {
  const pts: V3[] = [];
  for (let i = 0; i + 3 < l.pts.length; i += 2) {
    const ax = l.pts[i], ay = l.pts[i + 1], bx = l.pts[i + 2], by = l.pts[i + 3];
    const n = Math.max(1, Math.ceil(Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) / 6));
    for (let k = 0; k < n; k++) pts.push(fromChart(ri, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n));
  }
  pts.push(fromChart(ri, l.pts[l.pts.length - 2], l.pts[l.pts.length - 1]));
  const centre = v3();
  for (const q of pts) set(centre, centre.x + q.x, centre.y + q.y, centre.z + q.z);
  normalize(centre);
  let cos = 1;
  for (const q of pts) cos = Math.min(cos, dot(q, centre));
  // Widen the cap by the lane's width and the carve's banks.
  const pad = (l.width + 40) / R;
  cos = cos * (1 - (pad * pad) / 2) - Math.sqrt(Math.max(0, 1 - cos * cos)) * pad;
  return { name: l.name, region: ri, pts, width: l.width, speed: l.speed, centre, cos };
}

export const CURRENTS: readonly CurrentLane[] = SPECS.flatMap((s, ri) => s.lanes.map((l) => laneOf(ri, l)));

/** Distance in metres from p to a lane's centre line, and (in LANE_HIT) the segment it is nearest. */
const LANE_HIT = { seg: 0, along: 0, d: 0 };
function laneDistance(l: CurrentLane, p: V3): number {
  let best = 1e9, seg = 0, along = 0;
  const pts = l.pts;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, qx = p.x - a.x, qy = p.y - a.y, qz = p.z - a.z;
    const l2 = dx * dx + dy * dy + dz * dz;
    let t = l2 > 0 ? (qx * dx + qy * dy + qz * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = qx - dx * t, ey = qy - dy * t, ez = qz - dz * t, d2 = ex * ex + ey * ey + ez * ez;
    if (d2 < best) { best = d2; seg = i; along = t; }
  }
  LANE_HIT.seg = seg;
  LANE_HIT.along = along;
  LANE_HIT.d = R * Math.sqrt(best);
  return LANE_HIT.d;
}

/** Distance from the equator in metres. */
const fromEquator = (p: V3): number => Math.abs(p.y) * R * (1 + (p.y * p.y) / 6);

/** Lanes stay open: the ground is pulled down to a channel with banks at most this steep. */
function carve(p: V3, h: number): number {
  const de = fromEquator(p);
  if (de < GREAT_CURRENT.fade + 40) h = smin(h, -7 + 2.4 * Math.max(0, de - GREAT_CURRENT.half), 3);
  for (let i = 0; i < CURRENTS.length; i++) {
    const l = CURRENTS[i];
    if (dot(p, l.centre) < l.cos) continue;
    const d = laneDistance(l, p), half = l.width / 2;
    if (d < half + 40) h = smin(h, -5 + 2 * Math.max(0, d - half * 0.6), 3);
  }
  return h;
}

// ---------------------------------------------------------------------------------------------------------
// Heights

/** The exact ground height at p, blended and carved, for the renderer's meshes at any resolution. */
export function heightExact(p: V3): number {
  return carve(p, blended(p));
}

// The simulation's heights come from a grid baked on the cube sphere (equal-angle faces, as sphere.ts), tile
// by tile the first time a ship needs one, so startup costs nothing. Every node is a pure function of its
// position, so the order tiles bake in never changes a value.

/** Cells along each cube face edge; a cell is about 2.3 m across. */
export const HEIGHT_GRID = 384;
const GT = 16, TILES = HEIGHT_GRID / GT, NODE_ROW = HEIGHT_GRID + 1, FACE_NODES = NODE_ROW * NODE_ROW;
let NODES: Float32Array = new Float32Array(6 * FACE_NODES);
let BAKED = new Uint8Array(6 * TILES * TILES);
const PROBE = v3();

function bakeTile(face: number, ti: number, tj: number): void {
  const i0 = ti * GT, j0 = tj * GT, base = face * FACE_NODES;
  for (let j = j0; j <= j0 + GT; j++) {
    for (let i = i0; i <= i0 + GT; i++) {
      faceDir(face, (i / HEIGHT_GRID) * 2 - 1, (j / HEIGHT_GRID) * 2 - 1, PROBE);
      NODES[base + j * NODE_ROW + i] = heightExact(PROBE);
    }
  }
  BAKED[(face * TILES + tj) * TILES + ti] = 1;
}

const UV: FaceUV = { face: 0, u: 0, v: 0 };

/** Height of the ground above mean sea level in metres: positive is land, negative is the sea floor. */
export function heightAt(p: V3): number {
  faceUV(p, UV);
  const fx = (UV.u + 1) * 0.5 * HEIGHT_GRID, fy = (UV.v + 1) * 0.5 * HEIGHT_GRID;
  const i = Math.max(0, Math.min(HEIGHT_GRID - 1, Math.floor(fx))), j = Math.max(0, Math.min(HEIGHT_GRID - 1, Math.floor(fy)));
  const ti = Math.floor(i / GT), tj = Math.floor(j / GT), f = UV.face;
  if (BAKED[(f * TILES + tj) * TILES + ti] === 0) bakeTile(f, ti, tj);
  const tx = Math.max(0, Math.min(1, fx - i)), ty = Math.max(0, Math.min(1, fy - j)), b = f * FACE_NODES + j * NODE_ROW + i;
  const h0 = NODES[b] + (NODES[b + 1] - NODES[b]) * tx, h1 = NODES[b + NODE_ROW] + (NODES[b + NODE_ROW + 1] - NODES[b + NODE_ROW]) * tx;
  return h0 + (h1 - h0) * ty;
}

/** Bakes every tile now and returns the grid, e.g. in a worker, to hand to adoptHeights on the main thread. */
export function bakeHeights(): Float32Array {
  for (let f = 0; f < 6; f++) for (let tj = 0; tj < TILES; tj++) for (let ti = 0; ti < TILES; ti++) {
    if (BAKED[(f * TILES + tj) * TILES + ti] === 0) bakeTile(f, ti, tj);
  }
  return NODES;
}

/** Installs a grid baked elsewhere by bakeHeights (same code, so the same values). */
export function adoptHeights(grid: Float32Array): void {
  if (grid.length !== NODES.length) throw new RangeError('adoptHeights: wrong grid size');
  NODES = grid;
  BAKED = new Uint8Array(6 * TILES * TILES).fill(1);
}

/** True where a ship can float at sea level `tide` (metres, between -TIDE_AMPLITUDE and +TIDE_AMPLITUDE). */
export const navigable = (p: V3, tide = 0): boolean => heightAt(p) < tide - DRAFT;

// ---------------------------------------------------------------------------------------------------------
// The surface current

const EAST = v3(), TAN = v3();

/** The surface current at p, in m/s, tangent to the sphere: the Great Current, the region lanes and the vortex. */
export function currentAt(p: V3, out: V3): V3 {
  set(out, 0, 0, 0);
  // The Great Current, east along the equator.
  const de = fromEquator(p);
  if (de < GREAT_CURRENT.fade) {
    const s = GREAT_CURRENT.speed * (1 - smoothstep(GREAT_CURRENT.half, GREAT_CURRENT.fade, de));
    set(EAST, p.z, 0, -p.x);
    const l = Math.sqrt(EAST.x * EAST.x + EAST.z * EAST.z);
    if (l > 1e-9) set(out, (EAST.x / l) * s, 0, (EAST.z / l) * s);
  }
  // The lanes.
  for (let i = 0; i < CURRENTS.length; i++) {
    const l = CURRENTS[i];
    if (dot(p, l.centre) < l.cos) continue;
    const d = laneDistance(l, p), half = l.width / 2;
    if (d >= half) continue;
    const n = l.pts.length - 1, at = (LANE_HIT.seg + LANE_HIT.along) / n;
    const ends = smoothstep(0, 0.08, at) * (1 - smoothstep(0.9, 1, at));
    const s = l.speed * (1 - smoothstep(half * 0.4, half, d)) * ends;
    if (s <= 0) continue;
    const a = l.pts[LANE_HIT.seg], b = l.pts[LANE_HIT.seg + 1];
    set(TAN, b.x - a.x, b.y - a.y, b.z - a.z);
    const k = dot(TAN, p);
    normalize(set(TAN, TAN.x - k * p.x, TAN.y - k * p.y, TAN.z - k * p.z));
    set(out, out.x + TAN.x * s, out.y + TAN.y * s, out.z + TAN.z * s);
  }
  vortexAt(p, out, 1);
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// The Maelstrom's vortex

export interface Vortex {
  /** Unit vector to the Eye. */
  pos: V3;
  /** Radius of the whirlpool basin, of the calm eye, and the peak swirl and inflow speeds (m/s). */
  r: number;
  eye: number;
  swirl: number;
  inflow: number;
}

const MAEL = 15;
export const VORTEX: Vortex = { pos: fromChart(MAEL, VORTEX_SPEC.x, VORTEX_SPEC.y), ...VORTEX_SPEC };
const RADIAL = v3(), SPIN = v3();

/** Adds the vortex's flow at p to out, scaled by strength (1 normally; the Maelstrom's event raises it). */
export function vortexAt(p: V3, out: V3, strength = 1): V3 {
  const c = VORTEX.pos, d = dot(p, c), lim = 1 - (VORTEX.r * VORTEX.r) / (2 * R * R);
  if (d < lim) return out;
  // Toward the eye, along the surface.
  set(RADIAL, c.x - d * p.x, c.y - d * p.y, c.z - d * p.z);
  const len = Math.sqrt(RADIAL.x * RADIAL.x + RADIAL.y * RADIAL.y + RADIAL.z * RADIAL.z);
  if (len < 1e-12) return out;
  const rho = R * Math.sqrt(Math.max(0, 2 - 2 * d));
  set(RADIAL, RADIAL.x / len, RADIAL.y / len, RADIAL.z / len);
  // Clockwise seen from above the south pole: the spin is p × toward-eye.
  set(SPIN, p.y * RADIAL.z - p.z * RADIAL.y, p.z * RADIAL.x - p.x * RADIAL.z, p.x * RADIAL.y - p.y * RADIAL.x);
  const u = rho / VORTEX.r, rim = 1 - smoothstep(0.75, 1, u), calm = smoothstep(VORTEX.eye * 0.6, VORTEX.eye * 1.6, rho);
  const swirl = strength * VORTEX.swirl * rim * calm * (0.45 + 0.55 * (1 - u));
  const inflow = strength * VORTEX.inflow * rim * calm;
  return set(out, out.x + SPIN.x * swirl + RADIAL.x * inflow, out.y + SPIN.y * swirl + RADIAL.y * inflow,
    out.z + SPIN.z * swirl + RADIAL.z * inflow);
}

// ---------------------------------------------------------------------------------------------------------
// Sites

export interface Site {
  region: number;
  /** Unit vector. */
  pos: V3;
  /** Unit tangent the site faces. */
  facing: V3;
  /** Radius in metres. */
  r: number;
}

export interface Landmark extends Site {
  name: string;
  /** Height in metres above sea level. */
  height: number;
}

/** A natural beacon: where its light sits, and how high above sea level. */
export interface Beacon extends Site {
  height: number;
}

const site = (ri: number, x: number, y: number, bearing: number, r: number): Site => {
  const pos = fromChart(ri, x, y);
  return { region: ri, pos, facing: chartTangent(ri, pos, bearing), r };
};

export const LANDMARKS: readonly Landmark[] = SPECS.map((s, i) => {
  const m = s.landmark;
  return { ...site(i, m.x, m.y, m.bearing, m.r), name: REGIONS[i].landmark, height: m.height };
});

export const BEACONS: readonly Beacon[] = SPECS.map((s, i) => ({ ...site(i, s.beacon.x, s.beacon.y, s.beacon.bearing ?? 0, 4), height: s.beacon.height }));

/** Loot spots, 6 or more per region, all in water a ship can reach. r is the pickup radius. */
export const LOOT_SPOTS: readonly Site[] = SPECS.flatMap((s, i) => {
  const out: Site[] = [];
  for (let k = 0; k + 1 < s.loot.length; k += 2) out.push(site(i, s.loot[k], s.loot[k + 1], 0, 6));
  return out;
});

/** Tidal passages: sills that open at high tide and close at low tide. */
export const TIDAL_PASSAGES: readonly Site[] = SPECS.flatMap((s, i) => {
  const out: Site[] = [];
  for (let k = 0; k + 1 < s.tidal.length; k += 2) out.push(site(i, s.tidal[k], s.tidal[k + 1], 0, 10));
  return out;
});

// ---------------------------------------------------------------------------------------------------------
// Obstacles the heightfield can't express, and zones

export interface Obstacle extends Site {
  kind: ObstacleKind;
  /** Top, metres above sea level. */
  height: number;
  /** Length along `facing` (logs, curtains). */
  length: number;
  /** A log's bore radius, or the clearance under an arch. */
  inner: number;
}

export const OBSTACLES: readonly Obstacle[] = SPECS.flatMap((s, i) => s.obstacles.map((o) => ({
  ...site(i, o.x, o.y, o.bearing, o.r), kind: o.kind, height: o.height, length: o.length ?? 0, inner: o.inner ?? 0,
})));

const OB_REACH = OBSTACLES.map((o) => {
  const reach = (Math.max(o.r, o.length / 2) + 2) / R;
  return 1 - (reach * reach) / 2;
});

/**
 * The obstacle that is solid at the waterline at p, or -1. Arches and curtains are never solid (their pillars
 * are terrain); a log is solid in its walls and open along its bore; a trunk is solid across its radius.
 */
export function obstacleAt(p: V3): number {
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    if (o.kind === 'arch' || o.kind === 'curtain') continue;
    const d = dot(p, o.pos);
    if (d < OB_REACH[i]) continue;
    const qx = (p.x - o.pos.x) * R, qy = (p.y - o.pos.y) * R, qz = (p.z - o.pos.z) * R;
    if (o.kind === 'trunk') {
      if (qx * qx + qy * qy + qz * qz < o.r * o.r) return i;
      continue;
    }
    const along = qx * o.facing.x + qy * o.facing.y + qz * o.facing.z;
    if (Math.abs(along) > o.length / 2) continue;
    const side = Math.sqrt(Math.max(0, qx * qx + qy * qy + qz * qz - along * along));
    if (side < o.r && side > o.inner) return i;
  }
  return -1;
}

export const ZONE: Readonly<Record<ZoneKind, number>> = {
  kelp: 1, hot: 2, mist: 4, canopy: 8, curtain: 16, slush: 32, lagoon: 64, petals: 128, sulphur: 256, spray: 512,
};

export interface Zone extends Site {
  kind: ZoneKind;
}

export const ZONES: readonly Zone[] = SPECS.flatMap((s, i) => s.zones.map((z) => ({ ...site(i, z.x, z.y, 0, z.r), kind: z.kind })));
const ZONE_COS = ZONES.map((z) => 1 - (z.r * z.r) / (2 * R * R));

/** The zones covering p, as a bitmask of ZONE flags. */
export function zonesAt(p: V3): number {
  let m = 0;
  for (let i = 0; i < ZONES.length; i++) if (dot(p, ZONES[i].pos) > ZONE_COS[i]) m |= ZONE[ZONES[i].kind];
  return m;
}

// ---------------------------------------------------------------------------------------------------------
// The Ice Crown's floes: discs that ride slow rings around the pole, each ring at its own speed, so the lanes
// between clumps open and close. Pure functions of the match time t (seconds).

export interface Floe {
  ring: number;
  /** Ring radius from the pole, metres. */
  orbit: number;
  /** Angle at t = 0, radians. */
  angle: number;
  /** Floe radius, metres. */
  size: number;
  /** Radians per second; the sign is the direction. */
  speed: number;
}

export const FLOES: readonly Floe[] = FLOE_RINGS.flatMap((ring, k) => ring.floes.map((f) => ({
  ring: k, orbit: ring.r + f.dr, angle: f.angle, size: f.size, speed: ring.speed,
})));

/** Where floe f is at time t. */
export function floePos(f: Floe, t: number, out: V3 = v3()): V3 {
  const a = f.angle + f.speed * t;
  return fromChart(0, f.orbit * dsin(a), f.orbit * dcos(a), out);
}

const FLOE_P = v3();
/** The floe covering p at time t, or -1. */
export function floeAt(p: V3, t: number): number {
  if (p.y < 0.8) return -1;
  for (let i = 0; i < FLOES.length; i++) {
    const f = FLOES[i];
    floePos(f, t, FLOE_P);
    const dx = p.x - FLOE_P.x, dy = p.y - FLOE_P.y, dz = p.z - FLOE_P.z, r = f.size / R;
    if (dx * dx + dy * dy + dz * dz < r * r) return i;
  }
  return -1;
}
