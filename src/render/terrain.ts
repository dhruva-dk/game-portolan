// Island terrain (WP15 part A): the land of the one geography, meshed from its height field and drawn by the
// illustrator's hand. Each cube face of the territory grid is cut into 32-cell chunks; a chunk with land holds a
// vertex on every cell corner, and every corner's height is the mean of the distinct cells round it, so the faces
// meeting at a cube edge or corner agree to the bit (no seams, cracks or pinching anywhere, poles included). A
// chunked LOD adapted from the earlier game's quadtree (its horizon and frustum culls, screen-error split) picks a level per
// chunk, keeps neighbours within one level, and closes every T-junction by snapping the finer side's odd rim
// vertices onto the coarser line; the whole planet's land is then one index buffer and one draw call. The planet's
// curve is real geometry, as for the sea, so distant islands sink hull-down behind it.
//
// The waterline is the sea's own: the land is never laid below the sea's surface, and the fragment discards
// wherever the sea's field (the same cube texture the sea reads) puts water, then inks the inner half of the sea's
// coast line, so the land meets the coast rings and foam exactly. The ground is washed in each region's pigments:
// sand by its colour (white, gold, black, mud, ice, shingle) with tide lines and grains, rock and cliffs in strata,
// basalt in hexagonal columns, scree stippled, ice glazed blue, uplands in the foliage wash; hatching follows the
// slope's contours and deepens to cross-hatching away from the light; the composite inks silhouettes and creases.
import * as THREE from 'three';
import { inkMaterial, transmittanceVec } from '../style/glsl.ts';
import { PIGMENTS, type RGB } from '../style/palette.ts';
import { v3, type V3 } from '../sim/math.ts';
import { R, TERRITORY, cellOf, faceUV, gnomonicDir, type FaceUV } from '../sim/sphere.ts';
import { CHARTS, type Geography } from '../sim/world/geography.ts';
import { FLOOR, REGIONS, TIDE, type Region } from '../sim/world/regions.ts';
import type { Pipeline } from './pipeline.ts';
import { seas } from './sea.ts';
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
/** By the surface's up·normal: sheer below `cliff`, steep below `scree`; beaches reach berm·beachRise + beachBase. */
export const SLOPES = { cliff: 0.62, scree: 0.8, beachRise: 1.6, beachBase: 0.3 } as const;
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
const beachTop = (r: Region): number => r.shore.berm * SLOPES.beachRise + SLOPES.beachBase;

/** The ground of region `ri` at `height` u where the surface's up·normal is `up`. */
export function groundAt(ri: number, height: number, up: number): Ground {
  const r = REGIONS[ri], form = landformOf(r);
  if (form === 2) return GROUND.ice;
  if (up < SLOPES.cliff) return form === 1 ? GROUND.basalt : GROUND.cliff;
  if (up < SLOPES.scree) return height < r.shore.cliffH * 0.8 ? GROUND.scree : GROUND.rock;
  if (height < beachTop(r)) return sandOf(r) === 'mud' ? GROUND.mud : GROUND.beach;
  return GROUND.meadow;
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
  private readonly cells: number[] = [];
  private readonly d = v3();
  private readonly uv: FaceUV = { face: 0, u: 0, v: 0 };
  private readonly p = [v3(), v3(), v3(), v3()];
  private readonly nq = [v3(), v3(), v3(), v3()];

  constructor(geo: Geography) {
    this.geo = geo;
  }

  /** Height of corner (i, j) of face f's cell grid, i, j ∈ [−1, N + 1]: the mean of the distinct cells round it
   *  (found by direction on or past a face edge, summed in cell order so every face gets the same bits). */
  corner(f: number, i: number, j: number): number {
    const H = this.geo.heights;
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
    out.ground = groundAt(out.region, out.height, out.up);
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
function belowHorizon(dir: THREE.Vector3, spread: number, top: number, eyeDir: THREE.Vector3, eyeR: number): boolean {
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
in vec3 vWorld;
in vec3 vNormal;
flat in int vRegion;
uniform vec4 uLand[${NR}];
uniform vec4 uFoliage[${NR}];
uniform vec4 uSand[${NR}];
uniform vec4 uShore[${NR}]; // beach top u, cliff height u, landform (0 strata, 1 basalt, 2 ice), mud shore
uniform vec3 uChartE[${NR}];
uniform vec3 uChartN[${NR}];
uniform vec2 uFade;         // the composite's line fade, u from the eye
const float CLIFF_UP = ${SLOPES.cliff.toFixed(3)}, SCREE_UP = ${SLOPES.scree.toFixed(3)}, TIDE_AMP = ${TIDE.amp.toFixed(3)};
const float STRATA = 1.15, COLUMN = 1.5, LINE_CSS = 0.45, COAST_CSS = 0.6;
const vec3 ULTRA_T = ${vec(transmittanceVec(PIGMENTS.ultramarine))};

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

void main() {
  vec3 dir = normalize(vWorld);
  vec4 f = seaField(dir);
  float above = f.x - uSeaLevel; // the sea paints depth = uSeaLevel - f.x: one waterline for both
  if (above < -0.5) discard;
  int ri = vRegion;
  vec4 shore = uShore[ri], land = uLand[ri], fol = uFoliage[ri], sand = uSand[ri];
  vec3 n = normalize(vNormal), v = normalize(cameraPosition - vWorld);
  float h = length(vWorld) - SEA_R, up = dot(n, dir), dist = distance(cameraPosition, vWorld);
  float upx = max(length(dFdx(vWorld)), length(dFdy(vWorld)));
  vec2 pl = vec2(dot(vWorld, uChartE[ri]), dot(vWorld, uChartN[ri]));
  Paper q = paperAt(vWorld, n, 1.0);

  // grounds, blended where washes meet along noise-warped edges
  float bleed = (q.bloom - 0.5) * 0.08 + (q.mottle - 0.5) * 0.06;
  float cliff = 1.0 - smoothstep(CLIFF_UP - 0.05, CLIFF_UP + 0.05, up + bleed);
  float steep = (1.0 - cliff) * (1.0 - smoothstep(SCREE_UP - 0.04, SCREE_UP + 0.04, up + bleed));
  float low = 1.0 - smoothstep(shore.x - 0.3, shore.x + 0.3, h + bleed * 6.0);
  float beach = (1.0 - cliff - steep) * low, meadow = 1.0 - cliff - steep - beach;
  float pool = max(washPool(n, v, q), 1.0 - smoothstep(0.0, 1.2, -f.y)); // the land's washes pool along the shore
  vec3 ground = parchment(q);
  float band = h / STRATA + (q.mottle - 0.5) * 0.3, bh = hash11(floor(band) * 1.37 + float(ri) * 5.1);
  vec3 rock = glaze(ground, land.rgb, land.a * (0.7 + 0.6 * bh * cliff), pool, q);
  float wet = 1.0 - smoothstep(0.0, TIDE_AMP + 0.15, above);
  vec3 sandC = glaze(ground, sand.rgb, sand.a * (1.0 + 0.45 * wet), pool, q);
  vec3 green = glaze(ground, fol.rgb, fol.a * (1.0 + 0.015 * max(h, 0.0)), pool, q);
  vec3 col = rock * (cliff + steep) + sandC * beach + green * meadow;

  float lines = 0.0;
  if (shore.z > 1.5) {
    col = wash(col, ULTRA_T, 0.35 * (cliff + steep) + 0.12); // ice: blue-white, its faces glazed deeper
  } else if (shore.z > 0.5) {
    // basalt: hexagonal joints, upright on the faces and tiled across the tops, each column its own load
    vec4 hx = hexCell(pl / COLUMN);
    float rim = 0.5 - max(dot(abs(hx.xy), vec2(0.5, 0.8660254)), abs(hx.x));
    col = wash(col, land.rgb, (cliff + steep) * 0.35 * hash12(hx.zw));
    lines += inkLine(rim, length(fwidth(pl)) / COLUMN, LINE_CSS) * (1.0 - low) * 0.8;
  } else {
    lines += inkLine(abs(fract(band + 0.5) - 0.5), fwidth(band), LINE_CSS) * cliff * step(0.3, bh) * 0.75; // strata
  }
  lines += stipple(pl, upx, 0.45, 3.0) * steep * step(h, shore.y * 0.8);                                 // scree
  lines += inkLine(-f.y - 0.9 - (q.mottle - 0.5) * 0.3, fwidth(f.y), LINE_CSS * 0.8) * beach * 0.55;        // tide lines
  lines += inkLine(-f.y - 2.1 - (q.bloom - 0.5) * 0.4, fwidth(f.y), LINE_CSS * 0.7) * beach * 0.35;
  lines += stipple(pl, upx, 0.16, 9.0) * beach * 0.6;                                                    // grains
  lines += inkLine(abs(fract(-f.y / 0.7 + 0.5) - 0.5), fwidth(f.y) / 0.7, LINE_CSS * 0.7) * beach * shore.w
    * 0.5 * (1.0 - smoothstep(2.0, 5.0, -f.y));                                                           // mud ripples

  // light: the shade and lit glazes, then hatching along the slope's contours (true height), straightened on the
  // flats by the region's chart plane, deepening to cross-hatching away from the light
  float ndl = dot(n, uSun), tone = max(lightTone(ndl, abs(dot(n, v))), 0.22 * cliff);
  col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
  vec2 hc = vec2(h + 0.12 * pl.y, pl.x + 0.7 * pl.y), hdx = dFdx(hc), hdy = dFdy(hc);
  col = mix(col, hatchInk(tone), hatching(hc, hdx, hdy, tone, float(ri) * 3.7));
  col = mix(col, hatchInk(0.7), clamp(lines, 0.0, 1.0) * (1.0 - smoothstep(uFade.x, uFade.y, dist)));
  if (uNight > 0.0) {
    float lit = smoothstep(0.3, 0.95, ndl) * uNight;
    col = mix(col, uSilver, 0.65 * hatching(rot2(0.6) * hc, rot2(0.6) * hdx, rot2(0.6) * hdy, lit * 0.26, 11.0));
  }
  // the inner half of the sea's waterline, and nothing past it
  float cw = COAST_CSS * uRenderPx;
  col = mix(col, uInk, 0.9 * (1.0 - smoothstep(cw - 0.5, cw + 0.5, above / max(fwidth(above), 1e-4))));
  if (above < 0.0) discard;
  writeInk(candle(col, vWorld), n);
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
      uShore: { value: REGIONS.map((r) => new THREE.Vector4(beachTop(r), r.shore.cliffH, landformOf(r), sandOf(r) === 'mud' ? 1 : 0)) },
      uChartE: { value: REGIONS.map((_, i) => new THREE.Vector3(e(i).x, e(i).y, e(i).z)) },
      uChartN: { value: REGIONS.map((_, i) => new THREE.Vector3(nn(i).x, nn(i).y, nn(i).z)) },
      uFade: { value: new THREE.Vector2(pipeline.ink.fadeStart, pipeline.ink.fadeEnd) },
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
      const loose = levelFor(c, d, 1), strict = levelFor(c, d, HYSTERESIS);
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

/** The composition root's terrain (MODULES): it meets the sea built before it. */
export function createTerrain(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene);
  if (!sea) throw new Error('createTerrain: the sea module is built first (MODULES order)');
  const terrain = new Terrain(ctx.pipeline, ctx.world.geo, sea.swell);
  ctx.scene.add(terrain.mesh);
  return {
    frame() {},
    dispose() {
      ctx.scene.remove(terrain.mesh);
      terrain.dispose();
    },
  };
}
