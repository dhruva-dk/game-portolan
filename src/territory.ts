// Territory and trails as part of the sea: ownership textures, crisp seamless borders, flood and
// sweep animations, draining, and the glowing open-trail ribbons that ride the swell.
import * as THREE from 'three';
import { GRID, R, SHIPS, TICK, TRAIL_STEP, cellOf, chord, mix, wrapCell, type V3 } from './sim.ts';
import { teamColor } from './ships.ts';
import { drawPass, SWELL_GLSL, SWELL_UNIFORMS } from './ocean.ts';
import { COMMON_GLSL, SKY_GLSL, WIND_GLSL } from './sky.ts';
import { LAYER } from './post.ts';
import type { Ctx, Frame } from './main.ts';

const N = GRID, NN = N * N, CELLS = 6 * NN;
/** Seconds a changed cell keeps its previous owner on record for the shader's before/after fields. */
const HOLD = 8;
/** Lowest smoothed share a cell keeps of its own owner, so thin strips and single cells never vanish. */
const MIN_SHARE = 0.62;
/** Smoothing radius (cells); a cell owning this whole neighbourhood alone is flagged flat (share byte 255). */
const FLAT = 3, WIN = 2 * FLAT + 1;
/** Bake texels per face edge (two per cell), and the face tile with its one-texel apron. */
const BN = 2 * N, TILE = BN + 2;

// Borders are the 0.5 contour of each owner's share, smoothed over a Gaussian window on the CPU and
// interpolated by a quadratic B-spline on the GPU: a raster staircase becomes a clean curve without moving it.
const SMOOTH = new Float32Array(WIN * WIN);
{
  let sum = 0;
  for (let k = 0; k < WIN * WIN; k++) {
    const i = (k % WIN) - FLAT, j = Math.floor(k / WIN) - FLAT;
    sum += SMOOTH[k] = Math.exp(-(i * i + j * j) / (2 * 1.15 * 1.15));
  }
  for (let k = 0; k < WIN * WIN; k++) SMOOTH[k] /= sum;
}
const NBI = [1, -1, 0, 0, 1, -1, 1, -1]; // 4-neighbours first, then diagonals
const NBJ = [0, 0, 1, -1, 1, 1, -1, -1];

/** Cell at grid offset (di, dj) from c; past a face edge the step continues on the neighbouring face. */
function offset(c: number, di: number, dj: number): number {
  const f = Math.floor(c / NN), r = c - f * NN, j = Math.floor(r / N), i = r - j * N;
  const x = i + di, y = j + dj;
  return x >= 0 && x < N && y >= 0 && y < N ? c + dj * N + di : wrapCell(f, x, y, N);
}

/** The 8 neighbours of c (4-neighbours first) into out. */
function around(c: number, out: Int32Array): Int32Array {
  const r = c % NN, j = Math.floor(r / N), i = r - j * N;
  const inner = i > 0 && j > 0 && i < N - 1 && j < N - 1;
  for (let s = 0; s < 8; s++) out[s] = inner ? c + NBJ[s] * N + NBI[s] : offset(c, NBI[s], NBJ[s]);
  return out;
}

/** The smoothing window of c (WIN×WIN cells, row by row) into out. */
function cellWindow(c: number, out: Int32Array): Int32Array {
  const r = c % NN, j = Math.floor(r / N), i = r - j * N;
  const inner = i >= FLAT && j >= FLAT && i < N - FLAT && j < N - FLAT;
  for (let dj = -FLAT, k = 0; dj <= FLAT; dj++) {
    for (let di = -FLAT; di <= FLAT; di++, k++) out[k] = inner ? c + dj * N + di : offset(c, di, dj);
  }
  return out;
}

/**
 * GLSL mirror of the sim's cube-sphere grid with the owner lookup for maps (HUD, globe), include-guarded:
 *   int terrOwnerAt(sampler2D cells, vec3 unitDir)   owner index (0 open sea) from Territory.u.tTerrOwner
 * and the helpers terrFace, terrBasis, terrUV, terrDir, terrCellOf.
 */
export const OWNER_GLSL = /* glsl */ `
#ifndef TERR_OWNER_GLSL
#define TERR_OWNER_GLSL
const float TERR_PI = 3.14159265;
const float TERR_N = ${N}.0;
// Cube-sphere face of a direction, ties to the lower face as in sim.ts faceUV.
int terrFace(vec3 p) {
  vec3 a = abs(p);
  if (a.x >= a.y && a.x >= a.z) return p.x >= 0.0 ? 0 : 1;
  if (a.y >= a.z) return p.y >= 0.0 ? 2 : 3;
  return p.z >= 0.0 ? 4 : 5;
}
// Columns: face u axis, v axis, normal. p * B gives (gnomonic u·n, v·n, n).
mat3 terrBasis(int f) {
  if (f == 0) return mat3(0, 0, -1, 0, 1, 0, 1, 0, 0);
  if (f == 1) return mat3(0, 0, 1, 0, 1, 0, -1, 0, 0);
  if (f == 2) return mat3(1, 0, 0, 0, 0, -1, 0, 1, 0);
  if (f == 3) return mat3(1, 0, 0, 0, 0, 1, 0, -1, 0);
  if (f == 4) return mat3(1, 0, 0, 0, 1, 0, 0, 0, 1);
  return mat3(-1, 0, 0, 0, 1, 0, 0, 0, -1);
}
// Equal-angle face coordinates (-1..1) of q = p * terrBasis(f), and the unit direction of (f, uv).
vec2 terrUV(vec3 q) { return atan(q.xy / q.z) * (4.0 / TERR_PI); }
vec3 terrDir(int f, vec2 uv) { return normalize(terrBasis(f) * vec3(tan(uv * (TERR_PI / 4.0)), 1.0)); }
// Atlas texel of the cell under a direction.
ivec2 terrCellOf(vec3 p) {
  int f = terrFace(p);
  ivec2 c = clamp(ivec2(floor((terrUV(p * terrBasis(f)) + 1.0) * (0.5 * TERR_N))), 0, int(TERR_N) - 1);
  return ivec2(c.x, f * int(TERR_N) + c.y);
}
int terrOwnerAt(sampler2D cells, vec3 p) { return int(texelFetch(cells, terrCellOf(normalize(p)), 0).r * 255.0 + 0.5); }
#endif
`;

// The quadratic B-spline stencil and the choice of the leading owners, shared by the bake and the water.
const FIELD_GLSL = /* glsl */ `
${OWNER_GLSL}
// Weight of the stencil sample at offset o (-1, 0, 1 per axis) from the nearest centre, u the position from
// that centre: 0.5 (0.5 ∓ u)² or 0.75 - u² per axis; dw is its gradient.
float terrSpline(vec2 u, ivec2 o, out vec2 dw) {
  vec2 of = vec2(o), ao = abs(of);
  vec2 wv = mix(0.75 - u * u, 0.5 * (0.5 + of * u) * (0.5 + of * u), ao), dv = mix(-2.0 * u, of * (0.5 + of * u), ao);
  dw = vec2(dv.x * wv.y, wv.x * dv.y);
  return wv.x * wv.y;
}
// Slots of the strongest and the second strongest of up to three owners (slots with id < 0 are unused);
// a lone owner gets the same slot twice.
ivec2 terrTop2(vec3 m, vec3 id) {
  m = mix(m, vec3(-9.0), vec3(lessThan(id, vec3(0.0))));
  int ka = m.y > m.x ? (m.z > m.y ? 2 : 1) : (m.z > m.x ? 2 : 0);
  int kb = ka == 0 ? (m.z > m.y ? 2 : 1) : ka == 1 ? (m.z > m.x ? 2 : 0) : (m.y > m.x ? 1 : 0);
  return ivec2(ka, (kb == 0 ? id.x : kb == 1 ? id.y : id.z) < 0.0 ? ka : kb);
}
`;

// Brightness gain that makes every team colour glow alike, cream and sable included.
const GLOW_GLSL = /* glsl */ `
float terrGain(vec3 c) { return 0.3 / max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.02); }
`;

/**
 * Bakes the territory fields from the cell textures into the bake atlas: per face a tile of BN² texels
 * (two per cell edge) inside a one-texel apron, so lookups near an edge never leave the tile. Output 0:
 * current owner pair, the field between them (0.5 on the border), whether anything nearby is changing
 * hands; output 1: previous pair and field, and the time since the reveal front passed (squashed).
 */
const BAKE_FRAG = /* glsl */ `
uniform sampler2D tTerrOwner;  // cells ${N}×${6 * N}: r owner, g previous owner, b own share, a previous share
uniform sampler2D tTerrReveal; // cells: match time the current owner shows
uniform vec4 uTerrClock;
${FIELD_GLSL}
layout(location = 0) out vec4 bake0;
layout(location = 1) out vec4 bake1;

// Cell texel of cell c on face f. A tap one cell past the edge is re-projected from a quarter cell
// beyond the edge at the tap's along-edge centre: it lands in the neighbour's edge row exactly as that
// face indexes it, so both faces interpolate the same cells along their common edge.
ivec2 terrTexel(int f, ivec2 c) {
  if (c.x >= 0 && c.y >= 0 && c.x < int(TERR_N) && c.y < int(TERR_N)) return ivec2(c.x, f * int(TERR_N) + c.y);
  return terrCellOf(terrDir(f, clamp((vec2(c) + 0.5) * (2.0 / TERR_N) - 1.0, -1.0 - 0.5 / TERR_N, 1.0 + 0.5 / TERR_N)));
}

// Smoothed ownership gathered over a stencil. An owner's indicator is its share where it holds a tap and
// the complement elsewhere, i.e. base (every tap's complement) plus its own surplus e. Up to three owners
// are tracked; with find off, the slots hold a given pair and nothing else is added.
struct TerrAcc { vec3 id; vec3 e; float base; };

TerrAcc terrAcc(bool find, ivec2 pair) {
  vec3 id = find ? vec3(-1.0) : vec3(float(pair.x), pair.x == pair.y ? -2.0 : float(pair.y), -2.0);
  return TerrAcc(id, vec3(0.0), 0.0);
}

void terrAdd(inout TerrAcc a, float id, float b, float w) {
  a.base += w * (1.0 - b);
  float c = w * (2.0 * b - 1.0);
  if (id == a.id.x || a.id.x == -1.0) {
    a.id.x = id;
    a.e.x += c;
  } else if (id == a.id.y || a.id.y == -1.0) {
    a.id.y = id;
    a.e.y += c;
  } else if (id == a.id.z || a.id.z == -1.0) {
    a.id.z = id;
    a.e.z += c;
  }
}

// The field towards pair.x against pair.y; a lone owner is measured against everyone else. With find, the
// pair is the two strongest owners, ordered by index so both sides of a border agree on the sign.
float terrField(TerrAcc a, bool find, inout ivec2 pair) {
  if (find) {
    ivec2 k = terrTop2(a.base + a.e, a.id);
    float ia = a.id[k.x], ib = a.id[k.y];
    pair = ivec2(min(ia, ib), max(ia, ib));
  }
  float ex = a.id.x == float(pair.x) ? a.e.x : a.id.y == float(pair.x) ? a.e.y : a.e.z;
  float ey = a.id.x == float(pair.y) ? a.e.x : a.id.y == float(pair.y) ? a.e.y : a.e.z;
  return pair.x == pair.y ? 2.0 * (a.base + ex) - 1.0 : ex - ey;
}

// The fields in face f's lattice at p (p may lie up to half a cell past f's edges): current pair field,
// previous pair field, reveal time; moving: a tap changed hands in the last seconds.
void terrLattice(int f, vec3 p, bool find, inout ivec2 pairF, inout ivec2 pairP,
                 out float sF, out float sP, out float rev, out bool moving) {
  vec2 x = (terrUV(p * terrBasis(f)) + 1.0) * (0.5 * TERR_N) - 0.5;
  // Quadratic B-spline over the 3×3 cells around the nearest centre: a C1 field, so borders are smooth
  // curves rather than chains of segments. The stencil never reaches more than one cell past an edge.
  int n1 = int(TERR_N) - 1;
  ivec2 c0 = clamp(ivec2(floor(x + 0.5)), ivec2(0), ivec2(n1));
  vec2 u = x - vec2(c0);
  // Where three faces meet there are only three cells: the tap past both edges takes the corner cell of
  // the lowest face, the choice every face makes there.
  ivec2 corner = ivec2(c0.x == 0 ? -1 : c0.x == n1 ? 1 : 9, c0.y == 0 ? -1 : c0.y == n1 ? 1 : 9);
  TerrAcc aF = terrAcc(find, pairF), aP = terrAcc(find, pairP);
  float settled = uTerrClock.y - ${HOLD.toFixed(1)};
  rev = 0.0;
  moving = false;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      ivec2 o = ivec2(i - 1, j - 1);
      ivec2 tx = terrTexel(f, c0 + o);
      if (o == corner) {
        ivec2 a = terrTexel(f, c0 + ivec2(o.x, 0)), b = terrTexel(f, c0 + ivec2(0, o.y)), m = a.y < b.y ? a : b;
        tx = c0.y + f * int(TERR_N) < m.y ? ivec2(c0.x, c0.y + f * int(TERR_N)) : m;
      }
      vec2 dw;
      float w = terrSpline(u, o, dw);
      vec4 t = texelFetch(tTerrOwner, tx, 0);
      float r = texelFetch(tTerrReveal, tx, 0).r, id = floor(t.r * 255.0 + 0.5);
      // taps changed in the last few seconds still know who held them before
      bool act = r > settled;
      terrAdd(aF, id, t.b, w);
      terrAdd(aP, act ? floor(t.g * 255.0 + 0.5) : id, act ? t.a : t.b, w);
      moving = moving || act;
      rev += w * max(r, settled);
    }
  }
  sF = terrField(aF, find, pairF);
  sP = terrField(aP, find, pairP);
}

// Cells from p to the edges of face f along its two axes (negative past an edge).
vec2 terrMargin(int f, vec3 p) { return (1.0 - abs(terrUV(p * terrBasis(f)))) * (0.5 * TERR_N); }

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  int tile = c.y / ${TILE};
  vec3 p = terrDir(tile, (vec2(c.x, c.y - tile * ${TILE}) - 0.5) * (2.0 / ${BN}.0) - 1.0);
  // Each face's lattice is smooth only within the face, so across a band one cell wide around every edge
  // the neighbouring faces' lattices are blended in with weights that are a smooth partition of unity:
  // borders stay smooth curves across edges and through the cube corners.
  int f = terrFace(p);
  mat3 B = terrBasis(f);
  vec3 q = p * B;
  vec2 m = terrMargin(f, p);
  ivec2 pairF = ivec2(0), pairP = ivec2(0);
  float sF = 0.0, sP = 0.0, rev = 0.0, wsum = 0.0;
  bool moving = false;
  for (int k = 0; k < 3; k++) {
    if (k > 0 && (k == 1 ? m.x : m.y) >= 0.5) continue;
    int g = k == 0 ? f : k == 1 ? terrFace(B[0] * sign(q.x)) : terrFace(B[1] * sign(q.y));
    vec2 h = smoothstep(-0.5, 0.5, terrMargin(g, p));
    float a, b, r;
    bool mv;
    terrLattice(g, p, k == 0, pairF, pairP, a, b, r, mv);
    sF += a * h.x * h.y;
    sP += b * h.x * h.y;
    rev += r * h.x * h.y;
    wsum += h.x * h.y;
    moving = moving || mv;
  }
  float since = uTerrClock.y - rev / wsum;
  bake0 = vec4(vec2(pairF) / 255.0, sF / wsum * 0.5 + 0.5, moving ? 1.0 : 0.0);
  bake1 = vec4(vec2(pairP) / 255.0, sP / wsum * 0.5 + 0.5, 0.5 + 0.5 * since / (0.25 + abs(since)));
}
`;

/**
 * GLSL for the ocean shader: void territory(vec3 unitDir, out vec4 tint, out vec4 fx)
 *   tint.rgb owner colour (linear), tint.a coverage 0..1 with an anti-aliased border
 *   fx.x luminous border edge, fx.y border foam line, fx.z flood/sweep wave front, fx.w draining
 * Pass the undisplaced (rest) direction of the water point, from uniform control flow (it takes
 * screen-space derivatives of p). Needs COMMON_GLSL before it; uniforms come from Territory.u.
 * Dye the water body with tint (before reflection and specular), add tint.rgb * (fx.x + fx.z) as
 * emission (fx evens out the teams' brightness), merge fx.y into the foam coverage and churn
 * or darken the water by fx.w. All heavy work is baked: open water and territory interiors cost one
 * texel, borders nine (eighteen while they change hands).
 */
export const TERRITORY_GLSL = /* glsl */ `
uniform sampler2D tTerrBake0, tTerrBake1; // see BAKE_FRAG
uniform vec3 uTerrColors[${SHIPS + 1}];    // linear team colours by owner index, 0 = open sea
uniform vec4 uTerrClock;                   // render time, match time, night, glow scale (exposure-compensated)
${FIELD_GLSL}
${GLOW_GLSL}

// Owner memberships gathered from baked texels: a texel's pair field s gives its lower owner 0.5 + 0.5 s and
// the other the rest (a lone owner keeps only its share). Up to three owners, with gradients (texel units).
struct TerrAcc { vec3 id; vec3 m; vec2 g0; vec2 g1; vec2 g2; };

void terrAdd(inout TerrAcc a, float id, float v, float w, vec2 dw) {
  if (id == a.id.x || a.id.x < 0.0) {
    a.id.x = id;
    a.m.x += w * v;
    a.g0 += dw * v;
  } else if (id == a.id.y || a.id.y < 0.0) {
    a.id.y = id;
    a.m.y += w * v;
    a.g1 += dw * v;
  } else if (id == a.id.z || a.id.z < 0.0) {
    a.id.z = id;
    a.m.z += w * v;
    a.g2 += dw * v;
  }
}

void terrTexel(inout TerrAcc a, vec4 t, float w, vec2 dw) {
  vec2 pr = floor(t.xy * 255.0 + 0.5);
  float v = t.z;
  terrAdd(a, pr.x, v, w, dw);
  if (pr.y != pr.x) terrAdd(a, pr.y, 1.0 - v, w, dw);
}

// The field between the two strongest owners as (value, d/dx, d/dy) in screen pixels, positive towards the
// lower index so both sides of a border agree; a lone owner is measured against everyone else.
vec3 terrPick(TerrAcc a, mat2 jac, out ivec2 pair) {
  ivec2 k = terrTop2(a.m, a.id);
  int ka = k.x, kb = k.y;
  float ia = ka == 0 ? a.id.x : ka == 1 ? a.id.y : a.id.z, ib = kb == 0 ? a.id.x : kb == 1 ? a.id.y : a.id.z;
  float ma = ka == 0 ? a.m.x : ka == 1 ? a.m.y : a.m.z, mb = kb == 0 ? a.m.x : kb == 1 ? a.m.y : a.m.z;
  vec2 ga = ka == 0 ? a.g0 : ka == 1 ? a.g1 : a.g2, gb = kb == 0 ? a.g0 : kb == 1 ? a.g1 : a.g2;
  if (ka == kb) {
    pair = ivec2(ia);
    return vec3(2.0 * ma - 1.0, 2.0 * ga * jac);
  }
  float o = ia < ib ? 1.0 : -1.0;
  pair = ivec2(min(ia, ib), max(ia, ib));
  return vec3((ma - mb) * o, (ga - gb) * o * jac);
}

// Colour and coverage of one field: premultiplied tint and the owner colour at the border (a = 0 when only
// open sea is in reach).
void terrShade(ivec2 pr, vec3 s, out vec4 tint, out vec4 ec) {
  float t = clamp(0.5 + s.x / max(length(s.yz), 1e-6), 0.0, 1.0);
  vec3 lo = uTerrColors[pr.x], hi = uTerrColors[pr.y];
  float alo = pr.x > 0 ? 1.0 : 0.0, ahi = pr.y > 0 ? 1.0 : 0.0;
  tint = vec4(mix(hi * ahi, lo * alo, t), mix(ahi, alo, t));
  ec = pr.y > 0 ? vec4(pr.x > 0 ? mix(hi, lo, t) : hi, 1.0) : vec4(0.0);
}

// A line of width w (any unit) at distance d, widened to the pixel footprint px with its energy kept.
float terrLine(float d, float w, float px) {
  float we = max(w, px);
  return exp(-d * d / (we * we)) * (w / we);
}

void territory(vec3 p, out vec4 tint, out vec4 fx) {
  p = normalize(p);
  vec3 dpx = dFdx(p), dpy = dFdy(p);
  int f = terrFace(p);
  mat3 B = terrBasis(f);
  vec3 q = p * B;
  vec2 g = q.xy / q.z;
  vec2 x = (terrUV(q) + 1.0) * ${BN / 2}.0 - 0.5;
  // texel of the nearest bake sample, inside the face's tile (its apron covers the stencil's reach)
  ivec2 c0 = clamp(ivec2(floor(x + 0.5)), ivec2(0), ivec2(${BN - 1})), t0 = ivec2(c0.x + 1, f * ${TILE} + c0.y + 1);
  // open water and territory interiors (one owner throughout, nothing changing hands): one texel settles
  // it. After dark owned water carries a faint wash of its owner's light.
  vec4 a = texelFetch(tTerrBake0, t0, 0);
  int own = int(a.x * 255.0 + 0.5);
  tint = vec4(uTerrColors[own], own > 0 ? 1.0 : 0.0);
  fx = vec4(tint.a * 0.035 * uTerrClock.z * terrGain(tint.rgb) * uTerrClock.w, 0.0, 0.0, 0.0);
  if (a == vec4(a.x, a.x, 1.0, 0.0)) return;

  // Quadratic B-spline over the 3×3 bake samples around the nearest: the baked field is smooth and so stay
  // the borders, C1 curves even under a camera at deck level.
  vec2 k = ${((2 * BN) / Math.PI).toFixed(4)} / ((1.0 + g * g) * q.z);
  vec3 qx = dpx * B, qy = dpy * B;
  mat2 jac = mat2((qx.xy - g * qx.z) * k, (qy.xy - g * qy.z) * k);
  vec2 u = x - vec2(c0);
  TerrAcc accF = TerrAcc(vec3(-1.0), vec3(0.0), vec2(0.0), vec2(0.0), vec2(0.0)), accP = accF;
  vec3 since = vec3(9.0, 0.0, 0.0);
  bool moving = false;
  for (int pass = 0; pass < 2; pass++) {
    if (pass == 1) {
      if (!moving) break;
      since = vec3(0.0);
    }
    for (int j = 0; j < 3; j++) {
      for (int i = 0; i < 3; i++) {
        vec2 dw;
        float w = terrSpline(u, ivec2(i - 1, j - 1), dw);
        ivec2 tx = t0 + ivec2(i - 1, j - 1);
        if (pass == 0) {
          vec4 t = texelFetch(tTerrBake0, tx, 0);
          terrTexel(accF, t, w, dw);
          moving = moving || t.w > 0.5;
        } else {
          // something nearby is changing hands: the previous field and the time since the front passed
          vec4 t = texelFetch(tTerrBake1, tx, 0);
          terrTexel(accP, t, w, dw);
          float y = clamp(t.w * 2.0 - 1.0, -0.996, 0.996), z = 0.25 * y / (1.0 - abs(y));
          since += vec3(w, dw) * z;
        }
      }
    }
  }
  ivec2 pairF, pairP;
  vec3 sF = terrPick(accF, jac, pairF), sP = sF;
  pairP = pairF;
  if (moving) {
    sP = terrPick(accP, jac, pairP);
    since.yz = since.yz * jac;
  }

  vec4 tintF, ecF, tintP, ecP;
  terrShade(pairF, sF, tintF, ecF);
  terrShade(pairP, sP, tintP, ecP);
  float pxT = length(since.yz), tf = clamp(0.5 + since.x / max(pxT, 1e-6), 0.0, 1.0);
  // land returning to open sea fades out ahead of the receding front
  float fade = mix(1.0, smoothstep(0.0, 0.6, -since.x), 1.0 - tintF.a);
  vec4 ec = ecF.a == 0.0 ? ecP : ecP.a == 0.0 ? ecF : mix(ecP, ecF, tf);
  vec4 tc = mix(tintP * fade, tintF, tf);
  tint = vec4(tc.a > 1e-3 ? tc.rgb / tc.a : ec.rgb, tc.a);

  // A fine luminous line on the border (with a soft halo on the dark water at night), over a line of foam on
  // the sea side. Only |s| is used: a lone-owner field cannot know which side of the pair ordering its
  // unseen neighbour is on.
  float aF = abs(sF.x), aP = abs(sP.x), pF = length(sF.yz), pP = length(sP.yz);
  float edgeF = terrLine(aF, 0.07, pF) * 1.4 + terrLine(aF, 0.3, pF) * 0.25 * uTerrClock.z * tintF.a;
  float edgeP = (terrLine(aP, 0.07, pP) * 1.4 + terrLine(aP, 0.3, pP) * 0.25 * uTerrClock.z * tintP.a) * fade;
  float foam = mix(terrLine(aP, 0.12, pP) * fade, terrLine(aF, 0.12, pF), tf) * (1.0 - 0.75 * tint.a);
  float edge = mix(edgeP, edgeF, tf) * ec.a;
  if (edge + foam > 1e-3) {
    // foam broken up along the line, and a soft shimmer drifting along it, livelier on dark water at night
    float n = vnoise(p * 300.0 + vec3(uTerrClock.x * 0.5, 0.0, uTerrClock.x * 0.2));
    edge *= 0.8 + (0.35 + 0.65 * uTerrClock.z) * (0.5 + 0.5 * sin(n * 9.0 + uTerrClock.x * 1.7) - 0.4);
    foam *= 0.35 + 0.65 * smoothstep(0.2, 0.75, n);
  }
  // the flood front: a thin bright crest running over the water
  float crest = terrLine(since.x, 0.01, pxT) * 1.6 * tintF.a * step(1e-3, distance(tintF, tintP));
  float drain = (1.0 - tintF.a) * tintP.a * (since.x < 0.0 ? 1.0 - fade : exp(-since.x * 3.0));
  float lift = terrGain(tint.rgb) * uTerrClock.w;
  fx = vec4((edge + tint.a * 0.035 * uTerrClock.z) * lift, foam, crest * lift, drain);
}
`;
// ---------------------------------------------------------------------------------------------
// Trails: per ship two ribbon slots (one growing, one fading out after a claim or a sinking), resampled
// to an even step and stored in a float texture; one draw builds every ribbon from gl_VertexID.
const SLOTS = 2 * SHIPS;
const CAP = 4096; // samples per slot: 2,000 units (14 km) of open trail, 1.6 times round the planet
const STEP = TRAIL_STEP; // world units between ribbon samples: the sim's trail spacing
const HEAD = 6; // segments bridging the newest sample and the stern
const ABSORB = 0.7; // seconds a closed loop's ribbon takes to sink into the new border
const DISSOLVE = 1.8; // seconds a sunk ship's ribbon takes to break up into foam
const FREE = 0, OPEN = 1, ABSORBED = 2, DISSOLVING = 3; // slot modes

/** Per face cell rows lo..hi and columns left..right (empty when hi < 0). */
interface Rect {
  lo: Int32Array;
  hi: Int32Array;
  left: Int32Array;
  right: Int32Array;
}

interface Slot {
  ship: number;
  mode: number;
  since: number; // render time the slot closed
  trail: V3[] | null; // the sim's polyline being followed
  idx: number; // trail segment the resampler is in
  arcA: number; // arc length at trail[idx]
  next: number; // arc length of the next sample
  end: number; // arc length at the newest trail point
  endIdx: number;
  n: number; // samples stored
}

const TRAIL_VERT = /* glsl */ `
uniform sampler2D tTrail;
uniform vec4 uTrailHead[${SLOTS}];  // stern direction, arc length
uniform vec4 uTrailState[${SLOTS}]; // samples, ship, seconds since closed, mode
uniform float uTrailStart[${SLOTS}]; // first segment of each slot in the draw
uniform float uTime, uSimTime;
${WIND_GLSL}
${SWELL_GLSL}
out vec2 vRib;
out vec3 vNrm;
out vec3 vPos;
flat out vec4 vState;
flat out float vHead;

vec4 trailPoint(int slot, int k, int n) {
  if (k < n) return texelFetch(tTrail, ivec2(k, slot), 0);
  vec4 a = texelFetch(tTrail, ivec2(n - 1, slot), 0), h = uTrailHead[slot];
  float s = float(k - n + 1) / ${HEAD}.0;
  return vec4(normalize(mix(a.xyz, h.xyz, s)), mix(a.w, h.w, s));
}

void main() {
  int seg = gl_VertexID / 6, corner = gl_VertexID - seg * 6;
  int slot = 0;
  for (int s = 1; s < ${SLOTS}; s++) if (float(seg) >= uTrailStart[s]) slot = s;
  vec4 st = uTrailState[slot];
  int n = int(st.x), last = n + ${HEAD - 1};
  int k = seg - int(uTrailStart[slot]) + (corner == 2 || corner == 4 || corner == 5 ? 1 : 0);
  float side = corner == 1 || corner == 3 || corner == 4 ? 1.0 : -1.0;
  vec4 P = trailPoint(slot, k, n);
  vec3 tang = trailPoint(slot, min(k + 1, last), n).xyz - trailPoint(slot, max(k - 1, 0), n).xyz;
  vec3 across = cross(P.xyz, tang);
  across /= max(length(across), 1e-9);
  float w = 0.6;
  if (st.w == ${ABSORBED}.0) w *= 1.0 - 0.6 * min(st.z / ${ABSORB}, 1.0);
  if (st.w == ${DISSOLVING}.0) w *= 1.0 + 0.6 * min(st.z / ${DISSOLVE}, 1.0);
  vec3 dir = normalize(P.xyz + across * (side * w / ${R.toFixed(1)}));
  vec3 nrm;
  vec3 world = dir * ${R.toFixed(1)} + swell(dir, uTime, uSimTime, nrm) + nrm * 0.04;
  vRib = vec2(side * w / 0.6, P.w);
  vNrm = nrm;
  vPos = world;
  vState = st;
  vHead = uTrailHead[slot].w;
  // the water also carries chop and wake waves the swell does not know about: bias the depth a little
  // towards the eye so they cannot cut the ribbon, while real crests in front still hide it
  vec4 clip = projectionMatrix * viewMatrix * vec4(world, 1.0);
  vec4 lifted = projectionMatrix * viewMatrix * vec4(world + normalize(cameraPosition - world) * 0.3, 1.0);
  gl_Position = vec4(clip.xy, lifted.z / lifted.w * clip.w, clip.w);
}
`;

const TRAIL_FRAG = /* glsl */ `
uniform vec3 uTerrColors[${SHIPS + 1}];
uniform vec4 uTerrClock;
uniform float uTime;
uniform vec3 uKeyDir, uKeyColor, uAmbient;
${COMMON_GLSL}
${SKY_GLSL}
${GLOW_GLSL}
in vec2 vRib;
in vec3 vNrm;
in vec3 vPos;
flat in vec4 vState;
flat in float vHead;

void main() {
  float a = abs(vRib.x);
  float s = vRib.y;
  vec3 team = uTerrColors[int(vState.y) + 1], glow = team * terrGain(team);
  // newest part rises out of the wake, the oldest part leaves the border cleanly
  float ends = smoothstep(0.0, 2.0, vHead - s) * smoothstep(0.0, 1.0, s);
  // a thin hot core in a soft sheen of the team colour, laid flat on the water
  float core = exp(-a * a * 150.0);
  float body = exp(-a * a * 3.5) * (1.0 - smoothstep(0.75, 1.0, a));
  // pulses racing back along the ribbon, a heartbeat, and flicker riding the ripples
  float pulse = pow(0.5 + 0.5 * sin(s * 0.7 + uTime * 8.0), 8.0);
  float flick = vnoise(vec3(s * 0.9 + uTime * 4.0, a * 3.0, uTime * 1.7));
  float beat = 0.85 + 0.15 * sin(uTime * 6.5);
  // in the team's own hue by day (bright enough to bleach to white would lose it); after dusk brighter, with the
  // core running white-hot, so danger stays readable on the dark water
  float night = uTerrClock.z;
  vec3 emit = glow * body * (0.4 + 0.4 * flick + pulse)
    + mix(glow, vec3(1.0), 0.35 * night) * core * (1.4 + 1.4 * pulse) * (1.0 + 1.5 * night);
  emit *= beat * uTerrClock.w * (1.0 + 0.4 * night);
  // mostly light on the water; only a breath of dye, or pale teams would paint a white stripe by day
  float alpha = body * 0.12;
  vec3 lit = uAmbient + uKeyColor * max(dot(vNrm, uKeyDir), 0.0);
  vec3 dye = team * lit * 0.3;
  if (vState.w == ${ABSORBED}.0) {
    float k = min(vState.z / ${ABSORB}, 1.0);
    emit *= 1.0 - k;
    alpha *= 1.0 - k;
  } else if (vState.w == ${DISSOLVING}.0) {
    // the glow dies away and the ribbon breaks up into lacy foam that thins out
    float k = min(vState.z / ${DISSOLVE}, 1.0);
    float n = fbm(vPos * 2.4 + vec3(0.0, 0.0, uTime * 0.3)) + 0.2 * (1.0 - a);
    float froth = smoothstep(0.45 + 0.5 * k, 0.6 + 0.5 * k, n);
    emit *= exp(-k * 3.5);
    dye = mix(dye, vec3(0.9) * lit, smoothstep(0.0, 0.25, k));
    alpha = mix(alpha, froth * (1.0 - smoothstep(0.7, 1.0, a)) * 0.6, smoothstep(0.0, 0.25, k)) * (1.0 - k * k);
  }
  alpha *= ends;
  emit *= ends;
  // haze is affine in the colour: fog the premultiplied dye and attenuate the emission alike
  vec3 haze = skyFog(vec3(0.0), vPos);
  gl_FragColor = vec4(skyFog(dye * alpha + emit, vPos) - haze * (1.0 - alpha), alpha);
}
`;

// ---------------------------------------------------------------------------------------------
export class Territory {
  private readonly cells = new Uint8Array(CELLS * 4); // owner, previous owner, share, previous share
  private readonly reveal = new Float32Array(CELLS).fill(-1e6);
  private readonly ownerTex = dataTexture(this.cells, N, 6 * N, THREE.RGBAFormat, THREE.UnsignedByteType);
  private readonly revealTex = dataTexture(this.reveal, N, 6 * N, THREE.RedFormat, THREE.FloatType);
  private readonly baked = new THREE.WebGLRenderTarget(TILE, 6 * TILE, {
    count: 2, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  });
  /**
   * Uniforms of TERRITORY_GLSL; spread them into any material that includes it. tTerrOwner is the plain
   * cell atlas (512×3072, r = owner index / 255; g, b, a internal) for maps that only need owners.
   */
  readonly u = {
    tTerrOwner: { value: this.ownerTex },
    tTerrBake0: { value: this.baked.textures[0] },
    tTerrBake1: { value: this.baked.textures[1] },
    uTerrColors: { value: [new THREE.Color(0, 0, 0), ...Array.from({ length: SHIPS }, (_, i) => teamColor(i))] },
    uTerrClock: { value: new THREE.Vector4(0, 0, 0, 1) },
  };
  private readonly bakeMat: THREE.ShaderMaterial;
  private primed = false; // the textures went up whole and the whole atlas was baked
  /** Cell rects of changes still playing out, re-baked every frame. */
  private readonly animating: { until: number; rect: Rect }[] = [];
  private readonly ctx: Ctx;
  private readonly mark = new Int32Array(CELLS); // per event: 3e changed, 3e+1 changed and listed, 3e+2 listed
  private readonly seen = new Int32Array(CELLS);
  private readonly list = new Int32Array(CELLS);
  private readonly queue = new Int32Array(CELLS);
  private epoch = 0;
  /** Cells of past changes, released once every animation in them has played out. */
  private readonly settling: { until: number; cells: Int32Array }[] = [];
  private readonly dirty = rect(); // cells touched since the last upload
  private readonly win = new Int32Array(WIN * WIN);
  private readonly nb = new Int32Array(8);

  private readonly slots: Slot[] = Array.from({ length: SLOTS }, (_, k) => ({
    ship: k >> 1, mode: FREE, since: 0, trail: null, idx: 0, arcA: 0, next: 0, end: 0, endIdx: 0, n: 0,
  }));
  private readonly open = new Int32Array(SHIPS).fill(-1);
  private readonly trailData = new Float32Array(CAP * SLOTS * 4);
  private readonly trailTex = dataTexture(this.trailData, CAP, SLOTS, THREE.RGBAFormat, THREE.FloatType);
  private readonly trailU = {
    tTrail: { value: this.trailTex },
    uTrailHead: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
    uTrailState: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
    uTrailStart: { value: new Float32Array(SLOTS) },
  };
  private readonly ribbons: THREE.Mesh;
  private readonly stern = new THREE.Vector3();

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    this.resetDirty();
    this.load(ctx.sim.owner);
    this.bakeMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tTerrOwner: this.u.tTerrOwner, tTerrReveal: { value: this.revealTex }, uTerrClock: this.u.uTerrClock,
      },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: BAKE_FRAG,
    });
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...ctx.sky.u, ...SWELL_UNIFORMS, ...this.trailU, uTerrColors: this.u.uTerrColors, uTerrClock: this.u.uTerrClock,
      },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.ribbons = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.ribbons.frustumCulled = false;
    this.ribbons.layers.set(LAYER.OVER);
    ctx.scene.add(this.ribbons);
  }

  update(f: Frame): void {
    // glows are set in display terms: night exposure would otherwise blow them out
    this.u.uTerrClock.value.set(f.t, f.simTime, f.env.night, 2 / (f.env.exposure + 1));
    for (const e of f.events) {
      if (e.type === 'claim') {
        this.change(e.cells, e.ship + 1, e.tick * TICK, e.loop);
        this.closeTrail(e.ship, ABSORBED, f.t);
      } else if (e.type === 'drain') this.change(e.cells, 0, e.tick * TICK, null);
      else if (e.type === 'sink') this.closeTrail(e.ship, DISSOLVING, f.t);
      else if (e.type === 'respawn') {
        // a fresh home blooms outward from the ship
        this.change(e.cells, e.ship + 1, e.tick * TICK, Int32Array.of(cellOf(this.ctx.sim.ships[e.ship].home, N)));
      }
    }
    this.settle(f.simTime);
    this.sync(f.simTime);
    this.updateTrails(f);
  }

  // -------------------------------------------------------------------------------------------
  // Ownership

  /** Mirror the whole ownership grid (start of a match): no animation, shares around every border. */
  private load(owner: Uint8Array): void {
    const C = this.cells;
    let n = 0;
    for (let c = 0; c < CELLS; c++) {
      C[c * 4] = C[c * 4 + 1] = owner[c];
      C[c * 4 + 2] = C[c * 4 + 3] = 255;
      if (owner[c]) this.list[n++] = c;
    }
    const e = ++this.epoch * 3;
    let m = 0;
    for (let k = 0; k < n; k++) m = this.listWindow(this.list[k], e, m, this.queue);
    for (let k = 0; k < m; k++) {
      const c = this.queue[k];
      C[c * 4 + 2] = C[c * 4 + 3] = this.share(c);
    }
  }

  /**
   * Cells `changed` go to `owner` (0: open sea). Their previous owners stay on record and the shader
   * reveals the new owner along a front spreading from `loop` (or receding from the region's edge).
   */
  private change(changed: Int32Array, owner: number, t0: number, loop: Int32Array | null): void {
    if (changed.length === 0) return;
    const C = this.cells, mark = this.mark, list = this.list, rev = this.reveal;
    const e = ++this.epoch * 3;
    for (let k = 0; k < changed.length; k++) mark[changed[k]] = e;
    // boundary cells of the changed region (also the sources of a receding drain) and every cell
    // within FLAT cells of them, on both sides (their smoothed shares and flatness depend on the change)
    let nb = 0, nl = 0;
    for (let k = 0; k < changed.length; k++) {
      const c = changed[k];
      if (this.isBoundary(c, e)) {
        this.queue[nb++] = c;
        nl = this.listWindow(c, e, nl, list);
      }
    }
    // keep the state being replaced for the before/after fields
    for (let k = 0; k < changed.length; k++) {
      const c = changed[k] * 4;
      C[c + 1] = C[c];
      C[c + 3] = C[c + 2];
      C[c] = owner;
      C[c + 2] = 255;
      this.touch(changed[k]);
    }
    for (let k = 0; k < nl; k++) {
      const c = list[k];
      if (mark[c] === e + 2) {
        C[c * 4 + 1] = C[c * 4];
        C[c * 4 + 3] = C[c * 4 + 2];
        rev[c] = Math.max(rev[c], t0);
        this.touch(c);
      }
    }
    for (let k = 0; k < nl; k++) C[list[k] * 4 + 2] = this.share(list[k]);

    // multi-source BFS through the changed region, alternating 4- and 8-neighbour steps for a
    // near-round front; distances land in `rev` and become reveal times below
    const seen = this.seen, queue = this.queue;
    let head = 0, tail = 0;
    if (loop) {
      for (let k = 0; k < loop.length; k++) {
        const c = loop[k];
        if ((mark[c] === e || mark[c] === e + 1) && seen[c] !== e) {
          seen[c] = e;
          rev[c] = 0;
          queue[tail++] = c;
        }
      }
    }
    if (tail === 0) {
      for (let k = 0; k < nb; k++) {
        seen[queue[k]] = e;
        rev[queue[k]] = 0;
      }
      tail = nb;
    }
    let layer = 0;
    while (head < tail) {
      const stop = tail, steps = ++layer & 1 ? 4 : 8;
      for (; head < stop; head++) {
        const nb = around(queue[head], this.nb);
        for (let s = 0; s < steps; s++) {
          const x = nb[s];
          if ((mark[x] === e || mark[x] === e + 1) && seen[x] !== e) {
            seen[x] = e;
            rev[x] = layer;
            queue[tail++] = x;
          }
        }
      }
    }
    // two in-place passes of a 3×3 average round off the octagonal facets of the BFS front
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < tail; k++) {
        const c = queue[k], nb = around(c, this.nb);
        let sum = rev[c], n = 1;
        for (const x of nb) {
          if (seen[x] === e) {
            sum += rev[x];
            n++;
          }
        }
        rev[c] = sum / n;
      }
    }
    const far = Math.max(1, layer - 1);
    // floods race in from the loop; a sunk ship's sea drains from its edges a beat after it goes down
    const span = owner ? Math.min(3.2, 0.7 + far * 0.022) : Math.min(2.8, 1.6 + far * 0.015);
    if (!owner) t0 += 0.3;
    for (let k = 0; k < changed.length; k++) {
      const c = changed[k];
      rev[c] = t0 + (span * (seen[c] === e ? rev[c] : far)) / far;
    }
    const cells = new Int32Array(changed.length + nl);
    cells.set(changed);
    cells.set(list.subarray(0, nl), changed.length);
    this.settling.push({ until: t0 + span + HOLD, cells });
    const d = this.dirty;
    this.animating.push({
      until: t0 + span + 2.5,
      rect: { lo: d.lo.slice(), hi: d.hi.slice(), left: d.left.slice(), right: d.right.slice() },
    });
  }

  /**
   * Cells whose animations have played out forget their previous state, so the shader again finds
   * them settled from a single texel (previous owner and share equal to the current ones).
   */
  private settle(T: number): void {
    const C = this.cells;
    while (this.settling.length && this.settling[0].until <= T) {
      for (const c of this.settling.shift()!.cells) {
        if (this.reveal[c] > T - HOLD) continue; // changed again since
        C[c * 4 + 1] = C[c * 4];
        C[c * 4 + 3] = C[c * 4 + 2];
        this.touch(c);
      }
    }
  }

  /** Changed cell with a neighbour outside the change. */
  private isBoundary(c: number, e: number): boolean {
    for (const x of around(c, this.nb)) if (this.mark[x] !== e && this.mark[x] !== e + 1) return true;
    return false;
  }

  /** Append the cells within FLAT of c not yet listed for this event; returns the new count. */
  private listWindow(c: number, e: number, n: number, out: Int32Array): number {
    const mark = this.mark;
    for (const x of cellWindow(c, this.win)) {
      if (mark[x] === e) mark[x] = e + 1;
      else if (mark[x] !== e + 1 && mark[x] !== e + 2) mark[x] = e + 2;
      else continue;
      out[n++] = x;
    }
    return n;
  }

  /**
   * Smoothed share of c's own owner over its window, as a byte. 255 is kept for cells that own the whole
   * window alone: every shader stencil around them is uniform, so it can stop early.
   */
  private share(c: number): number {
    const C = this.cells, o = C[c * 4], w = cellWindow(c, this.win);
    let s = 0, flat = true;
    for (let k = 0; k < w.length; k++) {
      if (C[w[k] * 4] === o) s += SMOOTH[k];
      else flat = false;
    }
    return flat ? 255 : Math.min(254, Math.round(Math.max(s, MIN_SHARE) * 255));
  }

  /** Record a changed cell for upload and baking; near a face edge the neighbouring tile reads it too. */
  private touch(c: number): void {
    this.extend(c);
    const r = c % NN, j = Math.floor(r / N), i = r - j * N;
    if (i > 2 && j > 2 && i < N - 3 && j < N - 3) return;
    for (let s = 0; s < 8; s++) this.extend(offset(c, NBI[s] * 3, NBJ[s] * 3));
  }

  private extend(c: number): void {
    const d = this.dirty, f = Math.floor(c / NN), r = c - f * NN, j = Math.floor(r / N), i = r - j * N;
    if (j < d.lo[f]) d.lo[f] = j;
    if (j > d.hi[f]) d.hi[f] = j;
    if (i < d.left[f]) d.left[f] = i;
    if (i > d.right[f]) d.right[f] = i;
  }

  private resetDirty(): void {
    this.dirty.lo.fill(N);
    this.dirty.hi.fill(-1);
    this.dirty.left.fill(N);
    this.dirty.right.fill(-1);
  }

  /**
   * Upload the cells touched this frame, then re-bake around them and around every change still playing out
   * (its reveal front and fading previous owner move every frame). The first call sends and bakes everything.
   */
  private sync(T: number): void {
    const d = this.dirty;
    if (!this.primed) {
      d.lo.fill(0);
      d.left.fill(0);
      d.hi.fill(N - 1);
      d.right.fill(N - 1);
    }
    let any = false, rows = 0;
    for (let f = 0; f < 6; f++) if (d.hi[f] >= 0) rows += d.hi[f] - d.lo[f] + 1;
    // each row is its own texSubImage2D (three only merges ranges within a row); past a few dozen the GPU
    // process stalls on the calls, so a big claim sends the whole textures in one go instead
    const ranged = this.primed && rows <= 32;
    for (let f = 0; f < 6; f++) {
      if (d.hi[f] < 0) continue;
      any = true;
      if (!ranged) continue;
      for (let j = d.lo[f]; j <= d.hi[f]; j++) {
        const start = (f * NN + j * N + d.left[f]) * 4, count = (d.right[f] - d.left[f] + 1) * 4;
        this.ownerTex.addUpdateRange(start, count);
        this.revealTex.addUpdateRange(start, count); // single-channel texture: three counts ranges in RGBA units
      }
    }
    this.primed = true;
    for (let k = this.animating.length - 1; k >= 0; k--) if (this.animating[k].until <= T) this.animating.splice(k, 1);
    if (!any && !this.animating.length) return;
    if (any) this.ownerTex.needsUpdate = this.revealTex.needsUpdate = true;

    const r = this.ctx.pipeline.renderer, autoClear = r.autoClear;
    r.autoClear = false;
    this.baked.scissorTest = true;
    this.bake(d);
    for (const { rect } of this.animating) this.bake(rect);
    r.setRenderTarget(null);
    r.autoClear = autoClear;
    this.resetDirty();
  }

  /** Bake the texels around a cell rect. */
  private bake({ lo, hi, left, right }: Rect): void {
    const r = this.ctx.pipeline.renderer, t = this.baked, m = 5; // the stencil and blend band reach two cells
    for (let f = 0; f < 6; f++) {
      if (hi[f] < 0) continue;
      const x0 = Math.max(0, left[f] * 2 + 1 - m), x1 = Math.min(TILE, right[f] * 2 + 3 + m);
      const y0 = Math.max(0, lo[f] * 2 + 1 - m), y1 = Math.min(TILE, hi[f] * 2 + 3 + m);
      t.viewport.set(x0, f * TILE + y0, x1 - x0, y1 - y0);
      t.scissor.copy(t.viewport);
      drawPass(r, this.bakeMat, t);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Trails

  private closeTrail(ship: number, mode: number, t: number): void {
    const k = this.open[ship];
    if (k < 0) return;
    const s = this.slots[k];
    s.mode = mode;
    s.since = t;
    s.trail = null;
    this.open[ship] = -1;
  }

  private updateTrails(f: Frame): void {
    const sim = this.ctx.sim, st = this.trailU.uTrailState.value;
    for (const ship of sim.ships) {
      let k = this.open[ship.id];
      // a trail replaced or cut short without an event is closed like a claimed loop
      if (k >= 0 && (this.slots[k].trail !== ship.trail || ship.trail.length <= this.slots[k].endIdx)) {
        this.closeTrail(ship.id, ABSORBED, f.t);
        k = -1;
      }
      if (k < 0 && ship.alive && ship.trail.length > 0) k = this.openTrail(ship.id, ship.trail);
      if (k >= 0) this.grow(k, f);
    }
    let start = 0;
    for (let k = 0; k < SLOTS; k++) {
      const s = this.slots[k];
      const age = f.t - s.since;
      if ((s.mode === ABSORBED && age > ABSORB) || (s.mode === DISSOLVING && age > DISSOLVE)) s.mode = FREE;
      if (s.mode === FREE) s.n = 0;
      this.trailU.uTrailStart.value[k] = start;
      st[k].set(s.n, s.ship, s.mode === OPEN ? 0 : age, s.mode);
      if (s.n > 0) start += s.n - 1 + HEAD;
    }
    this.ribbons.geometry.setDrawRange(0, start * 6);
    this.ribbons.visible = start > 0;
  }

  private openTrail(ship: number, trail: V3[]): number {
    // alternate the ship's two slots so the previous ribbon can finish fading
    const a = ship * 2, b = a + 1;
    const k = this.slots[a].mode === FREE ? a : this.slots[b].mode === FREE ? b
      : this.slots[a].since < this.slots[b].since ? a : b;
    Object.assign(this.slots[k], {
      ship, mode: OPEN, since: 0, trail, idx: 0, arcA: 0, next: 0, end: 0, endIdx: 0, n: 0,
    });
    this.open[ship] = k;
    return k;
  }

  /** Resample new trail points into the slot up to the stern, and move the head to the stern. */
  private grow(k: number, f: Frame): void {
    const s = this.slots[k], trail = s.trail!, pose = f.poses[s.ship], data = this.trailData;
    while (s.endIdx + 1 < trail.length) {
      s.end += chord(trail[s.endIdx], trail[s.endIdx + 1]);
      s.endIdx++;
    }
    const cutoff = s.end - pose.length * 0.5 - STEP, n0 = s.n;
    while (s.idx + 1 < trail.length && s.n < CAP) {
      const a = trail[s.idx], b = trail[s.idx + 1], len = chord(a, b);
      while (s.next <= s.arcA + len && s.next <= cutoff && s.n < CAP) {
        const t = len > 1e-6 ? (s.next - s.arcA) / len : 0;
        const x = mix(a.x, b.x, t), y = mix(a.y, b.y, t), z = mix(a.z, b.z, t);
        const l = Math.hypot(x, y, z), o = (k * CAP + s.n) * 4;
        data[o] = x / l;
        data[o + 1] = y / l;
        data[o + 2] = z / l;
        data[o + 3] = s.next;
        s.n++;
        s.next += STEP;
      }
      if (s.next > s.arcA + len) {
        s.arcA += len;
        s.idx++;
      } else break;
    }
    if (s.n > n0) {
      this.trailTex.addUpdateRange((k * CAP + n0) * 4, (s.n - n0) * 4);
      this.trailTex.needsUpdate = true;
    }
    if (s.n === 0) return;
    const p = this.stern.copy(pose.up).multiplyScalar(R).addScaledVector(pose.fwd, -pose.length * 0.5).normalize();
    const o = (k * CAP + s.n - 1) * 4;
    const gap = R * Math.hypot(p.x - data[o], p.y - data[o + 1], p.z - data[o + 2]);
    this.trailU.uTrailHead.value[k].set(p.x, p.y, p.z, data[o + 3] + gap);
  }
}

function dataTexture(
  data: Uint8Array | Float32Array, w: number, h: number, format: THREE.PixelFormat, type: THREE.TextureDataType,
): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, format, type);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

function rect(): Rect {
  return { lo: new Int32Array(6), hi: new Int32Array(6), left: new Int32Array(6), right: new Int32Array(6) };
}
