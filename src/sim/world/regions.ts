// The world as data: the twelve regions at the vertices of an icosahedron, each drawn by hand in its own local chart,
// and the open sea between them. Nothing here is random: geography.ts turns these strokes into the one fixed
// geography the simulation and the renderer share.
//
// Local charts: x east and y north of the region's centre, in world units (u), on the tangent plane (orthographic;
// 2 % short at 70 u). Bearings are compass degrees, clockwise from north. Heights are u above mean sea level.
// Neighbouring regions lie at the bearings of the edges of a region's pentagon (110 u away at the edge, 130 u at a
// corner); land stays inside about 70 u toward the edges, so every cut edge of the chart net runs through open sea.
import { PI, dcos, dsin } from '../math.ts';

/** Seabed kinds; the codes are the values of the geography's floor field. */
export const FLOOR = { sand: 0, rock: 1, coral: 2, kelp: 3, ice: 4, mud: 5, blackSand: 6 } as const;
export type Floor = (typeof FLOOR)[keyof typeof FLOOR];

/** The illuminator's pigments by name (src/style/palette.ts PIGMENTS); the sim only names them. */
export type Pigment =
  | 'ironGall' | 'sepia' | 'umber' | 'ochre' | 'verdigris' | 'malachite' | 'ultramarine' | 'indigo' | 'vermilion'
  | 'roseMadder' | 'leadWhite' | 'goldLeaf';

export type RegionId =
  | 'iceCrown' | 'fjords' | 'basaltStacks' | 'kelpShallows' | 'amberShoals' | 'weepingIsle' | 'coralAtolls'
  | 'spiceIsles' | 'fireArchipelago' | 'mangroveLabyrinth' | 'glassSea' | 'maelstrom';

/** Landmark perks (PROMPT.md, The regions); WP7 grants them while the landmark lies inside a ship's waters. */
export type Perk =
  | 'crownLight' | 'greatFalls' | 'arch' | 'kelpCathedral' | 'sandbarLight' | 'weepingIsle' | 'greatLagoon'
  | 'spiceHarbour' | 'caldera' | 'rootGate' | 'whaleRoad' | 'eye';

export type Species = 'gull' | 'puffin' | 'seal' | 'otter' | 'wader' | 'turtle' | 'heron' | 'whale' | 'dolphin';
export type Flora =
  | 'pine' | 'heather' | 'grass' | 'duneGrass' | 'cloudForest' | 'treeFern' | 'palm' | 'jungle' | 'floweringTree'
  | 'mangrove' | 'scrub' | 'kelp' | 'coral';
export type Mode = 'ionian' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian';

/**
 * The strokes a region is drawn with. Land and carves bend with the region's gentle domain warp, so coasts are
 * organic while channel widths stay within ~10 % of their design.
 *   land    tapered capsule chain through (x, y, radius) triples: an island body; `top` is the ridge relief along
 *           it, `cliff` 0 (beaches) … 1 (sheer cliffs), `ch` the cliff height
 *   carve   channel through land and shallows along (x, y, half-width) triples (fjords, sounds, mangrove creeks)
 *   bay     disc carved out of the land (coves, harbours)
 *   reef    reef ring around a lagoon, drawn by its rim: knots (bearing, radius, width, crest) about its centre, a
 *           smooth closed curve through them (rimAt), so a ring bulges, kinks and pinches, its reef flat broad to
 *           windward and narrow to leeward, its crest (the flat's height) dry, awash or drowned; `gaps` are passes
 *           through it at bearings from its centre, deep or over a sill `crest`
 *   patch   patch reefs (bommies, coral heads) at (x, y, radius) triples, their tops at `crest`
 *   bar     sandbar or sill along (x, y) pairs, flat crest `w` either side; tidal when its crest is in the tide band
 *   column  one sea stack; `stacks` lines a wall of them along (x, y) pairs, too close for any hull between
 *   flat    level floor (banks, platforms, lagoon floors) at `depth`
 *   cone    volcano: land disc with a cone of `top` and a crater of radius `crater` whose floor is at `floor`
 *   kelp    kelp bed (slows and hides ships; zone and floor)          hot   hot water (damages hulls; zone)
 */
export type Stroke =
  | { k: 'land'; pts: readonly number[]; top: number; cliff: number; ch: number }
  | { k: 'carve'; pts: readonly number[] }
  | { k: 'bay'; x: number; y: number; r: number }
  | { k: 'reef'; x: number; y: number; rim: readonly number[]; lagoon: number; gaps: readonly Gap[]; great: boolean }
  | { k: 'patch'; pts: readonly number[]; crest: number }
  | { k: 'bar'; pts: readonly number[]; w: number; crest: number }
  | { k: 'column'; x: number; y: number; r: number; h: number }
  | { k: 'stacks'; pts: readonly number[]; r0: number; r1: number; h0: number; h1: number }
  | { k: 'flat'; x: number; y: number; r: number; depth: number; floor: Floor }
  | { k: 'cone'; x: number; y: number; r: number; top: number; crater: number; floor: number }
  | { k: 'kelp'; x: number; y: number; r: number }
  | { k: 'hot'; x: number; y: number; r: number };

/** A pass through a reef ring: bearing from the ring's centre, half-width along the rim, sill crest (null: deep). */
export interface Gap { bearing: number; half: number; crest: number | null }

/** A reef ring's rim at one bearing: the radius of its crest line, the reef flat's width and its crest height (u). */
export interface Rim { r: number; w: number; crest: number }

/**
 * The rim of a reef ring at compass bearing `b` (degrees): a periodic cubic (Hermite, Catmull-Rom tangents over the
 * knots' uneven bearings) through its knots (bearing, radius, width, crest), bearings ascending in [0, 360). Plain
 * arithmetic only, so the same bits everywhere; the renderer reads the same rim.
 */
export function rimAt(rim: readonly number[], b: number, out: Rim = { r: 0, w: 0, crest: 0 }): Rim {
  const n = rim.length >> 2;
  let x = b - 360 * Math.floor(b / 360);
  if (x < rim[0]) x += 360;
  let i = 0;
  while (i + 1 < n && rim[4 * (i + 1)] <= x) i++;
  // the knot bearings unwrapped around i: k-1, k, k+1, k+2
  const at = (k: number): number => rim[4 * (((k % n) + n) % n)] + 360 * Math.floor(k / n);
  const b0 = at(i - 1), b1 = at(i), b2 = at(i + 1), b3 = at(i + 2), d = b2 - b1, t = (x - b1) / d;
  const t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = 3 * t2 - 2 * t3, h11 = t3 - t2;
  const v = (k: number, c: number): number => rim[4 * (((k % n) + n) % n) + c];
  const f = (c: number): number => {
    const m1 = ((v(i + 1, c) - v(i - 1, c)) / (b2 - b0)) * d, m2 = ((v(i + 2, c) - v(i, c)) / (b3 - b1)) * d;
    return h00 * v(i, c) + h10 * m1 + h01 * v(i + 1, c) + h11 * m2;
  };
  out.r = f(1);
  out.w = Math.max(1.5, f(2));
  out.crest = f(3);
  return out;
}

export interface Landmark { name: string; perk: Perk; x: number; y: number; r: number }
/** A natural sheltered mooring: the anchorage, the bearing out through its mouth, berths, the harbour-repair radius. */
export interface Harbour { x: number; y: number; facing: number; moorings: number; r: number }
/** A light on a headland: a point near it and the bearing out to sea (geography.ts sets it on the headland). */
export interface Lighthouse { x: number; y: number; facing: number; period: number }
/** A fall from a cliff top: a point near the cliff and the bearing out over the sea. */
export interface Cascade { x: number; y: number; facing: number }
/** Wrecks lie in navigable water; caches stand on a shore (set ashore by geography.ts along `facing`). */
export interface Find { kind: 'wreck' | 'cache'; x: number; y: number; facing: number }
export interface Habitat { species: Species; x: number; y: number; r: number; count: number }
/** Relative odds of each weather state over the region. */
export interface Weather { fair: number; fog: number; squall: number; calm: number }
/** Ice Crown: a ring of floes at radius `r` turning at `speed` rad/s (positive anticlockwise seen from above). */
export interface FloeRing { r: number; count: number; size0: number; size1: number; speed: number }
/** Maelstrom: the vortex (radii u, peak swirl and inflow u/s; clockwise seen from above, as at the south pole). */
export interface Vortex { r: number; eye: number; swirl: number; inflow: number }

export interface Region {
  id: RegionId;
  name: string;
  /** Icosahedron vertex, degrees. */
  lat: number;
  lon: number;
  climate: 'polar' | 'temperate' | 'tropical' | 'volcanic';
  pigments: { land: Pigment; shallows: Pigment; foliage: Pigment; accent: Pigment; ink: Pigment };
  flora: readonly Flora[];
  /** Coast profile: beach sand, berm height, default cliff height, shallows [width, depth], shelf [width, depth]. */
  shore: { sand: Floor; floor: Floor; berm: number; cliffH: number; shallows: readonly [number, number];
    shelf: readonly [number, number] };
  /** Discs (x, y, r) of the blue shelf the region stands on. */
  shelf: readonly number[];
  strokes: readonly Stroke[];
  landmark: Landmark;
  harbours: readonly Harbour[];
  lighthouses: readonly Lighthouse[];
  cascades: readonly Cascade[];
  finds: readonly Find[];
  fauna: readonly Habitat[];
  weather: Weather;
  /** Value of finds and loot relative to the world's average. */
  richness: number;
  /**
   * Lanes the Great Current may take: four half-circles round the region at radius `rim` (in open water outside its
   * land), and `passes`, designed polylines (x, y pairs) across the region where it is open enough.
   */
  rim: number;
  passes: readonly (readonly number[])[];
  mechanics: {
    /** Speed factor and sight inside kelp (Kelp Shallows). */
    kelp?: { slow: number; hide: boolean };
    /** Hull damage per second in hot water (Fire Archipelago). */
    hotDamage?: number;
    floes?: readonly FloeRing[];
    /** Speed factor among the pack ice. */
    packSlow?: number;
    packR?: number;
    vortex?: Vortex;
    /**
     * Mangrove Labyrinth: the roots break the wind within `reach` u of the banks, down to `still` of its strength at
     * the bank, and unsettle its direction (WP6).
     */
    shelter?: { reach: number; still: number };
    /** The Caldera's eruption period, s. */
    eruption?: number;
  };
  music: { mode: Mode; motif: readonly number[] };
}

/** The planetary tide: sea level is TIDE.amp·sin(2πt/period) u above mean (WP6). */
export const TIDE = { period: 120, amp: 0.6 } as const;
/** Hull depth: water shallower than this blocks a ship. At mean tide the solid contour is at height −DRAFT. */
export const DRAFT = 0.8;

// ---------------------------------------------------------------------------------------------------------------
// Stroke builders, so the designs below read as drawings.

const land = (pts: number[], top = 0, cliff = 0, ch = 0): Stroke => ({ k: 'land', pts, top, cliff, ch });
const carve = (pts: number[]): Stroke => ({ k: 'carve', pts });
const bay = (x: number, y: number, r: number): Stroke => ({ k: 'bay', x, y, r });
type Reef = Extract<Stroke, { k: 'reef' }>;
const reef = (x: number, y: number, rim: number[], gaps: Gap[], o: { lagoon?: number; great?: boolean } = {}): Reef =>
  ({ k: 'reef', x, y, rim, gaps, lagoon: o.lagoon ?? 3.5, great: o.great ?? false });
/**
 * A motu strung along a reef's rim from bearing b0 to b1 (clockwise), on the flat's seaward side (`out` of its width
 * past the crest line): body radius `r`, tapering to low sandy spits of radius `tip` at either end, the body swelling
 * toward `fat` (0 … 1: where along it, 0.5 midway).
 */
function motu(rf: Reef, b0: number, b1: number, r: number, o: { tip?: number; out?: number; top?: number; fat?: number } = {}): Stroke {
  const tip = o.tip ?? 0.9, out = o.out ?? 0.05, fat = o.fat ?? 0.5, pts: number[] = [];
  const rim = rimAt(rf.rim, (b0 + b1) / 2), n = Math.max(3, Math.round(((b1 - b0) * (PI / 180) * rim.r) / 3.5));
  for (let i = 0; i <= n; i++) {
    const u = i / n, b = b0 + (b1 - b0) * u, a = b * (PI / 180);
    rimAt(rf.rim, b, rim);
    const q = u < fat ? (u - fat) / fat : (u - fat) / (1 - fat), d = rim.r + out * rim.w;
    pts.push(rf.x + d * dsin(a), rf.y + d * dcos(a), tip + (r - tip) * (1 - q * q * q * q));
  }
  return land(pts, o.top ?? 1.3, 0, 1);
}
const patch = (pts: number[], crest: number): Stroke => ({ k: 'patch', pts, crest });
/** A low sandy spit off a motu's end: a bar from the lagoon side of the flat at bearing b, curling `sweep` degrees on
 *  (+ clockwise) as it runs `len` u out into the lagoon; awash at high water. */
function spit(rf: Reef, b: number, sweep: number, len: number): Stroke {
  const pts: number[] = [], rim = { r: 0, w: 0, crest: 0 };
  for (const u of [0, 0.5, 1]) {
    const bu = b + sweep * u, a = bu * (PI / 180);
    rimAt(rf.rim, bu, rim);
    const d = rim.r - rim.w * (0.25 + 0.25 * u) - len * u * u;
    pts.push(rf.x + d * dsin(a), rf.y + d * dcos(a));
  }
  return bar(pts, 0.8, 0.15);
}
const gap = (bearing: number, half: number, crest: number | null = null): Gap => ({ bearing, half, crest });
const bar = (pts: number[], w: number, crest: number): Stroke => ({ k: 'bar', pts, w, crest });
const column = (x: number, y: number, r: number, h: number): Stroke => ({ k: 'column', x, y, r, h });
const stacks = (pts: number[], r0: number, r1: number, h0: number, h1: number): Stroke => ({ k: 'stacks', pts, r0, r1, h0, h1 });
const flat = (x: number, y: number, r: number, depth: number, floor: Floor): Stroke => ({ k: 'flat', x, y, r, depth, floor });
const cone = (x: number, y: number, r: number, top: number, crater: number, floor: number): Stroke =>
  ({ k: 'cone', x, y, r, top, crater, floor });
const kelp = (x: number, y: number, r: number): Stroke => ({ k: 'kelp', x, y, r });
const hot = (x: number, y: number, r: number): Stroke => ({ k: 'hot', x, y, r });

/** Points (x, y pairs) along a circular arc about (cx, cy), from bearing a0 to a1 in steps of about 6°. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): number[] {
  const n = Math.max(1, Math.round(Math.abs(a1 - a0) / 6)), out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * (PI / 180);
    out.push(cx + r * dsin(a), cy + r * dcos(a));
  }
  return out;
}

// The Coral Atolls' rings (knots: bearing, radius, width, crest), shared by their strokes and their motu.
/** The Great Lagoon: its windward reef flat up to 9 u broad, its algal ridge dry at half tide; its leeward rim a narrow
 *  flat under a film of water at half tide; one channel in from the south-south-west; never a hull's water. */
const GREAT = reef(8, 6, [
  0, 25, 4.5, 0.4, 25, 26.5, 6, 0.45, 55, 27.5, 7.5, 0.45, 80, 30, 8, 0.45, 104, 29.5, 8, 0.45, 126, 27, 6.5, 0.45,
  144, 29.5, 7.5, 0.45, 163, 28, 6, 0.4, 174, 24.5, 5, 0.3, 192, 23.5, 4, 0.15, 205, 23.5, 4, 0.15, 220, 24, 3.6, 0.15,
  242, 27, 3.4, 0.15, 268, 26, 3.2, 0.2, 294, 23, 3.2, 0.25, 318, 24.5, 3.6, 0.3, 338, 23, 3.8, 0.4,
], [gap(205, 4.6)], { lagoon: 4.5, great: true });
/** South-west: nearly closed, a long motu to windward, its harbour inside the channel from the east. */
const SW_ATOLL = reef(-40, -30, [
  0, 11, 4, 0.4, 40, 12.5, 5, 0.45, 68, 12, 4.5, 0.45, 90, 11, 3.4, 0.4, 112, 11.5, 4, 0.4, 140, 13, 4.5, 0.4,
  176, 11, 3.5, 0.35, 210, 9.5, 3, 0.3, 250, 10, 2.8, 0.3, 290, 11.5, 3, 0.3, 325, 10, 3.2, 0.35,
], [gap(90, 3.2)]);
/** North-west: a horseshoe, dry from west through north to east, its southern rim drowned at high water (still a
 *  keel's depth short, so no way in); the channel through the drowned rim and a back door over a sill at high tide. */
const NW_ATOLL = reef(-42, 32, [
  0, 13, 4.5, 0.45, 45, 14, 5.5, 0.45, 85, 13, 5, 0.4, 108, 13.5, 3.6, 0.15, 130, 14.5, 3, 0, 150, 14, 3, 0,
  176, 13, 3, 0, 205, 13.5, 3, 0, 230, 12, 3, 0.15, 254, 11, 3.2, 0.35, 290, 12.5, 3.4, 0.4, 330, 12, 3.4, 0.4,
], [gap(150, 3.4), gap(330, 3.2, -1.1)]);
/** South-east: small and three-cornered, nearly closed, its channel on its west-north-west side. */
const SE_ATOLL = reef(40, -40, [
  10, 10.5, 4, 0.4, 55, 8, 4.5, 0.45, 95, 7.5, 4.5, 0.45, 130, 10, 4.5, 0.4, 175, 7.5, 3.5, 0.35, 215, 7.5, 3, 0.3,
  250, 9.5, 3, 0.3, 280, 8.5, 2.8, 0.3, 300, 8.2, 2.8, 0.3, 320, 8.5, 3, 0.35, 342, 9, 3.2, 0.35,
], [gap(300, 3.2)], { lagoon: 4.5 });
/** East: a kidney, broad and long-motu'd to windward, pinched in on its lee toward the Great Lagoon; its channel
 *  opens north-west. */
const E_ATOLL = reef(47, 30, [
  0, 9.5, 3.8, 0.4, 35, 9.5, 4.6, 0.45, 75, 9, 4.6, 0.45, 110, 9.5, 4.6, 0.45, 150, 10.5, 4.2, 0.4, 185, 9.5, 3.2, 0.35,
  225, 8.5, 2.8, 0.3, 255, 7.5, 2.8, 0.3, 290, 9, 2.8, 0.3, 320, 9.5, 3, 0.35, 345, 10, 3.4, 0.4,
], [gap(320, 3.4)], { lagoon: 5 });

const UPPER = 26.565051177077990, LOWER = -UPPER; // atan(1/2), the icosahedron's rings

// ---------------------------------------------------------------------------------------------------------------
// The regions. Order is the region index used by every field and table.

export const REGIONS: readonly Region[] = [
  {
    id: 'iceCrown', name: 'The Ice Crown', lat: 90, lon: 0, climate: 'polar',
    pigments: { land: 'leadWhite', shallows: 'verdigris', foliage: 'leadWhite', accent: 'roseMadder', ink: 'indigo' },
    flora: [],
    shore: { sand: FLOOR.ice, floor: FLOOR.ice, berm: 0.6, cliffH: 5, shallows: [2.5, 2.6], shelf: [10, 16] },
    shelf: [0, 0, 56, 52, -48, 18],
    strokes: [
      // The Crown skerry, ice-bound under its light at the pole, ringed by three counter-turning rings of floes.
      land([-5, -2, 4, 1, 3, 5.5, 7, 0, 4], 5, 0.9, 5),
      // Grounded bergs between the rings, standing where the moving floes never reach.
      land([16, 15, 2.6], 3, 1, 7), land([-19, -11, 3], 3, 1, 8), land([-4, -22, 2.4], 2, 1, 6),
      land([28, 29, 3.2], 3, 1, 7), land([-38, 14, 3.4], 3, 1, 9), land([-22, -34, 3], 3, 1, 7),
      land([40, -6, 2.8], 3, 1, 6), land([6, 40, 3], 3, 1, 8),
      // The Silver Isle, a crescent of old ice and rock outside the pack, its cove turned away from the floes.
      land([41, -50.5, 3.4, 34.3, -46.8, 4.4, 26.9, -50, 4.4, 25, -58.9, 3.4], 4, 0.6, 4), bay(34.3, -56.9, 5.8),
    ],
    landmark: { name: 'The Crown Light', perk: 'crownLight', x: 1, y: 1, r: 6 },
    harbours: [{ x: 34, y: -58, facing: 146, moorings: 3, r: 7 }],
    lighthouses: [{ x: 6, y: 0, facing: 90, period: 8 }, { x: 27, y: -60, facing: 221, period: 10 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: -10, y: 21, facing: 0 }, { kind: 'wreck', x: 30, y: -24, facing: 0 },
      { kind: 'wreck', x: -30, y: -28, facing: 0 }, { kind: 'cache', x: 35, y: -50, facing: 0 },
    ],
    fauna: [
      { species: 'seal', x: 0, y: 0, r: 52, count: 18 }, { species: 'seal', x: 33, y: -54, r: 10, count: 6 },
      { species: 'gull', x: 0, y: 0, r: 60, count: 10 },
    ],
    weather: { fair: 5, fog: 3, squall: 2, calm: 2 },
    richness: 1.0,
    rim: 80, passes: [],
    mechanics: {
      floes: [
        { r: 14, count: 8, size0: 2, size1: 3.6, speed: 0.016 },
        { r: 31, count: 13, size0: 2.4, size1: 4.6, speed: -0.009 },
        { r: 47, count: 18, size0: 2.6, size1: 4.4, speed: 0.006 },
      ],
      packSlow: 0.6, packR: 54,
    },
    music: { mode: 'lydian', motif: [0, 4, 7, 11, 9, 7] },
  },
  {
    id: 'fjords', name: 'The Fjords', lat: UPPER, lon: 0, climate: 'temperate',
    pigments: { land: 'sepia', shallows: 'malachite', foliage: 'malachite', accent: 'leadWhite', ink: 'ironGall' },
    flora: ['pine', 'heather'],
    shore: { sand: FLOOR.rock, floor: FLOOR.rock, berm: 0.8, cliffH: 16, shallows: [2, 2.5], shelf: [6, 22] },
    shelf: [0, 0, 64],
    strokes: [
      // One great highland, cut by the Sound (the through-channel and its chokepoint), the Falls Fjord to the Great
      // Falls, a narrow north arm and a branching south fjord.
      land([-36, -28, 21, -30, 20, 26, 10, 35, 26, 35, 0, 24, 20, -35, 22, -36, -28, 21], 20, 1, 16),
      land([0, 0, 30], 24, 1, 16),
      carve([-76, -46, 6, -56, -36, 6, -38, -24, 5.5, -20, -18, 5, -6, -6, 4.2, 4, 12, 4.4, 20, 24, 5, 40, 28, 5.5, 58, 36, 6, 76, 44, 6]),
      carve([-78, 6, 6, -56, 4, 5, -40, 10, 4.5, -28, 15, 4.5]), bay(-20, 18, 8),
      carve([-4, 76, 5, -4, 52, 4, -10, 40, 3.6, -8, 30, 3.4]),
      carve([20, -76, 6, 17, -52, 4.6, 22, -36, 4.4, 33, -27, 4.4]),
      carve([17, -50, 4.4, 4, -40, 4.2, -6, -34, 4]),
      bay(-30, -31, 6.5),
      // Short arms off the outer coast: blind inlets to lie in wait.
      carve([70, -8, 5, 50, -6, 3.4, 40, 2, 3, 34, 8, 2.8]), carve([-62, 40, 4.5, -44, 32, 3.2, -34, 34, 3]),
      carve([-30, -70, 4.5, -24, -50, 3.2, -18, -42, 3]), carve([62, -46, 4.5, 50, -38, 3.2, 44, -34, 3]),
      // Skerries off the outer coast.
      land([-60, -20, 3], 3, 1, 6), land([62, -22, 3.4], 3, 1, 7), land([-50, 46, 3], 3, 1, 6), land([-8, -66, 2.6], 2, 1, 5),
    ],
    landmark: { name: 'The Great Falls', perk: 'greatFalls', x: -20, y: 18, r: 7 },
    harbours: [{ x: -30, y: -31, facing: 0, moorings: 3, r: 6 }],
    lighthouses: [{ x: -50, y: -44, facing: 225, period: 9 }, { x: 52, y: 26, facing: 60, period: 7 }],
    cascades: [
      { x: -14, y: 18, facing: 270 }, { x: -24, y: 25, facing: 160 }, { x: -46, y: 14, facing: 190 },
      { x: -12, y: 42, facing: 90 }, { x: 28, y: -32, facing: 320 }, { x: 8, y: -8, facing: 300 },
      { x: 30, y: 20, facing: 200 },
    ],
    finds: [
      { kind: 'wreck', x: -12, y: -12, facing: 0 }, { kind: 'wreck', x: 30, y: 26, facing: 0 },
      { kind: 'cache', x: -8, y: 26, facing: 180 }, { kind: 'cache', x: -2, y: -36, facing: 270 },
    ],
    fauna: [{ species: 'gull', x: 0, y: 0, r: 60, count: 10 }, { species: 'seal', x: -60, y: -46, r: 6, count: 4 }],
    weather: { fair: 4, fog: 5, squall: 2, calm: 1 },
    richness: 1.0,
    rim: 84, passes: [],
    mechanics: {},
    music: { mode: 'dorian', motif: [0, 2, 3, 7, 5, 3, 2] },
  },
  {
    id: 'basaltStacks', name: 'The Basalt Stacks', lat: UPPER, lon: 72, climate: 'temperate',
    pigments: { land: 'ironGall', shallows: 'verdigris', foliage: 'malachite', accent: 'vermilion', ink: 'ironGall' },
    flora: ['grass', 'heather'],
    shore: { sand: FLOOR.rock, floor: FLOOR.rock, berm: 0.8, cliffH: 10, shallows: [2, 2.5], shelf: [8, 7] },
    shelf: [0, 0, 62],
    strokes: [
      flat(0, 0, 58, 7, FLOOR.rock),
      // The Arch at the heart: two great columns under one span, a gate ships can thread from north to south.
      column(-6.5, 0, 3, 18), column(6.5, 0, 3, 18),
      // Three broken walls of columns around it, their gaps staggered so the way in winds: a maze for ambush and
      // escape, its lanes 7–12 u wide.
      stacks(arc(0, 0, 16, 75, 225), 1.1, 1.9, 9, 14), stacks(arc(0, 0, 16, 255, 405), 1.1, 1.9, 9, 14),
      stacks(arc(0, 0, 30, 165, 290), 1.2, 2.1, 7, 12), stacks(arc(0, 0, 30, 312, 408), 1.2, 2.1, 7, 12),
      stacks(arc(0, 0, 30, 70, 140), 1.2, 2.1, 7, 12),
      stacks(arc(0, 0, 45, 105, 190), 1.2, 2.2, 5, 10), stacks(arc(0, 0, 45, 212, 250), 1.2, 2.2, 5, 10),
      stacks(arc(0, 0, 45, 272, 320), 1.2, 2.2, 5, 10), stacks(arc(0, 0, 45, 345, 438), 1.2, 2.2, 5, 10),
      // Spurs that turn the lanes into blind alleys.
      stacks([16, 0, 30, 0], 1.1, 1.8, 6, 10), stacks([-11, -26, -20, -39], 1.1, 1.8, 6, 10),
      stacks([-24, 18, -36, 28], 1.1, 1.8, 6, 10),
      // Lone pillars in the outer moat.
      column(52, 8, 1.8, 9), column(-50, 12, 1.6, 8), column(10, -54, 1.8, 10), column(-4, 55, 1.6, 9),
      // Columnar islands at the edge, white with puffins.
      land([-46, 34, 6, -38, 44, 5], 6, 1, 10), land([46, -32, 6, 52, -22, 4.5], 6, 1, 9), land([30, 48, 4.5], 5, 1, 8),
      land([-54, -26, 4.5], 4, 1, 8), land([-36, 48, 4.5, -30, 58, 5.5, -18, 56, 4.5], 6, 0.8, 9), bay(-26, 50, 5.5),
    ],
    landmark: { name: 'The Arch', perk: 'arch', x: 0, y: 0, r: 7 },
    harbours: [{ x: -26, y: 50, facing: 152, moorings: 2, r: 5 }],
    lighthouses: [{ x: 50, y: -24, facing: 120, period: 8 }, { x: -38, y: 46, facing: 20, period: 10 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: 22, y: 12, facing: 0 }, { kind: 'wreck', x: -36, y: -8, facing: 0 },
      { kind: 'wreck', x: 8, y: -38, facing: 0 }, { kind: 'cache', x: 30, y: 44, facing: 180 },
    ],
    fauna: [
      { species: 'puffin', x: -42, y: 40, r: 8, count: 24 }, { species: 'puffin', x: 48, y: -28, r: 7, count: 18 },
      { species: 'puffin', x: 0, y: 0, r: 46, count: 20 }, { species: 'gull', x: 0, y: 0, r: 60, count: 8 },
    ],
    weather: { fair: 4, fog: 5, squall: 2, calm: 1 },
    richness: 1.1,
    rim: 88, passes: [],
    mechanics: {},
    music: { mode: 'phrygian', motif: [0, 1, 3, 1, 0, 7, 5] },
  },
  {
    id: 'kelpShallows', name: 'The Kelp Shallows', lat: UPPER, lon: 144, climate: 'temperate',
    pigments: { land: 'umber', shallows: 'verdigris', foliage: 'ochre', accent: 'malachite', ink: 'sepia' },
    flora: ['grass', 'kelp'],
    shore: { sand: FLOOR.sand, floor: FLOOR.rock, berm: 0.7, cliffH: 3, shallows: [3, 2], shelf: [8, 4.5] },
    shelf: [0, 0, 62],
    strokes: [
      flat(0, 0, 60, 4.5, FLOOR.rock),
      // The Kelp Cathedral: a ring of towering kelp round a clear nave, then forests of kelp between the islets.
      kelp(0, 4, 13), kelp(-28, 20, 12), kelp(-20, 30, 9), kelp(24, 26, 11), kelp(32, 14, 8), kelp(-30, -22, 11),
      kelp(-18, -34, 9), kelp(22, -28, 12), kelp(34, -40, 7), kelp(46, 0, 8), kelp(-48, 0, 8), kelp(2, -50, 9),
      kelp(6, 46, 8),
      // Low rocky islets.
      land([-10, 24, 3], 2, 0.5, 3), land([14, -10, 2.6], 2, 0.5, 3), land([-40, -8, 3.8, -36, -14, 3], 2, 0.5, 3),
      land([40, 30, 3.4], 2, 0.5, 3), land([-16, -52, 3], 2, 0.5, 3), land([52, -20, 4, 56, -12, 3], 3, 0.6, 4),
      land([-4, -22, 2.4], 1.5, 0.5, 3), land([28, 48, 3], 2, 0.5, 3),
      // The Otter Hook, the largest islet, curled round its harbour.
      land([-24, 52, 3.6, -36, 56, 5, -46, 48, 5, -46, 38, 4], 4, 0.5, 4), bay(-36, 44, 5),
    ],
    landmark: { name: 'The Kelp Cathedral', perk: 'kelpCathedral', x: 0, y: 4, r: 12 },
    harbours: [{ x: -36, y: 44, facing: 135, moorings: 3, r: 6 }],
    lighthouses: [{ x: -24, y: 53, facing: 70, period: 9 }, { x: 56, y: -14, facing: 110, period: 8 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: -24, y: 4, facing: 0 }, { kind: 'wreck', x: 14, y: 30, facing: 0 },
      { kind: 'wreck', x: 12, y: -40, facing: 0 }, { kind: 'cache', x: -40, y: -10, facing: 90 },
      { kind: 'cache', x: 52, y: -18, facing: 270 },
    ],
    fauna: [
      { species: 'otter', x: 0, y: 4, r: 14, count: 8 }, { species: 'otter', x: -26, y: 24, r: 12, count: 6 },
      { species: 'otter', x: 24, y: -28, r: 12, count: 6 }, { species: 'gull', x: 0, y: 0, r: 60, count: 10 },
      { species: 'seal', x: 52, y: -16, r: 6, count: 4 }, { species: 'otter', x: -36, y: 44, r: 8, count: 4 },
    ],
    weather: { fair: 6, fog: 2, squall: 2, calm: 2 },
    richness: 1.0,
    rim: 82, passes: [[-95, 6, 95, 8]],
    mechanics: { kelp: { slow: 0.65, hide: true } },
    music: { mode: 'mixolydian', motif: [0, 2, 4, 5, 4, 2, 10] },
  },
  {
    id: 'amberShoals', name: 'The Amber Shoals', lat: UPPER, lon: 216, climate: 'temperate',
    pigments: { land: 'ochre', shallows: 'verdigris', foliage: 'ochre', accent: 'goldLeaf', ink: 'umber' },
    flora: ['duneGrass'],
    shore: { sand: FLOOR.sand, floor: FLOOR.sand, berm: 1.0, cliffH: 2, shallows: [3, 2.3], shelf: [10, 3] },
    shelf: [0, 0, 64],
    strokes: [
      flat(0, 0, 62, 3, FLOOR.sand), flat(0, 0, 30, 2.5, FLOOR.sand),
      // Barrier islands in a ring round the basin, the long Sandbar spit closing it from the south-east. The main
      // inlet north of the spit is always open; the four between the islands open and close with the tide, each at
      // its own height, so each opens at its own hour.
      land([-14, -33, 2.6, -26, -24, 2.8], 1, 0, 1), land([-32, -14, 2.6, -36, 2, 2.6], 1, 0, 1),
      land([-34, 12, 3.2, -26, 26, 3.2], 1.5, 0, 1), land([-16, 33, 2.6, 2, 37, 2.8, 16, 34, 2.4], 1, 0, 1),
      land([26, 26, 2.4, 32, 20, 2.2], 1, 0, 1),
      land([-4, -36, 2.6, 14, -36, 3, 30, -26, 3, 38, -10, 2.6, 40, 2, 3.4], 2, 0, 1),
      bar([-22, -32, -32, -22], 3, -1.35), bar([-38, -6, -36, 8], 3, -1.05),
      bar([-33, 18, -28, 30], 3, -0.75), bar([18, 36, 28, 28], 3, -0.45),
      // Tidal flats in the basin and sandbars on the outer shelf.
      bar([-12, 6, 6, 14], 4, -0.3), bar([-6, -16, 10, -12], 3.5, -0.6), bar([-20, -2, -14, 10], 3, -0.9),
      bar([-48, -30, -54, -6, -48, 20], 3, -0.8), bar([-6, 50, 22, 46], 3, -0.6), bar([50, -24, 54, 0], 3, -1.0),
    ],
    landmark: { name: 'The Sandbar Light', perk: 'sandbarLight', x: 40, y: 3, r: 4 },
    harbours: [{ x: -21, y: -10, facing: 90, moorings: 4, r: 6 }],
    lighthouses: [{ x: 40, y: 3, facing: 20, period: 7 }, { x: -30, y: 22, facing: 300, period: 10 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: 4, y: -24, facing: 0 }, { kind: 'wreck', x: -44, y: 34, facing: 0 },
      { kind: 'wreck', x: 46, y: -36, facing: 0 }, { kind: 'cache', x: 2, y: 36, facing: 180 },
      { kind: 'cache', x: 20, y: -34, facing: 0 },
    ],
    fauna: [
      { species: 'wader', x: 0, y: 8, r: 16, count: 20 }, { species: 'wader', x: -40, y: 0, r: 14, count: 14 },
      { species: 'wader', x: 20, y: 40, r: 10, count: 10 }, { species: 'gull', x: 0, y: 0, r: 60, count: 12 },
    ],
    weather: { fair: 6, fog: 1, squall: 1, calm: 4 },
    richness: 1.1,
    rim: 80, passes: [],
    mechanics: {},
    music: { mode: 'ionian', motif: [0, 4, 7, 9, 7, 4, 2] },
  },
  {
    id: 'weepingIsle', name: 'The Weeping Isle', lat: UPPER, lon: 288, climate: 'tropical',
    pigments: { land: 'umber', shallows: 'verdigris', foliage: 'malachite', accent: 'leadWhite', ink: 'sepia' },
    flora: ['cloudForest', 'treeFern'],
    shore: { sand: FLOOR.sand, floor: FLOOR.rock, berm: 0.8, cliffH: 18, shallows: [2, 3], shelf: [6, 18] },
    shelf: [0, 0, 62],
    strokes: [
      // One towering cloud-forest mountain, sheer on every side but one: the largest island in the world.
      land([0, 0, 32], 46, 0.85, 18),
      land([-18, 14, 24, 0, 22, 22, 18, 14, 24], 24, 0.85, 18), land([20, -14, 22, 0, -22, 22, -20, -14, 24], 24, 0.85, 18),
      land([30, 30, 6, 42, 40, 4], 6, 0.9, 10),
      // The harbour bay on the south-west, the one gentle shore.
      bay(-32, -30, 8), land([-46, -20, 3.6, -46, -32, 3], 3, 0.3, 4),
      // Rocks that guard the loop round the island.
      land([52, -28, 2.6], 3, 1, 6), land([-54, 20, 3], 3, 1, 6), land([6, 56, 2.6], 3, 1, 5),
    ],
    landmark: { name: 'The Weeping Isle', perk: 'weepingIsle', x: 0, y: 0, r: 44 },
    harbours: [{ x: -33, y: -31, facing: 225, moorings: 4, r: 7 }],
    lighthouses: [{ x: 41, y: 39, facing: 45, period: 8 }, { x: -46, y: -31, facing: 230, period: 10 }],
    cascades: [0, 28, 62, 96, 128, 160, 190, 250, 280, 310, 336].map((b) => ({ x: 0, y: 0, facing: b })),
    finds: [
      { kind: 'wreck', x: 50, y: -40, facing: 0 }, { kind: 'wreck', x: -50, y: 34, facing: 0 },
      { kind: 'cache', x: -40, y: -26, facing: 225 }, { kind: 'cache', x: 42, y: 38, facing: 45 },
    ],
    fauna: [{ species: 'gull', x: 0, y: 0, r: 58, count: 16 }, { species: 'dolphin', x: 0, y: 0, r: 60, count: 6 }],
    weather: { fair: 5, fog: 3, squall: 3, calm: 1 },
    richness: 1.0,
    rim: 80, passes: [],
    mechanics: {},
    music: { mode: 'aeolian', motif: [0, 3, 2, 0, 7, 5, 3] },
  },
  {
    id: 'glassSea', name: 'The Glass Sea', lat: LOWER, lon: 36, climate: 'tropical',
    pigments: { land: 'ochre', shallows: 'verdigris', foliage: 'malachite', accent: 'verdigris', ink: 'indigo' },
    flora: ['grass', 'palm'],
    shore: { sand: FLOOR.sand, floor: FLOOR.sand, berm: 0.8, cliffH: 4, shallows: [3, 2], shelf: [8, 14] },
    shelf: [0, 0, 26, -36, -48, 16, 52, 34, 10],
    strokes: [
      // A vast calm mirror: the Whale Road, a pale bank where the whales gather, and nothing else but one islet with
      // its harbour and a light on the far rim.
      flat(-14, -6, 13, 6, FLOOR.sand), flat(14, 6, 13, 6, FLOOR.sand), flat(0, 0, 9, 6, FLOOR.sand),
      land([-43, -42, 3.6, -38, -52, 4.6, -28, -55, 3.6], 3, 0.3, 4), bay(-34, -45, 4.5),
      land([54, 36, 2.6], 4, 1, 6),
    ],
    landmark: { name: 'The Whale Road', perk: 'whaleRoad', x: 0, y: 0, r: 22 },
    harbours: [{ x: -33, y: -44, facing: 30, moorings: 3, r: 6 }],
    lighthouses: [{ x: -28, y: -56, facing: 150, period: 9 }, { x: 54, y: 37, facing: 30, period: 11 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: 28, y: -20, facing: 0 }, { kind: 'wreck', x: -20, y: 30, facing: 0 },
      { kind: 'cache', x: -42, y: -44, facing: 290 },
    ],
    fauna: [
      { species: 'whale', x: 0, y: 0, r: 30, count: 6 }, { species: 'whale', x: 0, y: 0, r: 60, count: 4 },
      { species: 'dolphin', x: 0, y: 0, r: 60, count: 8 }, { species: 'gull', x: -36, y: -48, r: 14, count: 8 },
    ],
    weather: { fair: 5, fog: 1, squall: 1, calm: 5 },
    richness: 0.9,
    rim: 80, passes: [[-95, 10, 95, -10], [10, 95, -10, -95]],
    mechanics: {},
    music: { mode: 'lydian', motif: [0, 7, 6, 4, 2, 4] },
  },
  {
    id: 'fireArchipelago', name: 'The Fire Archipelago', lat: LOWER, lon: 108, climate: 'volcanic',
    pigments: { land: 'ironGall', shallows: 'verdigris', foliage: 'umber', accent: 'vermilion', ink: 'ironGall' },
    flora: ['scrub'],
    shore: { sand: FLOOR.blackSand, floor: FLOOR.blackSand, berm: 0.8, cliffH: 6, shallows: [3, 2.5], shelf: [8, 14] },
    shelf: [0, 0, 60],
    strokes: [
      // The volcano and its Caldera, lava deltas steaming where they meet the sea.
      cone(0, 0, 24, 30, 6, 18),
      land([12, -16, 5, 22, -26, 3.6], 2, 0.2, 2), land([-14, 18, 5, -24, 26, 3.4], 2, 0.2, 2),
      land([4, 22, 4, 8, 33, 3], 4, 0.9, 6),
      hot(25, -30, 9), hot(-27, 29, 8), hot(18, 6, 4),
      // Satellite cones and Cinder Isle with its black-sand harbour.
      cone(36, 30, 7, 10, 2, 7), cone(-30, 44, 6, 8, 1.5, 6), cone(40, -40, 6, 8, 0, 0),
      land([-52, -10, 5, -46, -26, 6, -34, -32, 4.6], 6, 0.4, 5), bay(-40, -18, 5), hot(-44, -42, 6),
    ],
    landmark: { name: 'The Caldera', perk: 'caldera', x: 0, y: 0, r: 24 },
    harbours: [{ x: -40, y: -18, facing: 60, moorings: 3, r: 6 }],
    lighthouses: [{ x: 8, y: 34, facing: 10, period: 8 }, { x: -52, y: -8, facing: 300, period: 9 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: 30, y: -14, facing: 0 }, { kind: 'wreck', x: -22, y: -40, facing: 0 },
      { kind: 'wreck', x: 50, y: 10, facing: 0 }, { kind: 'cache', x: -26, y: 20, facing: 300 },
      { kind: 'cache', x: 36, y: 24, facing: 200 }, { kind: 'cache', x: 26, y: -24, facing: 130 },
    ],
    fauna: [{ species: 'gull', x: 0, y: 0, r: 60, count: 6 }],
    weather: { fair: 6, fog: 2, squall: 3, calm: 1 },
    richness: 1.8,
    rim: 80, passes: [],
    mechanics: { hotDamage: 2, eruption: 75 },
    music: { mode: 'phrygian', motif: [0, 1, 4, 5, 4, 1, 0] },
  },
  {
    id: 'mangroveLabyrinth', name: 'The Mangrove Labyrinth', lat: LOWER, lon: 180, climate: 'tropical',
    pigments: { land: 'umber', shallows: 'malachite', foliage: 'malachite', accent: 'ochre', ink: 'sepia' },
    flora: ['mangrove'],
    shore: { sand: FLOOR.mud, floor: FLOOR.mud, berm: 0.6, cliffH: 3, shallows: [1.8, 2.6], shelf: [10, 8] },
    shelf: [0, 0, 64],
    strokes: [
      // One low forest of roots, threaded by creeks: entrances west, south and east, a loop round a mangrove block,
      // blind pools, and the Root Gate where the creeks cross.
      land([0, 36, 24, 32, 10, 26, 22, -30, 24, -22, -30, 26, -34, 10, 24, 0, 36, 24], 1.2, 0, 1), land([0, 0, 30], 1.2, 0, 1),
      land([-6, 50, 12, 52, 18, 12, 30, -44, 12, -32, -42, 12, -52, 14, 12], 1.2, 0, 1),
      carve([-76, -6, 5.6, -58, -2, 4.6, -46, -8, 4.4, -40, -2, 4.2, -34, 4, 4.2, -26, 6, 4, -20, 2, 4, -16, -6, 4, -12, -10, 4, 0, -12, 4.4]),
      carve([10, -76, 5.6, 4, -62, 4.6, 10, -54, 4.4, 8, -48, 4.4, 0, -44, 4.2, -4, -36, 4.2, -10, -30, 4, -6, -24, 4, 0, -12, 4.4]),
      carve([0, -12, 4.4, 10, -8, 4.2, 18, 2, 4.2, 14, 10, 4.4, 10, 16, 4, 4, 20, 4, -4, 18, 4, -10, 22, 4, -16, 28, 4, -22, 32, 4.2, -26, 40, 4.2, -20, 46, 4.2, -18, 58, 4.6, -8, 76, 5.6]),
      carve([14, 10, 4.2, 22, 12, 4, 30, 8, 4, 34, 0, 4, 40, -4, 4.2, 48, -10, 4.2, 46, -20, 4.4, 56, -26, 4.6, 76, -26, 5.6]),
      carve([-34, 4, 4, -38, 20, 4, -22, 32, 4]),
      carve([8, -48, 4, 24, -42, 4, 32, -30, 3.8]), bay(33, -28, 5),
      carve([30, 8, 4, 36, 24, 4, 30, 33, 4]), bay(30, 35, 6),
      carve([-46, -8, 4, -46, -26, 3.8, -36, -38, 3.8]),
      // A rock headland for the light, the only high ground.
      land([50, 14, 6, 60, 18, 4], 6, 0.9, 6), land([-34, -50, 5], 5, 0.9, 5),
    ],
    landmark: { name: 'The Root Gate', perk: 'rootGate', x: 14, y: 10, r: 6 },
    harbours: [{ x: 30, y: 34, facing: 150, moorings: 3, r: 6 }],
    lighthouses: [{ x: 61, y: 19, facing: 72, period: 9 }, { x: -35, y: -52, facing: 216, period: 8 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: -37, y: 13, facing: 0 }, { kind: 'wreck', x: 33, y: -28, facing: 0 },
      { kind: 'cache', x: -14, y: 14, facing: 160 }, { kind: 'cache', x: 22, y: 0, facing: 0 },
      { kind: 'cache', x: -40, y: -32, facing: 60 },
    ],
    fauna: [
      { species: 'heron', x: 0, y: 0, r: 44, count: 14 }, { species: 'heron', x: 30, y: 35, r: 6, count: 4 },
      { species: 'gull', x: 0, y: 0, r: 60, count: 4 },
    ],
    weather: { fair: 5, fog: 3, squall: 2, calm: 2 },
    richness: 1.2,
    rim: 82, passes: [],
    mechanics: { shelter: { reach: 10, still: 0.45 } },
    music: { mode: 'dorian', motif: [0, 3, 5, 7, 5, 10, 7] },
  },
  {
    id: 'coralAtolls', name: 'The Coral Atolls', lat: LOWER, lon: 252, climate: 'tropical',
    pigments: { land: 'ochre', shallows: 'verdigris', foliage: 'malachite', accent: 'roseMadder', ink: 'ultramarine' },
    flora: ['palm', 'coral'],
    shore: { sand: FLOOR.sand, floor: FLOOR.sand, berm: 0.9, cliffH: 3, shallows: [3, 1.8], shelf: [8, 10] },
    shelf: [0, 0, 64],
    strokes: [
      // The rings, drawn by their rims: the reef flats broad to windward (the trades blow from the east-north-east) and
      // narrow to leeward, each ring bulging, kinking and pinching, each lagoon with its single channel.
      GREAT, SW_ATOLL, NW_ATOLL, SE_ATOLL, E_ATOLL,
      // Motu strung along the rims, longest to windward, sandy spits at their ends and gaps of reef flat between them.
      motu(GREAT, 26, 64, 2.6, { fat: 0.6, out: 0.15 }), motu(GREAT, 70, 104, 2.8, { fat: 0.4, out: 0.12 }),
      motu(GREAT, 112, 140, 2.3, { tip: 0.8, out: 0.1 }), motu(GREAT, 150, 162, 1.8, { tip: 0.8 }), motu(GREAT, 346, 372, 1.8),
      motu(GREAT, 226, 240, 1.7, { out: -0.05, top: 1.5 }), motu(GREAT, 300, 312, 1.5, { tip: 0.8, out: -0.05, top: 1.5 }),
      motu(SW_ATOLL, 4, 54, 2, { fat: 0.4 }), motu(SW_ATOLL, 128, 152, 1.7, { tip: 0.8 }), motu(SW_ATOLL, 300, 330, 1.5, { tip: 0.8, top: 1.5 }),
      motu(NW_ATOLL, 14, 78, 2.2, { fat: 0.65 }), motu(NW_ATOLL, 262, 306, 1.7, { top: 1.5 }),
      motu(SE_ATOLL, 28, 92, 2), motu(SE_ATOLL, 118, 146, 1.6, { tip: 0.8 }), motu(SE_ATOLL, 352, 380, 1.5, { tip: 0.8 }),
      motu(E_ATOLL, 18, 118, 1.6, { fat: 0.35, out: 0.2, top: 1.6 }), motu(E_ATOLL, 134, 160, 1.5, { tip: 0.8, out: 0.15, top: 1.6 }),
      spit(GREAT, 27, -16, 2.5), spit(GREAT, 139, 13, 2.5), spit(GREAT, 105, -4, 3), spit(E_ATOLL, 19, -16, 1.5),
      spit(SW_ATOLL, 5, -18, 1.5), spit(NW_ATOLL, 77, 14, 1.5),
      // Patch reefs in the lagoons: bommies, some breaking at low water, some deep under the turquoise.
      patch([20, 15, 1.5, 21.5, 12.8, 0.8, -5, 15, 1.7, 17, -5, 1.3], 0.1), patch([25, 2, 1.1, 14, 22, 1, 24, -8, 1.2, -4, 20, 0.8], -0.4),
      patch([2, 21, 1.3, -10, 3, 1.2, 26, 12, 1.4, 6, -2, 1, 12, 17, 0.9, -2, 10, 1.1, 20, -12, 1, 24, 20, 1.2], -1.7),
      patch([-44, 29, 1.2], 0), patch([-38, 37, 1, -47, 36, 0.9], -1.6), patch([-43, -26, 0.9], -1.6),
      patch([49.5, 27, 0.9, 44, 27.5, 0.8], -2),
      // Reef mazes between the atolls: clusters of patch reefs, some dry at low water, some awash only at low tide, the
      // sea's lanes winding between them.
      patch([-58, -8, 2.6, -55.5, -5, 1.2, -53, 3, 2, -51, 5.5, 1.1, -57, 11, 1.5], 0.3), patch([-47, -1, 1.9, -48.5, 1.5, 1, -44.5, 7, 1.2, -61, 1, 1.3], -1),
      patch([-25, -17, 2.4, -22.5, -19.5, 1.3, -18, -25, 1, -16, -29, 2.2, -13.5, -31, 1.2], 0.3), patch([-29, -9, 1.7, -31.5, -12, 1.1, -20, -37, 1.3], -1),
      patch([-30, 2, 2, -26.5, 4, 1, -21, 3, 1.6, -24, -1, 0.9], -1),
      patch([-9, -38, 1.6, -6, -40.5, 2.4, -2, -41, 1, 5, -45, 1.4, 8.5, -46, 2.1, 11, -49.5, 1], 0.3), patch([1, -37, 1.2, 14, -42, 1.4], -1),
      patch([20, -32, 1.8, 22.5, -29, 0.9, 25, -27.5, 1.5, 30, -25, 1.1], -0.8), patch([33, -25, 1.5, 34.5, -22, 0.9], 0.2),
      patch([-23, 48.5, 2.2, -20, 50.5, 1.2, -12, 51, 1.8, -9, 53, 2.5, -4, 55, 1.1], 0.3), patch([-15, 42, 1.5, -17.5, 44, 0.9, 0, 50, 1.2], -1.2),
      patch([49, -1, 2.2, 51.5, 2, 1, 54, 5, 1.7, 57.5, 8.5, 1.9, 55, 11, 0.9], -1.2), patch([60, -6, 1.8, 62, -3, 1, 63, 1, 1.3], 0.3),
      // and a sand cay or two
      bar([16, 50, 28, 56], 1.6, -0.9), bar([34, 46, 38, 50], 1.2, 0.3),
    ],
    landmark: { name: 'The Great Lagoon', perk: 'greatLagoon', x: 8, y: 6, r: 18 },
    harbours: [{ x: -40, y: -30, facing: 90, moorings: 3, r: 6 }],
    lighthouses: [{ x: -12.7, y: -9.6, facing: 225, period: 9 }, { x: 51.5, y: 38.6, facing: 30, period: 10 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: -16, y: -46, facing: 0 }, { kind: 'wreck', x: 14, y: 10, facing: 0 },
      { kind: 'wreck', x: 56, y: -10, facing: 0 }, { kind: 'cache', x: 27.9, y: 25.9, facing: 225 },
      { kind: 'cache', x: -31.1, y: 41.2, facing: 230 },
    ],
    fauna: [
      { species: 'turtle', x: 8, y: 6, r: 20, count: 10 }, { species: 'turtle', x: -40, y: -30, r: 8, count: 4 },
      { species: 'gull', x: 0, y: 0, r: 60, count: 10 }, { species: 'dolphin', x: 0, y: 0, r: 64, count: 4 },
    ],
    weather: { fair: 7, fog: 1, squall: 2, calm: 2 },
    richness: 1.2,
    rim: 82, passes: [],
    mechanics: {},
    music: { mode: 'ionian', motif: [0, 2, 4, 7, 9, 7, 4] },
  },
  {
    id: 'spiceIsles', name: 'The Spice Isles', lat: LOWER, lon: 324, climate: 'tropical',
    pigments: { land: 'ochre', shallows: 'verdigris', foliage: 'malachite', accent: 'vermilion', ink: 'sepia' },
    flora: ['jungle', 'floweringTree', 'palm'],
    shore: { sand: FLOOR.sand, floor: FLOOR.sand, berm: 0.9, cliffH: 6, shallows: [3, 2], shelf: [8, 12] },
    shelf: [0, 0, 64],
    strokes: [
      // Five jungle islands crowded round one sound, Spice Harbour opening into it from the main island.
      land([-30, 12, 13, -12, 20, 15, 6, 14, 12], 16, 0.3, 6), bay(-8, 3, 7.5),
      land([24, 6, 9, 34, -10, 10], 12, 0.3, 6), land([-14, -40, 9, 8, -44, 10, 22, -36, 7], 12, 0.3, 6),
      land([-44, -12, 8, -34, -28, 9], 10, 0.3, 6),
      land([16, 32, 5], 6, 0.3, 4), land([-48, 24, 5], 6, 0.3, 4), land([44, 22, 4.6], 5, 0.3, 4), land([42, -38, 5], 6, 0.3, 4),
    ],
    landmark: { name: 'Spice Harbour', perk: 'spiceHarbour', x: -8, y: 2, r: 6 },
    harbours: [{ x: -8, y: 2, facing: 180, moorings: 6, r: 7 }],
    lighthouses: [{ x: 36, y: -18, facing: 150, period: 8 }, { x: -46, y: -6, facing: 300, period: 9 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: 2, y: -18, facing: 0 }, { kind: 'wreck', x: 30, y: 24, facing: 0 },
      { kind: 'wreck', x: -40, y: 38, facing: 0 }, { kind: 'wreck', x: 52, y: -10, facing: 0 },
      { kind: 'cache', x: -30, y: 24, facing: 0 }, { kind: 'cache', x: 24, y: 14, facing: 0 },
      { kind: 'cache', x: 8, y: -36, facing: 0 }, { kind: 'cache', x: -36, y: -20, facing: 90 },
      { kind: 'cache', x: 16, y: 32, facing: 0 },
    ],
    fauna: [{ species: 'gull', x: 0, y: 0, r: 60, count: 14 }, { species: 'dolphin', x: 0, y: -16, r: 20, count: 4 }],
    weather: { fair: 6, fog: 2, squall: 3, calm: 1 },
    richness: 1.4,
    rim: 80, passes: [],
    mechanics: {},
    music: { mode: 'mixolydian', motif: [0, 4, 5, 7, 10, 7, 5] },
  },
  {
    id: 'maelstrom', name: 'The Maelstrom', lat: -90, lon: 0, climate: 'temperate',
    pigments: { land: 'ironGall', shallows: 'ultramarine', foliage: 'umber', accent: 'leadWhite', ink: 'indigo' },
    flora: ['grass'],
    shore: { sand: FLOOR.rock, floor: FLOOR.rock, berm: 0.8, cliffH: 8, shallows: [2, 3], shelf: [6, 26] },
    shelf: [0, 0, 64],
    strokes: [
      // The whirlpool turns in open water; a broken ring of skerries waits for ships flung off its rim, and the Outer
      // Isle shelters a harbour on its far side.
      land([12, 54, 2.6], 4, 1, 7), land([36, 42, 3], 4, 1, 8), land([54, 10, 2.4], 3, 1, 6),
      land([48, -26, 2.8], 4, 1, 7), land([-10, -55, 3], 4, 1, 8), land([-30, -47, 2.6], 3, 1, 6),
      land([-52, -16, 3.2, -56, -8, 2.4], 4, 1, 8), land([-48, 28, 2.6], 3, 1, 6),
      land([41, -56, 4, 38, -49, 5, 43, -42, 5, 51, -44, 4], 6, 0.8, 9), bay(46, -50, 5.5),
    ],
    landmark: { name: 'The Eye', perk: 'eye', x: 0, y: 0, r: 6 },
    harbours: [{ x: 47, y: -51, facing: 140, moorings: 3, r: 6 }],
    lighthouses: [{ x: 41, y: -57, facing: 230, period: 8 }, { x: -56, y: -10, facing: 280, period: 10 }],
    cascades: [],
    finds: [
      { kind: 'wreck', x: 20, y: 30, facing: 0 }, { kind: 'wreck', x: -36, y: -10, facing: 0 },
      { kind: 'wreck', x: 0, y: -30, facing: 0 }, { kind: 'cache', x: 51, y: -44, facing: 40 },
    ],
    fauna: [{ species: 'gull', x: 0, y: 0, r: 64, count: 10 }],
    weather: { fair: 4, fog: 2, squall: 4, calm: 1 },
    richness: 1.1,
    rim: 86, passes: [[-13, 94, 13, -94], [-74, -58, 80, 50]],
    mechanics: { vortex: { r: 46, eye: 5, swirl: 7, inflow: 0.7 } },
    music: { mode: 'aeolian', motif: [0, 7, 3, 7, 2, 7, 0] },
  },
];
