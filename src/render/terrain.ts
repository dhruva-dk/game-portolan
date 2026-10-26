// Island terrain (WP15 part A): the land of the one geography, meshed from its height field and drawn by the
// illustrator's hand. Each cube face of the territory grid is cut into 32-cell chunks; a chunk with land holds a
// vertex on every cell corner, and every corner's height is the mean of the distinct cells round it, so the faces
// meeting at a cube edge or corner agree to the bit (no seams, cracks or pinching anywhere, poles included). A
// chunked LOD adapted from the earlier game's quadtree (its horizon and frustum culls, screen-error split) picks a level per
// chunk, keeps neighbours within one level, and closes every T-junction by snapping the finer side's odd rim
// vertices onto the coarser line; the whole planet's land is then one index buffer and one draw call. The planet's
// curve is real geometry, as for the sea, so distant islands sink hull-down behind it.
//
// The land is drawn from the geography's heights carved into believable landforms (Relief, below): hills, saddles,
// crags and peaks in place of flat tops, gullies cut down the fall line into ravines, wave-cut benches at the cliffs'
// feet and strata stepping the slopes, all brought to the planet's scale; every cell at or below the highest tide keeps
// the geography's height, so the sim's coast is the drawn one. The waterline is the sea's own: the land is never laid
// below the sea's surface, and the fragment discards wherever the sea's field (the same cube texture the sea reads)
// puts water (sheer walls keep their own sub-cell foot rather than be sawn into teeth along it), then inks the inner
// half of the sea's coast line, so the land meets the coast rings and foam exactly. Finer than the cells, the shader
// lights sub-cell relief (ridged lumps, the lips of the beds) and draws the ground in each region's pigments: sand by
// its colour with tide lines, ripples, grains and pebbles; rock in beds bent by folds, tilted by the region's dip and
// broken along faults, with staggered joints and fissures; basalt in hexagonal columns; volcanic crust cracked; ice
// striated; scree stippled densest in the talus fans at the cliffs' feet, with boulders and outcrops; moss, lichen and
// dry ground in the washes, which pool where grounds meet. Hatching follows the beds on rock and the contours
// elsewhere, deepening to cross-hatching away from the light; the brow and foot of every cliff are inked, heavier near
// the eye; the composite inks silhouettes and creases.
import * as THREE from 'three';
import { inkMaterial, linearVec, transmittanceVec } from '../style/glsl.ts';
import { PARCHMENT, PIGMENTS, type RGB } from '../style/palette.ts';
import { v3, type V3 } from '../sim/math.ts';
import { R, TERRITORY, cellDir, cellOf, faceUV, gnomonicDir, type FaceUV } from '../sim/sphere.ts';
import { CHARTS, type Geography } from '../sim/world/geography.ts';
import { FLOOR, REGIONS, TIDE, type Region } from '../sim/world/regions.ts';
import type { Pipeline } from './pipeline.ts';
import { exposureAt, LAND_GLSL, seas } from './sea.ts';
import { SWELL_GLSL, type Swell } from './swell.ts';
import type { RenderContext, RenderModule } from './world.ts';

const N = TERRITORY.n, NN = N * N;
/** Territory cells along a chunk's edge. */
export const CHUNK = 32;
const SIDE = CHUNK + 1, VERTS = SIDE * SIDE, PER_FACE = N / CHUNK;
/** Level L keeps every 2^L-th corner: 33 … 3 vertices along a chunk's edge. */
export const LEVELS = 5;
/** Arc length of a cell, u. */
const CELL_U = ((Math.PI / 2) * R) / N;
/** A level is fine enough while its height error stays under SPLIT_PX and its vertex spacing under SPACING_PX
 *  (render px); a chunk turns coarser only once both hold with HYSTERESIS to spare. */
const SPLIT_PX = 4, SPACING_PX = 48, HYSTERESIS = 0.7;
/** WP24 part C: how far the limits are relaxed (×) while the zoom lifts the eye toward orbit (world.ts sets it each
 *  frame: 1 on the deck, 2.5 from z 0.28), so the hemisphere swinging into view keeps A9's triangle budget; the eye is
 *  climbing fast there and the chart globe soaks in over the world from z 0.34. */
let coarsen = 1;
export function setTerrainCoarsen(k: number): void { coarsen = Math.max(1, k); }
/** A chunk stays in view while within this share of its distance outside the frustum, so turning the eye rebuilds
 *  the index buffer only now and then. */
const FRUSTUM_MARGIN = 0.15;
/** Ground lower than this under a whole chunk stays under the sea at every tide: no chunk. */
export const WET = -TIDE.amp - 0.4;
/** The land never lies lower than this over the sea's surface (the sea's field draws the waterline). */
const LIFT = 0.03;

// ---------------------------------------------------------------------------------------------------------------
// Grounds: what the land is made of where. The shader blends softly across the same thresholds.

export const GROUND = { beach: 0, mud: 1, meadow: 2, scree: 3, rock: 4, cliff: 5, ice: 6, basalt: 7 } as const;
export type Ground = (typeof GROUND)[keyof typeof GROUND];
/** By the surface's up·normal: sheer below `cliff`, steep below `scree`; beaches reach berm·beachRise + beachBase.
 *  Rainforest clings to far steeper ground (`clad`: sheer below [0], steep below [1]), so a jungle's slopes and spurs
 *  are forest down to the beach, and only its true crags stand bare; its sand lies only on the strand's flat (gentler
 *  than `strand`), the forest's leaf bank closing down to it over any rise behind (S-022). */
export const SLOPES = { cliff: 0.62, scree: 0.8, beachRise: 1.6, beachBase: 0.3, clad: [0.42, 0.62], strand: 0.86 } as const;
/** Whether region r's land is clad in rainforest (its slopes held by the forest: SLOPES.clad). */
export const cladOf = (r: Region): boolean => r.flora.includes('jungle');
/** Region r's sheer and steep thresholds of up·normal. */
export const slopesOf = (r: Region): readonly [number, number] => (cladOf(r) ? SLOPES.clad : [SLOPES.cliff, SLOPES.scree]);
const LOAD = { land: 0.7, foliage: 0.62 } as const;

export type Sand = 'white' | 'gold' | 'black' | 'mud' | 'ice' | 'shingle';
/** Each sand's pigment and wash density. */
const SANDS: Record<Sand, readonly [RGB, number]> = {
  white: [PIGMENTS.ochre, 0.14], gold: [PIGMENTS.ochre, 0.6], black: [PIGMENTS.ironGall, 0.85],
  mud: [PIGMENTS.umber, 0.75], ice: [PIGMENTS.ultramarine, 0.12], shingle: [PIGMENTS.sepia, 0.42],
};
/** A region's beach, from its shore: coral sand is white. */
export function sandOf(r: Region): Sand {
  switch (r.shore.sand) {
    case FLOOR.blackSand: return 'black';
    case FLOOR.mud: return 'mud';
    case FLOOR.ice: return 'ice';
    case FLOOR.rock: return 'shingle';
    default: return r.flora.includes('coral') ? 'white' : 'gold';
  }
}
/** How a region's rock is drawn: 0 strata, 1 basalt columns (regions with stacks or columns), 2 ice (polar). */
export function landformOf(r: Region): number {
  return r.climate === 'polar' ? 2 : r.strokes.some((s) => s.k === 'stacks' || s.k === 'column') ? 1 : 0;
}
/** The top of region r's beach, u over mean sea. */
export const beachTop = (r: Region): number => r.shore.berm * SLOPES.beachRise + SLOPES.beachBase;
/** How the coast's exposure (sea.ts EXPOSE: +1 off a point, −1 at a bay's head) moves the sand, as on a coast drawn from
 *  life (S-025 (4)): at a bay's head the beach's top and the foreshore's rise by up to `raise` u, so pocket beaches
 *  gather in the coves, widest at their heads; off a point both fall below the lowest water (`bare` 0 to 1 over that
 *  exposure) and its shore is bare rock where the sand would lie (`fore` u: the highest water's reach on clad land),
 *  the forest or meadow above coming down to it. Only where a coast has rock to bare (`cliffH`, its cliffs' height, ramping the rule in): a low coast of
 *  sand or mud (the shoals' dunes, the atolls' white coral cays, the mangroves' mud) keeps its sand all round. */
export const EXPOSED = { raise: 0.5, bare: [0.25, 0.8], fore: TIDE.amp + 0.4, cliffH: [3, 5], head: 0.8, outcrop: 0.9, pitch: 7 } as const;
/** How fully region r's sand follows its coast's exposure (0–1, EXPOSED). */
export const exposedOf = (r: Region): number => (sandOf(r) === 'white' || sandOf(r) === 'mud' ? 0 : smooth(EXPOSED.cliffH[0], EXPOSED.cliffH[1], r.shore.cliffH));
/** Region r's sand at exposure ex: the top of its beach on the strand's flat, the top of its foreshore sand however
 *  steep (on clad land), and how bare a point has left its foreshore (0–1). */
export function sandTops(r: Region, ex: number): [number, number, number] {
  const e = ex * exposedOf(r), bare = smooth(EXPOSED.bare[0], EXPOSED.bare[1], e), lift = EXPOSED.raise * Math.max(-e, 0), lw = -TIDE.amp - 0.1;
  return [beachTop(r) + (lw - beachTop(r)) * bare + lift, EXPOSED.fore + (lw - EXPOSED.fore) * bare + lift, bare];
}

/** The ground of region `ri` at `height` u where the surface's up·normal is `up` and the coast's exposure is `ex`. */
export function groundAt(ri: number, height: number, up: number, ex = 0): Ground {
  const r = REGIONS[ri], form = landformOf(r);
  if (form === 2) return GROUND.ice;
  const [sheer, steep] = slopesOf(r);
  if (up < sheer) return form === 1 ? GROUND.basalt : GROUND.cliff;
  if (up < steep) return height < r.shore.cliffH * 0.8 ? GROUND.scree : GROUND.rock;
  const [top, fore, bare] = sandTops(r, ex), sandy = (t: number, f: number): boolean => height < t && (up > SLOPES.strand || !cladOf(r) || height < f);
  if (sandy(top, fore)) return sandOf(r) === 'mud' ? GROUND.mud : GROUND.beach;
  if (bare > 0.5 && sandy(beachTop(r), EXPOSED.fore)) return GROUND.rock;
  return GROUND.meadow;
}

// ---------------------------------------------------------------------------------------------------------------
// Relief: the geography's heights carved for drawing into the landforms a master engraver draws from life. The sim's
// coast is untouched: every cell at or below KEEP keeps its height to the bit, so the waterline at every tide is the
// geography's, and the carving fades in above it. Above, (0) the profile from the shore is a cliff where the coast is
// cliffed and a slope rising inland where it is not, so headlands alternate with hills running down to coves; (1) wave-cut benches hold the first cells under a cliff at the
// highest tide's shelf, so sea cliffs step down to the water; (2) a domain-warped ridged field lifts the land inland
// into hills, saddles and peaks, so no top is a flat mesa; (3) outcrops roughen it at the cells' own scale; (4) gullies
// are cut down the fall line (noise stretched along the coast distance's gradient), notching the cliff edges into
// ravines; (5) tall land is eased down to the planet's scale, so islands read as land on a globe from orbit rather
// than pillars while deck views keep their cliffs; (6) strata step the slopes into benches (basalt in taller columnar
// steps). Each region's style comes from its own data (reliefOf).

/** Heights at or below this, u, are the geography's own: the highest tide with a margin, so the sim's waterline holds. */
export const KEEP = TIDE.amp + 0.25;

export interface Relief {
  /** Relief amplitude, u: the region's cliff height, 2 … 18. */
  amp: number;
  /** Cliffed coast, ridged crags (0 rounded … 1 jagged), gully depth, strata terracing and wave-cut benches, shares. */
  sheer: number;
  crag: number;
  gully: number;
  terrace: number;
  bench: number;
  /** Strata step, u (basalt's columns stand in taller steps). */
  step: number;
  /** How far inland (u) the gullies run before fading (rainforest valleys cut back to the summits). */
  reach: number;
}

/** How region r's land is carved, from its own data: cliff height, landform, sand and climate. Ice rounds and low
 *  sand islands barely rise; the high regions (Fjords, Weeping Isle, Basalt) are craggy and deeply gullied; volcanic
 *  land is the most jagged; basalt terraces in columns. */
export function reliefOf(r: Region): Relief {
  const form = landformOf(r), amp = THREE.MathUtils.clamp(r.shore.cliffH, 2, 18), high = THREE.MathUtils.clamp((amp - 3) / 12, 0, 1);
  const flat = form === 2 || amp <= 3;
  // rainforest land weathers deep: no bare beds stepping its slopes, knife-edge ridges and spurs between ravines cut
  // back to the summits, few sea cliffs but rocky headlands between coves
  if (r.flora.includes('jungle')) return { amp, sheer: 0.18, crag: 0.85, gully: 1.15, terrace: 0, bench: 0.3, step: 1.15, reach: 34 };
  return {
    amp,
    sheer: form === 2 ? 0.5 : sandOf(r) === 'black' ? 0.4 : 0.25 + 0.5 * high,
    crag: form === 2 ? 0.15 : sandOf(r) === 'black' ? 0.95 : amp <= 3 ? 0.1 : 0.4 + 0.5 * high,
    gully: form === 2 ? 0.35 : 0.45 + 0.55 * high,
    terrace: form === 1 ? 0.8 : flat ? 0 : 0.25 + 0.3 * high,
    bench: flat ? 0 : 0.35 + 0.4 * high,
    step: form === 1 ? 1.5 : 1.15,
    reach: 22,
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smin = (a: number, b: number, k: number): number => {
  const t = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * t - k * t * (1 - t);
};
const ease = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
/** Value noise in [−1, 1] on the unit lattice. */
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), u = ease(x - ix), v = ease(y - iy), w = ease(z - iz);
  const a = hash3(ix, iy, iz), b = hash3(ix + 1, iy, iz), c = hash3(ix, iy + 1, iz), d = hash3(ix + 1, iy + 1, iz);
  const e = hash3(ix, iy, iz + 1), f = hash3(ix + 1, iy, iz + 1), g = hash3(ix, iy + 1, iz + 1), k = hash3(ix + 1, iy + 1, iz + 1);
  const ab = a + (b - a) * u, cd = c + (d - c) * u, ef = e + (f - e) * u, gk = g + (k - g) * u;
  const lo = ab + (cd - ab) * v;
  return 2 * (lo + (ef + (gk - ef) * v - lo) * w) - 1;
}
/** The carving's headland share at the world point (x, y, z) u in a region whose sheer share is `sheer`: 0 where the
 *  land is laid down to a cove's gentle rise, 1 where it stands up as a headland. One rule for the relief, the sand
 *  (shoreExposure) and the shader's `headland` (the same hash, bit for bit). */
export const headlandAt = (x: number, y: number, z: number, sheer: number): number => smooth(-0.3, 0.3, noise3(x / 17 + 1.7, y / 17, z / 17) + sheer - 0.5);
/** The exposure the sand follows at unit `dir` in region `ri` (EXPOSED): the coast's (sea.ts exposureAt) and, along it,
 *  the carving's headlands (`head` times its headland share) and rocky outcrops (`outcrop` times a value noise of
 *  `pitch` u), so a long smooth shore breaks into pocket beaches between rocky points, and the points stand where the
 *  land stands up behind them. */
export function shoreExposure(geo: Geography, dir: V3, ri: number): number {
  const l = Math.hypot(dir.x, dir.y, dir.z), x = (dir.x / l) * R, y = (dir.y / l) * R, z = (dir.z / l) * R, p = EXPOSED.pitch;
  const k = headlandAt(x, y, z, reliefOf(REGIONS[ri]).sheer);
  return Math.max(-1, Math.min(1, exposureAt(geo, dir) + EXPOSED.head * k + EXPOSED.outcrop * noise3(x / p + 3.1, y / p - 1.3, z / p)));
}
/** Ridged multifractal in [0, 1]: sharp crests, each octave weighted by the one above (crags on the crests). */
function ridged(x: number, y: number, z: number, octaves: number): number {
  let sum = 0, norm = 0, amp = 1, weight = 1, f = 1;
  for (let o = 0; o < octaves; o++) {
    const r = 1 - Math.abs(noise3(x * f, y * f, z * f)), s = r * r * weight;
    sum += s * amp;
    norm += amp;
    weight = Math.min(1, s * 1.8);
    amp *= 0.5;
    f *= 2.07;
  }
  return sum / norm;
}
function fbm3(x: number, y: number, z: number, octaves: number): number {
  let sum = 0, norm = 0, amp = 1, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * f + o * 17.1, y * f, z * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Every cell's drawn height: the geography's at or below KEEP, carved above it. */
/** A harbour that is its region's landmark is a town: level made ground along its quay, terraces climbing behind
 *  (carve), built on rather than planted (flora). */
export const townsOf = (geo: Geography): Geography['harbours'] => geo.harbours.filter((hb) => geo.landmarks.some((m) =>
  m.region === hb.region && Math.hypot(m.pos.x - hb.pos.x, m.pos.y - hb.pos.y, m.pos.z - hb.pos.z) < m.r * 1.5));
export function carve(geo: Geography): Float32Array {
  const H = geo.heights, C = geo.coast, out = Float32Array.from(H), styles = REGIONS.map(reliefOf);
  const d = v3(), di = v3(), dj = v3();
  const towns = townsOf(geo);
  for (let c = 0; c < H.length; c++) {
    const h = H[c];
    if (h <= KEEP) continue;
    const s = styles[geo.region[c]], i = c % N, j = Math.floor(c / N) % N, inland = Math.max(0, -C[c]);
    cellDir(TERRITORY, c, d);
    const x = d.x * R, y = d.y * R, z = d.z * R;
    // the fall line (seaward, unit): the coast distance's gradient toward the cell's neighbours on its face
    let gx = 0, gy = 0, gz = 0;
    if (i < N - 1 && j < N - 1) {
      cellDir(TERRITORY, c + 1, di);
      cellDir(TERRITORY, c + N, dj);
      const a = C[c + 1] - C[c], b = C[c + N] - C[c];
      const ex = di.x - d.x, ey = di.y - d.y, ez = di.z - d.z, el = Math.hypot(ex, ey, ez);
      const nx = dj.x - d.x, ny = dj.y - d.y, nz = dj.z - d.z, nl = Math.hypot(nx, ny, nz);
      gx = (a * ex) / el + (b * nx) / nl; gy = (a * ey) / el + (b * ny) / nl; gz = (a * ez) / el + (b * nz) / nl;
      const gl = Math.hypot(gx, gy, gz);
      if (gl > 1e-3) { gx /= gl; gy /= gl; gz /= gl; } else gx = gy = gz = 0;
    }
    const w = smooth(KEEP, KEEP + 2, h), rise = smooth(0, 3 + 0.4 * s.amp, inland);
    let e = h - KEEP;
    const k = headlandAt(x, y, z, s.sheer);
    const slope = (0.3 + 0.25 * (1 + noise3(x / 11, y / 11 + 4.4, z / 11))) * (0.5 + s.amp / 18);
    e = smin(e, s.amp * 0.45 * (0.2 + 0.8 * k) + inland * slope, 1);
    const bench = k * s.bench * smooth(2, 5, h) * (1 - smooth(0.9, 1.7, inland)) * smooth(-0.1, 0.25, noise3(x / 7, y / 7, z / 7));
    e += (0.15 - e) * bench;
    const wb = w * (1 - 0.85 * bench);
    const qx = x / 26 + 0.9 * noise3(x / 41, y / 41, z / 41), qy = y / 26 + 0.9 * noise3(x / 41 + 5.2, y / 41, z / 41);
    const qz = z / 26 + 0.9 * noise3(x / 41, y / 41 + 9.7, z / 41);
    const round = 0.5 + 0.5 * fbm3(qx * 0.8, qy * 0.8, qz * 0.8, 2);
    const shape = Math.min(1.2, round + (1.6 * ridged(qx, qy, qz, 4) - round) * s.crag);
    e += wb * s.amp * rise * (0.6 * shape - 0.25);
    e += wb * s.amp * 0.5 * smooth(4, 30, inland) * (0.5 + 0.5 * round); // great islands climb to a massif
    e += wb * s.amp * (0.04 + 0.07 * s.crag) * fbm3(x / 2.6, y / 2.6, z / 2.6, 2);
    // moving inland by D moves the gully sample by D/5 down the fall line: channels five times longer than wide
    const gf = 1 / 4.5, gs = inland * gf * 0.8;
    const n1 = noise3(x * gf + gx * gs, y * gf + gy * gs, z * gf + gz * gs);
    const n2 = noise3(2.1 * (x * gf + gx * gs) + 3.3, 2.1 * (y * gf + gy * gs), 2.1 * (z * gf + gz * gs));
    const cut = Math.max(1 - smooth(0, 0.22, Math.abs(n1)), 0.6 * (1 - smooth(0, 0.16, Math.abs(n2))));
    e -= wb * s.gully * cut * Math.max(0, Math.min(e, s.amp)) * 0.55 * (1 - smooth(8, s.reach, inland));
    e = Math.max(e, Math.min(h - KEEP, 0.12));
    let hr = KEEP + (e * 0.85) / (1 + e / 40);
    if (s.terrace > 0) {
      const off = 0.8 * noise3(x / 30, y / 30, z / 30), t = (hr - KEEP + off) / s.step, fl = Math.floor(t);
      const stepped = KEEP + (fl + smooth(0.55, 0.95, t - fl)) * s.step - off;
      hr += (stepped - hr) * s.terrace * wb * (0.5 + 0.5 * noise3(x / 9, y / 9 + 3.1, z / 9));
    }
    for (const hb of towns) {
      if (hb.region !== geo.region[c]) continue;
      const pl = Math.hypot(hb.pos.x, hb.pos.y, hb.pos.z), ox = d.x - hb.pos.x / pl, oy = d.y - hb.pos.y / pl, oz = d.z - hb.pos.z / pl;
      const dd = Math.hypot(ox, oy, oz) * R, town = 1 - smooth(hb.r + 9, hb.r + 15, dd);
      if (town <= 0) continue;
      // the quay's apron 6 u deep at the coping, then terraces 1.25 u high every 2.6 u up the slope, each riser a wall
      const t = Math.max(0, inland - 6) / 2.6, fl = Math.floor(t), level = KEEP + 0.15 + 1.25 * (fl + smooth(0.8, 1, t - fl));
      hr += (Math.min(hr, level) - hr) * town;
    }
    out[c] = Math.max(hr, KEEP + Math.min(h - KEEP, 0.1));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The terrain field: corner heights, positions and normals, and the surface queries B (structures) and C (flora)
// place things with.

const TANS = new Float64Array(N + 3);
for (let i = -1; i <= N + 1; i++) TANS[i + 1] = Math.tan(((i / N) * 2 - 1) * (Math.PI / 4));
const angleOf = (i: number): number => ((i / N) * 2 - 1) * (Math.PI / 4);
const NUDGE = (Math.PI / 2 / N) * 0.05;

export interface Surface {
  /** Height of the finest drawn surface above mean sea level, u (the land is never drawn below the sea). */
  height: number;
  /** Outward unit normal. */
  readonly normal: THREE.Vector3;
  /** normal · local up: 1 flat, 0 sheer. */
  up: number;
  ground: Ground;
  region: number;
}

export class TerrainField {
  readonly geo: Geography;
  /** Every cell's drawn height (carve). */
  readonly relief: Float32Array;
  private readonly cells: number[] = [];
  private readonly d = v3();
  private readonly uv: FaceUV = { face: 0, u: 0, v: 0 };
  private readonly p = [v3(), v3(), v3(), v3()];
  private readonly nq = [v3(), v3(), v3(), v3()];

  constructor(geo: Geography) {
    this.geo = geo;
    this.relief = carve(geo);
  }

  /** Height of corner (i, j) of face f's cell grid, i, j ∈ [−1, N + 1]: the mean of the distinct cells' drawn heights round
   *  it (found by direction on or past a face edge, summed in cell order so every face gets the same bits). */
  corner(f: number, i: number, j: number): number {
    const H = this.relief;
    if (i > 0 && i < N && j > 0 && j < N) {
      const b = f * NN + (j - 1) * N + i - 1;
      return 0.25 * (H[b] + H[b + 1] + H[b + N] + H[b + N + 1]);
    }
    const cells = this.cells, a = angleOf(i), b = angleOf(j);
    cells.length = 0;
    for (let k = 0; k < 4; k++) {
      gnomonicDir(f, Math.tan(a + (k & 1 ? NUDGE : -NUDGE)), Math.tan(b + (k & 2 ? NUDGE : -NUDGE)), this.d);
      const c = cellOf(TERRITORY, this.d);
      if (!cells.includes(c)) cells.push(c);
    }
    cells.sort((x, y) => x - y);
    let s = 0;
    for (const c of cells) s += H[c];
    return s / cells.length;
  }

  /** Unit direction through corner (i, j) of face f. */
  dir(f: number, i: number, j: number, out: V3): V3 {
    return gnomonicDir(f, TANS[i + 1], TANS[j + 1], out);
  }

  /** Outward normal at corner (i, j) of face f, from the neighbouring corners (across a face edge by direction). */
  normal(f: number, i: number, j: number, out: V3): V3 {
    const [e, w, n, s] = this.p;
    this.point(f, i + 1, j, e); this.point(f, i - 1, j, w); this.point(f, i, j + 1, n); this.point(f, i, j - 1, s);
    const ax = e.x - w.x, ay = e.y - w.y, az = e.z - w.z, bx = n.x - s.x, by = n.y - s.y, bz = n.z - s.z;
    const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx, l = Math.hypot(x, y, z) || 1;
    out.x = x / l; out.y = y / l; out.z = z / l;
    return out;
  }

  private point(f: number, i: number, j: number, out: V3): V3 {
    this.dir(f, i, j, out);
    const r = R + this.corner(f, i, j);
    out.x *= r; out.y *= r; out.z *= r;
    return out;
  }

  /** Height of the finest terrain surface over direction p (the mesh's own triangles), u above mean sea level. */
  height(p: V3): number {
    const c = this.locate(p), f = this.uv.face, i = c.i, j = c.j;
    const h00 = this.corner(f, i, j), h10 = this.corner(f, i + 1, j), h01 = this.corner(f, i, j + 1), h11 = this.corner(f, i + 1, j + 1);
    return c.tx + c.ty <= 1 ? h00 + c.tx * (h10 - h00) + c.ty * (h01 - h00) : h11 + (1 - c.tx) * (h01 - h11) + (1 - c.ty) * (h10 - h11);
  }

  /** The surface over direction p at sea level `tide`: height, normal, slope, ground and region. */
  surface(p: V3, tide: number, out: Surface): Surface {
    const h = this.height(p), c = this.locate(p), f = this.uv.face, [a, b, d, e] = this.nq;
    this.normal(f, c.i, c.j, a); this.normal(f, c.i + 1, c.j, b); this.normal(f, c.i, c.j + 1, d); this.normal(f, c.i + 1, c.j + 1, e);
    const w = [(1 - c.tx) * (1 - c.ty), c.tx * (1 - c.ty), (1 - c.tx) * c.ty, c.tx * c.ty];
    out.normal.set(0, 0, 0);
    [a, b, d, e].forEach((q, k) => out.normal.add(new THREE.Vector3(q.x, q.y, q.z).multiplyScalar(w[k])));
    out.normal.normalize();
    const l = Math.hypot(p.x, p.y, p.z);
    out.height = Math.max(h, tide + LIFT);
    out.up = (out.normal.x * p.x + out.normal.y * p.y + out.normal.z * p.z) / l;
    out.region = this.geo.region[cellOf(TERRITORY, p)];
    out.ground = groundAt(out.region, out.height, out.up, out.height < 3 ? shoreExposure(this.geo, p, out.region) : 0);
    return out;
  }

  private readonly at = { i: 0, j: 0, tx: 0, ty: 0 };
  private locate(p: V3): { i: number; j: number; tx: number; ty: number } {
    faceUV(p, this.uv);
    const x = (this.uv.u + 1) * 0.5 * N, y = (this.uv.v + 1) * 0.5 * N, a = this.at;
    a.i = Math.min(N - 1, Math.floor(x)); a.j = Math.min(N - 1, Math.floor(y));
    a.tx = x - a.i; a.ty = y - a.j;
    return a;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Chunks and their LOD templates

export interface Chunk {
  readonly face: number;
  readonly cx: number;
  readonly cy: number;
  /** First vertex in the terrain's vertex buffer. */
  readonly base: number;
  /** Bounding cone of the chunk's directions, and its highest corner, u. */
  readonly axis: THREE.Vector3;
  readonly spread: number;
  readonly top: number;
  readonly sphere: THREE.Sphere;
  /** World-unit height error of each level against the finest. */
  readonly err: Float32Array;
  /** Land chunk across each edge (−u, +u, −v, +v), −1 where there is none. */
  readonly nb: Int32Array;
}

export interface ChunkSet {
  chunks: Chunk[];
  /** World positions, xyz per vertex. */
  position: Float32Array;
  /** Normal xyz (×127) and region index per vertex. */
  normalRegion: Int8Array;
}

const keyOf = (f: number, cx: number, cy: number): number => (f * PER_FACE + cy) * PER_FACE + cx;

/** Every land chunk of the planet with its vertices, bounds, level errors and neighbours. */
export function buildChunks(field: TerrainField): ChunkSet {
  const found: { f: number; cx: number; cy: number; h: Float32Array; top: number }[] = [];
  const hs = new Float32Array(VERTS);
  for (let f = 0; f < 6; f++) {
    for (let cy = 0; cy < PER_FACE; cy++) {
      for (let cx = 0; cx < PER_FACE; cx++) {
        let top = -Infinity;
        for (let j = 0; j <= CHUNK; j++) {
          for (let i = 0; i <= CHUNK; i++) {
            const h = field.corner(f, cx * CHUNK + i, cy * CHUNK + j);
            hs[j * SIDE + i] = h;
            if (h > top) top = h;
          }
        }
        if (top > WET) found.push({ f, cx, cy, h: hs.slice(), top });
      }
    }
  }
  const position = new Float32Array(found.length * VERTS * 3), normalRegion = new Int8Array(found.length * VERTS * 4);
  const byKey = new Map<number, number>(), d = v3(), nrm = v3(), box = new THREE.Box3(), pt = new THREE.Vector3();
  const chunks = found.map((c, k): Chunk => {
    byKey.set(keyOf(c.f, c.cx, c.cy), k);
    box.makeEmpty();
    for (let j = 0; j <= CHUNK; j++) {
      for (let i = 0; i <= CHUNK; i++) {
        const v = k * VERTS + j * SIDE + i, gi = c.cx * CHUNK + i, gj = c.cy * CHUNK + j, r = R + c.h[j * SIDE + i];
        field.dir(c.f, gi, gj, d);
        position[v * 3] = d.x * r; position[v * 3 + 1] = d.y * r; position[v * 3 + 2] = d.z * r;
        field.normal(c.f, gi, gj, nrm);
        normalRegion[v * 4] = Math.round(nrm.x * 127);
        normalRegion[v * 4 + 1] = Math.round(nrm.y * 127);
        normalRegion[v * 4 + 2] = Math.round(nrm.z * 127);
        normalRegion[v * 4 + 3] = field.geo.region[c.f * NN + Math.min(gj, N - 1) * N + Math.min(gi, N - 1)];
        box.expandByPoint(pt.set(d.x, d.y, d.z).multiplyScalar(Math.max(r, R + WET)));
      }
    }
    field.dir(c.f, c.cx * CHUNK + CHUNK / 2, c.cy * CHUNK + CHUNK / 2, d);
    const axis = new THREE.Vector3(d.x, d.y, d.z);
    let cosA = 1;
    for (let q = 0; q < 4; q++) {
      field.dir(c.f, c.cx * CHUNK + (q & 1) * CHUNK, c.cy * CHUNK + (q >> 1) * CHUNK, d);
      cosA = Math.min(cosA, axis.x * d.x + axis.y * d.y + axis.z * d.z);
    }
    return {
      face: c.f, cx: c.cx, cy: c.cy, base: k * VERTS, axis, spread: Math.acos(cosA), top: c.top,
      sphere: box.getBoundingSphere(new THREE.Sphere()), err: levelErrors(c.h), nb: new Int32Array(4).fill(-1),
    };
  });
  // neighbours: the chunk half a cell past each edge's midpoint, on this face or across a cube edge
  for (const c of chunks) {
    for (let k = 0; k < 4; k++) {
      const pi = k === 0 ? c.cx * CHUNK - 0.5 : k === 1 ? (c.cx + 1) * CHUNK + 0.5 : c.cx * CHUNK + CHUNK / 2 + 0.5;
      const pj = k === 2 ? c.cy * CHUNK - 0.5 : k === 3 ? (c.cy + 1) * CHUNK + 0.5 : c.cy * CHUNK + CHUNK / 2 + 0.5;
      const cell = cellOf(TERRITORY, gnomonicDir(c.face, Math.tan(angleOf(pi)), Math.tan(angleOf(pj)), d));
      const f = Math.floor(cell / NN), i = cell % N, j = Math.floor(cell / N) % N;
      c.nb[k] = byKey.get(keyOf(f, Math.floor(i / CHUNK), Math.floor(j / CHUNK))) ?? -1;
    }
  }
  return { chunks, position, normalRegion };
}

/** Each level's worst height error against the finest grid (heights under the lowest tide count as that tide). */
function levelErrors(h: Float32Array): Float32Array {
  const err = new Float32Array(LEVELS), at = (i: number, j: number) => Math.max(h[j * SIDE + i], -TIDE.amp);
  for (let L = 1; L < LEVELS; L++) {
    const s = 1 << L;
    let e = err[L - 1];
    for (let j = 0; j <= CHUNK; j++) {
      for (let i = 0; i <= CHUNK; i++) {
        const i0 = Math.min(CHUNK - s, i - (i % s)), j0 = Math.min(CHUNK - s, j - (j % s)), tx = (i - i0) / s, ty = (j - j0) / s;
        const h00 = at(i0, j0), h10 = at(i0 + s, j0), h01 = at(i0, j0 + s), h11 = at(i0 + s, j0 + s);
        const g = tx + ty <= 1 ? h00 + tx * (h10 - h00) + ty * (h01 - h00) : h11 + (1 - tx) * (h01 - h11) + (1 - ty) * (h10 - h11);
        e = Math.max(e, Math.abs(at(i, j) - g));
      }
    }
    err[L] = e;
  }
  return err;
}

const templates = new Map<number, Uint32Array>();
/** Chunk-local triangles of level L. Bit k of `mask` marks edge k (−u, +u, −v, +v) as meeting a chunk one level
 *  coarser: that edge's odd vertices snap onto their even neighbours, so the edge runs straight between the coarse
 *  side's vertices and no T-junction opens. Each quad splits along the same diagonal as TerrainField.height. */
export function template(L: number, mask: number): Uint32Array {
  const key = L * 16 + mask, hit = templates.get(key);
  if (hit) return hit;
  const s = 1 << L, out: number[] = [];
  const snap = (i: number, j: number): number => {
    if (((j === 0 && mask & 4) || (j === CHUNK && mask & 8)) && (i / s) & 1) i -= s;
    if (((i === 0 && mask & 1) || (i === CHUNK && mask & 2)) && (j / s) & 1) j -= s;
    return j * SIDE + i;
  };
  const tri = (a: number, b: number, c: number) => {
    const ax = a % SIDE, ay = (a - ax) / SIDE, bx = b % SIDE, by = (b - bx) / SIDE, cx = c % SIDE, cy = (c - cx) / SIDE;
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0) out.push(a, b, c); // snapping folds some flat: drop them
  };
  for (let j = 0; j < CHUNK; j += s) {
    for (let i = 0; i < CHUNK; i += s) {
      const a = snap(i, j), b = snap(i + s, j), c = snap(i, j + s), d = snap(i + s, j + s);
      tri(a, b, c);
      tri(b, d, c);
    }
  }
  const t = Uint32Array.from(out);
  templates.set(key, t);
  return t;
}

/** Whether everything within `spread` of `dir`, up to radius `top`, lies behind the sea's horizon from the eye. */
export function belowHorizon(dir: THREE.Vector3, spread: number, top: number, eyeDir: THREE.Vector3, eyeR: number): boolean {
  const ang = Math.acos(THREE.MathUtils.clamp(dir.dot(eyeDir), -1, 1)) - spread;
  return ang > Math.acos(Math.min(1, R / eyeR)) + Math.acos(Math.min(1, R / Math.max(R, top)));
}

// ---------------------------------------------------------------------------------------------------------------
// The material

const v4 = (c: RGB, d: number): THREE.Vector4 => {
  const t = transmittanceVec(c);
  return new THREE.Vector4(t.x, t.y, t.z, d);
};
const vec = (v: THREE.Vector3): string => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
const NR = REGIONS.length;

const VERTEX = /* glsl */ `
${SWELL_GLSL}
in vec4 aNR;
out vec3 vWorld;
out vec3 vNormal;
flat out int vRegion;
void main() {
  float r = length(position);
  vWorld = position * (max(r, SEA_R + uSeaLevel + ${LIFT.toFixed(3)}) / r);
  vNormal = aNR.xyz;
  vRegion = int(aNR.w + 0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
${SWELL_GLSL}
${LAND_GLSL}
in vec3 vWorld;
in vec3 vNormal;
flat in int vRegion;
uniform vec4 uLand[${NR}];
uniform vec4 uFoliage[${NR}];
uniform vec4 uSand[${NR}];
uniform vec4 uShore[${NR}];  // beach top u, cliff height u, landform (0 strata, 1 basalt, 2 ice), shore (1 mud, -1 white coral sand)
uniform vec4 uRelief[${NR}]; // crag share, volcanic, shingle beach, the beds' dip bearing (rad, chart plane)
uniform vec3 uChartE[${NR}];
uniform vec3 uChartN[${NR}];
uniform vec2 uFade;          // the composite's line fade, u from the eye
uniform float uSheer[${NR}]; // the carving's sheer share (headlandAt)
uniform vec4 uSlope[${NR}];  // up·normal below which the ground is sheer, and steep; 1 where rainforest clads the land; how fully the sand follows the coast's exposure
const float TIDE_AMP = ${TIDE.amp.toFixed(3)};
const float CELL_U = ${CELL_U.toFixed(4)};
const float STRATA = 1.15, COLUMN = 1.5, JOINT = 0.9, LINE_CSS = 0.45, COAST_CSS = 0.6;
const vec3 ULTRA_T = ${vec(transmittanceVec(PIGMENTS.ultramarine))};
const vec3 ROSE_T = ${vec(transmittanceVec(PIGMENTS.roseMadder))}, OCHRE_T = ${vec(transmittanceVec(PIGMENTS.ochre))};
const vec3 VERD_T = ${vec(transmittanceVec(PIGMENTS.verdigris))};
const vec3 LEAD = ${vec(linearVec(PIGMENTS.leadWhite))}, PARCH = ${vec(linearVec(PARCHMENT))};

// ink coverage of a line d field units from its centre, half-width w CSS px, the field changing fw per render px
float inkLine(float d, float fw, float w) {
  float hw = w * uRenderPx;
  return 1.0 - smoothstep(hw - 0.5, hw + 0.5, abs(d) / max(fw, 1e-5));
}

// the hexagonal joint pattern of a basalt column field: offset from the column's centre (xy) and its cell (zw)
vec4 hexCell(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 c = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, c.xy) : vec4(h.zw, c.zw + 0.5);
}

// dots of ink on a jittered grid in the region's chart plane, the grid's octave keeping them a few px apart
float dotsAt(vec2 x, float C, float upx, float dens, float seed) {
  vec2 cell = floor(x / C);
  float h = hash12(cell + seed);
  vec2 c = (cell + 0.25 + 0.5 * vec2(hash12(cell + seed + 7.1), hash12(cell.yx + seed + 3.3))) * C;
  float r = (0.5 + 0.4 * h) * uRenderPx;
  return step(h, dens) * (1.0 - smoothstep(r - 0.5, r + 0.5, length(x - c) / upx));
}
float stipple(vec2 x, float upx, float dens, float seed) {
  float lvl = max(log2(upx * uRenderPx * 7.0 / 0.3), 0.0), lo = floor(lvl), C = 0.3 * exp2(lo);
  return mix(dotsAt(x, C, upx, dens, seed + lo), dotsAt(x, 2.0 * C, upx, dens, seed + lo + 1.0), lvl - lo);
}

// the carving's headland share (headlandAt: its value noise on the CPU's integer hash, bit for bit)
float hashI(vec3 c) {
  ivec3 i = ivec3(c);
  uint h = uint(i.x) * 374761393u + uint(i.y) * 668265263u + uint(i.z) * 1274126177u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967296.0;
}
float noiseI(vec3 p) {
  vec3 i = floor(p), f = p - i, u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return 2.0 * mix(mix(mix(hashI(i), hashI(i + vec3(1, 0, 0)), u.x), mix(hashI(i + vec3(0, 1, 0)), hashI(i + vec3(1, 1, 0)), u.x), u.y),
                   mix(mix(hashI(i + vec3(0, 0, 1)), hashI(i + vec3(1, 0, 1)), u.x), mix(hashI(i + vec3(0, 1, 1)), hashI(i + vec3(1, 1, 1)), u.x), u.y), u.z) - 1.0;
}
// shoreExposure's: the coast's exposure, the carving's headlands and the shore's rocky outcrops
float shoreExposure(vec3 dir, float d0, float sheer) {
  vec3 x = dir * SEA_R;
  vec2 rise;
  float k = smoothstep(-0.3, 0.3, noiseI(vec3(x.x / 17.0 + 1.7, x.y / 17.0, x.z / 17.0)) + sheer - 0.5);
  return clamp(exposure(dir, d0, rise) + ${EXPOSED.head.toFixed(2)} * k + ${EXPOSED.outcrop.toFixed(2)} * noiseI(vec3(x.x / ${EXPOSED.pitch.toFixed(1)} + 3.1, x.y / ${EXPOSED.pitch.toFixed(1)} - 1.3, x.z / ${EXPOSED.pitch.toFixed(1)})), -1.0, 1.0);
}
// value noise in [-1, 1] on the unit lattice
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p), f = p - i, u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash13(i), b = hash13(i + vec3(1, 0, 0)), c = hash13(i + vec3(0, 1, 0)), d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1)), g = hash13(i + vec3(1, 0, 1)), k = hash13(i + vec3(0, 1, 1)), l = hash13(i + vec3(1, 1, 1));
  return 2.0 * mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(k, l, u.x), u.y), u.z) - 1.0;
}
// relief finer than the mesh's cells, u: lumps (ridged by the region's crag share), each octave fading out before it
// would alias
float fineRelief(vec3 p, float upx, float crag) {
  float a = 0.0, s = 1.0, f = 0.55;
  for (int o = 0; o < 3; o++) {
    float k = 1.0 - smoothstep(0.12, 0.35, upx * f);
    if (k <= 0.0) break;
    float n = noise3(p * f + float(o) * 7.31);
    a += s * k * mix(n, 1.0 - 2.0 * abs(n), crag);
    s *= 0.42;
    f *= 2.3;
  }
  return a;
}
// the normal tilted by a height field b over the surface (screen-space surface gradient)
vec3 bumped(vec3 n, vec3 p, float b) {
  vec3 sx = dFdx(p), sy = dFdy(p), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  return normalize(abs(det) * n - sign(det) * (dFdx(b) * r1 + dFdy(b) * r2));
}
// one stone per jittered cell of C u (where its hash falls under dens): its outline's ink (x) and its side away from
// the sun (y), fading in once it is a few px across
vec2 stones(vec2 x, float C, float dens, float seed, vec2 sun, float upx) {
  vec2 cell = floor(x / C), c = (cell + 0.3 + 0.4 * vec2(hash12(cell + seed), hash12(cell.yx + seed + 1.7))) * C;
  float r = C * (0.1 + 0.17 * hash12(cell + seed + 8.3));
  vec2 o = x - c;
  float d = length(o) - r, on = step(hash12(cell + seed + 4.1), dens) * smoothstep(1.2, 2.5, r / (upx * uRenderPx));
  return on * vec2(inkLine(d, upx, LINE_CSS * 0.75), step(d, 0.0) * smoothstep(0.0, 0.7, -dot(o, sun) / r));
}
// a knob of broken coral per jittered cell of C u (where its hash falls under dens), lobed, never a disc, and wholly
// inside its cell: its outline's ink, heavier on its side away from the sun (x), its body (y) and that side's shade
// (z), fading in once it is a few px across
vec3 knobs(vec2 x, float C, float dens, float seed, vec2 sun, float upx) {
  vec2 cell = floor(x / C), c = (cell + 0.34 + 0.32 * vec2(hash12(cell + seed), hash12(cell.yx + seed + 1.7))) * C;
  float h = hash12(cell + seed + 8.3), r = C * (0.12 + 0.12 * h);
  vec2 o = x - c;
  float a = atan(o.y, o.x), d = length(o) - r * (1.0 + 0.2 * sin(3.0 * a + 6.3 * h) + 0.1 * sin(5.0 * a + 2.0 * h));
  float on = step(hash12(cell + seed + 4.1), dens) * smoothstep(1.2, 2.5, r / (upx * uRenderPx));
  float lee = smoothstep(-0.2, 0.6, -dot(o, sun) / r);
  return on * vec3(inkLine(d, upx, LINE_CSS * 0.7) * (0.3 + 0.7 * lee), 1.0 - smoothstep(-0.5 * upx, 0.5 * upx, d), step(d, 0.0) * lee);
}
// u up a shore from the water: the sea's field's height over the slope of that field across a pace, as the sea paints
// the waterline from it (never by the pixel's derivatives, which step from texel to texel and speckle); lo the least
// slope taken
float upShore(vec3 dir, float above, float lo) {
  vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
  const float E = 0.7 / SEA_R;
  vec2 rise = vec2(seaField(normalize(dir + t1 * E)).x - seaField(normalize(dir - t1 * E)).x, seaField(normalize(dir + t2 * E)).x - seaField(normalize(dir - t2 * E)).x);
  return above / clamp(length(rise) / 1.4, lo, 0.8);
}

void main() {
  vec3 dir = normalize(vWorld);
  vec4 f = seaField(dir);
  float above = f.x - uSeaLevel; // the sea paints depth = uSeaLevel - f.x: one waterline for both
  vec3 n0 = normalize(vNormal);
  float up0 = dot(n0, dir);
  int ri = vRegion;
  vec4 shore = uShore[ri], land = uLand[ri], fol = uFoliage[ri], sand = uSand[ri], rel = uRelief[ri];
  vec4 slope = uSlope[ri];
  float CLIFF_UP = slope.x, SCREE_UP = slope.y, clad = slope.z, STRAND_UP = ${SLOPES.strand.toFixed(3)};
  // a sheer wall stands on the mesh's own foot (within a cell of the coast) rather than be sawn into teeth along the
  // field's waterline; never on reef, whose flank under the water is the sea's to paint, nor (on the low coral cays of
  // a white-sand region, which have no cliffs) further out than a cell, where the mesh's faces at a drowned shelf's
  // edge stood above the sea (both showed as slivers and a smear of pigments round the atolls); and never a face the
  // waterline laid flat on the sea (a drowned slope's, every corner lifted: S-022's flat orange plank in Spice Harbour)
  bool wall = up0 < 0.4 && f.w < 0.5 && (shore.w > -0.5 || f.y < CELL_U) && length(vWorld) > SEA_R + uSeaLevel + ${(LIFT + 0.01).toFixed(3)};
  if (above < -0.5 && !wall) discard;
  vec3 E = uChartE[ri], NC = uChartN[ri], v = normalize(cameraPosition - vWorld);
  float h = length(vWorld) - SEA_R, dist = distance(cameraPosition, vWorld);
  float upx = max(length(dFdx(vWorld)), length(dFdy(vWorld)));
  // (on a reef the footprint is judged from the eye's distance, the pixel's angle and the smooth normal, never from the
  // facet's own derivatives, which jump from cell to cell: on the lip's sliver facets they laid the far flat's bleach
  // in pale straight-edged wedges, S-024)
  vec3 rdir = normalize(vWorld - cameraPosition);
  float pang = max(length(dFdx(rdir)), length(dFdy(rdir)));
  float upxR = mix(upx, dist * pang / max(abs(dot(normalize(vNormal), v)), 0.12), smoothstep(0.0, 0.03, f.w));
  float near = 1.0 - smoothstep(uFade.x, uFade.y, dist);
  vec2 pl = vec2(dot(vWorld, E), dot(vWorld, NC));
  Paper q = paperAt(vWorld, n0, 1.0);

  // grounds by the mesh's slope, blended where washes meet along noise-warped edges; talus fans at the cliffs' feet
  float bleed = (q.bloom - 0.5) * 0.08 + (q.mottle - 0.5) * 0.06;
  float cliff = 1.0 - smoothstep(CLIFF_UP - 0.05, CLIFF_UP + 0.05, up0 + bleed);
  float steep = (1.0 - cliff) * (1.0 - smoothstep(SCREE_UP - 0.04, SCREE_UP + 0.04, up0 + bleed));
  // white coral sand: a sand cay's or reef's flank up to the beach is sand and pavement, never a rock wall of beds
  float cay = max(-shore.w, 0.0) * (1.0 - smoothstep(shore.x + 0.2, shore.x + 0.8, h));
  cliff *= 1.0 - cay;
  steep *= 1.0 - cay;
  // the coast's exposure moves the sand (EXPOSED, sandTops): pocket beaches in the coves, widest at their heads; off the
  // points bare rock where the sand would lie and the forest or meadow above coming down to it
  float ex = slope.w > 0.0 && h < shore.x + ${(EXPOSED.raise + 0.5).toFixed(2)} ? slope.w * shoreExposure(dir, f.y, uSheer[ri]) : 0.0;
  float bare = smoothstep(${EXPOSED.bare[0].toFixed(2)}, ${EXPOSED.bare[1].toFixed(2)}, ex), lift = ${EXPOSED.raise.toFixed(2)} * max(-ex, 0.0), lw = -TIDE_AMP - 0.1;
  float topB = mix(shore.x, lw, bare) + lift, topF = mix(TIDE_AMP + 0.35, lw, bare) + lift;
  float onFlat = smoothstep(STRAND_UP - 0.04, STRAND_UP + 0.03, up0 + bleed + 0.06 * (q.mottle - 0.5));
  float low = 1.0 - smoothstep(topB - 0.3, topB + 0.3, h + bleed * 6.0), low0 = 1.0 - smoothstep(shore.x - 0.3, shore.x + 0.3, h + bleed * 6.0);
  if (clad > 0.5) { // (the foreshore sand, however steep)
    low *= max(onFlat, 1.0 - smoothstep(topF - 0.1, topF + 0.1, h + 0.2 * bleed));
    low0 *= max(onFlat, 1.0 - smoothstep(TIDE_AMP + 0.25, TIDE_AMP + 0.45, h + 0.2 * bleed));
  }
  float scar = (1.0 - cliff) * bare * low0; // (the shore a point has bared is rock up to where its sand would lie)
  steep = max(steep, scar);
  float beach = (1.0 - cliff - steep) * low, meadow = 1.0 - cliff - steep - beach;
  float talus = steep * (1.0 - smoothstep(0.25, 0.45, h / max(shore.y, 1.0))) * (1.0 - clad); // (no scree under rainforest)

  // the beds: bent by folds, tilted by the region's dip, broken into blocks along faults
  float fold = 0.9 * noise3(vWorld / 9.0) + 0.3 * noise3(vWorld / 3.1);
  vec2 dip = vec2(cos(rel.w), sin(rel.w));
  float fault = floor(dot(pl, vec2(-dip.y, dip.x)) / 7.0 + 0.6 * noise3(vWorld / 13.0));
  float bed = h + fold + 0.05 * dot(pl, dip) + (hash11(fault * 7.3 + float(ri)) - 0.5) * 1.4;
  float band = bed / STRATA + 0.35 * noise3(vWorld / 1.4 + 5.0) + (q.mottle - 0.5) * 0.3, bh = hash11(floor(band) * 1.37 + float(ri) * 5.1);
  // crags: the rock split into buttresses and gullies down the fall line (noise stretched upright: fine across the face,
  // coarse down it), its creases the fissures; the beds show only in broken outcrops and pinch out along their length,
  // so a face reads as ribs, fissures and broken ledges, never as stripes (S-020)
  vec3 cp = vec3(pl, h * 0.22) + float(ri) * 3.1;
  float rib = noise3(cp / 4.5) + 0.5 * noise3(cp / 1.6 + 7.0) + 0.22 * noise3(cp / 0.6 + 3.0);
  float crease = 1.0 - smoothstep(0.0, 0.3, abs(rib));
  float outcrop = smoothstep(0.0, 0.35, noise3(vWorld / 7.0 + 2.0)) * smoothstep(-0.05, 0.3, noise3(vec3(pl / 2.6, floor(band) * 1.91)));
  float bedded = shore.z < 0.5 ? 1.0 : 0.0, crag = bedded * (1.0 - smoothstep(0.15, 0.5, upx));

  // light on relief finer than the cells: lumps, and the beds' lips catching the light near the eye
  float rough = mix(0.06, 0.38, cliff + steep) * (1.0 - 0.7 * beach) * (shore.z > 1.5 ? 0.4 : 1.0);
  float b = rough * fineRelief(vWorld, upx, rel.x);
  if (shore.z < 0.5) b += 0.16 * (cliff + steep) * outcrop * smoothstep(0.62, 0.92, fract(band)) * (1.0 - smoothstep(0.1, 0.3, upx));
  b += 0.8 * crag * (cliff + 0.6 * steep) * abs(rib);
  vec3 n = bumped(n0, vWorld, b);
  n = normalize(mix(n, normalize(vWorld), 0.85 * cay)); // a cay lies low and flat in the light (its cells' steep facets unshaded)

  // washes by ground: rock with moss and lichen on its ledges, sand darker where wet, the uplands' green with dry
  // ground showing through; all pooling along the shore and where rock meets the slopes above and below it
  float pool = max(max(washPool(n, v, q), 1.0 - smoothstep(0.0, 1.2, -f.y)), 4.0 * cliff * (1.0 - cliff));
  vec3 ground = parchment(q);
  float patchy = noise3(vWorld / 4.0);
  // each face's blocks its own load (between the beds that show and the fissures), weather stains run down the faces
  float blk = hash12(vec2(floor(band), floor(rib * 2.2 + dot(pl, vec2(0.6, 0.8)) / 3.1)));
  float stain = smoothstep(0.2, 0.6, noise3(vec3(pl / 0.55, h * 0.05) + 13.0)) * cliff;
  vec3 rock = glaze(ground, land.rgb, land.a * (0.75 + 0.35 * mix(0.5, blk, 0.4 + 0.6 * outcrop) * cliff + 0.15 * patchy + 0.25 * stain), pool, q);
  rock = mix(rock, glaze(rock, fol.rgb, 0.35, pool, q), smoothstep(0.2, 0.7, patchy) * steep * (1.0 - rel.y));
  float wet = 1.0 - smoothstep(0.0, TIDE_AMP + 0.15, above);
  vec3 sandC = glaze(ground, sand.rgb, sand.a * (1.0 + 0.45 * wet + 0.12 * patchy), pool, q);
  vec3 green = glaze(ground, fol.rgb, fol.a * (1.0 + 0.015 * max(h, 0.0) + 0.25 * patchy), pool, q);
  green = mix(green, glaze(ground, land.rgb, land.a * 0.6, pool, q), smoothstep(0.35, 0.9, -patchy) * 0.6);
  // slopes short of sheer carry the uplands' growth where the ground allows (not on ice, basalt, lava or the talus),
  // the rock showing through in patches
  float veg = smoothstep(-0.3, 0.3, patchy + 0.3 - 1.2 * talus) * (1.0 - rel.y) * step(shore.z, 0.5) * 0.85;
  // rainforest: its steep slopes the forest floor in the canopy's shade, never bare; its crags dark volcanic rock, only
  // its buttresses' spines and ledges bare, ferns and scrub filling the gullies and clinging to every ledge (S-022)
  float spine = 0.0;
  if (clad > 0.5) {
    vec3 shadeG = glaze(green, ULTRA_T, 0.3 + 0.15 * patchy, pool, q);
    vec3 lava = glaze(glaze(ground, land.rgb, land.a * 0.5, pool, q), SEPIA_T, 0.85 + 0.25 * blk, pool, q);
    lava = glaze(lava, ULTRA_T, 0.25, pool, q);
    spine = smoothstep(0.2, 0.55, rib + 0.3 * patchy) * (1.0 - smoothstep(0.1, 0.5, noise3(vWorld / 1.3 + 6.0) + 0.4 * crease));
    spine = max(spine, scar); // (a bared point's shore is the crags' dark rock, washed bare by the sea)
    rock = mix(shadeG, lava, spine);
    veg = (1.0 - 0.5 * spine) * (1.0 - scar);
    green = mix(green, shadeG, 0.35 * steep);
  }
  veg *= 1.0 - scar; // (a bared shore is the sea's, washed bare)
  vec3 col = rock * cliff + mix(rock, green, veg) * steep + sandC * beach + green * meadow;
  // (the clad slopes are drawn as the forest floor from here on: beds, joints, fissures and fall-line hatching only on
  // the bare spines)
  if (clad > 0.5) { cliff *= spine; steep *= spine; }
  // coral: where the floor is reef the ground is the reef's own: up to the high-water line a pavement of bleached
  // limestone under a veneer of white coral sand, cooler and darker where wet; a blush of coralline algae along its
  // edge, olive turf and rubble in broad soft patches, and near the eye pools that keep the sea's turquoise; its fronts
  // the same limestone (never bedded rock). The fine mottle is laid only where it is several px across, so from high
  // the reef is one pale wash with its blush and turf, never confetti. Above it the motus' dry sand, bleached white:
  // warm white in the light, the shade's cool glaze in shadow.
  // The flat ends at the land line (sim's LAND, coralAtolls.ts: dry at high water), where the motus' palms begin, so the
  // islets are exactly as long and broad as their height says and the reef between them is awash (S-021).
  float mud = max(shore.w, 0.0), reef = f.w * (1.0 - smoothstep(LAND_U - 0.03, LAND_U + 0.03, f.x + bleed));
  // a motu's beach: its white sand runs down from the dry crest a pace or two onto the flat (BEACH_W, no tree stands on
  // it), so from any height the islet reads as a white beach round its grove, ragged at its foot and inked there (the
  // islet's waterline at high water, S-021); a reef that never rises above the land line keeps no beach, and the gaps
  // between the motus stay awash flat (toLand: one rule with the sea's waterline ink)
  float toL = 9.0;
  if (reef > 0.01 && shore.w < -0.5 && f.x > -0.4) toL = toLand(dir, f.x);
  float beachD = toL - BEACH_W + 0.35 * noise3(vWorld / 1.3 + 7.0);
  reef *= smoothstep(-0.12, 0.12, beachD);
  // the awash flat's lines (its tide lines, its lip into the sea and the composite's creases over it) are drawn light
  // and in broken lengths, as the sea draws its waterline there: its relief lies under the water at high tide; the
  // motus' beaches keep theirs (S-021)
  float lip = toL < 8.0 ? lipInk(dir, f.w * smoothstep(BEACH_W - 0.1, BEACH_W + 0.6, toL)) : f.w > 0.02 && above < 0.4 ? lipInk(dir, offBeach(dir, f)) : 1.0;
  float bleached = max(-shore.w, 0.0), reefInk = 0.0, reefShade = 0.0, reefSw = 0.0;
  float afar = smoothstep(0.025, 0.06, upxR * uRenderPx); // ~0.04 u to the CSS px and more: the flat seen from high
  if (reef > 0.01) {
    // near the eye a wet reef pavement at low water, as an engraver draws it from the beach (S-024: its sepia pits read
    // as a leopard's hide, its hatched rubble as grid patches): pale cream limestone going cool grey in broad ragged
    // patches; a crust of coralline rose along its seaward fringe and in scraps over it; olive turf in soft patches;
    // broken coral heaped in drifts, each knob bleached, lit on top and drawn round on its side from the sun; shallow
    // pools of standing water giving back the pale sky inside a damp margin and a broken rim; the stone's honeycomb a
    // fine sparse stipple, never spots; its flanks broken and shaded. Every patch's outline is warped, never a round blot.
    float fine = 1.0 - smoothstep(0.04, 0.16, upxR), grain = 1.0 - smoothstep(0.012, 0.045, upxR);
    float m1 = noise3(vWorld / 6.0), m2 = fine * noise3(vWorld / 1.2 + 3.0);
    float m3 = noise3(vWorld / 3.0 + 11.0);
    vec3 wv = vWorld + 0.8 * vec3(noise3(vWorld / 2.1 + 31.0), noise3(vWorld / 2.1 + 37.0), noise3(vWorld / 2.1 + 43.0));
    float edge = (1.0 - smoothstep(0.3, 1.5, -f.y + 0.6 * m1)) * smoothstep(-0.5, 0.1, m3 + 0.3 * m2);
    float turf = smoothstep(0.15, 0.55, -m1 + 0.3 * m3 + 0.45 * m2) * (1.0 - 0.6 * edge);
    float grey = smoothstep(-0.1, 0.45, noise3(wv / 3.2 + 13.0) + 0.3 * m2) * (1.0 - edge) * (1.0 - turf);
    vec3 pave = glaze(ground * 1.04, OCHRE_T, mix(0.15, 0.06, fine) + 0.04 * m1, pool * (1.0 - fine), q);
    pave = mix(pave, ground * LEAD / PARCH * 1.03, (0.1 + 0.3 * grey) * fine);
    // coralline rose: a crust along the seaward fringe, broken, and scraps of it over the flat
    // (and thickest as a knobbled crust on the lip itself, the water's edge and the face below it, broken in short lengths:
    // the reef's living edge, rose against the pale stone, S-024)
    float crust = (1.0 - smoothstep(0.0, 0.35 + 0.25 * m1, above)) * smoothstep(0.42, 0.62, noise3(wv / 0.45 + 41.0) + 0.25 * noise3(wv / 1.6 + 47.0));
    float blush = max(max(edge * smoothstep(-0.35, 0.15, noise3(wv / 0.8 + 19.0)), 0.4 * fine * smoothstep(0.35, 0.6, m2 - 0.35 * m1)), crust);
    pave = glaze(pave, ROSE_T, mix(0.42, 0.5, fine) * blush, 0.0, q);
    pave = glaze(glaze(pave, OCHRE_T, 0.16 * turf, 0.0, q), VERD_T, 0.17 * turf, 0.0, q);
    // pools, a pace or two across, low on the flat: the pale sky in them, a damp margin round them
    // (more of them and broader, and kept further out, so they read at the shore's distance, S-024)
    float pf = 1.0 - smoothstep(0.07, 0.3, upxR);
    float pv = 0.8 * noise3(wv / 1.15 + 17.0) + 0.45 * noise3(wv / 3.4 + 5.0) + 0.2 * m2 - 0.35 * smoothstep(0.35, 0.7, above);
    pf *= smoothstep(0.02, 0.1, above) * smoothstep(0.6, 0.8, up0); // (on the flat's top, never down its lip)
    float poolK = pf * smoothstep(0.14, 0.2, pv), damp = pf * smoothstep(0.03, 0.15, pv) * (1.0 - poolK);
    pave = glaze(pave, SEPIA_T, 0.12 * damp, 0.0, q);
    pave = mix(pave, glaze(ground * LEAD / PARCH * 1.08, ULTRA_T, 0.27, 0.0, q), 0.88 * poolK);
    pave = glaze(pave, VERD_T, 0.1 * poolK * smoothstep(0.36, 0.56, pv), 0.0, q); // (the floor seen through its middle)
    // rubble: drifts heaped along the flat (banks running with the shore, ragged, a pace or two wide), a few knobs
    // strewn between them
    float bk = noise3(vec3(f.y / 0.9 + 0.7 * m3, pl / 4.5 + 3.0)) + 0.35 * noise3(wv / 0.9 + 23.0);
    float bank = fine * smoothstep(0.25, 0.5, bk) * (1.0 - poolK);
    vec2 sunR = normalize(vec2(dot(uSun, E), dot(uSun, NC)) + 1e-4);
    vec3 k1 = knobs(pl, 0.2, mix(0.03, 0.9, bank), 51.0, sunR, upxR), k2 = knobs(pl + 0.05, 0.09, mix(0.04, 0.8, bank), 57.0, sunR, upxR);
    float body = max(k1.y, k2.y) * fine * (1.0 - poolK);
    pave = mix(pave, glaze(ground * 1.03, OCHRE_T, 0.05, 0.0, q), 0.35 * bank); // (coral grit between the knobs)
    pave = mix(pave, ground * LEAD / PARCH * 1.07, 0.7 * body);
    pave = glaze(pave, SEPIA_T, 0.28 * max(k1.z, k2.z) * body, 0.0, q);
    // the honeycomb: a fine sparse stipple, thicker in ragged patches, none in the pools
    float comb = 0.24 * smoothstep(-0.3, 0.4, noise3(wv / 1.4 + 29.0)) * (1.0 - poolK) * (1.0 - body);
    reefInk = fine * (0.65 * max(k1.x, k2.x) * (1.0 - poolK)
                      + 0.6 * inkLine(pv - 0.2, fwidth(pv), LINE_CSS * 0.7) * smoothstep(-0.2, 0.2, noise3(wv / 0.5 + 2.0)) * pf / max(fine, 0.05)) * (1.0 - smoothstep(0.3, 0.7, -above))
            + grain * 0.5 * stipple(pl, upxR, comb, 61.0);
    // wet below the last tide: a little darker and cooler, the sea's green in it
    pave = glaze(glaze(pave, SEPIA_T, 0.04 * wet * wet, 0.0, q), VERD_T, 0.06 * wet, 0.0, q);
    // its margin to the water near the eye (at deck level, as the sea's): the swash runs up over the flat in a thin
    // glassy film of the lagoon's water, furthest up in the bays between the pavement's spurs, its edge a broken line
    // of foam with a ripple inside it and scraps of foam at the water's edge, so the flat never ends in a hard lip
    reefSw = (1.0 - smoothstep(0.03, 0.09, upxR)) * (1.0 - smoothstep(4.0, 7.0, length(cameraPosition) - SEA_R - uSeaLevel));
    if (reefSw > 0.01 && above < 0.3) {
      // (u in from the water: up the lip by the field's slope, across the top by the coast's distance)
      float wd = min(upShore(dir, above, 0.02), max(-f.y, 0.0)), fw = max(fwidth(wd), 1e-4);
      float cn = noise3(vec3(pl / 1.8, 0.0) + 8.3), bay = smoothstep(-0.45, 0.55, cn + 0.3 * noise3(vec3(pl / 0.6, 1.0)));
      float run = 0.86 + 0.14 * sin(uTime * 0.8 + 5.0 * cn);
      float reach = max((0.12 + 0.7 * bay) * run, 6.0 * fw);
      float film = 1.0 - smoothstep(reach - fw, reach + fw, wd);
      float gr = noise3(vec3(pl / max(0.25, 6.0 * fw), uTime * 0.2) + 1.7);
      float rimW = max(0.05 + 0.04 * bay, 3.0 * fw);
      float rim = (1.0 - smoothstep(0.0, rimW, reach - wd)) * film * smoothstep(-0.4, 0.1, gr);
      float rp = 0.5 * reach + 0.05 * noise3(vec3(pl / 0.7, 3.0)), rpW = max(0.012, 1.2 * fw);
      float ripple = (1.0 - smoothstep(rpW, rpW + fw, abs(wd - rp))) * smoothstep(-0.1, 0.3, noise3(vec3(pl / 0.5, 9.0)));
      // (deepening toward the water's edge to the lagoon's own tint, so the film and the sea meet without a seam, S-024)
      float deep = 1.0 - smoothstep(0.0, 0.18 + 0.1 * bay, wd);
      float bt = max(0.03, 2.0 * fw) * (0.6 + 0.6 * smoothstep(-0.5, 0.5, gr)), brk = (1.0 - smoothstep(bt - fw, bt + fw, wd)) * smoothstep(0.0, 0.3, gr);
      pave = glaze(glaze(pave, VERD_T, (0.38 + 0.22 * deep) * film * reefSw, 0.0, q), ULTRA_T, 0.05 * film * reefSw, 0.0, q);
      pave = mix(pave, ground * LEAD / PARCH * 1.06, 0.85 * max(max(rim, brk), 0.55 * ripple * film) * reefSw);
      reefInk += reefSw * (0.6 * (1.0 - smoothstep(0.4, 1.1, abs(wd - reach) / fw / uRenderPx)) * smoothstep(-0.1, 0.25, noise3(vec3(pl / 0.8, 7.0)))
                           + 0.3 * (1.0 - smoothstep(0.3, 0.9, abs(wd - rp - rpW) / fw / uRenderPx)) * smoothstep(0.1, 0.4, noise3(vec3(pl / 0.5, 9.0)))
                           );
      reefSw *= film;
    } else reefSw = 0.0;
    // flanks broken and shaded where they stand clear of the swash: a ragged lip, never a pale cliff
    float flank = smoothstep(0.02, 0.3, 1.0 - up0) * (0.7 + 0.6 * m2) * (1.0 - 0.85 * reefSw);
    pave = glaze(pave, SEPIA_T, 0.14 * flank, 0.0, q);
    reefShade = fine * clamp(0.4 * flank, 0.0, 1.0);
    // awash: the flat lies under the sea at high water and keeps a film of it at half tide, so it reads as pale wet
    // coral and rubble under thin turquoise, never as dry land beside the motus' white sand (S-021); the film thinner
    // near the eye, where the pavement shows through it, and thinnest where the flat stands highest
    // (from afar the rubble bleached near white under the film, its warm blush and turf let go, since a warm ground under
    // a blue-green film greys it; drifts of rubble a pace or two across lie paler and warmer under a thinner film, the
    // hollows between under more: turquoise, never grey)
    float drift = afar * smoothstep(0.1, 0.5, noise3(vWorld / 2.2 + 21.0) + 0.35 * noise3(vWorld / 0.7 + 4.0) + 0.2 * m3);
    // (near the eye at low water the pavement stands bare but for a sheen, the hollows between the banks under more)
    float film = mix((0.08 + 0.1 * (1.0 - bank)) * (1.0 - 0.7 * poolK), 0.58, afar) * (1.0 - 0.3 * smoothstep(0.0, TIDE_AMP, above)) * (0.85 + 0.3 * m1 - 0.3 * drift);
    pave = mix(mix(pave, ground * LEAD / PARCH * 1.06, 0.7 * afar), ground * 1.04, 0.25 * drift);
    pave = glaze(glaze(pave, VERD_T, film, 0.0, q), ULTRA_T, 0.1 * film, 0.0, q);
    col = mix(col, pave, reef * (1.0 - meadow));
  }
  col = mix(col, ground * LEAD / PARCH * 1.05, bleached * beach * (1.0 - reef) * (1.0 - 0.6 * wet) * 0.92 * (0.9 + 0.2 * patchy));
  if (bleached > 0.0) {
    // shells and coral grit strewn on the coral sand near the eye, a hand long (~0.03 u): cream, now and then rose, a dark
    // fleck of shadow at the lip
    vec2 sg = pl / 0.3, si = floor(sg), so = fract(sg) - 0.5 - 0.6 * (vec2(hash12(si), hash12(si + 3.1)) - 0.5);
    float sh = hash12(si + 7.7), sd = length(so * vec2(1.0, 1.6)) * 0.3, near = 1.0 - smoothstep(0.004, 0.01, upx);
    float has = near * step(0.8, sh) * (1.0 - smoothstep(0.012, 0.016, sd));
    vec3 shc = ground * LEAD / PARCH;
    col = mix(col, mix(shc, shc * ROSE_T, 0.45 * step(0.94, sh)), 0.9 * has);
    col *= 1.0 - 0.3 * has * smoothstep(0.0, 0.3, so.y);
  }

  // a sand beach's foreshore near the eye (not mud, coral, shingle or black sand): the shore break's foam at the water's
  // edge; above it the swash runs up the wet sand in a thin glassy film, its edge a broken line of foam scalloped between
  // the beach's cusps (the horns pointing to the sea, the bays running furthest up), pulsing as the swash runs and
  // falls; above that the last swash's mark, a darker wavering line on the wet sand; so the waterline is never one
  // ruled line under a strip of paper (S-022)
  float sandy = step(abs(shore.w), 0.5) * (1.0 - rel.y) * (1.0 - rel.z) * step(shore.z, 0.5) * (1.0 - reef) * beach
              * (1.0 - smoothstep(0.03, 0.09, upx)) * (1.0 - smoothstep(4.0, 7.0, length(cameraPosition) - SEA_R - uSeaLevel)); // (at deck level, as the sea's)
  float swEdge = 0.0, swMark = 0.0;
  if (sandy > 0.01 && above < 0.5) {
    float wd = upShore(dir, above, 0.08), fw = max(fwidth(wd), 1e-4); // (u up the beach from the water)
    float cn = noise3(vec3(pl / 2.1, 0.0) + 3.3), bay = min(1.0, abs(cn) * 2.4);    // 0 at a cusp's horn, 1 in its bay
    float run = 0.82 + 0.18 * sin(uTime * 0.95 + 5.0 * cn);
    float reach = max((0.12 + 0.3 * bay) * run, 6.0 * fw), foamW = max(0.025 + 0.04 * bay * run, 2.0 * fw);
    float film = 1.0 - smoothstep(reach - fw, reach + fw, wd);
    float grain = noise3(vec3(pl / max(0.3, 6.0 * fw), uTime * 0.2) + 1.7);
    float rimW = max(0.04 + 0.03 * bay, 2.5 * fw);
    float rim = (1.0 - smoothstep(0.0, rimW, reach - wd)) * film * smoothstep(-0.45, 0.1, grain);          // the swash's foam edge, broken
    float bt = foamW * (0.6 + 0.6 * smoothstep(-0.5, 0.5, grain)), brk = (1.0 - smoothstep(bt - fw, bt + fw, wd)) * smoothstep(0.0, 0.3, grain); // the shore break's foam, in scraps
    float mk = reach / run + max(0.12, 4.0 * fw) + 0.08 * noise3(vec3(pl / 0.9, 2.0)), mkW = max(0.02, 1.2 * fw);
    swMark = (1.0 - smoothstep(mkW, mkW + fw, abs(wd - mk))) * smoothstep(-0.4, 0.0, noise3(vec3(pl / 0.6, 5.0))) * sandy;
    // the film: the sand darker and cooler under it
    col = glaze(glaze(col, VERD_T, 0.16 * film * sandy, 0.0, q), SEPIA_T, 0.14 * film * sandy, 0.0, q);
    col = glaze(col, SEPIA_T, 0.12 * (1.0 - film) * (1.0 - smoothstep(mk - fw, mk + fw, wd)) * sandy + 0.3 * swMark, 0.0, q); // wet below the mark
    col = mix(col, ground * LEAD / PARCH * 1.04, 0.9 * max(rim, brk) * sandy);
    swEdge = (1.0 - smoothstep(0.4, 1.1, abs(wd - reach) / fw / uRenderPx)) * smoothstep(-0.1, 0.25, noise3(vec3(pl / 0.8, 7.0))) * sandy;
  }

  float lines = 0.0;
  vec2 across = normalize(vec2(-dot(n0, NC), dot(n0, E)) + 1e-4);
  float jc = dot(pl, across) / JOINT; // along the face
  if (shore.z > 1.5) {
    // ice: blue-white, its faces glazed deeper and striated, crevasses across the slopes
    col = wash(col, ULTRA_T, (0.35 + 0.1 * patchy) * (cliff + steep) + 0.12);
    float stria = jc * 1.3 + 0.8 * noise3(vWorld / 2.0);
    lines += inkLine(abs(fract(stria) - 0.5), min(fwidth(stria), 0.4), LINE_CSS * 0.6) * cliff * 0.45 * step(0.4, hash11(floor(stria)));
    float crev = bed / 2.3 + 0.5 * fold;
    lines += inkLine(abs(fract(crev) - 0.5), min(fwidth(crev), 0.4), LINE_CSS * 0.6) * steep * 0.4 * step(0.5, hash11(floor(crev) + fault));
  } else if (shore.z > 0.5) {
    // basalt: hexagonal joints, upright on the faces and tiled across the tops, each column its own load
    vec4 hx = hexCell(pl / COLUMN);
    float rim = 0.5 - max(dot(abs(hx.xy), vec2(0.5, 0.8660254)), abs(hx.x));
    col = wash(col, land.rgb, (cliff + steep) * 0.35 * hash12(hx.zw));
    lines += inkLine(rim, length(fwidth(pl)) / COLUMN, LINE_CSS) * (1.0 - low) * 0.8;
  } else {
    // strata: the lip of a hard bed inked only where an outcrop shows it, pinching out along its length; joints
    // staggered bed by bed; the fissures down the creases between the buttresses, broken now and then; and the ribs'
    // shaded flanks drawn round (only where rock shows: soil and growth bury the beds, so a wooded slope never rings
    // with them, S-020)
    float bare = (cliff + 0.5 * steep * (1.0 - veg)) * (1.0 - reef);
    lines += inkLine(abs(fract(band + 0.5) - 0.5), min(fwidth(band), 0.5), LINE_CSS) * bare * outcrop * step(0.4, bh) * 0.7;
    float jn = noise3(vec3(pl / 1.1, floor(band) * 2.3 + 0.5));
    lines += inkLine(jn, fwidth(jn), LINE_CSS * 0.7) * cliff * outcrop * 0.55 * (1.0 - reef);
    lines += inkLine(rib, fwidth(rib), LINE_CSS * 0.6) * bare * crag * smoothstep(-0.1, 0.25, noise3(cp / 3.2 + 11.0)) * 0.6;
    col = glaze(col, SEPIA_T, 0.4 * crease * bare * bedded * (1.0 - smoothstep(0.25, 0.8, upx)), 0.0, q);   // the creases and gullies in shadow
  }
  if (rel.y > 0.5) {
    // volcanic: the lava's crust cracked into plates
    vec2 cw = pl / 1.4 + 0.7 * vec2(noise3(vWorld / 2.2), noise3(vWorld / 2.2 + 5.0)), cf = abs(fract(cw) - 0.5);
    lines += inkLine(0.5 - max(cf.x, cf.y), length(fwidth(cw)), LINE_CSS * 0.6) * (meadow + steep) * 0.55;
  }
  vec2 sunPl = normalize(vec2(dot(uSun, E), dot(uSun, NC)) + 1e-4);
  vec2 rocks = stones(pl, 0.9, 0.5, 21.0, sunPl, upx) * talus + stones(pl, 1.7, 0.16, 33.0, sunPl, upx) * (meadow * rel.x + steep)
    + stones(pl, 0.32, 0.75, 41.0, sunPl, upx) * beach * rel.z;                                         // boulders, outcrops, pebbles
  col = mix(col, hatchInk(0.6), rocks.y * 0.35 * near);
  lines += rocks.x;
  lines += stipple(pl, upx, 0.45 + 0.3 * talus, 3.0) * steep * (1.0 - veg) * step(h, shore.y * 0.8);                  // scree
  // a point's bared shore drawn from life (S-028 (1): never a flat slab): stepped ledges of the dark rock, bedded and
  // jointed, each lip inked over its riser's shade and each tread weathered pale; pools left on the treads giving back
  // the sky; cobbles heaped at the foot (structures.ts layShoreRocks heaps the boulders); a dark wet band and weed at the
  // waterline, the wash white where the sea works at it; the forest's roots and litter stopping at the rock's edge
  float scarFlat = 0.0;
  if (scar > 0.01) {
    float ledge = scar * (1.0 - cliff), aw = max(above, h - uSeaLevel); // (u over the water: the field's, never under the mesh's own)
    // the ledges: steps of 0.3 u along the beds, broken by two sets of joints into blocks, each block's step set up or
    // down its own way, so the lips run in short offset lengths, never as level bands
    float lb0 = (h + 0.06 * dot(pl, dip) + 0.2 * noise3(vWorld / 2.6 + 1.0) + 0.06 * noise3(vWorld / 0.7)) / 0.3;
    float ja = dot(pl, vec2(-dip.y, dip.x)) / 1.7 + 0.3 * noise3(vWorld / 1.8), jb = dot(pl, dip) / 2.3 + 0.3 * noise3(vWorld / 2.1 + 4.0);
    vec2 blkId = vec2(floor(ja), floor(jb));
    float lb = lb0 + 0.55 * hash12(blkId + floor(lb0) * 1.7), lt = fract(lb), lk = floor(lb);
    float brk = smoothstep(-0.35, 0.0, noise3(vec3(pl / 1.6, lk * 1.7)));               // (each lip pinching out along its length)
    float riser = smoothstep(0.55, 0.85, lt) * brk;
    vec3 tread = glaze(mix(col, PARCH, 0.12 + 0.12 * hash12(blkId + lk)), OCHRE_T, 0.1, pool, q);
    vec3 face = glaze(glaze(col, SEPIA_T, 0.7 + 0.3 * blk, pool, q), ULTRA_T, 0.3, pool, q);
    col = mix(col, mix(tread, face, riser), ledge);
    scarFlat = ledge * (1.0 - riser);
    lines += inkLine(abs(fract(lb + 0.5) - 0.5), min(fwidth(lb), 0.5), LINE_CSS * 1.1) * ledge * brk * 0.85;    // the lips
    float jd = min(abs(fract(ja + 0.5) - 0.5) / max(fwidth(ja), 1e-4), abs(fract(jb + 0.5) - 0.5) / max(fwidth(jb), 1e-4));
    lines += (1.0 - smoothstep(0.4, 1.2, jd)) * ledge * step(0.3, hash12(blkId * 1.3 + lk)) * 0.7;            // the joints
    float pn = noise3(vec3(pl / 0.55, lk * 2.3 + 4.0)) - 0.5 - 0.8 * riser - 0.6 * (1.0 - smoothstep(0.1, 0.3, lt));
    float pw = smoothstep(0.0, 0.03, pn) * ledge * step(0.25, aw);
    col = mix(col, glaze(glaze(glaze(ground, VERD_T, 0.5, 0.0, q), ULTRA_T, 0.6, 0.0, q), SEPIA_T, 0.25, 0.0, q), pw);  // pools
    lines += inkLine(pn, fwidth(pn), LINE_CSS * 0.8) * ledge * step(0.25, aw) * 0.8;
    float foot = (1.0 - smoothstep(0.15, 0.9, aw)) * ledge;
    vec3 kb = knobs(pl, 0.8, 0.8, 61.0, sunPl, upx) * foot, kc = knobs(pl + 0.37, 0.38, 0.85, 67.0, sunPl, upx) * foot;
    float body = max(kb.y, kc.y), lee = max(kb.z, kc.z);
    col = mix(col, glaze(mix(col, PARCH, 0.4), SEPIA_T, 0.15, pool, q), body * (1.0 - lee));                 // cobbles
    col = mix(col, glaze(col, SEPIA_T, 0.45, pool, q), lee);
    lines += kb.x + kc.x;
    float wetB = (1.0 - smoothstep(0.05, 0.4 + 0.15 * noise3(vWorld / 1.7) + 0.1 * noise3(vWorld / 0.45), aw)) * ledge;
    col = glaze(glaze(col, SEPIA_T, 0.65 * wetB, pool, q), ULTRA_T, 0.25 * wetB, pool, q);                  // the wet band
    float weed = (1.0 - smoothstep(0.0, 0.2 + 0.14 * noise3(vWorld / 1.1) + 0.06 * noise3(vWorld / 0.3), aw)) * smoothstep(-0.25, 0.2, noise3(vWorld / 0.8 + 3.0)) * ledge;
    col = glaze(col, mix(fol.rgb, OCHRE_T, 0.45), 1.2 * weed, pool, q);
    lines += stipple(pl, upx, 0.7, 13.0) * weed * 0.6;
    float wsh = (1.0 - smoothstep(0.0, 0.04 + 0.07 * noise3(vWorld / 1.5 + 2.0), aw)) * smoothstep(0.0, 0.25, noise3(vWorld / 0.5 + 7.0)) * ledge;
    col = mix(col, LEAD, 0.85 * wsh);                                                                        // the wash
    float edge = smoothstep(0.1, 0.4, scar) * (1.0 - smoothstep(0.55, 0.9, scar)) * (1.0 - cliff);
    col = glaze(col, SEPIA_T, 0.4 * edge * smoothstep(-0.3, 0.3, noise3(vWorld / 0.6 + 9.0)), pool, q);    // litter
    float rt = noise3(vec3(pl / 0.5, 2.0));
    lines += inkLine(rt, fwidth(rt), LINE_CSS * 0.9) * edge * 0.6 + stipple(pl, upx, 0.25, 17.0) * edge * 0.4;  // roots
  }
  lines += inkLine(-f.y - 0.9 - (q.mottle - 0.5) * 0.3, fwidth(f.y), LINE_CSS * 0.8) * beach * 0.55 * lip;    // tide lines
  lines += inkLine(-f.y - 2.1 - (q.bloom - 0.5) * 0.4, fwidth(f.y), LINE_CSS * 0.7) * beach * 0.35 * lip;
  lines += stipple(pl, upx, 0.16, 9.0) * beach * 0.6;                                                // grains
  float rip = -f.y / 0.45 + 0.7 * noise3(vWorld / 2.5);                                              // wind ripples
  lines += inkLine(abs(fract(rip) - 0.5), min(fwidth(rip), 0.5), LINE_CSS * 0.6) * beach * (1.0 - rel.z) * (1.0 - mud) * (1.0 - reef)
    * 0.3 * step(0.0, patchy) * smoothstep(1.0, 2.5, -f.y);
  lines += inkLine(abs(fract(-f.y / 0.7 + 0.5) - 0.5), fwidth(f.y) / 0.7, LINE_CSS * 0.7) * beach * mud
    * 0.5 * (1.0 - smoothstep(2.0, 5.0, -f.y));                                                       // mud ripples
  // coral sand near the eye: ripple marks the ebb left on the wet sand, parallel to the water's edge and breaking off;
  // the strandline at the last high water, a broken line of weed, grit and shell; shells strewn above and below it
  float nearR = f.w * (1.0 - smoothstep(0.04, 0.16, upx)) * (1.0 - afar), rr = rip * 1.7; // (from high they ran as contours)
  lines += inkLine(abs(fract(rr) - 0.5), min(fwidth(rr), 0.5), LINE_CSS * 0.55) * nearR * reef * wet * 0.45 * smoothstep(-0.25, 0.25, noise3(vWorld / 1.6 + 5.0));
  float strand = (1.0 - smoothstep(0.03, 0.12, abs(above - 0.8 * TIDE_AMP + 0.12 * noise3(vWorld / 2.2)))) * smoothstep(-0.2, 0.2, noise3(vWorld / 1.1 + 2.0));
  lines += stipple(pl, upx, 0.75, 5.0) * nearR * strand * 0.9;
  lines += reefInk * reef * (1.0 - meadow);
  // white coral sand's high-water line inked all round, so each motu reads as its own islet on the awash flat (S-021)
  lines += inkLine(f.x - LAND_U, fwidth(f.x), LINE_CSS * 0.9) * bleached * beach * 0.85;
  // and the beach's foot, where its sand meets the awash flat (the islet's waterline at high water), so each motu is
  // drawn round on the reef rather than the reef's lip inked as one ring (the sea's waterline ink lightens there)
  lines += inkLine(beachD, fwidth(beachD), LINE_CSS * 0.8) * step(beachD, 1.0) * f.w * 0.75;
  lines += 0.45 * swEdge; // the swash's edge, a fine broken pen line along its scallops
  // the brow and foot of every cliff, heavier near the eye
  // (broken into lengths, so a rounded crag's brow never draws a ring round it)
  lines += inkLine(up0 - CLIFF_UP, fwidth(up0), LINE_CSS * mix(1.5, 0.8, smoothstep(0.0, uFade.x, dist))) * 0.8 * (1.0 - 0.5 * low)
    * mix(1.0, smoothstep(-0.25, 0.15, noise3(vWorld / 2.4 + 4.0)), crag);

  // light: the shade and lit glazes, then hatching along the beds on rock and the contours elsewhere (straightened on
  // the flats by the region's chart plane), deepening to cross-hatching away from the light
  n = normalize(mix(n, normalize(vWorld), 0.9 * reefSw * reef)); // (a reef's lip under the swash lies in the light as the water's skin, its cells' facets unshaded)
  float ndl = dot(n, uSun), tone = max(lightTone(ndl, abs(dot(n, v))), 0.22 * cliff);
  col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
  // (bedded rock is hatched down its fall line instead, as an engraver draws a crag: strokes running down each face,
  // bending round its buttresses, laid along whichever chart axis lies across the face so they never degenerate, so a
  // cone or a cliff never rings with contour stripes; the uplands' contours wander, S-020)
  float wander = 0.45 * noise3(vWorld / 6.0 + 9.0);
  vec2 hc = vec2(mix(h + 0.12 * pl.y + wander, bed, (cliff + steep) * (1.0 - reef)), pl.x + 0.7 * pl.y), hdx = dFdx(hc), hdy = dFdy(hc);
  vec2 fa = vec2(pl.x + 0.35 * rib, h + 0.3 * pl.y), fb = vec2(pl.y + 0.35 * rib, h + 0.3 * pl.x);
  vec2 fadx = dFdx(fa), fady = dFdy(fa), fbdx = dFdx(fb), fbdy = dFdy(fb);
  float fall = clamp(bedded * (cliff + steep * (1.0 - veg)) * (1.0 - reef) * 1.25, 0.0, 1.0);
  float hcov = fall < 0.99 ? hatching(hc, hdx, hdy, tone, float(ri) * 3.7) : 0.0;
  if (fall > 0.01) {
    float wa = smoothstep(0.3, 0.7, across.x * across.x);
    float fcov = (wa > 0.01 ? wa * hatching(fa, fadx, fady, tone, float(ri) * 3.7 + 1.3) : 0.0)
      + (wa < 0.99 ? (1.0 - wa) * hatching(fb, fbdx, fbdy, tone, float(ri) * 3.7 + 2.9) : 0.0);
    hcov = mix(hcov, fcov, fall);
  }
  hcov *= 1.0 - 0.65 * scarFlat; // (a bared ledge's tread lies in the light; its riser keeps the hatching)
  // (the awash flat lies under its film of water: hatched lightly, never contoured as dry land)
  col = mix(col, hatchInk(tone), hcov * (1.0 - mix(0.75, 0.95, afar) * reef * (1.0 - meadow)));
  // the reef pavement's own shading near the eye: its rubble's undersides, its pits and its broken flanks, hatched
  reefShade *= 1.0 - afar; // (from high the flat lies under its film, never contoured)
  if (reefShade * reef > 0.01) col = mix(col, hatchInk(0.6), reef * hatching(hc * 2.3, hdx * 2.3, hdy * 2.3, 0.3 * reefShade, 7.3));
  col = mix(col, hatchInk(0.7), clamp(lines, 0.0, 1.0) * near);
  if (uNight > 0.0) {
    float lit = smoothstep(0.3, 0.95, ndl) * uNight;
    col = mix(col, uSilver, 0.65 * hatching(rot2(0.6) * hc, rot2(0.6) * hdx, rot2(0.6) * hdy, lit * 0.26, 11.0));
  }
  // the inner half of the sea's waterline, and nothing past it (a wall's foot meets the sea's own coast rings)
  float cw = COAST_CSS * uRenderPx;
  // (a reef's lip light and broken, as the sea draws it, and so the composite's line where the two meet)
  float wl = (wall ? 0.0 : 0.9) * (1.0 - smoothstep(cw - 0.5, cw + 0.5, above / max(fwidth(above), 1e-4))) * (1.0 - sandy) * (1.0 - 0.8 * reefSw * reef);
  col = mix(col, uInk, wl * lip);
  lip *= 1.0 - 0.85 * max(sandy, reefSw * reef) * (1.0 - smoothstep(0.3, 0.6, above)); // (and the composite's line there, light: the swash draws a beach's or a reef flat's edge)
  if (above < 0.0 && !wall) discard;
  writeInk(candle(col, vWorld), n0, lip);
}
`;


function terrainMaterial(pipeline: Pipeline, swell: Swell): THREE.ShaderMaterial {
  const e = (ri: number) => CHARTS[ri].e, nn = (ri: number) => CHARTS[ri].n;
  const m = inkMaterial(pipeline.style, {
    vertexShader: VERTEX, fragmentShader: FRAGMENT, inkWeight: 1.15,
    uniforms: {
      ...swell.uniforms,
      uLand: { value: REGIONS.map((r) => v4(PIGMENTS[r.pigments.land], LOAD.land)) },
      uFoliage: { value: REGIONS.map((r) => v4(PIGMENTS[r.pigments.foliage], LOAD.foliage)) },
      uSand: { value: REGIONS.map((r) => v4(...SANDS[sandOf(r)])) },
      uShore: { value: REGIONS.map((r) => new THREE.Vector4(beachTop(r), r.shore.cliffH, landformOf(r), sandOf(r) === 'mud' ? 1 : sandOf(r) === 'white' ? -1 : 0)) },
      uRelief: { value: REGIONS.map((r, i) => new THREE.Vector4(reliefOf(r).crag, sandOf(r) === 'black' ? 1 : 0, sandOf(r) === 'shingle' ? 1 : 0, i * 2.4)) },
      uChartE: { value: REGIONS.map((_, i) => new THREE.Vector3(e(i).x, e(i).y, e(i).z)) },
      uChartN: { value: REGIONS.map((_, i) => new THREE.Vector3(nn(i).x, nn(i).y, nn(i).z)) },
      uFade: { value: new THREE.Vector2(pipeline.ink.fadeStart, pipeline.ink.fadeEnd) },
      uSheer: { value: REGIONS.map((r) => reliefOf(r).sheer) },
      uSlope: { value: REGIONS.map((r) => new THREE.Vector4(...slopesOf(r), cladOf(r) ? 1 : 0, exposedOf(r))) },
    },
  });
  // the land wins the depth test where it lies on the sea's surface
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -2;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// The terrain

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly field: TerrainField;
  readonly chunks: readonly Chunk[];
  private readonly geometry = new THREE.BufferGeometry();
  private index: THREE.BufferAttribute;
  private readonly level: Int8Array;
  private readonly want: Int8Array;
  private readonly eyeDir = new THREE.Vector3();
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  private readonly probe = new THREE.Sphere();
  private count = 0;
  private growTo = 0;

  constructor(pipeline: Pipeline, geo: Geography, swell: Swell) {
    this.field = new TerrainField(geo);
    const set = buildChunks(this.field);
    this.chunks = set.chunks;
    this.level = new Int8Array(set.chunks.length).fill(-2);
    this.want = new Int8Array(set.chunks.length);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(set.position, 3));
    this.geometry.setAttribute('aNR', new THREE.BufferAttribute(set.normalRegion, 4));
    this.index = new THREE.BufferAttribute(new Uint32Array(1 << 20), 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setIndex(this.index);
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geometry, terrainMaterial(pipeline, swell));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1; // before the sea, so the sea's fragments behind the land are culled early
    this.mesh.onBeforeRender = (renderer, _s, camera) => {
      const t = renderer.getRenderTarget();
      this.update(camera as THREE.PerspectiveCamera, t ? t.height : renderer.domElement.height);
    };
    this.mesh.onAfterRender = () => this.grow();
  }

  /** Triangles the terrain submits at the current levels. */
  get triangles(): number {
    return this.count / 3;
  }

  /** Vertex and index buffer bytes on the GPU (the terrain has no textures of its own). */
  get bytes(): number {
    const g = this.geometry;
    return g.getAttribute('position').array.byteLength + g.getAttribute('aNR').array.byteLength + this.index.array.byteLength;
  }

  /** Pick each chunk's level for the eye (horizon and frustum culls, screen error with hysteresis, neighbours within one
   *  level) and rebuild the index buffer when any level changed. `pxHeight`: the render target's height. */
  update(camera: THREE.PerspectiveCamera, pxHeight: number): void {
    const eye = camera.position, eyeR = eye.length(), want = this.want, chunks = this.chunks;
    this.eyeDir.copy(eye).divideScalar(eyeR);
    const pxPerRad = pxHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.frustum.setFromProjectionMatrix(this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (let k = 0; k < chunks.length; k++) {
      const c = chunks[k];
      if (belowHorizon(c.axis, c.spread, R + Math.max(c.top, 0), this.eyeDir, eyeR)) {
        want[k] = -1;
        continue;
      }
      const near = Math.max(0, c.sphere.distanceToPoint(eye));
      this.probe.center.copy(c.sphere.center);
      this.probe.radius = c.sphere.radius + near * FRUSTUM_MARGIN;
      if (!this.frustum.intersectsSphere(this.probe)) {
        want[k] = -1;
        continue;
      }
      const d = Math.max(0.05, near) / pxPerRad, cur = this.level[k];
      const loose = levelFor(c, d, coarsen), strict = levelFor(c, d, HYSTERESIS * coarsen);
      want[k] = cur >= strict && cur <= loose ? cur : loose;
    }
    for (let moved = true; moved;) {
      moved = false;
      for (let k = 0; k < chunks.length; k++) {
        if (want[k] < 0) continue;
        for (const n of chunks[k].nb) {
          if (n >= 0 && want[n] >= 0 && want[k] > want[n] + 1) {
            want[k] = want[n] + 1;
            moved = true;
          }
        }
      }
    }
    let changed = false;
    for (let k = 0; k < chunks.length && !changed; k++) changed = want[k] !== this.level[k];
    if (!changed) return;
    this.level.set(want);
    this.rebuild();
  }

  private rebuild(): void {
    const a = this.index.array as Uint32Array;
    let count = 0;
    for (let k = 0; k < this.chunks.length; k++) {
      const L = this.level[k];
      if (L < 0) continue;
      const c = this.chunks[k];
      let mask = 0;
      for (let e = 0; e < 4; e++) if (c.nb[e] >= 0 && this.level[c.nb[e]] === L + 1) mask |= 1 << e;
      const t = template(L, mask);
      if (count + t.length > a.length) {
        // too small: keep drawing the last selection and grow once this frame is drawn
        this.growTo = Math.max(this.growTo, (count + t.length) * 2);
        this.level.fill(-2);
        return;
      }
      for (let x = 0; x < t.length; x++) a[count + x] = t[x] + c.base;
      count += t.length;
    }
    this.count = count;
    this.geometry.setDrawRange(0, count);
    this.index.clearUpdateRanges();
    this.index.addUpdateRange(0, count);
    this.index.needsUpdate = true;
  }

  /** After a frame is drawn, a larger index buffer if the selection outgrew it (rare); the old GPU buffers are
   *  released (the vertices upload again with the next frame). */
  private grow(): void {
    if (this.growTo <= this.index.array.length) return;
    const a = new Uint32Array(this.growTo);
    this.geometry.dispose();
    this.index = new THREE.BufferAttribute(a, 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setIndex(this.index);
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** The coarsest level whose error and spacing stay within the limits (×k), `d` the distance in u per render px. */
function levelFor(c: Chunk, d: number, k: number): number {
  let L = LEVELS - 1;
  while (L > 0 && (c.err[L] / d > SPLIT_PX * k || (CELL_U * (1 << L)) / d > SPACING_PX * k)) L--;
  return L;
}

/** Each scene's terrain, for the modules built after it (structures stand on its field). */
export const terrains = new WeakMap<THREE.Object3D, Terrain>();

/** The composition root's terrain (MODULES): it meets the sea built before it. */
export function createTerrain(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene);
  if (!sea) throw new Error('createTerrain: the sea module is built first (MODULES order)');
  const terrain = new Terrain(ctx.pipeline, ctx.world.geo, sea.swell);
  ctx.scene.add(terrain.mesh);
  terrains.set(ctx.scene, terrain);
  return {
    frame() {},
    dispose() {
      ctx.scene.remove(terrain.mesh);
      terrain.dispose();
    },
  };
}
