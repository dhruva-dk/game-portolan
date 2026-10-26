// The sea (WP13): the style carried across the whole planet's water. One camera-centred geodesic disc (a polar grid
// with geometric radial spacing reaching past the horizon) is laid on the sphere in the vertex shader and moved by
// the render swell, so there are no seams or pinching anywhere, poles and cube edges included, in one draw call.
// The planet's curve is real geometry, so distant ships and islands sink hull first behind it. The fragment paints
// a portolan chart's sea brought to life: the floor seen through clear shallows (sand ripples, hatched rock, coral
// heads, swaying kelp); bare parchment washed with depth (pale lagoons, verdigris shallows, ultramarine shelves, deep
// indigo), each wash its own glaze with a wavering pooled edge; the swell's backs hatched as form; coastlines traced
// by rings of fine parallel lines; waves as pen strokes at several scales riding the swell downwind; lead-white
// dry-brush foam at the waterline, in lace over the reefs, on drift lines and on breaking crests; current lanes as
// fast streaks of ink and foam; the weather (a calm's mirror with the sky, islands and ships drawn upside down in it,
// a squall's rough grey sea); and WP20's territory washes. Bow waves and wakes are a second draw: a ribbon per ship.
import * as THREE from 'three';
import { inkMaterial, linearVec, transmittanceVec } from '../style/glsl.ts';
import { hex, PARCHMENT, PIGMENTS, SEA_WASHES, type PigmentName } from '../style/palette.ts';
import { tideOf } from '../sim/environment.ts';
import type { V3 } from '../sim/math.ts';
import { cellOf, horizonDistance, R, TERRITORY } from '../sim/sphere.ts';
import { LANE_TAPER } from '../sim/tables.ts';
import { airOf } from './weather.ts';
import { CHARTS, coastAt, type Geography, heightAt, ZONE } from '../sim/world/geography.ts';
import { DRAFT, FLOOR, REGIONS, TIDE } from '../sim/world/regions.ts';
import type { Pipeline } from './pipeline.ts';
import { cubeTexture, SEA_FIELD_BYTES, SEA_FLOOR_BYTES, seaFloorFaces, Swell, SWELL_GLSL } from './swell.ts';
import type { RenderContext, RenderModule } from './world.ts';

/** Rings of the sea disc, centre to rim. */
export const DISC_RINGS = 112;
const RINGS = DISC_RINGS, SEGMENTS = 224;
/** How much of each SEA_WASHES density the sea lays: a chart's sea is pale vellum washed with depth. */
const WASH_LOAD = { lagoon: 0.5, shallows: 0.45, shelf: 0.32, deep: 0.38 } as const;
/** Arc (u) from the coral region's centre its clear water keeps (fading over the next ~10 u). */
const CLEAR_REACH = 105;
/** Current arcs the sea draws: the geography's fixed lanes, then the streams laid with Sea.setStreams. */
export const MAX_LANES = 24;
/** Ships whose bow waves and wakes (and calm-water reflections) the sea draws at once. */
export const WAKE_SHIPS = 16;
/** u between the points a wake lays along the stern's path; s a wake lasts. */
export const WAKE_STEP = 0.9, WAKE_LIFE = 14;
/** s a stopped ship's wake (one sinking, S-019 pass g) takes to die: the wedge stops opening and the ribbon fades. */
export const WAKE_DIE = 2.5;
/** Points of each wake ribbon: bow, midships and stern, then the stern's track, newest first. */
const WAKE_HEAD = 3, WAKE_PTS = WAKE_HEAD + 40;

/** A current arc drawn with the lanes' look: from a to b along their great circle (unit directions). */
export interface Arc { readonly a: V3; readonly b: V3; readonly width: number; readonly speed: number }

export interface DiscShape {
  /** Arc distance from the camera's foot to the disc's rim, u. */
  reach: number;
  /** Geometric spacing exponent: ring t ∈ [0, 1] lies at reach·(e^{kt} − 1)/(e^k − 1). */
  k: number;
  /** Straight-line distance from the eye to the horizon, u. */
  horizon: number;
}

/** The disc for an eye `height` above the sea: past the horizon, its first ring about 3 % of the height out. */
export function discShape(height: number, out: DiscShape): DiscShape {
  const h = Math.max(height, 0.3);
  out.reach = Math.min(horizonDistance(h) * 1.2 + 6, Math.PI * R * 0.98);
  out.horizon = Math.sqrt(h * (2 * R + h));
  const first = Math.max(0.1, 0.03 * h) / out.reach, ring = (k: number) => Math.expm1(k / RINGS) / Math.expm1(k);
  let lo = 1e-3, hi = 40;
  if (ring(lo) <= first) hi = lo;
  for (let i = 0; i < 40 && hi > lo; i++) {
    const mid = (lo + hi) / 2;
    if (ring(mid) > first) lo = mid; else hi = mid;
  }
  out.k = hi;
  return out;
}

/** A motu's white beach: how far (u) its sand runs from the land line (dry at high water, the coral planner's LAND) down
 *  onto the awash reef flat, before the shader's ragged edge (WP17, S-021). */
export const MOTU_BEACH = 1.55;
/**
 * GLSL (after SWELL_GLSL), one rule for the terrain's white beaches and the sea's waterline ink. float toLand(dir, h):
 * u from a point of height h to the land line, near enough within ~2 u (9 beyond): the least, over three rings of points
 * round it, of the arc out to a point plus twenty times the height that point still has to climb, so it runs on
 * smoothly and a flat or patch reef lying high but off any motu stays awash flat (the gaps between the motus never
 * fill with sand, and a patch that never clears the land line keeps none).
 */
export const LAND_GLSL = /* glsl */ `
const float LAND_U = ${(TIDE.amp + 0.15).toFixed(3)}, BEACH_W = ${MOTU_BEACH.toFixed(3)};
float toLand(vec3 dir, float h) {
  if (h >= LAND_U) return 0.0;
  float d = min(9.0, 20.0 * (LAND_U - h));
  vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.7854 + 0.3 * float(k - 2 * (k / 2));
    vec3 o = (t1 * cos(a) + t2 * sin(a)) / SEA_R;
    for (int j = 1; j <= 3; j++) {
      float r = 0.7 * float(j);
      d = min(d, r + 20.0 * max(LAND_U - seaField(normalize(dir + r * o)).x, 0.0));
    }
  }
  return d;
}
// how far a reef's waterline lies from any motu's beach: 0 where a beach comes down to the water (or off the reef), up to
// 1 along the awash flat's lip; and the ink a waterline takes, full on a beach, else light and in broken lengths, so an
// atoll is never one hard inked ring (S-021)
float offBeach(vec3 dir, vec4 f) {
  return f.w > 0.02 ? f.w * smoothstep(BEACH_W - 0.1, BEACH_W + 0.6, toLand(dir, f.x)) : 0.0;
}
float lipInk(vec3 dir, float off) {
  vec3 P = dir * SEA_R, tw = triWeights(dir, 4.0);
  float lengths = smoothstep(0.42, 0.58, tri(tPaper, P / 2.2 + 3.0, tw).g + 0.25 * (tri(tPaper, P / 4.1, tw).g - 0.5));
  return mix(1.0, mix(0.15, 0.45, lengths), off);
}
`;

/** The surf's rule, one for the shader and the coral plan (WP17): white water breaks over coral reef within `reach` u
 *  seaward of the coast where the water `out` u farther seaward is deeper than `deep` u and neither it nor the water `far`
 *  u out is a lagoon (an exposed reef front, where the open swell meets it: a lagoon's side and a pass's inner reach lie calm), and the
 *  reef is shoal enough to strike a keel at low water (the sim's height through `strike`), so a pass a hull clears at
 *  every tide stays unbroken; lace lies wherever the reef would strike a keel now (`lace`: depth through the draught). */
export const SURF = { reach: 7.5, out: 6, deep: [4, 7], far: 13, strike: [-TIDE.amp - DRAFT - 0.5, -TIDE.amp - DRAFT + 0.1], lace: [DRAFT - 0.25, DRAFT] } as const;
const ramp = (a: number, b: number, x: number): number => THREE.MathUtils.smoothstep(x, a, b);
const S1 = new THREE.Vector3(), S2 = new THREE.Vector3(), S3 = new THREE.Vector3();
/** How much white water the surf can lay at `dir` (0–1, its envelope: the sets break within it) at sea level `level`. */
export function surfAt(geo: Geography, dir: V3, level: number): number {
  const y = coastAt(geo, dir), h = heightAt(geo, dir);
  if (geo.floor[cellOf(TERRITORY, dir)] !== FLOOR.coral || y >= SURF.reach || level - h <= -0.4) return 0;
  const d = S3.set(dir.x, dir.y, dir.z);
  S1.crossVectors(d, Math.abs(d.y) < 0.9 ? S2.set(0, 1, 0) : S2.set(1, 0, 0)).normalize();
  S2.crossVectors(d, S1);
  const gx = coastAt(geo, S1.clone().multiplyScalar(0.8 / R).add(d).normalize()) - y, gy = coastAt(geo, S2.clone().multiplyScalar(0.8 / R).add(d).normalize()) - y;
  const sea = S1.multiplyScalar(gx).addScaledVector(S2, gy).addScaledVector(d, 1e-5).normalize();
  const far = S2.copy(sea).multiplyScalar(SURF.far / R).add(d).normalize(), out = sea.multiplyScalar(SURF.out / R).add(d).normalize();
  if ((geo.zones[cellOf(TERRITORY, out)] | geo.zones[cellOf(TERRITORY, far)]) & ZONE.lagoon) return 0;
  return ramp(SURF.deep[0], SURF.deep[1], level - heightAt(geo, out)) * ramp(SURF.strike[0], SURF.strike[1], h);
}
/** How much lace lies at `dir` at sea level `level` (0–1): over reef that would strike a keel now. */
export function laceAt(geo: Geography, dir: V3, level: number): number {
  const depth = level - heightAt(geo, dir);
  return geo.floor[cellOf(TERRITORY, dir)] === FLOOR.coral && depth > 0 ? 1 - ramp(SURF.lace[0], SURF.lace[1], depth) : 0;
}

/** The clear tropical water's uniforms: the chart of the region whose reefs are coral (its centre, the cosine of the
 *  reach its water keeps clear, its east and north). */
function clearWater(): Record<'uClear' | 'uClearE' | 'uClearN', { value: THREE.Vector4 | THREE.Vector3 }> {
  const ri = REGIONS.findIndex((r) => r.flora.includes('coral')), c = CHARTS[Math.max(ri, 0)];
  return {
    uClear: { value: new THREE.Vector4(c.c.x, c.c.y, c.c.z, ri < 0 ? 2 : Math.cos(CLEAR_REACH / R)) },
    uClearE: { value: new THREE.Vector3(c.e.x, c.e.y, c.e.z) }, uClearN: { value: new THREE.Vector3(c.n.x, c.n.y, c.n.z) },
  };
}

function discGeometry(): THREE.BufferGeometry {
  const pos = new Float32Array((RINGS + 1) * SEGMENTS * 3), idx: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const o = (r * SEGMENTS + k) * 3;
      pos[o] = r / RINGS;
      pos[o + 1] = (k / SEGMENTS) * Math.PI * 2;
      if (r === RINGS) continue;
      const a = r * SEGMENTS + k, b = r * SEGMENTS + ((k + 1) % SEGMENTS), c = a + SEGMENTS, d = b + SEGMENTS;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const vec = (v: THREE.Vector3) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
const T = (p: PigmentName) => vec(transmittanceVec(PIGMENTS[p]));
const washT = (k: keyof typeof SEA_WASHES) => vec(transmittanceVec(SEA_WASHES[k].pigment));
const washD = (k: keyof typeof SEA_WASHES) => (SEA_WASHES[k].density * WASH_LOAD[k]).toFixed(4);

/** Lead white and the pen, silvered by night: the foam's and the strokes' colours (fragment, after STYLE_GLSL). */
const INKS = /* glsl */ `
const vec3 LEAD = ${vec(linearVec(PIGMENTS.leadWhite))}, PARCH = ${vec(linearVec(PARCHMENT))};
const vec3 SUN_GOLD = ${vec(linearVec(hex('#f5dc96')))}, LEAF_LO = ${vec(linearVec(hex('#c08a2c')))}, LEAF_HI = ${vec(linearVec(hex('#f4d77e')))}, LEAF_GLINT = ${vec(linearVec(hex('#fff2c8')))}; // the pale gold close round a low sun (render/sky.ts); burnished leaf
vec3 leadWhite() { return mix(LEAD * uPaper / PARCH, uSilver, uNight * 0.6); }
vec3 penInk() { return mix(hatchInk(0.6), uSilver, uNight * 0.7); }
`;

const VERTEX = /* glsl */ `
${SWELL_GLSL}
uniform float uTime;
uniform vec3 uFoot;
uniform vec3 uEast;
uniform vec3 uNorth;
uniform float uReach;
uniform float uK;
out vec3 vRest;
out vec3 vWorld;
out vec3 vNormal;
out float vLift;
void main() {
  float a = uReach * (exp(uK * position.x) - 1.0) / (exp(uK) - 1.0) / SEA_R;
  vec3 dir = cos(a) * uFoot + sin(a) * (cos(position.y) * uEast + sin(position.y) * uNorth);
  vec4 f = seaField(dir);
  vec3 d = swell(dir, uTime, swellAmp(uSeaLevel - f.x), vNormal, vLift);
  vRest = dir;
  vWorld = dir * (SEA_R + uSeaLevel) + d;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
${SWELL_GLSL}
${LAND_GLSL}
#define MAX_LANES ${MAX_LANES}
#define WAKE_SHIPS ${WAKE_SHIPS}
in vec3 vRest;
in vec3 vWorld;
in vec3 vNormal;
in float vLift;
uniform float uHorizon; // straight-line distance from the eye to the horizon, u
uniform float uStrokes; // the share of cells that carry a wave stroke
uniform float uCaps;    // the share of crests breaking white
uniform float uCalm;    // 0…1: the sea laid flat as a mirror
uniform float uSquall;
uniform vec4 uStormCalm;  // 0…1: the sea roughened and greyed
uniform samplerCube tSeaFloor;   // masks: rock (and ice), kelp, mud, black sand
uniform vec4 uLaneA[MAX_LANES];  // a current arc's start (unit) and half-width, u
uniform vec4 uLaneB[MAX_LANES];  // its end (unit) and speed, u/s
uniform vec4 uLaneN[MAX_LANES];  // the pole of its great circle (a × b, unit); w 1 in use, 0 free
uniform vec4 uShips[WAKE_SHIPS]; // each ship's waterline point (u) and mast height (0: none)
uniform samplerCube tTerritory;  // WP20: rgb the owner's wash transmittance (1 where unowned), a 1 where owned
uniform float uTerritory;        // 1 once WP20 lays its map
uniform vec4 uClear;             // clear tropical water (the coral reefs' region): its chart's centre (unit), cos of its reach
uniform vec3 uClearE;            // that chart's east and north: its floor and surf are laid on the chart, unstretched
uniform vec3 uClearN;
uniform samplerCube tFlood;      // WP20's moments: r the cell's place in its moment, g its slot·32, b 255 inside one (r, g ·b)
uniform vec4 uFlood[8];          // WP20's moment slots: x kind (1 flood, 2 wash-out), y front u or progress, z reach u, w dryness
const vec3 LAGOON_T = ${washT('lagoon')}, SHALLOWS_T = ${washT('shallows')}, SHELF_T = ${washT('shelf')}, DEEP_T = ${washT('deep')};
const float LAGOON_D = ${washD('lagoon')}, SHALLOWS_D = ${washD('shallows')}, SHELF_D = ${washD('shelf')}, DEEP_D = ${washD('deep')};
const vec3 SAND_T = ${T('ochre')}, ROCK_T = ${T('umber')}, CORAL_T = ${T('roseMadder')}, KELP_T = ${T('malachite')};
const vec3 MUD_T = ${T('sepia')}, BLACK_T = ${T('ironGall')}, TURQ_T = ${T('verdigris')}, CREAM_T = ${T('ochre')};
const float LANE_TAPER = ${LANE_TAPER.toFixed(1)}, TERRITORY_D = 0.6;
const float SURF_REACH = ${SURF.reach.toFixed(2)}, SURF_OUT = ${SURF.out.toFixed(2)}, SURF_FAR = ${SURF.far.toFixed(2)};
const vec2 SURF_DEEP = vec2(${SURF.deep.map((v) => v.toFixed(2)).join(', ')}), SURF_STRIKE = vec2(${SURF.strike.map((v) => v.toFixed(2)).join(', ')}), SURF_LACE = vec2(${SURF.lace.map((v) => v.toFixed(2)).join(', ')});
${INKS}
// coast rings: the first RING0 u off the solid contour, then spreading by RING_G; widths in CSS px
const float RING0 = 0.8, RING_D = 1.1, RING_G = 1.5, RINGS = 6.0, RING_CSS = 0.5, COAST_CSS = 0.6;
// wave strokes: the nearest cells are STROKE_CELL u; farther, each octave doubles and keeps at least STROKE_CELL_CSS
const float STROKE_CELL = 0.7, STROKE_CELL_CSS = 26.0, STROKE_CSS = 1.0;

// A wash laid where e > 0 (e: how far past its edge, in depth u; fw = fwidth(e)): its anti-aliased cover and the
// pooled ring where the drying pigment gathered just inside the edge.
vec2 layer(float e, float fw) {
  float px = e / max(fw, 1e-4);
  float cover = smoothstep(-0.75, 0.75, px);
  return vec2(cover, cover * (1.0 - smoothstep(0.0, 6.0 * uRenderPx, px)));
}

// The planet frame's plane most facing unit d (0 yz, 1 zx, 2 xy) and by how much it leads the next.
int planeOf(vec3 d, out float lead) {
  vec3 a = abs(d);
  float m = max(a.x, max(a.y, a.z));
  lead = m - (a.x + a.y + a.z - m - min(a.x, min(a.y, a.z)));
  return a.x == m ? 0 : a.y == m ? 1 : 2;
}
vec2 onPlane(vec3 v, int i) { return i == 0 ? v.yz : i == 1 ? v.zx : v.xy; }

// Cellular noise at plane point x: distances to the nearest two jittered points, the offset to the nearest, its hash.
vec4 cells(vec2 x, out float id) {
  vec2 i = floor(x), fr = fract(x), r1 = vec2(0.0);
  float f1 = 9.0, f2 = 9.0;
  id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int k = -1; k <= 1; k++) {
      vec2 g = vec2(float(k), float(y)), r = g + 0.15 + 0.7 * vec2(hash12(i + g), hash12(i + g + 17.3)) - fr;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; r1 = r; id = hash12(i + g + 5.1); } else if (d < f2) f2 = d;
    }
  }
  return vec4(sqrt(f1), sqrt(f2), r1);
}

// Smooth value noise in [0, 1] on the unit lattice (no texture, so safe in any branch).
float vnoise(vec2 p) {
  vec2 i = floor(p), u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// One mark per occupied cell (a share of them) of size C at plane point x, along unit w; upx: plane units per render
// pixel. Kind 0, a wave stroke: a crescent whose chord lies along the crest, bowed downwind, tapering at both ends
// like a nib, now and then doubled by a shorter arc upwind; the pen sweeps it on, it drifts downwind as it rides,
// then the ink lifts. Kind 1, a streak: a long thin wavering dash along w that comes and goes. Kind 2, a blade: a
// streak that stays.
float mark(vec2 x, vec2 w, float C, float upx, float seed, float share, int kind) {
  vec2 cell = floor(x / C);
  float h0 = hash12(cell + seed), h1 = hash12(cell.yx + seed * 1.37 + 11.0), h2 = hash12(cell + seed * 2.11 + 23.0);
  if (h0 > share) return 0.0;
  float age = kind == 2 ? 0.5 : fract(uTime / (3.0 + 2.5 * h1) + h2);
  vec2 c = (cell + 0.5 + (vec2(h1, h2) - 0.5) * 0.3) * C + w * (kind == 2 ? 0.0 : (age - 0.5) * 0.25 * C);
  vec2 d = x - c, nw = vec2(-w.y, w.x);
  float fade = 1.0 - smoothstep(0.55, 0.95, age);
  if (kind > 0) {
    float hl = (0.3 + 0.15 * h1) * C, s = dot(d, w) / hl, a = dot(d, nw) - 0.08 * hl * sin(3.0 * s + 6.283 * h2);
    float hw = (0.25 + 0.5 * sqrt(max(1.0 - s * s, 0.0))) * STROKE_CSS * uRenderPx;
    return (1.0 - smoothstep(hw - 0.5, hw + 0.5, abs(a) / upx)) * step(abs(s), 1.0) * fade;
  }
  float hl = (0.2 + 0.08 * h0 / max(share, 1e-3)) * C, s = dot(d, nw) / hl, along = dot(d, w);
  float drawn = -1.0 + 2.2 * smoothstep(0.0, 0.25, age);
  float hw = (0.2 + 0.55 * sqrt(max(1.0 - s * s, 0.0))) * STROKE_CSS * uRenderPx;
  float cov = (1.0 - smoothstep(hw - 0.5, hw + 0.5, abs(along - 0.22 * hl * (1.0 - s * s)) / upx)) * step(abs(s), 1.0)
            * (1.0 - smoothstep(drawn - 0.08, drawn, s));
  if (h1 > 0.62) {
    float s2 = s / 0.7, hw2 = (0.15 + 0.4 * sqrt(max(1.0 - s2 * s2, 0.0))) * STROKE_CSS * uRenderPx;
    cov = max(cov, (1.0 - smoothstep(hw2 - 0.5, hw2 + 0.5, abs(along + 0.17 * C - 0.15 * hl * (1.0 - s2 * s2)) / upx))
                   * step(abs(s2), 1.0) * (1.0 - smoothstep(drawn - 0.08, drawn, s2)));
  }
  return cov * fade;
}

// The marks at rest point P (unit normal n) running along the tangent t, projected on the planet frame's three
// planes (only the dominant one away from the cube's diagonals), in two octaves of cell size from the pixel
// footprint upx (cells never nearer than STROKE_CELL_CSS); scroll carries them along t, u.
float marks(vec3 P, vec3 n, vec3 t, float upx, float cell, float share, float seed, int kind, float scroll) {
  float lvl = max(log2(upx * uRenderPx * STROKE_CELL_CSS / cell), 0.0);
  float lo = floor(lvl), f = lvl - lo, C = cell * exp2(lo);
  vec3 an = abs(n);
  float m = max(an.x, max(an.y, an.z));
  vec3 wts = smoothstep(m - 0.1, m, an);
  wts /= wts.x + wts.y + wts.z;
  float ink = 0.0;
  for (int i = 0; i < 3; i++) {
    if (wts[i] < 0.01) continue;
    vec2 wd = onPlane(t, i);
    wd /= max(length(wd), 1e-4);
    vec2 x = onPlane(P, i) - wd * scroll;
    float sd = seed + float(i) * 7.1 + lo * 3.3;
    float m0 = mark(x, wd, C, upx, sd, share, kind); // the coarser octave only where it blends in (f = 0 at the near clamp, WP30b)
    ink = max(ink, wts[i] * (f > 0.0 ? mix(m0, mark(x, wd, 2.0 * C, upx, sd + 3.3, share, kind), f) : m0));
  }
  return ink;
}

// The current arcs' flow at unit d (tangent, u/s): strongest down each lane's middle, easing in over LANE_TAPER u at
// its ends, as the sim's currentAt; edge: how near a lane's flank d lies.
vec3 laneFlow(vec3 d, out float edge) {
  vec3 flow = vec3(0.0);
  edge = 0.0;
  for (int i = 0; i < MAX_LANES; i++) {
    vec4 N = uLaneN[i];
    if (N.w == 0.0) continue;
    float x = SEA_R * dot(d, N.xyz) / uLaneA[i].w;
    if (abs(x) >= 1.0) continue;
    vec3 a = uLaneA[i].xyz, b = uLaneB[i].xyz;
    if (dot(cross(a, d), N.xyz) < 0.0 || dot(cross(d, b), N.xyz) < 0.0) continue;
    float ends = min(1.0, SEA_R * min(acos(clamp(dot(d, a), -1.0, 1.0)), acos(clamp(dot(d, b), -1.0, 1.0))) / LANE_TAPER);
    flow += normalize(cross(N.xyz, d)) * uLaneB[i].w * (1.0 - x * x) * ends;
    edge = max(edge, smoothstep(0.8, 0.95, abs(x)) * ends);
  }
  return flow;
}

void main() {
  vec3 dir = normalize(vRest);
  vec3 P = dir * SEA_R; // the paper and every mark ride the water
  Paper q = paperAt(P, dir, 1.0);
  vec3 tw = triWeights(dir, 4.0);
  float upx = max(length(dFdx(P)), length(dFdy(P)));
  vec4 f = seaField(dir);
  float wob = tri(tPaper, P / 23.0, tw).b - 0.5; // a broad, world-fixed waver for every drawn edge
  float fine = tri(tPaper, P / 4.1, tw).g - 0.5;  // the nib's own tremor
  float depth = uSeaLevel - f.x, fwD = fwidth(depth);
  float water = smoothstep(-0.6, 0.6, depth / max(fwD, 1e-4));
  vec3 V = cameraPosition - vWorld;
  float dist = length(V);
  V /= dist;
  float far = smoothstep(0.3, 1.0, dist / uHorizon), near = 1.0 - smoothstep(0.25, 0.7, dist / uHorizon);
  float clear = smoothstep(uClear.w - 0.03, uClear.w, dot(dir, uClear.xyz));
  // clear water is graded by depth alone (below), so the sim's lagoon cells never show their straight edges in it
  float lagoon = mix(smoothstep(0.3, 0.7, f.z), 1.0, clear);
  vec3 wind = normalize(cross(uWindAxis, dir) + 1e-6);
  float leadP;
  int pd = planeOf(dir, leadP);
  vec2 xp = onPlane(P, pd), wp = normalize(onPlane(wind, pd) + 1e-6);
  vec2 hc = vec2(dot(xp, wp), dot(xp, vec2(-wp.y, wp.x))) * 1.3, hdx = dFdx(hc), hdy = dFdy(hc);
  float diag = smoothstep(0.0, 0.05, leadP); // marks drawn on one plane thin out along the cube's diagonals

  // the floor, seen through clear water: refracted (n ≈ 4/3) and wavering under the swell's lens, fading with depth;
  // clearest over lagoons and kelp, stirred up in a squall, lost where the surface mirrors at a glance
  vec3 col = parchment(q);
  vec3 vt = V - dir * dot(V, dir);
  float si = length(vt), st = si / 1.33, tt = st * inversesqrt(max(1.0 - st * st, 1e-3)), dd = max(depth, 0.0);
  // the clear water's floor shifted by at most ~1.2 u and its lens gentle, no deeper than 2 u: the shift taken from the
  // depth over the eye's point folded the floor's image where a beach shelves into the deep lagoon, a head drawn twice,
  // mirrored and pulled out into a fin (S-021)
  float shift = dd * tt;
  shift = mix(shift, shift / (1.0 + shift / 1.2), clear);
  vec3 lens = (vNormal - dir) * mix(dd * 1.2, min(dd, 2.0) * 0.3, clear), Pf = P - vt / max(si, 1e-4) * shift + lens;
  vec3 dirF = normalize(Pf);
  // the floor is gone by 110 u (vis): past that, no taps (explicit LOD, safe in a branch; rip's fwidth may jump at the
  // seam, where vis is already 0 — WP30b)
  vec4 ff = vec4(0.0), fl = vec4(0.0);
  float heads = 0.0, headInk = 0.0; // how much of the point a coral head covers (it stands up toward the surface: less
                                      // water over it), and its line work (drawn through the water, not lost in it)
  if (dist < 110.0) { ff = seaField(dirF); fl = cubeAt(tSeaFloor, dirF); }
  float leadF;
  int pf = planeOf(dirF, leadF);
  vec2 x = onPlane(Pf, pf), xdx = onPlane(dFdx(Pf), pf), xdy = onPlane(dFdy(Pf), pf);
  // the sand ripples' crests follow the coast under the surface point, wavering with the lens but not shifted with the
  // depth: over a steep shelf (Spice Harbour's dredged berths) the depth's shift folded the floor's image and the
  // crests closed into concentric target rings (S-022); the clear water's shift is already tempered (S-021)
  float rip = mix(dist < 110.0 ? seaField(normalize(P + lens)).y : 0.0, ff.y, clear) / 0.85 + 0.6 * wob, rw = fwidth(rip);
  // the clear region's chart plane under the floor point (its coral is laid there, unstretched)
  vec2 xc = vec2(dot(Pf, uClearE), dot(Pf, uClearN)), xcx = dFdx(xc), xcy = dFdy(xc);
  float cpx = max(max(length(xcx), length(xcy)), 1e-5);
  float vis = exp(-max(uSeaLevel - ff.x, 0.0) * mix(mix(0.34, 0.17, max(lagoon, fl.g)), 0.12, clear)) * water
            * (1.0 - 0.7 * clear * smoothstep(4.5, 7.5, uSeaLevel - ff.x)) // the floor lost in the clear water's deep
            * (1.0 - pow(1.0 - clamp(dot(V, vNormal), 0.0, 1.0), 5.0)) * (1.0 - 0.6 * uSquall) * (1.0 - smoothstep(30.0, 110.0, dist));
  if (vis > 0.02) {
    float fpx = max(max(length(xdx), length(xdy)), 1e-5), mk = smoothstep(0.0, 0.05, leadF);
    vec2 L = normalize(onPlane(uSun, pf) + 1e-6);
    float n1 = textureLod(tMarks, x / 7.3, 0.0).b, n2 = textureLod(tMarks, x / 2.9 + 0.4, 0.0).g;
    float coral = ff.w, sand = clamp(1.0 - fl.r - fl.g - fl.b - coral, 0.0, 1.0);
    vec3 fc = glaze(col, mix(SAND_T, BLACK_T, fl.a), 0.3 * sand + 0.3 * fl.a, 0.0, q);
    fc = glaze(fc, MUD_T, 0.45 * fl.b, 0.0, q);
    // sand ripples, their crests parallel to the shore, inked, shaded in the lee and breaking off
    // (in the clear water only where each crest stands well apart, and pale: packed crests running away from the eye
    // read as an olive smear down the lagoon, S-021)
    float r = fract(rip), ripples = (sand + 0.5 * fl.b) * smoothstep(mix(2.5, 9.0, clear), mix(5.0, 18.0, clear), 1.0 / max(rw, 1e-5))
              * (1.0 - clear * smoothstep(0.8, 1.6, fpx / max(rw, 1e-6))); // (nor one ripple's lee drawn out over a flat)
    float crest = (1.0 - smoothstep(0.4, 1.2, min(r, 1.0 - r) / max(rw, 1e-5) / uRenderPx)) * step(mix(0.32, 0.45, clear), n2);
    fc = glaze(fc, SAND_T, mix(0.3, 0.2, clear) * smoothstep(0.0, 0.1, r) * (1.0 - smoothstep(0.1, 0.4, r)) * ripples, 0.0, q);
    fc = mix(fc, hatchInk(0.3), mix(0.55, 0.3, clear) * crest * ripples);
    // rock: boulders and ledges cracked apart, hatched on the side turned from the sun
    if (fl.r > 0.0) { // each floor's cells, hatching and marks only where it lies (WP30b)
    float idR;
    vec4 cr = cells(x / 1.8, idR);
    float rock = fl.r * step(0.12, idR), rt = clamp(0.3 + 1.4 * dot(cr.zw, L), 0.0, 1.0);
    float crack = 1.0 - smoothstep(0.4, 1.2, (cr.y - cr.x) * 0.9 / fpx / uRenderPx);
    fc = glaze(fc, ROCK_T, (0.4 + 0.35 * idR) * fl.r, 0.0, q);
    fc = mix(fc, hatchInk(rt), hatching(x * 1.3, xdx * 1.3, xdy * 1.3, 0.85 * rt, 13.0) * rock * mk);
    fc = mix(fc, hatchInk(0.7), 0.85 * crack * fl.r * mk);
    }
    // coral: the reef's heads as an engraver draws them through the water: crowded in patches with bare sand and rubble
    // between, no two alike (a few big bommies, smaller heads gathered round them, each its own size, lobes and wandering
    // edge): brain domes furrowed by meanders, branching thickets stippled with their pale tips, plates, dark soft corals;
    // dimmed by the depth over them (and the water's glaze laid over the floor), the shade glazed, hatched and outlined
    // only while shallow and large enough to read, the outline broken and softening as they lie deeper; a shadow cast on
    // the sand beside (in the clear region on its chart plane, so no head is stretched)
    float cw = max(coral, 0.55 * clear * sand * smoothstep(0.3, 0.7, ff.z)); // the lagoon's sand: patch reefs, sparser
    if (cw > 0.0) {
    bool onChart = clear > 0.0;
    vec2 xr = onChart ? xc : x, Lr = onChart ? normalize(vec2(dot(uSun, uClearE), dot(uSun, uClearN)) + 1e-6) : L;
    vec2 xrx = onChart ? xcx : xdx, xry = onChart ? xcy : xdy;
    float rpx = onChart ? cpx : fpx, mkr = onChart ? 1.0 : mk;
    // (what reads on the page judged by the chart's mean scale per pixel, not its most foreshortened: from a low eye the
    // heads were judged too small for any line, S-021)
    float cpxPx = (onChart ? sqrt(max(length(xcx), 1e-6) * max(length(xcy), 1e-6)) : rpx) * uRenderPx;
    float fdep = max(uSeaLevel - ff.x, 0.0), shallow = 1.0 - smoothstep(0.6, 2.6, fdep), dim = mix(onChart ? 0.85 : 0.5, 1.0, shallow);
    float crowd = smoothstep(0.3, 0.72, textureLod(tMarks, xr / 13.0 + 0.37, 0.0).b + 0.3 * (n1 - 0.5));
    fc = glaze(fc, ROCK_T, 0.16 * cw * crowd * smoothstep(0.45, 0.75, n2) * dim, 0.0, q); // rubble and grit between
    // ink drawn while the head is large on the page; in the clear water softened by the depth over it, never lost
    float inkD = onChart ? mix(1.0, 0.6, smoothstep(1.0, 6.0, fdep)) : shallow;
    // in the clear water a head stands up off the floor: its crown, seen through the water, lies further from the eye
    // than its foot by its height times the refracted ray's slope, so it is drawn as its foot drawn out toward its crown
    // (a mound seen from the side, not a flat disc pressed into the sand)
    vec2 away = onChart ? -normalize(vec2(dot(vt, uClearE), dot(vt, uClearN)) + 1e-6) : vec2(0.0);
    for (int sI = 0; sI < 2; sI++) {
      // each head the union over the cells round the point, so none is clipped to its cell's straight edges (S-021's
      // square tiles); where two meet, the one the point lies deepest in
      float sc = sI == 0 ? 3.4 : 1.15, share = (sI == 0 ? 0.3 + 0.3 * crowd : 0.15 + 0.65 * crowd) * min(1.0, 2.0 * cw);
      vec2 xs = xr / sc + float(sI) * 17.3, ci = floor(xs), cf = fract(xs), o = vec2(0.0);
      float idC = 0.0, rad = 1.0, has = 0.0, shadow = 0.0, best = 1e3, up = 0.0;
      for (int cy = -1; cy <= 1; cy++) {
        for (int cx = -1; cx <= 1; cx++) {
          vec2 g = vec2(float(cx), float(cy)), cid = ci + g;
          float id = hash12(cid + 5.1);
          if (id < 1.0 - share) continue;
          vec2 oo = (cf - g - 0.15 - 0.7 * vec2(hash12(cid), hash12(cid + 17.3))) * sc;
          float rr0 = sI == 0 ? 0.32 + 0.5 * fract(id * 3.7) : 0.1 + 0.3 * pow(fract(id * 3.7), 1.5), kd = fract(id * 7.31);
          // its height (a plate low), and its crown's offset from its foot (within the cells round the point)
          vec2 seg = away * min((kd >= 0.66 && kd < 0.84 && !onChart ? 0.25 : 0.55 + 0.5 * fract(id * 4.3)) * rr0 * min(tt, 1.6), sI == 0 ? 1.2 : 0.45);
          float ts = clamp(dot(oo, seg) / max(dot(seg, seg), 1e-6), 0.0, 1.0);
          vec2 oq = oo - seg * ts;
          float dd0 = length(oq);
          if (dd0 > 1.8 * rr0) continue;
          float rr = rr0 * (0.85 + 0.45 * vnoise(oq / rr0 * 1.4 + id * 91.0) + 0.1 * sin(floor(2.0 + 4.0 * fract(id * 2.9)) * atan(oq.y, oq.x) + id * 41.0));
          shadow = max(shadow, 1.0 - smoothstep(-rpx, rpx, length(oo + Lr * 0.25 * rr) - rr));
          if ((dd0 - rr) / rr < best) { best = (dd0 - rr) / rr; idC = id; o = oq; rad = rr; up = ts; has = 1.0; }
        }
      }
      has *= smoothstep(0.02, 0.08, cw); // (a head is there or not: its coverage is the share's, never a half-strength ghost)
      if (has <= 0.0) continue;
      float d = length(o), th = atan(o.y, o.x), kind = fract(idC * 7.31), tint = fract(idC * 13.7);
      // (in the clear water no plates: seen low across the lagoon their growth rings read as planks, S-021)
      if (onChart && kind >= 0.66 && kind < 0.84) kind = kind < 0.75 ? 0.2 : 0.9;
      float head = has * (1.0 - smoothstep(-rpx, rpx, d - rad));
      shadow *= has * (1.0 - head);
      float shade = clamp(0.4 - 0.9 * dot(o / rad, Lr) + (onChart ? 0.35 * (1.0 - up) * smoothstep(0.0, -0.8, dot(o / rad, away)) : 0.0), 0.0, 1.0);
      float big = smoothstep(5.0, 16.0, rad / cpxPx);
      // its shadow on the sand (in the clear water cool and pale, the water's own colour deepened: never a dark stain)
      fc = glaze(fc, onChart ? mix(ROCK_T, SHELF_T, 0.6) : ROCK_T, (onChart ? 0.16 : 0.4) * shadow * dim, 0.0, q);
      // the living mass: a warm transparent wash over the sand, ochre to rose, mottled (S-021: never a dark pebble)
      fc = glaze(fc, mix(SAND_T, CORAL_T, onChart ? 0.5 + 0.4 * tint : 0.35 + 0.5 * tint), (mix(0.22, 0.36, float(onChart)) + 0.18 * vnoise(xr / 0.3 + idC * 7.0)) * head * dim, 0.0, q);
      float ink = 0.0, pale = 0.0;
      if (kind < 0.36) {
        // a brain or boulder dome: cream to rose or sage, lit on its crown, its meanders wandering across it
        fc = glaze(fc, mix(mix(CREAM_T, CORAL_T, tint), KELP_T, step(0.7, tint) * 0.6), (0.3 + 0.25 * tint) * (0.7 + 0.6 * shade) * head * dim, 0.0, q);
        // (the meanders are contours of a wandering noise, a labyrinth: never parallel planks, S-021)
        float mz = 1.5 * (vnoise(o / (0.35 * rad) + idC * 17.0) + 0.4 * vnoise(o / (0.14 * rad) + idC * 5.0)), lpx = 5.5 / rad * cpxPx;
        ink = head * (1.0 - smoothstep(0.4, 1.1, abs(fract(mz) - 0.5) / lpx)) * smoothstep(2.0, 4.0, 1.0 / lpx) * 0.55 * smoothstep(1.0, 0.75, d / rad);
        if (tint > 0.45) {
          // a boulder coral: knobbed, its lobes rounded and parted by inked clefts (the meanders only on a brain)
          float lid, lsz = 0.3 * rad;
          vec4 lb = cells(o / lsz + idC * 31.0, lid);
          float cleft = (lb.y - lb.x) * 0.5 * lsz / cpxPx;
          fc = glaze(fc, mix(ROCK_T, CORAL_T, 0.4), 0.25 * smoothstep(0.25, 0.75, lb.x) * head * dim, 0.0, q);
          ink = head * (1.0 - smoothstep(0.6, 1.5, cleft)) * smoothstep(2.5, 5.0, lsz / cpxPx) * 0.5 * smoothstep(1.0, 0.8, d / rad);
        }
      } else if (kind < 0.66) {
        // a branching thicket, staghorn seen from above: branches wandering out from its heart and forking past halfway,
        // tapering, dark water between them, inked along their sides, pale growing tips at the rim
        float nb = floor(6.0 + 6.0 * fract(idC * 5.3)), dr = d / rad;
        float sp = th / 6.2832 * nb + 0.8 * vnoise(o / (0.35 * rad) + idC * 11.0) + 0.25 * vnoise(xr / 0.08 + idC * 13.0);
        float f = fract(sp), a = clamp((dr - 0.4) * 0.55, 0.0, 0.24), twig = min(abs(f - 0.5 - a), abs(f - 0.5 + a));
        float wd = 0.2 - 0.09 * dr - 0.5 * a, tpx = cpxPx * nb / (6.2832 * max(d, 0.05 * rad));
        float sres = smoothstep(1.0, 2.5, wd / tpx); // each branch a few pixels across
        float br = head * mix(0.5, 1.0 - smoothstep(wd - tpx, wd + tpx, twig), sres);
        fc = glaze(fc, ROCK_T, 0.18 * (head - br) * dim, 0.0, q);
        fc = glaze(fc, mix(CORAL_T, CREAM_T, tint), (0.35 + 0.2 * tint) * br * dim, 0.0, q);
        ink = 0.4 * head * sres * (1.0 - smoothstep(0.4, 1.3, abs(twig - wd) / tpx)) * step(0.3, dr);
        pale = br * smoothstep(0.75, 0.95, dr) * sres;
      } else if (kind < 0.84) {
        // a plate: flat and pale, a ring of growth, its rim shading the sand below further out
        fc = glaze(fc, mix(TURQ_T, CREAM_T, tint), 0.32 * head * dim, 0.0, q);
        fc = glaze(fc, ROCK_T, 0.2 * shadow * dim, 0.0, q);
        ink = head * (1.0 - smoothstep(0.3, 1.0, abs(fract(d / rad * 3.0 + 0.3 * vnoise(o * 9.0)) - 0.5) * rad / 3.0 / cpxPx)) * 0.25 * big;
      } else {
        // a soft coral or a head furred with turf: sage to lilac, mottled, light under the water, its fingers in clumps
        fc = glaze(fc, mix(KELP_T, CORAL_T, tint), (0.2 + 0.15 * vnoise(xr / 0.12)) * head * dim, 0.0, q);
        float lid, lsz = 0.18 * rad;
        vec4 lb = cells(o / lsz + idC * 23.0, lid);
        fc = glaze(fc, mix(KELP_T, ROCK_T, 0.5), 0.22 * smoothstep(0.3, 0.8, lb.x) * head * dim, 0.0, q);
        ink = head * (1.0 - smoothstep(0.5, 1.3, (lb.y - lb.x) * 0.5 * lsz / cpxPx)) * smoothstep(2.5, 5.0, lsz / cpxPx) * 0.3 * step(0.3, lid);
      }
      // shade glazed on the side turned from the sun; hatched and outlined while large on the page, softer as it lies deeper
      fc = glaze(fc, onChart ? mix(ROCK_T, CORAL_T, 0.35) : ROCK_T, 0.2 * shade * head * dim, 0.0, q);
      float edge = has * (1.0 - smoothstep(onChart ? 0.7 : 0.4, onChart ? 1.8 : 1.2, abs(d - rad) / cpxPx)) * (onChart ? 0.45 + 0.55 * shade : 0.2 + 0.8 * shade) * step(0.35, vnoise(vec2(th * 2.5, idC * 37.0)));
      fc = mix(fc, hatchInk(0.5), hatching(xr * 1.6, xrx * 1.6, xry * 1.6, (onChart ? 0.3 : 0.45) * shade * head, 17.0) * mkr * inkD * big);
      if (onChart) headInk = max(headInk, max(edge * 0.9 * big, ink) * inkD);
      else fc = mix(fc, hatchInk(0.55), max(edge * 0.5 * big, ink) * mkr * inkD);
      fc = mix(fc, LEAD * uPaper / PARCH, 0.45 * pale * inkD);
      heads = max(heads, head);
    }
    }
    // kelp: the forest floor in its own shade, holdfasts and blades swaying with the swell
    if (fl.g > 0.0) {
    fc = glaze(fc, KELP_T, 0.5 * fl.g, 0.0, q);
    fc = glaze(fc, ROCK_T, 0.25 * fl.g * n1, 0.0, q);
    vec2 sway = rot2(0.5 * sin(uTime * 0.8 + dot(x, vec2(0.21, 0.17)))) * normalize(onPlane(wind, pf) + 1e-6);
    float blades = mark(x, sway, 1.1, fpx, 31.0, 0.75, 2) * smoothstep(4.0, 9.0, 1.1 / fpx);
    fc = mix(fc, hatchInk(0.55), 0.8 * blades * fl.g * mk);
    }
    // (a head stands up toward the surface, a bommie to within a fathom: less water over it, so it reads clearer)
    col = mix(col, fc, min(1.0, vis * (1.0 + 0.7 * heads)));
    col = mix(col, hatchInk(0.55), headInk * min(1.0, 2.2 * vis));
    heads *= vis;
  }

  // depth washes: the swell's faces turned from the sun take a little more, the far sea pales toward the horizon
  // fine, even washes (S-002): the paper's mottle and blooms only breathe in them, never blotch
  float tone = clamp(1.0 - 1.4 * dot(vNormal - dir, uSun), 0.88, 1.14) * (1.0 - 0.5 * far);
  Paper qs = q;
  qs.mottle = 0.5 + 0.3 * (q.mottle - 0.5);
  qs.bloom = 0.5 + 0.3 * (q.bloom - 0.5);
  vec2 sh = layer(depth, fwD), shEnd = layer(16.0 + 4.0 * wob - depth, fwD);
  vec2 shelf = layer(depth - 3.0 - 1.5 * wob, fwD), deep = layer(depth - 24.0 - 2.5 * wob, fwD);
  col = glaze(col, SHALLOWS_T, SHALLOWS_D * tone * sh.x * shEnd.x * (1.0 - lagoon), 0.5 * shEnd.y + 0.3 * sh.y, qs);
  col = glaze(col, SHELF_T, SHELF_D * tone * shelf.x * (1.0 - lagoon), 0.4 * shelf.y, qs);
  col = glaze(col, DEEP_T, DEEP_D * tone * deep.x, 0.25 * deep.y, qs);
  col = glaze(col, LAGOON_T, LAGOON_D * tone * lagoon * sh.x * (1.0 - 0.5 * heads), 0.0, qs);
  // clear tropical water: palest over the sand at the beach, turquoise through the lagoons and over the reef flats, then
  // down the drop-off ultramarine laid from a wavering edge where the drying wash pooled (each reef drawn round by its
  // own contour), and the turquoise let go at a second edge farther out; a low eye sees more sky in it
  vec2 drop = layer(depth - 4.8 - 0.9 * wob - 0.4 * fine, fwD), open = layer(depth - 15.0 - 4.0 * wob, fwD);
  if (clear > 0.0) {
    float glance = 0.6 + 0.4 * smoothstep(0.02, 0.3, dot(V, dir));
    // inside a ring (the lagoon cells, blurred over ~5 u so their edges never show) the deep water darkens softly, with
    // no drawn edge: the sim's flat lagoon floor and carved throats would ink straight-edged contours
    vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
    float ring = 0.2 * (f.z + seaField(normalize(dir + t1 * (2.6 / SEA_R))).z + seaField(normalize(dir - t1 * (2.6 / SEA_R))).z
                      + seaField(normalize(dir + t2 * (2.6 / SEA_R))).z + seaField(normalize(dir - t2 * (2.6 / SEA_R))).z);
    ring = smoothstep(0.15, 0.85, ring);
    float dk = mix(drop.x, 0.75 * smoothstep(3.5, 10.0, depth + 1.5 * wob), ring);
    // (the deep reads dark even to a low eye: a pass's water is the one dark way through the pale reef)
    float turq = smoothstep(0.0, 0.9, depth) * (0.42 + 0.26 * smoothstep(1.0, 4.0, depth)) * (1.0 - 0.7 * dk) * (1.0 - open.x);
    col = glaze(col, TURQ_T, clear * water * glance * turq * tone * (1.0 - 0.55 * heads), 0.6 * open.y, qs);
    col = glaze(col, SHELF_T, clear * water * mix(glance, 1.0, 0.6) * 0.42 * dk * (1.0 - 0.35 * open.x), 0.4 * drop.y * (1.0 - ring), qs); // a soft pooled edge, never a sticker's outline
  }
  // the swell's backs, turned from the sun, take one more glaze laid with a frilled, pooled edge: brushed bands
  float back = -10.0 * dot(vNormal - dir, uSun) + 0.2 * (q.mottle - 0.5);
  vec2 band = layer(back - 0.3, fwidth(back));
  col = glaze(col, SHELF_T, 0.08 * band.x * water * (1.0 - far) * (1.0 - uCalm), 0.5 * band.y, qs);
  col = glaze(col, MUD_T, 0.25 * uSquall * water * (1.0 - far), 0.0, q); // a squall greys the sea
  // the sea the storm holds (outside its calm) heaves grey under it
  float stormSea = 1.0 - smoothstep(uStormCalm.w - 0.004, uStormCalm.w + 0.002, dot(dir, uStormCalm.xyz));
  col = glaze(glaze(col, MUD_T, 0.4 * stormSea * water, 0.0, q), DEEP_T, 0.3 * stormSea * water, 0.0, q);
  // the swell read as form: its backs hatched along the crests
  float backT = clamp(-6.0 * dot(vNormal - dir, uSun) - 0.1, 0.0, 1.0) * water * near * (1.0 - uCalm) * diag;
  col = mix(col, hatchInk(0.35), 0.55 * hatching(hc, hdx, hdy, 0.42 * backT, 5.0));

  // golden hour (uLow): the water gives back the sky. Each facet mirrors the sky along the reflected ray, washed as the
  // sky is (render/sky.ts): high, the cool zenith; low toward the sun, the hour's glow and pale gold; low away from it,
  // the cooler sky. That reflection takes the place of the water's own colour as the eye's glance grows shallower (never
  // laid over it: complementary washes would mix to mud), so toward the sun the water is the glowing sky and away from
  // it slate-blue; clear shallows keep their own colour under it, warmed a little. (Nothing at midday or by night.)
  float sunUp = smoothstep(-0.03, 0.04, dot(uSunDisc, dir)) * uLow * water;
  if (uLow > 0.001) {
    vec3 up0 = normalize(cameraPosition), rv = reflect(-V, vNormal);
    float el = dot(rv, up0), dip = sqrt(max(1.0 - pow(SEA_R / max(length(cameraPosition), SEA_R), 2.0), 0.0));
    vec3 hs = normalize(uSunDisc - up0 * dot(uSunDisc, up0) + 1e-6), hr = normalize(rv - up0 * el + 1e-6);
    float az = dot(hr, hs) * 0.5 + 0.5;                                  // 1 toward the sun's bearing, 0 away
    float dz = 0.06 + 0.94 * (1.0 - exp(-max(el + dip, 0.0) * 2.4));     // the zenith's wash over the horizon's
    dz = mix(dz, max(dz, 0.85), smoothstep(0.55, 0.1, az));              // the sky away from a low sun is the cooler
    vec3 sky = uSkyHorizon * pow(max(uSkyZenith / max(uSkyHorizon, vec3(1e-3)), vec3(1e-3)), vec3(dz));
    float glow = az * az * (1.0 - smoothstep(-0.04, 0.3, el - 0.22 * pow(az, 4.0))) * smoothstep(-0.25, 0.05, dot(uSunDisc, up0));
    sky = mix(sky, uSkyGlow, glow); // (the pale gold round the sun's own image is the glitter path's, below)
    sky *= 0.84; // (a reflection is always a little deeper than the sky it gives back; only the glitter is brighter)
    // how much of the sky the water gives back: a quarter looking down into it, nearly all at a glance; the glow, far
    // brighter than the water's body, takes its place sooner
    float cv = clamp(dot(V, vNormal), 0.0, 1.0), fr = 0.25 + 0.75 * pow(1.0 - cv, 3.0);
    float shallowClear = clear * (1.0 - smoothstep(4.0, 12.0, depth));
    float give = uLow * water * min(mix(fr, max(fr, 0.85), glow) * (1.0 - 0.75 * shallowClear), 0.92);
    col = mix(col, sky * parchment(qs) / uPaper, give);
    col = wash(col, uSunTint, 0.35 * uLow * water * shallowClear);      // the clear shallows, warmed a little
  }

  // a calm lays the sea flat as a mirror: the sky's wash, and islands and ships drawn upside down in it, broken by
  // ripple strokes (the reflected ray is marched over the height field; ships are the wakes' hulls, with masts)
  if (uCalm > 0.01) {
    vec3 rv = reflect(-V, vNormal);
    float e = max(dot(rv, dir), 0.02), te = e * inversesqrt(max(1.0 - e * e, 1e-4));
    vec3 az = normalize(rv - dir * dot(rv, dir) + 1e-6);
    float land = 0.0, s = 0.5;
    for (int i = 0; i < 10; i++) {
      s *= 1.55;
      if (seaField(normalize(P + az * s)).x - uSeaLevel - s * s / (2.0 * SEA_R) > s * te * (1.0 + 0.25 * fine)) { land = 1.0; break; }
    }
    float hull = 0.0, sail = 0.0, mast = 0.0;
    for (int k = 0; k < WAKE_SHIPS; k++) {
      vec4 S = uShips[k];
      if (S.w <= 0.0) continue;
      vec3 rel = S.xyz - P;
      float along = dot(rel, az);
      if (along <= 0.0 || along > 80.0) continue;
      float lat = length(rel - az * along - dir * dot(rel, dir)), h = along * te, sh2 = (h - 1.1) / (S.w - 1.1);
      hull = max(hull, step(h, 1.0) * step(lat, 1.4 - 0.5 * h));
      sail = max(sail, step(0.0, sh2) * step(sh2, 0.85) * step(lat, 1.8 * (1.0 - 0.7 * sh2)));
      mast = max(mast, step(h, S.w) * step(lat, 0.07));
    }
    float rr = dist * 2.2 + 2.0 * wob + 0.9 * fine;
    float gap = smoothstep(0.62, 0.7, fract(rr)) * smoothstep(3.0, 6.0, 1.0 / max(fwidth(rr), 1e-5));
    float calm = uCalm * water, keep = 1.0 - 0.85 * gap, fr = 0.3 + 0.7 * pow(1.0 - clamp(dot(V, vNormal), 0.0, 1.0), 3.0);
    col = mix(col, mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.5, e)) * parchment(q) / uPaper, 0.5 * fr * calm);
    // (in the clear tropical water the land's image is pale and broken by the ripple: no dark smear down the lagoon)
    float landK = land * keep * calm * mix(0.85, 0.3 * smoothstep(-0.1, 0.15, fine), clear);
    col = glaze(col, mix(mix(ROCK_T, KELP_T, 0.45), KELP_T, clear), landK, 0.3 * land * calm * (1.0 - clear), q);
    col = glaze(col, SAND_T, 0.4 * sail * keep * calm, 0.0, q);
    col = mix(col, hatchInk(0.75), max(hull, mast) * keep * calm * 0.8);
    col = mix(col, hatchInk(0.3), 1.4 * gap * (1.0 - gap) * calm * near * (0.25 + 0.75 * max(land, max(hull, sail))));
  }

  // current lanes: fast lanes of ink streaks and foam running with the flow, a faint glaze down their length
  float edge, laneInk = 0.0, laneFoam = 0.0;
  vec3 flow = laneFlow(dir, edge);
  float sp = length(flow);
  if (sp > 0.02) {
    vec3 fd = flow / sp;
    float kl = smoothstep(0.02, 0.5, sp) * water;
    col = glaze(col, SHELF_T, 0.1 * kl, 0.0, q);
    if (near > 0.0) {
      laneInk = kl * near * marks(P, dir, fd, upx, 1.5, 0.55, 41.0, 1, uTime * (1.0 + 2.0 * sp));
      laneFoam = kl * near * max(marks(P, dir, fd, upx, 0.9, 0.3, 57.0, 1, uTime * (1.4 + 2.5 * sp)), edge * step(0.05, fine));
    }
  }

  // WP20's territory: the owner's wash with a wavering pooled edge, granulating, a narrow hatched band inside the
  // border and the border inked in the owner's pigment. Its moments: a claim floods in from its trail as a wet wash
  // behind a wavering front with a dark pooled rim, granulating, drying to the flat tint before the border and its
  // hatching are inked; sea the storm swallows or a wreck frees runs, thins and washes out.
  if (uTerritory > 0.0) {
    vec4 tt = cubeAt(tTerritory, dir), fl = cubeAt(tFlood, dir);
    float own = tt.a - 0.5 + 0.1 * wob, wet = 0.0, thin = 1.0;
    float runs = 0.45 * (tri(tPaper, P / 6.0, tw).g - 0.5) + 0.25 * tri(tPaper, P / 1.9, tw).b;
    if (fl.b > 0.01) {
      vec4 ev = uFlood[int(fl.g / fl.b * 7.97 + 0.5)];
      float r = fl.r / fl.b, inside = smoothstep(0.3, 0.8, fl.b);
      if (ev.x > 0.5 && ev.x < 1.5) {
        float lag = ev.y - r * ev.z + (2.0 * wob + 1.5 * (q.bloom - 0.5)) * min(0.12 * ev.z, 2.5);
        own = mix(own, min(own, 0.3 * lag), inside);
        wet = (1.0 - ev.w) * inside * exp(-max(lag, 0.0) / (1.5 + 0.1 * ev.z));
      } else if (ev.x > 1.5) {
        float due = 0.12 + 0.5 * r + runs;
        own = mix(own, min(own, 2.5 * (due - ev.y)), inside);
        thin = 1.0 - 0.75 * inside * smoothstep(due - 0.45, due, ev.y);
        tt.rgb = mix(tt.rgb, vec3(1.0), 0.4 * (1.0 - thin));
      }
    }
    float fo = fwidth(own), dry = 1.0 - smoothstep(0.04, 0.35, wet);
    vec2 lay = layer(own, fo);
    float td = TERRITORY_D * thin * (1.0 + 1.3 * wet + 1.6 * wet * (q.grain - 0.4));
    col = glaze(col, tt.rgb, td * lay.x * water, (0.6 + 3.0 * wet) * lay.y, q);
    float hb = 0.5 * dry * thin * lay.x * (1.0 - smoothstep(0.0, 0.3, own)) * water; // hatching takes no implicit derivatives
    if (hb > 0.0) col = mix(col, hatchInk(0.3), hb * hatching(hc, hdx, hdy, 0.4, 19.0));
    float bw = 0.9 * uRenderPx;
    col = mix(col, wash(uPaper, tt.rgb, 2.2), 0.85 * dry * thin * water * (1.0 - smoothstep(bw - 0.5, bw + 0.5, abs(own) / max(fo, 1e-5))));
  }

  // coast rings, fading outward and wherever they would pack tighter than a few pixels
  float rx = log(max(1.0 + (f.y + 0.35 * wob + 0.12 * fine - RING0) / RING_D, 0.3)) / log(RING_G), fx = fwidth(rx);
  float kr = floor(rx + 0.5), rw2 = RING_CSS * uRenderPx * (1.0 - 0.08 * kr);
  float ring = (1.0 - smoothstep(rw2 - 0.5, rw2 + 0.5, abs(rx - kr) / max(fx, 1e-5))) * step(-0.5, kr) * step(kr, RINGS - 0.5)
             * pow(0.8, max(kr, 0.0)) * (0.75 + 0.6 * fine) * smoothstep(2.5, 5.0, 1.0 / max(fx, 1e-5)) * water * (1.0 - far);
  // (chart notation: over clear water a low eye sees through, depth grades in the washes, never in beaded rings)
  ring *= mix(1.0, smoothstep(10.0, 24.0, length(cameraPosition) - SEA_R - uSeaLevel), clear);
  float cw = COAST_CSS * uRenderPx;
  float coast = 1.0 - smoothstep(cw - 0.5, cw + 0.5, abs(depth) / max(fwD, 1e-4));
  // foam: a fringe at the waterline, bores running in to it, the reef crests breaking as the swell lifts, and lace —
  // the foam's net of bubbles over the reefs and in the shore's wash, pulsing with the swell
  float shore = depth / max(fwD / upx, 0.02); // u to the waterline
  float run = fract(uTime / 6.5 + wob * 1.7);
  float bore = (1.0 - smoothstep(0.0, 0.3, abs(f.y - mix(2.8, 0.0, run)))) * sin(run * 3.14159) * smoothstep(3.5, 0.5, depth);
  // (on a reef the waterline is the awash flat's lip, inked light and broken and its fringe thin, away from the motus'
  // beaches: the terrain inks each beach's foot, so the islets are drawn round, never the atoll as one ring, S-021)
  float off = (f.w > 0.02 && depth > -0.5 && shore < 1.2) ? offBeach(dir, f) : 0.0;
  if (off > 0.0) coast *= lipInk(dir, off);
  float foam = max((1.0 - smoothstep(0.15, 0.7 + 0.4 * wob, shore)) * (1.0 - 0.55 * off), 0.75 * bore) * water;
  // surf: along every reef's seaward front the swell comes in as pen lines, rears into a green face, breaks white and
  // spills over the reef set after set, in long lines broken along their length and peeling down the reef, the spent
  // foam left behind each line in lace; far off the break draws together into one broken ribbon of lead white along
  // the reef's edge. The lagoons lie calm: the break stands only where deep water lies a few u seaward.
  vec2 xs = clear > 0.0 ? vec2(dot(P, uClearE), dot(P, uClearN)) : xp;
  float fwY = max(fwidth(f.y), 1e-4), surf = 0.0, face = 0.0, swellInk = 0.0, keel = 0.0, surfInk = 0.0;
  if (f.w > 0.02 && f.y < SURF_REACH && depth > -0.4) {
    vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
    vec2 g = vec2(seaField(normalize(dir + t1 * (0.8 / SEA_R))).y, seaField(normalize(dir + t2 * (0.8 / SEA_R))).y) - f.y;
    vec3 seaward = normalize(t1 * g.x + t2 * g.y + dir * 1e-5);
    vec4 fo = seaField(normalize(dir + seaward * (SURF_OUT / SEA_R)));
    float exposed = f.w * smoothstep(SURF_DEEP.x, SURF_DEEP.y, uSeaLevel - fo.x) * smoothstep(SURF_STRIKE.x, SURF_STRIKE.y, f.x);
    // (a lagoon's side lies calm: no break where the water seaward, near or farther out, is a lagoon)
    if (exposed > 0.0) exposed *= 1.0 - smoothstep(0.2, 0.6, max(fo.z, seaField(normalize(dir + seaward * (SURF_FAR / SEA_R))).z));
    if (exposed > 0.0) {
      float s = f.y + 0.3 * wob + 0.08 * fine, detail = 1.0 - smoothstep(0.06, 0.22, upx);
      for (int k = 0; k < 3; k++) {
        float fk = float(k), t = uTime / 7.5 + fk / 3.0 + 0.45 * wob + 0.25 * vnoise(xs / 11.0 + fk * 3.1);
        float ph = fract(t), sk = mix(7.0, -3.2, ph), set = floor(t);
        float broke = smoothstep(2.0, 0.6, sk), spent = 1.0 - smoothstep(-1.4, -3.0, sk);
        // long lines with gaps where the reef bends or the swell slackens, new for every set
        float run = smoothstep(0.3, 0.42, vnoise(xs / 4.5 + vec2(fk * 7.7 + set * 3.3, set * 1.9)));
        float lineD = s - sk, back = 0.2 + 1.7 * broke * smoothstep(2.0, -1.5, sk);
        float lace = vnoise(xs / 0.45 + fk * 5.0 + set);
        float body = smoothstep(-fwY, fwY, lineD) * (1.0 - smoothstep(back * (0.25 + 0.75 * lace), back, lineD));
        surf = max(surf, body * broke * spent * run);
        // the pen along each broken line's crest, where it curls over, broken along its length; gone as it is spent
        surfInk = max(surfInk, (1.0 - smoothstep(0.5, 1.3, abs(lineD) / fwY / uRenderPx)) * broke * smoothstep(-1.0, 1.0, sk) * run
                               * step(0.32, vnoise(xs / 1.4 + vec2(fk * 2.1 + set * 1.7, set))));
        face = max(face, smoothstep(-0.55 - 0.3 * broke, -0.05, lineD) * step(lineD, 0.0) * smoothstep(4.0, 1.6, sk) * (1.0 - broke) * run);
        swellInk = max(swellInk, (1.0 - smoothstep(0.5, 1.3, abs(lineD) / fwY / uRenderPx)) * smoothstep(7.0, 5.5, sk) * (1.0 - smoothstep(3.5, 1.8, sk)) * run);
      }
      // the break far off: one ribbon along the reef's edge, broken only now and then (a line, never specks)
      // (no thinner than a few px from high)
      float rw = max(0.9, 5.0 * upx);
      float ribbon = (1.0 - smoothstep(rw, rw + 1.0 + upx, abs(s - 0.4))) * smoothstep(0.2, 0.34, vnoise(xs / 3.0));
      // (its seaward edge drawn: a broken pen line where the swell rears)
      float ribbonInk = (1.0 - smoothstep(0.5, 1.2, abs(s - 0.4 - rw) / fwY / uRenderPx)) * smoothstep(0.24, 0.4, vnoise(xs / 3.0 + 7.0));
      surf = mix(ribbon * 0.85, surf, detail) * exposed;
      surfInk = mix(0.6 * ribbonInk, surfInk, detail) * exposed;
      face *= exposed * detail;
      swellInk *= exposed * detail * near;
    }
  }
  // off a beach (a gentle shore near the eye, not a cliff's foot nor a reef's lip): the shore break's foam lies in
  // scallops along the water's edge between the beach's cusps, its seaward edge the waterline's pen, wavering and broken,
  // never ruled; broken lace drifts off it; the swell's last ripples come in as short pen strokes along the shore,
  // closing up as the water shoals, broken along their length (S-022)
  // (the shore's distance and slope from the floor's rise over a pace or so, never from the pixel's own derivatives,
  // which step from texel to texel and speckle at a low eye)
  float gentle = 0.0, ripple = 0.0, shoreLace = 1.0 - smoothstep(0.3, 1.1, shore);
  // (a deck-level eye's detail: from higher the chart's coast rings and the foam band draw the shore, as in the Amber
  // Shoals' flats)
  float deckEye = 1.0 - smoothstep(4.0, 7.0, length(cameraPosition) - SEA_R - uSeaLevel);
  if (depth < 3.5 && f.w < 0.2 && upx < 0.09 && water > 0.01 && deckEye > 0.01) {
    vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
    const float E = 0.7 / SEA_R;
    vec2 rise = vec2(seaField(normalize(dir + t1 * E)).x - seaField(normalize(dir - t1 * E)).x, seaField(normalize(dir + t2 * E)).x - seaField(normalize(dir - t2 * E)).x);
    float slopeS = length(rise) / 1.4, sd = depth / max(slopeS, 0.04);
    gentle = (1.0 - smoothstep(0.9, 1.4, slopeS)) * (1.0 - smoothstep(0.02, 0.2, f.w)) * (1.0 - smoothstep(0.03, 0.09, upx)) * deckEye;
    if (gentle > 0.01) {
      float fs = max(fwidth(sd), 1e-4);
      float bayS = min(1.0, abs(vnoise(xs / 1.9 + 3.3) - 0.5) * 4.4), pulse = 0.85 + 0.15 * sin(uTime * 0.95 + 9.0 * wob);
      float sw = max((0.06 + 0.22 * bayS) * pulse + 0.03 * fine, 2.0 * fs), edgeD = sd - sw;
      // (solid at the water's edge, broken into foam and bubbles out to its scalloped edge)
      float lens = (1.0 - smoothstep(-fs, fs, edgeD - max(0.05, 3.0 * fs) * (vnoise(xs / 0.5) - 0.5)))
                 * max(1.0 - smoothstep(0.2 * sw, 0.45 * sw, sd), smoothstep(0.42, 0.58, vnoise(xs / 0.28 + vec2(0.0, uTime * 0.1)) + 0.25 * fine));
      foam = mix(foam, max(lens, 0.75 * bore) * water, gentle);
      float edgeInk = (1.0 - smoothstep(cw - 0.5, cw + 0.5, abs(edgeD) / fs)) * smoothstep(0.25, 0.45, vnoise(xs / 1.1 + 5.0));
      coast = mix(coast, 0.8 * edgeInk, gentle);
      shoreLace = mix(shoreLace, (1.0 - smoothstep(sw + 0.1, sw + 0.6, sd)) * smoothstep(0.4, 0.6, vnoise(xs / 1.4 + wp * uTime * 0.05 + 2.0))
                  * (1.0 - smoothstep(0.05, 0.1, fs)), gentle);
      // the ripples: crests at whole phases, closer as the water shoals, running in with the swell, each drawn as short
      // strokes swelling and thinning along it, a second set between them lighter and sparser
      float ph = sqrt(max(edgeD, 0.0) + 0.3) * 4.2 + uTime / 3.4 + 0.5 * wob, wph = max(fwidth(ph), 1e-5);
      for (int k = 0; k < 2; k++) {
        float pk = ph + 0.5 * float(k), ci = floor(pk + 0.5);
        float env = smoothstep(0.42 + 0.08 * float(k), 0.62, vnoise(xs / 0.32 + vec2(ci * 7.3 + float(k) * 19.0, ci * 3.1)));
        ripple = max(ripple, (1.0 - smoothstep(0.6 * env, 0.6 * env + 0.9, abs(pk - ci) / wph / uRenderPx)) * step(0.02, env) * (1.0 - 0.4 * float(k)));
      }
      ripple *= gentle * smoothstep(0.15, 0.6, edgeD) * (1.0 - smoothstep(4.5, 8.0, sd)) * near * (1.0 - smoothstep(0.2, 0.4, wph));
    }
  }
  // lace over every reach of reef a keel would strike at this tide, drifting and pulsing with the swell; far off, a pale
  // stipple of it; in the shore's wash only a narrow band off the fringe, thinning out from it (no threads lie loose on
  // the still water beyond)
  float laceZone = max(f.w * (1.0 - smoothstep(SURF_LACE.x, SURF_LACE.y, depth)) * mix(near, 1.0, clear), shoreLace * near) * water * mix(diag, 1.0, clear);
  if (laceZone > 0.02) {
    // the net's threads are the walls between bubbles: bent (the cells looked up through a slow warp, never the straight
    // bisectors of a Voronoi net, which read as cracked glass, S-020), swelling and thinning along their length and
    // broken into runs, so no wall runs straight into a Y
    float idL, lcell = 0.8 * max(1.0, upx * uRenderPx * 6.0 / 0.8);
    vec2 lx = xs / lcell + wp * uTime * 0.05;
    lx += 0.5 * vec2(vnoise(lx * 0.6 + 3.7), vnoise(lx * 0.6 + 11.3)) + 0.32 * vec2(vnoise(lx * 1.7 + 7.9), vnoise(lx * 1.7 + 1.3)) - 0.41;
    vec4 cl = cells(lx, idL);
    float thread = vnoise(lx * 2.3 + 5.0 * idL), wall = (cl.y - cl.x) * lcell * 0.5 / upx / uRenderPx / (0.6 + 0.8 * thread);
    float net = (1.0 - smoothstep(0.4, 1.2, wall)) * smoothstep(0.32, 0.5, thread) * (0.55 + 0.45 * sin(uTime * 0.9 + 6.0 * wob + 3.0 * idL));
    keel = f.w * (1.0 - smoothstep(SURF_LACE.x, SURF_LACE.y, depth)) * water;
    foam = max(foam, laceZone * net * mix(1.0, 0.7, keel));
  }
  // foam's and drift's tMarks taps only where they can show (explicit gradients, so in a branch — WP30b)
  vec3 pl = P / 2.3, pb = (P + wind * uTime * 0.3) / 3.3, plx = dFdx(pl), ply = dFdy(pl), pbx = dFdx(pb), pby = dFdy(pb);
  float lead = 0.0;
  if (foam > 0.0) lead = smoothstep(0.42, 0.62, foam * (0.5 + 0.55 * q.grain + 0.45 * triGrad(tMarks, pl, tw, plx, ply).b));
  // drift lines: broken threads of foam lying along the shore, drifting downwind
  float fy = max(fwidth(f.y), 1e-5) * uRenderPx, drift = 0.0;
  float d1 = 1.0 - smoothstep(0.3, 1.0, abs(f.y - 1.4 - 0.6 * wob) / fy), d2 = 0.6 * (1.0 - smoothstep(0.3, 0.9, abs(f.y - 2.7 - 0.9 * wob) / fy));
  float dk = water * near * smoothstep(0.3, 1.0, depth) * (1.0 - lead);
  if (max(d1, d2) * dk > 0.0) {
    float br = triGrad(tMarks, pb, tw, pbx, pby).g;
    drift = max(d1 * step(0.45, br), d2 * step(0.5, br)) * dk;
  }

  // wave strokes ride the crests downwind at two scales, thinning toward the horizon; crests break white as the wind
  // rises; a squall drives spindrift down the wind in streaks
  float riding = mix(0.6, 1.0, smoothstep(-0.4, 0.6, vLift)) * water * smoothstep(0.8, 2.5, depth) * near * (1.0 - lead);
  // (each set is drawn only where it can show: marks take no derivatives, so they may sit in a branch — WP30a)
  float waves = 0.0, caps = 0.0, crestK = smoothstep(0.1, 0.6, vLift), capK = riding * smoothstep(0.3, 0.8, vLift);
  // a lagoon inside its reef is sheltered: the open sea's strokes give way to small close-set wavelets, lighter
  float sheltered = clear * smoothstep(0.3, 0.7, f.z);
  if (riding > 0.0) {
    waves = marks(P, dir, wind, upx, STROKE_CELL, uStrokes, 0.0, 0, 0.0);
    if (crestK > 0.0) waves = max(waves, crestK * marks(P, dir, wind, upx, 2.8 * STROKE_CELL, 0.5 * uStrokes, 13.0, 0, 0.0));
    if (sheltered > 0.0) waves = mix(waves, 0.6 * marks(P, dir, wind, upx, 0.45 * STROKE_CELL, min(1.0, 1.4 * uStrokes), 31.0, 0, 0.0), sheltered);
    waves *= riding;
    if (capK > 0.0) caps = capK * marks(P, dir, wind, upx, 1.7 * STROKE_CELL, uCaps, 23.0, 0, 0.0);
  }
  float spin = uSquall > 0.01 ? uSquall * water * near * marks(P, dir, wind, upx, 1.8, 0.45, 67.0, 1, uTime * 3.0) : 0.0;

  vec3 white = leadWhite(), pen = penInk();
  col = mix(col, hatchInk(0.45), ring * 0.85);
  col = mix(col, white, lead * 0.9);
  col = glaze(col, TURQ_T, 0.55 * face, 0.0, q);
  col = mix(col, hatchInk(0.4), 0.35 * face * hatching(hc, hdx, hdy, 0.5, 29.0));
  col = mix(col, pen, swellInk * 0.6);
  // the surf's white is the paper's, laid thin over the water, under its pen line
  col = mix(col, mix(parchment(q) * 1.03, white, 0.35), smoothstep(0.25, 0.55, surf * (0.6 + 0.5 * q.grain)) * 0.8);
  col = mix(col, pen, surfInk * 0.8);
  col = mix(col, white, drift * 0.7);
  col = mix(col, pen, laneInk * 0.8);
  col = mix(col, white, laneFoam * 0.85);
  col = mix(col, pen, waves * 0.95);
  col = mix(col, pen, ripple * (1.0 - lead) * 0.75);
  col = mix(col, white, max(caps * 0.95, spin * 0.6));
  col = mix(col, uInk, coast * 0.9);
  // the far sea goes into the sky's horizon wash (render/sky.ts lays the same), so sea and sky meet at every hour
  col = mix(col, uSkyHorizon * parchment(q) / uPaper, far * far * 0.6);
  // the glitter path up the water to a low sun: short broken strokes across the path, gold leaf at its heart and ink at
  // its flanks, lit only where a facet of the swell turns the sun's image to the eye (they come and go as the swell runs
  // under them), over a pale gold sheen; the path narrows to the horizon (the facets' slopes, about 0.22, set its width)
  if (sunUp > 0.001) {
    vec3 Hs = normalize(V + uSunDisc);
    float ch = max(dot(Hs, vNormal), 0.05), tn2 = (1.0 - ch * ch) / (ch * ch);
    float path = exp(-tn2 / 0.05) * sunUp * (1.0 - lead) * (1.0 - coast);
    if (path > 0.01) {
      vec3 toward = normalize(uSunDisc - dir * dot(uSunDisc, dir) + 1e-6); // strokes lie across the path
      // (glints are small, close-set and bold: the marks' cells at a third to a half of the wave strokes', broader strokes)
      float gold = marks(P, dir, toward, 0.35 * upx, 0.6 * STROKE_CELL, clamp(1.8 * path - 0.1, 0.0, 0.95), 41.0, 0, 0.0) * diag;
      float dark = marks(P, dir, toward, 0.6 * upx, 0.6 * STROKE_CELL, 0.75 * smoothstep(0.03, 0.25, path) * (1.0 - 0.7 * smoothstep(0.45, 0.85, path)), 53.0, 0, 0.0) * diag * (1.0 - gold);
      col = mix(col, SUN_GOLD * parchment(q) / uPaper, 0.3 * smoothstep(0.3, 0.9, path));
      col = mix(col, pen, 0.75 * dark);
      // (gold leaf: burnished at the path's flanks, bright where it catches the sun at its heart)
      col = mix(col, mix(mix(LEAF_LO, LEAF_HI, smoothstep(0.05, 0.3, path)), LEAF_GLINT, clamp(path + fine, 0.0, 1.0)), gold * smoothstep(0.08, 0.3, path));
    }
  }
#ifdef HEADS_PROBE
  outColor = vec4(heads, 0.0, 0.0, 1.0); outAux = vec4(0.0); return; // tests: how much of each point a coral head covers
#endif
  writeInk(candle(col, vWorld), normalize(dir + 0.3 * (vNormal - dir)), (off > 0.0 ? lipInk(dir, off) : 1.0) * (1.0 - 0.85 * gentle)); // (the composite's line where sea meets reef as light)
}
`;

const WAKE_VERTEX = /* glsl */ `
${SWELL_GLSL}
uniform float uTime;
uniform float uStill[${WAKE_SHIPS}]; // when each slot's ship stopped (sank), s; −1 under way
in vec4 aFwd;  // the heading at the point (tangent), and the u its ship had sailed there
in vec4 aWake; // side (−1, 1), birth s, speed u/s, half-width at birth u
out vec3 vRest;
out vec3 vWorld;
out vec2 vUv;
out float vAge;
out float vSpeed;
out float vDie;
void main() {
  vec3 dir = normalize(position);
  float age = max(uTime - aWake.y, 0.0), still = uStill[gl_VertexID / ${2 * WAKE_PTS}];
  // the Kelvin wedge opening at ~20°; once her way is lost it opens no further and the whole ribbon dies away
  float open = still < 0.0 ? age : min(age, max(still - aWake.y, 0.0));
  float hw = aWake.w + min(0.36 * aWake.z * open, 7.0);
  vDie = still < 0.0 ? 1.0 : 1.0 - smoothstep(0.0, ${WAKE_DIE.toFixed(1)}, uTime - still);
  vec3 side = cross(dir, aFwd.xyz);
  side /= max(length(side), 1e-6);
  vec3 p = normalize(dir * SEA_R + side * aWake.x * hw);
  vec4 f = seaField(p);
  vec3 n;
  float lift;
  vec3 d = swell(p, uTime, swellAmp(uSeaLevel - f.x), n, lift);
  vRest = p;
  vWorld = p * (SEA_R + uSeaLevel) + d;
  vUv = vec2(aWake.x, aFwd.w);
  vAge = age;
  vSpeed = aWake.z;
  // depth-tested a little nearer the eye than the water it lies on (its ribbon is coarser than the sea's mesh), so
  // hulls and headlands in front still hide it
  vec3 e = cameraPosition - vWorld;
  float de = length(e);
  vec4 c = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  vec4 nearer = projectionMatrix * viewMatrix * vec4(vWorld + e * (min(0.4 + 0.01 * de, 0.5 * de) / de), 1.0);
  gl_Position = vec4(c.xy, nearer.z / nearer.w * c.w, c.w);
}
`;

const WAKE_FRAGMENT = /* glsl */ `
in vec3 vRest;
in vec3 vWorld;
in vec2 vUv;
in float vAge;
in float vSpeed;
in float vDie;
${INKS}
const float SEA_R = ${R.toFixed(1)}, LIFE = ${WAKE_LIFE.toFixed(1)};
void main() {
  vec3 dir = normalize(vRest), P = dir * SEA_R;
  Paper q = paperAt(P, dir, 1.0);
  vec3 tw = triWeights(dir, 4.0);
  float u = abs(vUv.x), fu = max(fwidth(vUv.x), 1e-5) * uRenderPx;
  float life = (1.0 - smoothstep(0.3 * LIFE, LIFE, vAge)) * smoothstep(0.15, 1.2, vSpeed) * vDie;
  float n1 = tri(tMarks, P / 1.9, tw).b, n2 = tri(tPaper, P / 0.7, tw).g;
  // lead-white dry brush: the wedge's two arms (the bow wave running on as the diverging waves) and the churned
  // track astern, catching the paper's tooth and breaking up as they age
  float arm = smoothstep(0.5, 0.88, u) * (1.0 - smoothstep(0.93, 1.0, u)) * (1.0 - 0.6 * vAge / LIFE);
  float track = (1.0 - smoothstep(0.0, 0.5, u)) * exp(-0.5 * vAge);
  float dry = smoothstep(0.4, 0.62, max(arm, track) * (0.35 + 0.6 * q.grain + 0.55 * n1));
  // trailing ink: the transverse waves as small arcs across the track, bowed back, and the arms' outer edge, broken
  float tr = vUv.y / (0.6 + 0.15 * vSpeed) + 0.3 * vUv.x * vUv.x, ft = max(fwidth(tr), 1e-5) * uRenderPx;
  float trans = (1.0 - smoothstep(0.4, 1.1, abs(fract(tr) - 0.5) / ft)) * (1.0 - smoothstep(0.55, 0.8, u)) * step(0.4, n2) * smoothstep(0.0, 0.6, vAge);
  float edge = (1.0 - smoothstep(0.4, 1.1, abs(u - 0.985) / fu)) * step(0.35, n1);
  float ink = max(0.55 * trans, 0.8 * edge);
  float a = max(0.95 * dry, ink) * life;
  if (a < 0.003) discard;
  writeVeil(candle(dry >= ink ? leadWhite() : penInk(), vWorld), a);
}
`;

/**
 * The wake buffer: every ship's bow wave and wake as one ribbon on the swell, all ships in one draw. Ships feed it
 * every frame (WP19: feed with the hull's position, heading, speed and size on the render clock); the stern's path is
 * laid as world-anchored points every WAKE_STEP u, so a wake stays where its ship passed, opening into the Kelvin
 * wedge and fading over WAKE_LIFE s. A ship no longer fed leaves its wake to fade; one stopped (sinking) has it die
 * within WAKE_DIE s; forget frees its slot.
 */
export class Wakes {
  readonly geometry = new THREE.BufferGeometry();
  /** Each ship's waterline point (u) and mast height, 0 when its slot is free: the calm sea mirrors them (uShips). */
  readonly ships = Array.from({ length: WAKE_SHIPS }, () => new THREE.Vector4());
  /** When each slot's ship stopped (render clock, s), −1 under way (uStill). */
  readonly still = new Float32Array(WAKE_SHIPS).fill(-1);
  private readonly pos = new Float32Array(WAKE_SHIPS * WAKE_PTS * 2 * 3);
  private readonly fwd = new Float32Array(WAKE_SHIPS * WAKE_PTS * 2 * 4);
  private readonly info = new Float32Array(WAKE_SHIPS * WAKE_PTS * 2 * 4);
  private readonly ids = new Array<number>(WAKE_SHIPS).fill(-1);
  private readonly odo = new Float64Array(WAKE_SHIPS);
  private readonly at = Array.from({ length: WAKE_SHIPS }, () => new THREE.Vector3());
  private readonly up = new THREE.Vector3();
  private readonly f = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Vector3();
  private dirty = true;

  constructor() {
    const idx = new Uint16Array(WAKE_SHIPS * (WAKE_PTS - 1) * 6);
    for (let s = 0, k = 0; s < WAKE_SHIPS; s++) {
      for (let j = 0; j < WAKE_PTS - 1; j++, k += 6) {
        const a = (s * WAKE_PTS + j) * 2;
        idx.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], k);
      }
    }
    this.geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    for (const [name, a, n] of [['position', this.pos, 3], ['aFwd', this.fwd, 4], ['aWake', this.info, 4]] as const) {
      this.geometry.setAttribute(name, new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage));
    }
  }

  /** Triangles the ribbons submit. */
  get triangles(): number {
    return this.geometry.index!.count / 3;
  }

  /** Ship `id` at p (on or over the sea) heading along the tangent `forward` at `speed` u/s, at render-clock time t. */
  feed(id: number, p: V3, forward: V3, speed: number, t: number, length = 6, beam = 2): void {
    let s = this.ids.indexOf(id);
    const fresh = s < 0;
    if (fresh) {
      s = this.ids.indexOf(-1);
      if (s < 0) return;
      this.ids[s] = id;
      this.odo[s] = 0;
    }
    this.still[s] = -1;
    const up = this.up.set(p.x, p.y, p.z).normalize();
    const f = this.f.set(forward.x, forward.y, forward.z);
    f.addScaledVector(up, -up.dot(f)).normalize();
    if (!fresh) this.odo[s] += up.angleTo(this.at[s]) * R;
    this.at[s].copy(up);
    const o = this.odo[s], half = length / 2;
    this.put(s, 0, this.along(up, f, half), f, o + half, t, speed, 0.05);
    this.put(s, 1, up, f, o, t, speed, beam * (0.55 + 0.04 * Math.min(speed, 4)));
    const stern = this.along(up, f, -half);
    this.put(s, 2, stern, f, o - half, t, speed, beam * 0.5);
    if (fresh) {
      for (let j = WAKE_HEAD + 1; j < WAKE_PTS; j++) this.put(s, j, stern, f, o - half, t, 0, 0); // collapsed: no area
    } else if (this.q.fromArray(this.pos, (s * WAKE_PTS + WAKE_HEAD) * 6).angleTo(stern) * R < WAKE_STEP) {
      this.ships[s].set(up.x * R, up.y * R, up.z * R, length * 1.2);
      this.dirty = true;
      return;
    } else {
      for (const [a, n] of [[this.pos, 3], [this.fwd, 4], [this.info, 4]] as const) {
        const b = (s * WAKE_PTS + WAKE_HEAD) * 2 * n;
        a.copyWithin(b + 2 * n, b, (s + 1) * WAKE_PTS * 2 * n - 2 * n);
      }
    }
    this.put(s, WAKE_HEAD, stern, f, o - half, t, speed, beam * 0.5);
    this.ships[s].set(up.x * R, up.y * R, up.z * R, length * 1.2);
    this.dirty = true;
  }

  /** Ship `id` has lost all way (she is sinking) at render-clock time t: her wake dies within WAKE_DIE s, its wedge
   *  opening no further, and the calm sea no longer mirrors her masts. */
  stop(id: number, t: number): void {
    const s = this.ids.indexOf(id);
    if (s < 0 || this.still[s] >= 0) return;
    this.still[s] = t;
    this.ships[s].w = 0;
  }

  /** Free ship `id`'s slot (it sank or left): its ribbon collapses at once. */
  forget(id: number): void {
    const s = this.ids.indexOf(id);
    if (s < 0) return;
    this.ids[s] = -1;
    this.ships[s].w = 0;
    this.still[s] = -1;
    for (let j = 0; j < WAKE_PTS; j++) this.put(s, j, this.at[s], this.f.set(1, 0, 0), 0, -1e4, 0, 0);
    this.dirty = true;
  }

  /** Upload what changed since the last frame. */
  commit(): void {
    if (!this.dirty) return;
    for (const name of ['position', 'aFwd', 'aWake']) this.geometry.getAttribute(name).needsUpdate = true;
    this.dirty = false;
  }

  dispose(): void {
    this.geometry.dispose();
  }

  /** The unit direction d u along the tangent f from unit p. */
  private along(p: THREE.Vector3, f: THREE.Vector3, d: number): THREE.Vector3 {
    return this.p.copy(p).multiplyScalar(R).addScaledVector(f, d).normalize();
  }

  private put(s: number, j: number, p: THREE.Vector3, f: THREE.Vector3, odo: number, t: number, speed: number, hw: number): void {
    for (let side = 0; side < 2; side++) {
      const v = (s * WAKE_PTS + j) * 2 + side;
      this.pos[v * 3] = p.x; this.pos[v * 3 + 1] = p.y; this.pos[v * 3 + 2] = p.z;
      this.fwd[v * 4] = f.x; this.fwd[v * 4 + 1] = f.y; this.fwd[v * 4 + 2] = f.z; this.fwd[v * 4 + 3] = odo;
      this.info[v * 4] = side ? 1 : -1; this.info[v * 4 + 1] = t; this.info[v * 4 + 2] = speed; this.info[v * 4 + 3] = hw;
    }
  }
}

export class Sea {
  readonly mesh: THREE.Mesh;
  /** The wake ribbons: add it to the scene beside the disc. */
  readonly wake: THREE.Mesh;
  readonly swell: Swell;
  readonly wakes = new Wakes();
  private readonly floor: THREE.CubeTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly fixed: number;
  private readonly shape: DiscShape = { reach: 0, k: 0, horizon: 0 };
  private readonly foot = new THREE.Vector3();
  private readonly east = new THREE.Vector3(1, 0, 0);
  private readonly weather = { rough: 1, calm: 0, squall: 0 };
  private wind = 0.8;
  private readonly local = {
    uFoot: { value: new THREE.Vector3(0, 1, 0) },
    uEast: { value: new THREE.Vector3(1, 0, 0) },
    uNorth: { value: new THREE.Vector3(0, 0, -1) },
    uReach: { value: 1 },
    uK: { value: 1 },
    uHorizon: { value: 1 },
    uStrokes: { value: 0.63 },
    uCaps: { value: 0.04 },
    uCalm: { value: 0 },
    uSquall: { value: 0 },
    uStormCalm: { value: new THREE.Vector4(0, 0, 1, -2) },
    tSeaFloor: { value: null as unknown as THREE.CubeTexture },
    uLaneA: { value: Array.from({ length: MAX_LANES }, () => new THREE.Vector4()) },
    uLaneB: { value: Array.from({ length: MAX_LANES }, () => new THREE.Vector4()) },
    uLaneN: { value: Array.from({ length: MAX_LANES }, () => new THREE.Vector4()) },
    uShips: { value: this.wakes.ships },
    tTerritory: { value: null as THREE.CubeTexture | null },
    uTerritory: { value: 0 },
    tFlood: { value: null as THREE.CubeTexture | null },
    uFlood: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    ...clearWater(),
  };

  constructor(pipeline: Pipeline, geo: Geography) {
    this.swell = new Swell(geo);
    this.floor = cubeTexture(seaFloorFaces(geo), THREE.UnsignedByteType);
    this.local.tSeaFloor.value = this.floor;
    pipeline.registerTexture('sea fields', SEA_FIELD_BYTES);
    pipeline.registerTexture('sea floor', SEA_FLOOR_BYTES);
    this.fixed = Math.min(geo.lanes.length, MAX_LANES);
    geo.lanes.slice(0, this.fixed).forEach((l, i) => this.lay(i, l));
    this.material = inkMaterial(pipeline.style, {
      vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { ...this.swell.uniforms, ...this.local }, inkWeight: 0.8,
    });
    this.mesh = new THREE.Mesh(discGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.centre(camera.position);
      this.wakes.commit();
    };
    this.wake = new THREE.Mesh(this.wakes.geometry, inkMaterial(pipeline.style, {
      vertexShader: WAKE_VERTEX, fragmentShader: WAKE_FRAGMENT, uniforms: { ...this.swell.uniforms, uStill: { value: this.wakes.still } }, veil: true, side: THREE.DoubleSide,
    }));
    this.wake.frustumCulled = false;
  }

  /** Triangles the sea submits per frame (the disc and the wake ribbons). */
  get triangles(): number {
    return this.mesh.geometry.index!.count / 3 + this.wakes.triangles;
  }

  /** The wind at p toward the tangent `toward`, strength 0–1.4: the swell runs with it and strokes thicken. */
  setWind(p: V3, toward: V3, strength: number): void {
    this.swell.setWind(p, toward, strength);
    this.wind = strength;
    this.marks();
  }

  /**
   * The weather over the waters in view (the sim's skyAt there): rough 1 fair, more in a squall, 0 in a dead calm;
   * calm and squall 0–1. The sea eases toward it over a few seconds of dt (by default at once).
   */
  setWeather(sky: { readonly rough: number; readonly calm: number; readonly squall: number }, dt = Infinity): void {
    const w = this.weather, k = 1 - Math.exp(-dt / 2.5);
    w.rough += (sky.rough - w.rough) * k;
    w.calm += (sky.calm - w.calm) * k;
    w.squall += (sky.squall - w.squall) * k;
    this.swell.uniforms.uSwellAmp.value = Math.max(w.rough, 0.04);
    this.local.uCalm.value = w.calm;
    this.local.uSquall.value = w.squall;
    this.marks();
  }

  /** Current arcs drawn with the lanes' look after the geography's own (WP22: the Great Current's stretch in view). */
  setStreams(arcs: readonly Arc[]): void {
    for (let i = this.fixed; i < MAX_LANES; i++) {
      const arc = arcs[i - this.fixed];
      if (arc) this.lay(i, arc);
      else this.local.uLaneN.value[i].w = 0;
    }
  }

  /**
   * WP20's territory map, composited inside the sea shader (so territory is never a separate layer): a cube texture
   * laid out as seaFieldFaces (cubeTexture, RGBA bytes on the TERRITORY cells, linear filtering): rgb the owner's
   * wash transmittance (transmittanceVec of its pigment; white where unowned), a 1 where owned. The 0.5 contour of a
   * is the border, drawn with the style's pooled, granulating wash edge, a narrow hatched band and an inked line in
   * the owner's pigment. Update its faces in place (needsUpdate) as cells change; null hides territory. `moments` and
   * `slots` time its moments (territory.ts: floods and wash-outs).
   */
  setTerritory(map: THREE.CubeTexture | null, moments: THREE.CubeTexture | null = null, slots = this.local.uFlood.value): void {
    this.local.tTerritory.value = map;
    this.local.tFlood.value = moments;
    this.local.uFlood.value = slots;
    this.local.uTerritory.value = map ? 1 : 0;
  }

  /** The storm's calm (render/storm.ts): the sea outside the cap round `at` (cos of its angular radius) heaves grey. */
  setStorm(at: V3, cos: number): void {
    this.local.uStormCalm.value.set(at.x, at.y, at.z, cos);
  }

  /** Stroke and whitecap shares from the wind and the weather. */
  private marks(): void {
    const w = this.weather, wind = Math.min(this.wind, 1.4);
    this.local.uStrokes.value = (0.35 + 0.35 * wind) * (1 - 0.6 * w.calm) + 0.25 * w.squall;
    this.local.uCaps.value = (0.04 + 0.3 * Math.max(wind - 0.9, 0)) * (1 - w.calm) + 0.55 * w.squall;
  }

  private lay(i: number, { a, b, width, speed }: Arc): void {
    const n = this.foot.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x).normalize();
    this.local.uLaneA.value[i].set(a.x, a.y, a.z, width / 2);
    this.local.uLaneB.value[i].set(b.x, b.y, b.z, speed);
    this.local.uLaneN.value[i].set(n.x, n.y, n.z, 1);
  }

  /** Lay the disc round the eye's foot; its frame is carried along (parallel transport), so it never spins at a pole. */
  private centre(eye: THREE.Vector3): void {
    const u = this.local, foot = this.foot.copy(eye).normalize();
    discShape(eye.length() - R - this.swell.uniforms.uSeaLevel.value, this.shape);
    const e = this.east.addScaledVector(foot, -this.east.dot(foot));
    if (e.lengthSq() < 1e-6) e.set(Math.abs(foot.y) < 0.9 ? 0 : 1, Math.abs(foot.y) < 0.9 ? 1 : 0, 0).cross(foot);
    e.normalize();
    u.uFoot.value.copy(foot);
    u.uEast.value.copy(e);
    u.uNorth.value.crossVectors(foot, e);
    u.uReach.value = this.shape.reach;
    u.uK.value = this.shape.k;
    u.uHorizon.value = this.shape.horizon;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    (this.wake.material as THREE.Material).dispose();
    this.wakes.dispose();
    this.floor.dispose();
    this.swell.dispose();
  }
}

/** The sea each scene was built with: modules that meet the water share its swell and fields; ships feed its wakes. */
export const seas = new WeakMap<THREE.Object3D, Sea>();

/** The composition root's sea (MODULES): built when a match screen opens; the wind, the weather and the tide at the eye's foot (the air). */
export function createSea(ctx: RenderContext): RenderModule {
  const sea = new Sea(ctx.pipeline, ctx.world.geo);
  seas.set(ctx.scene, sea);
  ctx.scene.add(sea.mesh, sea.wake);
  return {
    frame(f) {
      ctx.pipeline.style.uniforms.uTime.value = f.clock;
      const air = airOf(ctx.scene).update(ctx.world, f.state, ctx.camera.position);
      sea.setWind(air.foot, air.toward, air.strength);
      sea.setWeather(air.sea, f.dt);
      sea.swell.uniforms.uSeaLevel.value = tideOf(f.state);
    },
    dispose() {
      ctx.scene.remove(sea.mesh, sea.wake);
      seas.delete(ctx.scene);
      sea.dispose();
    },
  };
}
