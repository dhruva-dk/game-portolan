import * as THREE from 'three';
import { inkMaterial, linearVec, transmittanceVec } from '../style/glsl.ts';
import { hex, PARCHMENT, PIGMENTS, SEA_WASHES, type PigmentName } from '../style/palette.ts';
import { tideOf } from '../sim/environment.ts';
import type { V3 } from '../sim/math.ts';
import { cellDir, cellOf, horizonDistance, R, TERRITORY } from '../sim/sphere.ts';
import { LANE_TAPER } from '../sim/tables.ts';
import { airOf } from './weather.ts';
import { CHARTS, coastAt, type Geography, heightAt, ZONE } from '../sim/world/geography.ts';
import { DRAFT, FLOOR, REGIONS, TIDE } from '../sim/world/regions.ts';
import type { Pipeline } from './pipeline.ts';
import { cubeTexture, SEA_FIELD_BYTES, SEA_FLOOR_BYTES, seaFloorFaces, Swell, SWELL_GLSL } from './swell.ts';
import type { RenderContext, RenderModule } from './world.ts';

export const DISC_RINGS = 112;
const RINGS = DISC_RINGS, SEGMENTS = 224;
const WASH_LOAD = { lagoon: 0.5, shallows: 0.45, shelf: 0.32, deep: 0.38 } as const;
const CLEAR_REACH = 105;
const SHORE_SWELL_GLSL =  `
float shoreSwell(vec3 dir, float depth) { return swellAmp(depth) * mix(1.0, smoothstep(-0.05, ${DRAFT.toFixed(2)}, depth), beachAt(dir)); }
`;
export const MAX_LANES = 24;
export const WAKE_SHIPS = 16;
export const WAKE_STEP = 0.9, WAKE_LIFE = 14;
export const WAKE_DIE = 2.5;
const WAKE_HEAD = 3, WAKE_PTS = WAKE_HEAD + 40;

export interface Arc { readonly a: V3; readonly b: V3; readonly width: number; readonly speed: number }

export interface DiscShape {
  reach: number;
  k: number;
  horizon: number;
}

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

export const MOTU_BEACH = 1.55;
export const EXPOSE = { s: [5, 10], gain: 1, shelf: 0.9 } as const;
const X1 = new THREE.Vector3(), X2 = new THREE.Vector3(), XA = new THREE.Vector3(), XB = new THREE.Vector3(), XP = new THREE.Vector3(), XT = new THREE.Vector3();
export function exposureAt(geo: Geography, dir: V3): number {
  const d = XP.set(dir.x, dir.y, dir.z).normalize(), d0 = coastAt(geo, d);
  X1.crossVectors(d, Math.abs(d.y) < 0.9 ? X2.set(0, 1, 0) : X2.set(1, 0, 0)).normalize();
  X2.crossVectors(d, X1);
  let e = 0;
  for (let k = 0; k < 2; k++) {
    const s = EXPOSE.s[k], q = s / R;
    if (k === 0) { XA.copy(X1).multiplyScalar(q); XB.copy(X2).multiplyScalar(q); }
    else { XA.copy(X1).add(X2).multiplyScalar(0.70711 * q); XB.copy(X2).sub(X1).multiplyScalar(0.70711 * q); }
    let m = 0;
    for (const [o, sg] of [[XA, 1], [XA, -1], [XB, 1], [XB, -1]] as const) m += coastAt(geo, XT.copy(d).addScaledVector(o, sg).normalize());
    e += ((m / 4 - d0) * 2) / s;
  }
  return Math.max(-1, Math.min(1, EXPOSE.gain * e));
}
export const BEACH = { ex: [0.15, 0.35], out: 8, fall: [0.3, 0.4, 1.5, 2.0], band: [-3, 9], fade: 2 } as const;
const BU = new THREE.Vector3(), BV = new THREE.Vector3(), BG = new THREE.Vector3(), BQ = new THREE.Vector3(), BD = new THREE.Vector3();
export function beachAt(geo: Geography, c: number): number {
  const y = geo.coast[c];
  if (y < BEACH.band[0] || y > BEACH.band[1] || geo.floor[c] !== FLOOR.sand || REGIONS[geo.region[c]].shore.sand !== FLOOR.sand) return 0;
  const d = cellDir(TERRITORY, c, BD), at = (o: V3, s: number): V3 => BQ.copy(d).addScaledVector(o, s / R).normalize();
  BU.crossVectors(d, Math.abs(d.y) < 0.9 ? BQ.set(0, 1, 0) : BQ.set(1, 0, 0)).normalize();
  BV.crossVectors(d, BU);
  BG.copy(BU).multiplyScalar(coastAt(geo, at(BU, 1)) - coastAt(geo, at(BU, -1))).addScaledVector(BV, coastAt(geo, at(BV, 1)) - coastAt(geo, at(BV, -1))).normalize();
  const fall = (heightAt(geo, at(BG, -1 - y)) - heightAt(geo, at(BG, BEACH.out - y))) / (BEACH.out + 1);
  const gentle = ramp(BEACH.fall[0], BEACH.fall[1], fall) * (1 - ramp(BEACH.fall[2], BEACH.fall[3], fall));
  return gentle > 0 ? gentle * (1 - ramp(BEACH.ex[0], BEACH.ex[1], exposureAt(geo, d))) * (1 - ramp(BEACH.band[1] - BEACH.fade, BEACH.band[1], y)) : 0;
}
export function beachGates(geo: Geography): Float32Array {
  const g = new Float32Array(geo.heights.length);
  for (let c = 0; c < g.length; c++) g[c] = beachAt(geo, c);
  return g;
}
export const LAND_GLSL =  `
const float LAND_U = ${(TIDE.amp + 0.15).toFixed(3)}, BEACH_W = ${MOTU_BEACH.toFixed(3)}, EXPOSE_G = ${EXPOSE.gain.toFixed(3)}, SHELF_EX = ${EXPOSE.shelf.toFixed(3)};
const vec2 EXPOSE_S = vec2(${EXPOSE.s[0].toFixed(2)}, ${EXPOSE.s[1].toFixed(2)});
float beachEye(float beach) { return beach * (1.0 - smoothstep(14.0, 20.0, length(cameraPosition) - SEA_R - uSeaLevel)); }
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
float exposure(vec3 dir, float d0, out vec2 rise) {
  vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
  float e = 0.0;
  rise = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    float s = k == 0 ? EXPOSE_S.x : EXPOSE_S.y;
    vec3 a = (k == 0 ? t1 : (t1 + t2) * 0.70711) * (s / SEA_R), b = (k == 0 ? t2 : (t2 - t1) * 0.70711) * (s / SEA_R);
    vec4 pa = seaField(normalize(dir + a)), na = seaField(normalize(dir - a)), pb = seaField(normalize(dir + b)), nb = seaField(normalize(dir - b));
    e += ((pa.y + na.y + pb.y + nb.y) * 0.25 - d0) * 2.0 / s;
    if (k == 0) { vec2 gd = vec2(pa.y - na.y, pb.y - nb.y), gh = vec2(pa.x - na.x, pb.x - nb.x); rise.x = -dot(gh, gd) / max(dot(gd, gd), 1e-3); }
    else rise.y = uSeaLevel - min(min(pa.x, na.x), min(pb.x, nb.x));
  }
  return clamp(EXPOSE_G * e, -1.0, 1.0);
}
float offBeach(vec3 dir, vec4 f) {
  return f.w > 0.02 ? f.w * smoothstep(BEACH_W - 0.1, BEACH_W + 0.6, toLand(dir, f.x)) : 0.0;
}
float lipInk(vec3 dir, float off) {
  vec3 P = dir * SEA_R, tw = triWeights(dir, 4.0);
  float lengths = smoothstep(0.42, 0.58, tri(tPaper, P / 2.2 + 3.0, tw).g + 0.25 * (tri(tPaper, P / 4.1, tw).g - 0.5));
  return mix(1.0, mix(0.15, 0.45, lengths), off);
}
`;

export const SURF = { reach: 7.5, out: 6, deep: [4, 7], far: 13, strike: [-TIDE.amp - DRAFT - 0.5, -TIDE.amp - DRAFT + 0.1], lace: [DRAFT - 0.25, DRAFT], from: 67.5, lit: [-0.5, 0.5], break: 0.3, wash: 0.3 } as const;
function swellFrom(dir: V3, out: THREE.Vector3): THREE.Vector3 {
  const c = CHARTS[Math.max(0, REGIONS.findIndex((r) => r.flora.includes('coral')))], b = THREE.MathUtils.degToRad(SURF.from);
  out.set(c.e.x * Math.sin(b) + c.n.x * Math.cos(b), c.e.y * Math.sin(b) + c.n.y * Math.cos(b), c.e.z * Math.sin(b) + c.n.z * Math.cos(b));
  const k = out.x * dir.x + out.y * dir.y + out.z * dir.z;
  return out.set(out.x - k * dir.x, out.y - k * dir.y, out.z - k * dir.z).normalize();
}
const ramp = (a: number, b: number, x: number): number => THREE.MathUtils.smoothstep(x, a, b);
const S1 = new THREE.Vector3(), S2 = new THREE.Vector3(), S3 = new THREE.Vector3(), S4 = new THREE.Vector3(), S5 = new THREE.Vector3();
export function openAt(geo: Geography, dir: V3, sea: V3, level: number): number {
  let zone = geo.zones[cellOf(TERRITORY, dir)], deep = -Infinity;
  for (const k of [SURF.out, SURF.far]) {
    const p = S5.set(sea.x, sea.y, sea.z).multiplyScalar(k / R).add(dir).normalize();
    zone |= geo.zones[cellOf(TERRITORY, p)];
    deep = Math.max(deep, level - heightAt(geo, p));
  }
  return zone & ZONE.lagoon ? 0 : ramp(SURF.deep[0], SURF.deep[1], deep);
}
export function surfAt(geo: Geography, dir: V3, level: number): number {
  const y = coastAt(geo, dir), h = heightAt(geo, dir);
  if (geo.floor[cellOf(TERRITORY, dir)] !== FLOOR.coral || y >= SURF.reach || level - h <= -0.4 - SURF.wash) return 0;
  const d = S3.set(dir.x, dir.y, dir.z);
  S1.crossVectors(d, Math.abs(d.y) < 0.9 ? S2.set(0, 1, 0) : S2.set(1, 0, 0)).normalize();
  S2.crossVectors(d, S1);
  const gx = coastAt(geo, S1.clone().multiplyScalar(0.8 / R).add(d).normalize()) - y, gy = coastAt(geo, S2.clone().multiplyScalar(0.8 / R).add(d).normalize()) - y;
  const sea = S1.multiplyScalar(gx).addScaledVector(S2, gy).addScaledVector(d, 1e-5).normalize();
  const lit = ramp(SURF.lit[0], SURF.lit[1], sea.dot(swellFrom(d, S4)));
  if (lit <= 0 || level - h <= -0.4 - SURF.wash * lit) return 0;
  const reach = SURF.break * lit;
  return lit * openAt(geo, d, sea, level) * ramp(SURF.strike[0] - reach, SURF.strike[1] - reach, h);
}
export function laceAt(geo: Geography, dir: V3, level: number): number {
  const depth = level - heightAt(geo, dir);
  return geo.floor[cellOf(TERRITORY, dir)] === FLOOR.coral && depth > 0 ? 1 - ramp(SURF.lace[0], SURF.lace[1], depth) : 0;
}

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

const INKS =  `
const vec3 LEAD = ${vec(linearVec(PIGMENTS.leadWhite))}, PARCH = ${vec(linearVec(PARCHMENT))};
const vec3 SUN_GOLD = ${vec(linearVec(hex('#f5dc96')))}, LEAF_LO = ${vec(linearVec(hex('#c08a2c')))}, LEAF_HI = ${vec(linearVec(hex('#f4d77e')))}, LEAF_GLINT = ${vec(linearVec(hex('#fff2c8')))};
vec3 leadWhite() { return mix(LEAD * uPaper / PARCH, uSilver, uNight * 0.6); }
vec3 penInk() { return mix(hatchInk(0.6), uSilver, uNight * 0.7); }
`;

const VERTEX =  `
${SWELL_GLSL}
${SHORE_SWELL_GLSL}
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
  vec3 d = swell(dir, uTime, shoreSwell(dir, uSeaLevel - f.x), vNormal, vLift);
  vRest = dir;
  vWorld = dir * (SEA_R + uSeaLevel) + d;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const FRAGMENT =  `
${SWELL_GLSL}
${SHORE_SWELL_GLSL}
${LAND_GLSL}
#define MAX_LANES ${MAX_LANES}
#define WAKE_SHIPS ${WAKE_SHIPS}
in vec3 vRest;
in vec3 vWorld;
in vec3 vNormal;
in float vLift;
uniform float uHorizon;
uniform float uStrokes;
uniform float uCaps;
uniform float uCalm;
uniform float uSquall;
uniform vec4 uStormCalm;
uniform samplerCube tSeaFloor;
uniform vec4 uLaneA[MAX_LANES];
uniform vec4 uLaneB[MAX_LANES];
uniform vec4 uLaneN[MAX_LANES];
uniform vec4 uShips[WAKE_SHIPS];
uniform samplerCube tTerritory;
uniform float uTerritory;
uniform vec4 uClear;
uniform vec3 uClearE;
uniform vec3 uClearN;
uniform samplerCube tFlood;
uniform vec4 uFlood[8];
const vec3 LAGOON_T = ${washT('lagoon')}, SHALLOWS_T = ${washT('shallows')}, SHELF_T = ${washT('shelf')}, DEEP_T = ${washT('deep')};
const float LAGOON_D = ${washD('lagoon')}, SHALLOWS_D = ${washD('shallows')}, SHELF_D = ${washD('shelf')}, DEEP_D = ${washD('deep')};
const vec3 SAND_T = ${T('ochre')}, ROCK_T = ${T('umber')}, CORAL_T = ${T('roseMadder')}, KELP_T = ${T('malachite')};
const vec3 MUD_T = ${T('sepia')}, BLACK_T = ${T('ironGall')}, TURQ_T = ${T('verdigris')}, CREAM_T = ${T('ochre')};
const float LANE_TAPER = ${LANE_TAPER.toFixed(1)}, TERRITORY_D = 0.6;
const float SURF_REACH = ${SURF.reach.toFixed(2)}, SURF_OUT = ${SURF.out.toFixed(2)}, SURF_FAR = ${SURF.far.toFixed(2)};
const vec2 SURF_LIT = vec2(${SURF.lit.map((v) => v.toFixed(2)).join(', ')});
const float SURF_FROM = ${THREE.MathUtils.degToRad(SURF.from).toFixed(4)}, SURF_BREAK = ${SURF.break.toFixed(2)}, SURF_WASH = ${SURF.wash.toFixed(2)};
const vec2 SURF_DEEP = vec2(${SURF.deep.map((v) => v.toFixed(2)).join(', ')}), SURF_STRIKE = vec2(${SURF.strike.map((v) => v.toFixed(2)).join(', ')}), SURF_LACE = vec2(${SURF.lace.map((v) => v.toFixed(2)).join(', ')});
${INKS}
const float RING0 = 0.8, RING_D = 1.1, RING_G = 1.5, RINGS = 6.0, RING_CSS = 0.5, COAST_CSS = 0.6;
const float STROKE_CELL = 0.7, STROKE_CELL_CSS = 26.0, STROKE_CSS = 1.0;

vec2 layer(float e, float fw) {
  float px = e / max(fw, 1e-4);
  float cover = smoothstep(-0.75, 0.75, px);
  return vec2(cover, cover * (1.0 - smoothstep(0.0, 6.0 * uRenderPx, px)));
}

int planeOf(vec3 d, out float lead) {
  vec3 a = abs(d);
  float m = max(a.x, max(a.y, a.z));
  lead = m - (a.x + a.y + a.z - m - min(a.x, min(a.y, a.z)));
  return a.x == m ? 0 : a.y == m ? 1 : 2;
}
vec2 onPlane(vec3 v, int i) { return i == 0 ? v.yz : i == 1 ? v.zx : v.xy; }

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

float vnoise(vec2 p) {
  vec2 i = floor(p), u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

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
    float m0 = mark(x, wd, C, upx, sd, share, kind);
    ink = max(ink, wts[i] * (f > 0.0 ? mix(m0, mark(x, wd, 2.0 * C, upx, sd + 3.3, share, kind), f) : m0));
  }
  return ink;
}

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
  vec3 P = dir * SEA_R;
  vec4 f = seaField(dir);
  Paper q = paperAt(P, dir, 1.0 - 0.8 * smoothstep(0.3, 0.7, f.z));
  vec3 tw = triWeights(dir, 4.0);
  float upx = max(length(dFdx(P)), length(dFdy(P)));
  float wob = tri(tPaper, P / 23.0, tw).b - 0.5;
  float fine = tri(tPaper, P / 4.1, tw).g - 0.5;
  float depth = uSeaLevel - f.x, fwD = fwidth(depth);
  float water = smoothstep(-0.6, 0.6, depth / max(fwD, 1e-4));
  vec3 V = cameraPosition - vWorld;
  float dist = length(V);
  V /= dist;
  float far = smoothstep(0.3, 1.0, dist / uHorizon), near = 1.0 - smoothstep(0.25, 0.7, dist / uHorizon);
  float clear = smoothstep(uClear.w - 0.03, uClear.w, dot(dir, uClear.xyz));
  float beach = beachAt(dir), bEye = beachEye(beach);
  float lagoon = mix(smoothstep(0.3, 0.7, f.z), 1.0, clear);
  vec3 wind = normalize(cross(uWindAxis, dir) + 1e-6);
  float leadP;
  int pd = planeOf(dir, leadP);
  vec2 xp = onPlane(P, pd), wp = normalize(onPlane(wind, pd) + 1e-6);
  vec2 hc = vec2(dot(xp, wp), dot(xp, vec2(-wp.y, wp.x))) * 1.3, hdx = dFdx(hc), hdy = dFdy(hc);
  float diag = smoothstep(0.0, 0.05, leadP);

  vec3 col = parchment(q);
  vec3 vt = V - dir * dot(V, dir);
  float si = length(vt), st = si / 1.33, tt = st * inversesqrt(max(1.0 - st * st, 1e-3)), dd = max(depth, 0.0);
  float shift = dd * tt;
  shift = mix(shift, shift / (1.0 + shift / 1.2), clear);
  vec3 lens = (vNormal - dir) * mix(dd * 1.2, min(dd, 2.0) * 0.3, clear), Pf = P - vt / max(si, 1e-4) * shift + lens;
  vec3 dirF = normalize(Pf);
  vec4 ff = vec4(0.0), fl = vec4(0.0);
  float heads = 0.0, headInk = 0.0;
  if (dist < 110.0) { ff = seaField(dirF); fl = cubeAt(tSeaFloor, dirF); }
  float leadF;
  int pf = planeOf(dirF, leadF);
  vec2 x = onPlane(Pf, pf), xdx = onPlane(dFdx(Pf), pf), xdy = onPlane(dFdy(Pf), pf);
  float rip = mix(dist < 110.0 ? seaField(normalize(P + lens)).y : 0.0, ff.y, clear) / 0.85 + 0.6 * wob, rw = fwidth(rip);
  vec2 xc = vec2(dot(Pf, uClearE), dot(Pf, uClearN)), xcx = dFdx(xc), xcy = dFdy(xc);
  float cpx = max(max(length(xcx), length(xcy)), 1e-5);
  float fres = pow(1.0 - clamp(dot(V, vNormal), 0.0, 1.0), 5.0), seen = water * (1.0 - 0.6 * uSquall) * (1.0 - smoothstep(30.0, 110.0, dist));
  float vis = exp(-max(uSeaLevel - ff.x, 0.0) * mix(mix(0.34, 0.17, max(lagoon, fl.g)), 0.12, clear))
            * (1.0 - 0.7 * clear * smoothstep(4.5, 7.5, uSeaLevel - ff.x))
            * (1.0 - fres) * seen;
  float crownD = 99.0, headShadow = 0.0, sVis = 0.0;
  if (vis > 0.02) {
    float fpx = max(max(length(xdx), length(xdy)), 1e-5), mk = smoothstep(0.0, 0.05, leadF);
    vec2 L = normalize(onPlane(uSun, pf) + 1e-6);
    float n1 = textureLod(tMarks, x / 7.3, 0.0).b, n2 = textureLod(tMarks, x / 2.9 + 0.4, 0.0).g;
    float coral = ff.w, sand = clamp(1.0 - fl.r - fl.g - fl.b - coral, 0.0, 1.0);
    vec3 fc = glaze(col, mix(SAND_T, BLACK_T, fl.a), 0.3 * sand + 0.3 * fl.a, 0.0, q);
    fc = glaze(fc, MUD_T, 0.45 * fl.b, 0.0, q);
    float r = fract(rip), ripples = (sand + 0.5 * fl.b) * smoothstep(mix(2.5, 9.0, clear), mix(5.0, 18.0, clear), 1.0 / max(rw, 1e-5))
              * (1.0 - clear * smoothstep(0.8, 1.6, fpx / max(rw, 1e-6)));
    float crest = (1.0 - smoothstep(0.4, 1.2, min(r, 1.0 - r) / max(rw, 1e-5) / uRenderPx)) * step(mix(0.32, 0.45, clear), n2);
    fc = glaze(fc, SAND_T, mix(0.3, 0.2, clear) * smoothstep(0.0, 0.1, r) * (1.0 - smoothstep(0.1, 0.4, r)) * ripples, 0.0, q);
    fc = mix(fc, hatchInk(0.3), mix(0.55, 0.3, clear) * crest * ripples);
    float cz = bEye * sand * (1.0 - smoothstep(0.4, 2.6, uSeaLevel - ff.x)) * (1.0 - smoothstep(8.0, 18.0, dist)) * mk;
    if (cz > 0.01) {
      const float CC = 0.24;
      vec2 xw = x / CC + 0.95 * vec2(vnoise(x / 0.41 + uTime * 0.09), vnoise(x / 0.41 + 5.2 - uTime * 0.08)) + 0.35 * vec2(vnoise(x / 0.13 + 2.0), vnoise(x / 0.13 + 7.7));
      float idC;
      vec4 cc = cells(xw + vec2(0.0, uTime * 0.12), idC);
      float lw = (cc.y - cc.x) * 0.5 * CC / max(fpx, 1e-5) / uRenderPx;
      float thread = (1.0 - smoothstep(0.4, 1.2, lw)) * smoothstep(0.38, 0.62, vnoise(xw * 0.31 + 3.1)) * smoothstep(9.0, 16.0, CC / max(fpx, 1e-5));
      fc = mix(fc, mix(LEAD * uPaper / PARCH, SUN_GOLD, 0.35), 0.5 * thread * cz);
    }
    if (fl.r > 0.0) {
    float idR;
    vec4 cr = cells(x / 1.8, idR);
    float rock = fl.r * step(0.12, idR), rt = clamp(0.3 + 1.4 * dot(cr.zw, L), 0.0, 1.0);
    float crack = 1.0 - smoothstep(0.4, 1.2, (cr.y - cr.x) * 0.9 / fpx / uRenderPx);
    fc = glaze(fc, ROCK_T, (0.4 + 0.35 * idR) * fl.r, 0.0, q);
    fc = mix(fc, hatchInk(rt), hatching(x * 1.3, xdx * 1.3, xdy * 1.3, 0.85 * rt, 13.0) * rock * mk);
    fc = mix(fc, hatchInk(0.7), 0.85 * crack * fl.r * mk);
    }
    float cw = max(coral, 0.55 * clear * sand * smoothstep(0.3, 0.7, ff.z));
    bool onChart = clear > 0.0;
    vec2 xr = onChart ? xc : x, Lr = onChart ? normalize(vec2(dot(uSun, uClearE), dot(uSun, uClearN)) + 1e-6) : L;
    vec2 xrx = onChart ? xcx : xdx, xry = onChart ? xcy : xdy;
    float rpx = onChart ? cpx : fpx, mkr = onChart ? 1.0 : mk;
    float crowd = smoothstep(0.3, 0.72, textureLod(tMarks, xr / 13.0 + 0.37, 0.0).b + 0.3 * (n1 - 0.5));
    #define PATCH(p, cd) smoothstep(0.5, 0.7, vnoise((p) / 8.0 + 3.7) + 0.18 * (vnoise((p) / 2.7 + 1.3) - 0.5) + 0.22 * (1.0 - smoothstep(4.0, 14.0, cd)))
    if (onChart) crowd = PATCH(xr, ff.y);
    if (onChart) {
      float pxs = max(max(length(xrx), length(xry)), 1e-5), lamR = 0.42;
      float tract = smoothstep(0.42, 0.62, vnoise(xr / 7.0 + 2.3) + 0.25 * (n1 - 0.5)) * sand;
      float sR = dot(xr, vec2(0.83, 0.56)) / lamR + 1.7 * vnoise(xr / 2.6 + 9.1) + 0.6 * vnoise(xr / 0.9), fR = fract(sR);
      float spR = max((abs(dot(xrx, vec2(0.83, 0.56))) + abs(dot(xry, vec2(0.83, 0.56)))) * 1.4 / lamR, 1e-5), rvR = smoothstep(5.0, 10.0, 1.0 / spR);
      float crestR = (1.0 - smoothstep(0.6 * spR, 1.6 * spR, min(fR, 1.0 - fR))) * step(0.42, vnoise(xr / 0.7 + 4.0));
      float leeR = smoothstep(0.0, 0.04, fR) * (1.0 - smoothstep(0.1, 0.4, fR));
      fc = glaze(fc, mix(SAND_T, SHELF_T, 0.35), 0.2 * leeR * tract * rvR + 0.05 * tract * (1.0 - rvR), 0.0, q);
      fc = glaze(fc, SAND_T, 0.12 * smoothstep(0.45, 0.75, vnoise(xr / 3.1 + 1.7)) * sand, 0.0, q);
      fc = mix(fc, hatchInk(0.3), 0.32 * crestR * tract * rvR);
      float cid;
      vec4 cl = cells(xr / 0.22 + 3.3, cid);
      float clast = step(0.7, cid) * (1.0 - smoothstep(0.14 + 0.5 * (cid - 0.7), 0.14 + 0.5 * (cid - 0.7) + 1.5 * pxs / 0.22, cl.x)) * smoothstep(0.15, 0.6, crowd) * cw
                  * smoothstep(1.2, 3.0, 0.066 / pxs), cside = dot(-cl.zw, Lr) / max(cl.x, 0.05);
      fc = glaze(fc, mix(SAND_T, ROCK_T, 0.35), 0.3 * clast, 0.0, q);
      fc = mix(fc, LEAD * uPaper / PARCH, 0.25 * clast * smoothstep(0.0, 0.8, cside));
      fc = glaze(fc, mix(ROCK_T, SHELF_T, 0.5), 0.45 * clast * smoothstep(0.0, -0.8, cside), 0.0, q);
      float grass = smoothstep(0.6, 0.74, vnoise(xr / 4.3 + 5.7) + 0.12 * (n2 - 0.5)) * (1.0 - smoothstep(0.2, 0.6, crowd)) * sand;
      if (grass > 0.0) {
        fc = glaze(fc, mix(KELP_T, SAND_T, 0.4), 0.32 * grass * (0.75 + 0.25 * n1), 0.0, q);
        vec2 comb = rot2(0.35 * sin(uTime * 0.7 + dot(xr, vec2(0.3, 0.2)))) * vec2(0.83, 0.56);
        float bl = max(mark(xr, comb, 0.26, pxs, 71.0, 0.85, 2), mark(xr + 0.13, comb, 0.26, pxs, 73.0, 0.85, 2)) * smoothstep(3.0, 7.0, 0.26 / pxs);
        fc = mix(fc, mix(hatchInk(0.3), KELP_T * uPaper, 0.35), 0.5 * bl * grass);
      }
    }
    if (cw > 0.0) {
    float cpxPx = (onChart ? sqrt(max(length(xcx), 1e-6) * max(length(xcy), 1e-6)) : rpx) * uRenderPx;
    float fdep = max(uSeaLevel - ff.x, 0.0), shallow = 1.0 - smoothstep(0.6, 2.6, fdep), dim = mix(onChart ? 0.85 : 0.5, 1.0, shallow);
    fc = glaze(fc, ROCK_T, 0.16 * cw * crowd * smoothstep(0.45, 0.75, n2) * dim, 0.0, q);
    float inkD = onChart ? mix(1.0, 0.8, smoothstep(1.0, 6.0, fdep)) : shallow;
    sVis = min(0.8, exp(-0.1 * fdep) * (1.0 - 0.45 * fres) * seen);
    vec2 away = onChart ? -normalize(vec2(dot(vt, uClearE), dot(vt, uClearN)) + 1e-6) : vec2(0.0), ray = away * min(tt, 1.2);
    float sz = clamp(dot(uSun, dirF), 0.2, 1.0), sxy = sqrt(1.0 - sz * sz);
    vec2 sideV = vec2(-away.y, away.x);
    vec2 Lh = onChart ? normalize(Lr + 0.9 * sideV * (dot(Lr, sideV) < 0.0 ? -1.0 : 1.0)) : Lr;
    vec3 sun3 = onChart ? normalize(vec3(Lh * 0.87, 0.5)) : normalize(vec3(Lh * max(sxy, 0.6), sz));
    vec2 sray = -Lh * (onChart ? 1.6 : min(sxy / sz, 1.6));
    float glanceK = min(length(xrx), length(xry)) / max(max(length(xrx), length(xry)), 1e-6);
    float cG = cpxPx, bigHead = 0.0;
    for (int sI = 0; sI < 2; sI++) {
      float sc = sI == 0 ? 3.4 : 1.15, share = (sI == 0 ? 0.36 + 0.34 * crowd : 0.2 + 0.65 * crowd) * min(1.0, 2.0 * cw);
      float grow = smoothstep(0.02, 0.08, cw);
      vec2 xs = xr / sc + float(sI) * 17.3, ci = floor(xs), cf = fract(xs), o = vec2(0.0);
      float idC = 0.0, R = 1.0, H = 1.0, Fm = 9.0, fw = 1.0, zh = 0.0, score = 0.0, shadow = 0.0;
      for (int cy = -1; cy <= 1; cy++) {
        for (int cx = -1; cx <= 1; cx++) {
          vec2 g = vec2(float(cx), float(cy)), cid = ci + g;
          float id = hash12(cid + 5.1), e = id - (1.0 - share), crowdH = crowd, growH = grow, fdepH = fdep;
          vec2 oo = (cf - g - 0.15 - 0.7 * vec2(hash12(cid), hash12(cid + 17.3))) * sc;
          float rf = sI == 0 ? 0.32 + 0.7 * pow(fract(id * 3.7), 1.4) : 0.11 + 0.3 * pow(fract(id * 3.7), 1.5);
          if (onChart) {
            if (id < 0.3 || dot(oo, oo) > 9.0 * 1.5625 * rf * rf) continue;
            vec3 dH = normalize(Pf - oo.x * uClearE - oo.y * uClearN);
            vec4 ffH = seaField(dH), flH = cubeAt(tSeaFloor, dH);
            float sandH = clamp(1.0 - flH.r - flH.g - flH.b - ffH.w, 0.0, 1.0), cwH = max(ffH.w, 0.55 * clear * sandH * smoothstep(0.3, 0.7, ffH.z));
            crowdH = PATCH(xr - oo, ffH.y);
            growH = smoothstep(0.02, 0.08, cwH);
            fdepH = max(uSeaLevel - ffH.x, 0.0);
            e = id - (1.0 - (sI == 0 ? 0.05 + 0.65 * crowdH : 0.02 + 0.88 * crowdH) * min(1.0, 2.0 * cwH));
          }
          if (e <= 0.0) continue;
          float r0 = rf * (sI == 0 ? 0.8 + (onChart ? 0.45 : 0.3) * crowdH : 1.0) * smoothstep(0.0, 0.06, e) * growH;
          if (r0 < 0.03 || dot(oo, oo) > 9.0 * r0 * r0) continue;
          float kd = fract(id * 7.31);
          float hh = min(r0 * (kd < 0.26 ? 0.6 + 0.3 * fract(id * 4.3) : kd < 0.46 ? 0.55 + 0.25 * fract(id * 4.3) : kd < 0.68 ? 0.42 + 0.15 * fract(id * 4.3)
                              : kd < 0.84 ? 0.32 + 0.08 * fract(id * 4.3) : 0.18 + 0.1 * fract(id * 4.3)), 0.7 * fdepH + 0.02);
          float a2 = dot(ray, ray), zs = max(dot(oo, ray) / (a2 + r0 * r0 / (hh * hh)), 0.0);
          vec2 pd = oo - ray * zs, nd = pd / (length(pd) + 1e-4);
          float lob = kd >= 0.46 && kd < 0.68 ? 0.2 * (vnoise(nd * 4.5 + id * 53.0) - 0.5) + 0.14 * (vnoise(nd * 11.0 + id * 29.0) - 0.5)
                    : kd >= 0.68 && kd < 0.84 ? 0.2 * (vnoise(nd * 2.2 + id * 71.0) - 0.5) + 0.05 * (vnoise(nd * 9.0 + id * 13.0) - 0.5)
                    : 0.26 * (vnoise(nd * 1.8 + id * 91.0) - 0.5) + 0.08 * sin(floor(2.0 + 4.0 * fract(id * 2.9)) * atan(nd.y, nd.x) + id * 41.0);
          float rr = r0 * (1.0 + lob), ir2 = 1.0 / (rr * rr);
          float A = a2 * ir2 + 1.0 / (hh * hh), B = dot(oo, ray) * ir2, C = dot(oo, oo) * ir2;
          float f0 = B > 0.0 ? C - B * B / A : C;
          vec2 gF = 2.0 * ir2 * (oo - (B > 0.0 ? B / A : 0.0) * ray);
          float fwk = max(abs(dot(gF, xrx)) + abs(dot(gF, xry)), 1e-4);
          float As = dot(sray, sray) * ir2 + 1.0 / (hh * hh), Bs = dot(oo, sray) * ir2;
          float fS = Bs > 0.0 ? C - Bs * Bs / As : C;
          shadow = max(shadow, onChart ? (1.0 - smoothstep(0.45, 1.35, fS)) * (0.6 + 0.4 * (1.0 - smoothstep(0.0, 1.0, C))) : 1.0 - smoothstep(0.85, 1.15, fS));
          float cov = 1.0 - smoothstep(1.0 - fwk, 1.0 + fwk, f0);
          if (cov <= 0.0) continue;
          float z1 = (B + sqrt(max(B * B - A * (C - 1.0), 0.0))) / A, sc1 = cov * (1.0 + z1);
          if (sc1 > score) { score = sc1; Fm = f0; fw = fwk; idC = id; o = oo; R = rr; H = hh; zh = max(z1, 0.0); }
        }
      }
      float thin = smoothstep(0.04, 0.12, (1.0 + 0.58 * H / R) * glanceK);
      float head = (1.0 - smoothstep(1.0 - fw, 1.0 + fw, Fm)) * (1.0 - bigHead) * thin * (onChart ? smoothstep(0.0, 0.12, cw) : 1.0);
      if (onChart) headShadow = max(headShadow, shadow * (1.0 - max(head, bigHead)) * dim);
      else fc = glaze(fc, mix(ROCK_T, SHELF_T, 0.6), 0.3 * shadow * (1.0 - max(head, bigHead)) * dim, 0.0, q);
      if (sI == 0) bigHead = head;
      if (head <= 0.0) continue;
      vec2 ph = o - ray * zh;
      float rho = clamp(length(ph) / R, 0.0, 1.0), up = clamp(zh / H, 0.0, 1.0), th = atan(ph.y, ph.x);
      float kind = fract(idC * 7.31), tint = fract(idC * 13.7), big = smoothstep(4.0, 12.0, R / cG);
      bool table = kind >= 0.68 && kind < 0.84;
      vec3 nrm = normalize(vec3(ph / (R * R), zh / (H * H)));
      if (table) nrm = normalize(mix(vec3(0.0, 0.0, 1.0), nrm, smoothstep(0.8, 1.0, rho)));
      float lit = clamp(dot(nrm, sun3), 0.0, 1.0), shade = 1.0 - lit, hollow = table ? 0.0 : 1.0 - smoothstep(0.0, 0.5, up);
      float pxu = max(mix(cG / uRenderPx, max(length(xrx), length(xry)), 0.35), 1e-5);
      vec3 OLIVE = mix(KELP_T, SAND_T, 0.55), ROSE = mix(CORAL_T, SAND_T, 0.35), VIOLET = mix(CORAL_T, SHELF_T, 0.45);
      vec3 hue = kind < 0.26 ? mix(SAND_T, tint < 0.5 ? OLIVE : ROSE, 0.35)
               : kind < 0.46 ? (tint < 0.4 ? SAND_T : tint < 0.7 ? ROSE : OLIVE)
               : kind < 0.68 ? mix(SAND_T, ROSE, 0.2 + 0.3 * tint)
               : table ? (tint < 0.6 ? OLIVE : mix(OLIVE, VIOLET, 0.45))
               : (tint < 0.45 ? VIOLET : tint < 0.75 ? ROSE : OLIVE);
      float mot = vnoise(ph / (0.3 * R) + idC * 7.0), mot2 = vnoise(ph / (0.11 * R) + idC * 3.1);
      fc = glaze(fc, hue, (0.5 + 0.22 * mot + 0.1 * mot2) * head * dim, 0.0, q);
      fc = glaze(fc, mix(ROCK_T, SHELF_T, 0.4), 0.14 * head * dim, 0.0, q);
      fc = glaze(fc, tint < 0.5 ? VIOLET : OLIVE, 0.2 * smoothstep(0.55, 0.85, mot2 + 0.3 * mot) * head * dim, 0.0, q);
      float lines = 0.0, pale = 0.0, dark = 0.0;
      if (kind < 0.26) {
        float lam = clamp(5.0 * pxu, 0.075 * R, 0.2 * R), rv = smoothstep(2.5, 6.0, lam / pxu);
        float sv = dot(ph, vec2(cos(idC * 31.0), sin(idC * 31.0))) / lam + 2.2 * vnoise(ph / (0.32 * R) + idC * 17.0) + 0.9 * vnoise(ph / (0.13 * R) + idC * 5.0);
        float gv = abs(fract(sv) - 0.5) * lam * 1.25, hw = lam * mix(0.07, 0.17, shade);
        lines = (1.0 - smoothstep(hw - pxu, hw + pxu, gv)) * rv;
        pale = (1.0 - smoothstep(0.0, 0.3, abs(abs(fract(sv) - 0.5) - 0.5) / 0.5)) * lit * rv;
        dark = 0.4 * (1.0 - smoothstep(0.1 * lam, 0.3 * lam, gv)) * rv + 0.15 * (1.0 - rv);
      } else if (kind < 0.46) {
        float lid, ls = clamp(7.0 * pxu, 0.2 * R, 0.4 * R), pid, ps = clamp(4.0 * pxu, 0.05 * R, 0.12 * R);
        vec4 lc = cells(ph / ls + idC * 13.0, lid), pc = cells(ph / ps + idC * 5.0, pid);
        float rl = smoothstep(2.0, 5.0, ls / pxu), kr = 0.36 + 0.2 * lid, kin = 1.0 - smoothstep(kr - 1.5 * pxu / ls, kr + 1.5 * pxu / ls, lc.x);
        float kf = dot(-lc.zw, Lh) / kr;
        float foot = (1.0 - smoothstep(0.6 * pxu / ls, 1.8 * pxu / ls, abs(lc.x - kr))) * smoothstep(0.0, -0.5, kf + 0.2 * shade);
        lines = max(foot * mix(0.55, 1.0, shade) * rl,
                    0.6 * kin * (1.0 - smoothstep(0.16, 0.16 + 1.5 * pxu / ps, pc.x)) * smoothstep(2.5, 4.5, ps / pxu) * smoothstep(0.1, 0.7, shade - 0.4 * kf));
        dark = ((1.0 - kin) * 0.45 + 0.4 * kin * smoothstep(0.0, -0.8, kf)) * rl + 0.12 * (1.0 - rl);
        pale = kin * smoothstep(0.1, 0.8, kf) * lit * rl;
      } else if (kind < 0.68) {
        float bs = clamp(12.0 * pxu, 0.17 * R, 0.4 * R), rb = 0.2 * bs, rr0 = smoothstep(1.2, 3.0, rb / pxu), dmin = 9.0, tip = 0.0;
        vec2 bi = floor(ph / bs), nb2 = vec2(0.0);
        for (int by = -1; by <= 1; by++) {
          for (int bxx = -1; bxx <= 1; bxx++) {
            vec2 gc = bi + vec2(float(bxx), float(by)), hc2 = vec2(hash12(gc + idC * 19.0), hash12(gc + idC * 23.0 + 7.1));
            vec2 bc = (gc + 0.2 + 0.6 * hc2) * bs;
            float ang = atan(bc.y, bc.x) + 1.3 * (hc2.x - 0.5), fa = ang + (hc2.y < 0.5 ? 0.6 : -0.6);
            vec2 ba = vec2(cos(ang), sin(ang)), p2 = bc + vec2(cos(fa), sin(fa)) * 0.6 * bs;
            for (int sg = 0; sg < 2; sg++) {
              vec2 s0 = sg == 0 ? bc - ba * 0.75 * bs : bc, s1 = sg == 0 ? bc + ba * 0.75 * bs : p2, sd = s1 - s0;
              float bt = clamp(dot(ph - s0, sd) / dot(sd, sd), 0.0, 1.0);
              vec2 cl2 = ph - s0 - sd * bt;
              float d2 = length(cl2) / (1.0 - 0.35 * bt);
              if (d2 < dmin) { dmin = d2; nb2 = cl2 / max(length(cl2), 1e-5); tip = bt * step(0.6, length(s1) / R); }
            }
          }
        }
        float onB = 1.0 - smoothstep(rb - pxu, rb + pxu, dmin), bside = dot(nb2, Lh) * smoothstep(0.0, rb, dmin);
        lines = (1.0 - smoothstep(0.55 * pxu, 1.4 * pxu, abs(dmin - rb))) * smoothstep(0.2, -0.4, dot(nb2, Lh) - 0.3 * shade) * rr0;
        dark = ((1.0 - onB) * 0.65 + 0.3 * onB * smoothstep(0.0, -0.8, bside)) * rr0 + 0.25 * (1.0 - rr0);
        pale = onB * (smoothstep(0.0, 0.8, bside) + 0.8 * smoothstep(0.6, 1.0, tip)) * rr0 + 0.4 * smoothstep(0.75, 1.0, rho) * (1.0 - rr0);
        lit *= mix(1.0, onB, rr0);
      } else if (table) {
        float nr = max(6.0, floor(min(36.0 + 20.0 * fract(idC * 5.3), 1.2566 * R / (5.0 * pxu)))), lev = exp2(floor(log2(max(rho, 0.2) / 0.2)));
        float sp = 6.2832 * max(rho, 0.2) * R / (nr * lev);
        float ga = abs(fract(th / 6.2832 * nr * lev + 0.4 * vnoise(ph / (0.2 * R) + idC)) - 0.5) * sp;
        lines = 0.6 * (1.0 - smoothstep(0.08 * sp, 0.08 * sp + pxu, ga)) * smoothstep(2.5, 5.0, sp / pxu) * smoothstep(0.08, 0.2, rho) * (1.0 - smoothstep(0.84, 0.9, rho));
        float grw = abs(fract(rho * 5.0 + 0.6 * vnoise(ph / (0.25 * R) + idC * 3.0)) - 0.5) * R / 5.0;
        lines = max(lines, 0.35 * (1.0 - smoothstep(0.0, 1.2 * pxu, grw)) * smoothstep(2.5, 5.0, 0.2 * R / pxu) * (1.0 - smoothstep(0.8, 0.88, rho)));
        float nearS = onChart ? smoothstep(0.1, -0.35, dot(ph / R, away)) : 0.0, under = nearS * smoothstep(0.86, 0.94, rho);
        float lip = (1.0 - smoothstep(0.6 * pxu, 1.6 * pxu, abs(rho - 0.88) * R)) * smoothstep(0.0, 0.5, nearS + 0.4 * shade);
        lines = max(lines, 0.75 * lip * smoothstep(6.0, 14.0, R / pxu));
        pale = smoothstep(0.76, 0.86, rho) * (1.0 - smoothstep(0.86, 0.9, rho)) * (0.6 + 0.4 * lit);
        dark = max(0.5 * smoothstep(0.96, 1.0, rho) * smoothstep(0.2, 0.7, shade), 0.85 * under);
        lit *= 1.0 - under;
      } else {
        float rgp = R / 3.0, rg = abs(fract(rho * 3.0 + 0.25 * vnoise(ph / (0.2 * R) + idC * 3.0)) - 0.5) * rgp, pid, ps = 0.06 * R;
        vec4 pc = cells(ph / ps + idC * 9.0, pid);
        lines = max(0.5 * (1.0 - smoothstep(0.05 * rgp, 0.05 * rgp + pxu, rg)) * smoothstep(2.5, 5.0, rgp / pxu) * step(0.45, vnoise(ph / (0.3 * R) + idC * 7.0)),
                    0.5 * step(0.5, pid) * (1.0 - smoothstep(0.18, 0.18 + 1.5 * pxu / ps, pc.x)) * smoothstep(2.5, 4.5, ps / pxu));
        dark = 0.2 * smoothstep(0.5, 0.8, mot2);
      }
      fc = glaze(fc, mix(ROCK_T, SHELF_T, 0.35), 0.32 * dark * head * dim, 0.0, q);
      float modK = onChart ? 1.35 : 1.0;
      fc = mix(fc, LEAD * uPaper / PARCH, modK * (0.22 * lit * lit * (1.0 - hollow) + 0.26 * pale) * head * mix(0.6, 1.0, shallow));
      fc = glaze(fc, mix(ROCK_T, SHELF_T, 0.45), (0.4 * modK * modK * smoothstep(onChart ? 0.4 : 0.25, onChart ? 0.85 : 0.95, shade) + 0.45 * hollow + 0.25 * smoothstep(0.55, 1.0, rho)) * head * dim, 0.0, q);
      vec2 nd = ph / (length(ph) + 1e-4), hdir = vec2(-Lh.y, Lh.x);
      float edge = (1.0 - smoothstep(0.4, 1.6, abs(Fm - 1.0) / fw)) * step(0.4, vnoise(nd * 3.0 + idC * 37.0)) * (0.3 + 0.5 * shade);
      mat2 hmat = mat2(Lh.x, hdir.x, Lh.y, hdir.y);
      float hat = hatching(hmat * xr * 4.0, hmat * xrx * 4.0, hmat * xry * 4.0, clamp(0.8 * smoothstep(0.35, 1.0, shade) + 0.4 * hollow, 0.0, 0.85), idC * 13.0);
      float hatK = onChart && kind >= 0.46 && kind < 0.84 ? 0.45 : modK;
      float lineK = max(max(edge * 0.8, 0.5 * hatK * hat) * big, (0.45 + 0.4 * shade) * modK * lines * (onChart ? mix(0.6, 1.0, shade) : 1.0));
      if (onChart) headInk = max(headInk, max(edge * 0.8 * big, lineK * head) * inkD * thin);
      else fc = mix(fc, hatchInk(0.55), 0.6 * lineK * head * mkr * inkD);
      heads = max(heads, head);
      crownD = min(crownD, max(fdep - zh, 0.2));
    }
    }
    if (fl.g > 0.0) {
    fc = glaze(fc, KELP_T, 0.5 * fl.g, 0.0, q);
    fc = glaze(fc, ROCK_T, 0.25 * fl.g * n1, 0.0, q);
    vec2 sway = rot2(0.5 * sin(uTime * 0.8 + dot(x, vec2(0.21, 0.17)))) * normalize(onPlane(wind, pf) + 1e-6);
    float blades = mark(x, sway, 1.1, fpx, 31.0, 0.75, 2) * smoothstep(4.0, 9.0, 1.1 / fpx);
    fc = mix(fc, hatchInk(0.55), 0.8 * blades * fl.g * mk);
    }
    float visH = clear > 0.0 ? min(0.9, exp(-0.1 * crownD) * (1.0 - 0.7 * smoothstep(4.5, 7.5, crownD)) * (1.0 - 0.45 * fres) * seen) : min(1.0, 1.7 * vis);
    col = mix(col, fc, mix(min(1.0, vis), max(visH, vis), heads));
    float visI = clear > 0.0 ? max(vis, visH) : vis;
    col = glaze(col, mix(ROCK_T, SHELF_T, 0.6), 0.75 * headShadow * max(vis, sVis), 0.0, q);
    col = mix(col, hatchInk(0.55), headInk * min(1.0, 2.2 * visI));
    heads *= visI;
  }

  float tone = clamp(1.0 - 1.4 * dot(vNormal - dir, uSun), 0.88, 1.14) * (1.0 - 0.5 * far);
  Paper qs = q;
  qs.mottle = 0.5 + 0.3 * (q.mottle - 0.5);
  qs.bloom = 0.5 + 0.3 * (q.bloom - 0.5);
  vec2 sh = layer(depth, fwD), shEnd = layer(16.0 + 4.0 * wob - depth, fwD);
  float shelfAt = 3.0;
  if (f.y > -2.0 && f.y < 18.0) {
    vec2 rise;
    float ex = exposure(dir, f.y, rise);
    shelfAt = max(${(DRAFT + 0.4).toFixed(2)}, 3.0 * exp(-SHELF_EX * ex * smoothstep(0.2, 0.45, rise.x) * smoothstep(6.0, 10.0, rise.y) * (1.0 - smoothstep(8.0, 16.0, f.y)) * (1.0 - f.w) * (1.0 - f.z) * (1.0 - clear)));
  }
  vec2 shelf = layer(depth - shelfAt * (1.0 + 0.5 * wob), fwD), deep = layer(depth - 24.0 - 2.5 * wob, fwD);
  col = glaze(col, SHALLOWS_T, SHALLOWS_D * tone * sh.x * shEnd.x * (1.0 - lagoon), 0.5 * shEnd.y + 0.3 * sh.y, qs);
  col = glaze(col, SHELF_T, SHELF_D * tone * shelf.x * (1.0 - lagoon), 0.4 * shelf.y, qs);
  col = glaze(col, DEEP_T, DEEP_D * tone * deep.x, 0.25 * deep.y, qs);
  col = glaze(col, LAGOON_T, LAGOON_D * tone * lagoon * sh.x * (1.0 - 0.5 * heads), 0.0, qs);
  vec2 drop = layer(depth - 4.8 - 0.9 * wob - 0.4 * fine, fwD), open = layer(depth - 15.0 - 4.0 * wob, fwD);
  if (clear > 0.0) {
    float glance = 0.6 + 0.4 * smoothstep(0.02, 0.3, dot(V, dir));
    vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
    float ring = 0.2 * (f.z + seaField(normalize(dir + t1 * (2.6 / SEA_R))).z + seaField(normalize(dir - t1 * (2.6 / SEA_R))).z
                      + seaField(normalize(dir + t2 * (2.6 / SEA_R))).z + seaField(normalize(dir - t2 * (2.6 / SEA_R))).z);
    ring = smoothstep(0.15, 0.85, ring);
    float dk = mix(drop.x, 0.75 * smoothstep(3.5, 10.0, depth + 1.5 * wob), ring);
    float turq = smoothstep(0.0, 0.9, depth) * (0.42 + 0.26 * smoothstep(1.0, 4.0, depth)) * (1.0 - 0.7 * dk) * (1.0 - open.x);
    col = glaze(col, TURQ_T, clear * water * glance * turq * tone * (1.0 - 0.45 * heads), 0.6 * open.y, qs);
    col = glaze(col, SHELF_T, clear * water * mix(glance, 1.0, 0.6) * 0.42 * dk * (1.0 - 0.35 * open.x), 0.4 * drop.y * (1.0 - ring), qs);
  }
  float hShoal = bEye * water * (1.0 - f.w) * (1.0 - smoothstep(1.6, 4.0 + wob, depth));
  if (hShoal > 0.0) {
    vec2 gEdge = layer(0.7 + 0.25 * wob - depth, fwD);
    col = glaze(col, SAND_T, 0.3 * gEdge.x * hShoal, 0.4 * gEdge.y, qs);
    col = glaze(col, TURQ_T, 0.34 * smoothstep(0.2, 1.4, depth) * hShoal * tone, 0.0, qs);
  }
  float back = -10.0 * dot(vNormal - dir, uSun) + 0.2 * (q.mottle - 0.5);
  vec2 band = layer(back - 0.3, fwidth(back));
  col = glaze(col, SHELF_T, 0.08 * band.x * water * (1.0 - far) * (1.0 - uCalm), 0.5 * band.y, qs);
  col = glaze(col, MUD_T, 0.25 * uSquall * water * (1.0 - far), 0.0, q);
  float stormSea = 1.0 - smoothstep(uStormCalm.w - 0.004, uStormCalm.w + 0.002, dot(dir, uStormCalm.xyz));
  col = glaze(glaze(col, MUD_T, 0.4 * stormSea * water, 0.0, q), DEEP_T, 0.3 * stormSea * water, 0.0, q);
  float backT = clamp(-6.0 * dot(vNormal - dir, uSun) - 0.1, 0.0, 1.0) * water * near * (1.0 - uCalm) * diag;
  col = mix(col, hatchInk(0.35), 0.55 * hatching(hc, hdx, hdy, 0.42 * backT, 5.0));

  float sunUp = smoothstep(-0.03, 0.04, dot(uSunDisc, dir)) * uLow * water;
  if (uLow > 0.001) {
    vec3 up0 = normalize(cameraPosition), rv = reflect(-V, vNormal);
    float el = dot(rv, up0), dip = sqrt(max(1.0 - pow(SEA_R / max(length(cameraPosition), SEA_R), 2.0), 0.0));
    vec3 hs = normalize(uSunDisc - up0 * dot(uSunDisc, up0) + 1e-6), hr = normalize(rv - up0 * el + 1e-6);
    float az = dot(hr, hs) * 0.5 + 0.5;
    float dz = 0.06 + 0.94 * (1.0 - exp(-max(el + dip, 0.0) * 2.4));
    dz = mix(dz, max(dz, 0.85), smoothstep(0.55, 0.1, az));
    vec3 sky = uSkyHorizon * pow(max(uSkyZenith / max(uSkyHorizon, vec3(1e-3)), vec3(1e-3)), vec3(dz));
    float glow = az * az * (1.0 - smoothstep(-0.04, 0.3, el - 0.22 * pow(az, 4.0))) * smoothstep(-0.25, 0.05, dot(uSunDisc, up0));
    sky = mix(sky, uSkyGlow, glow);
    sky *= 0.84;
    float cv = clamp(dot(V, vNormal), 0.0, 1.0), fr = 0.25 + 0.75 * pow(1.0 - cv, 3.0);
    float shallowClear = max(clear * (1.0 - smoothstep(4.0, 12.0, depth)), hShoal);
    float give = uLow * water * min(mix(fr, max(fr, 0.85), glow) * (1.0 - 0.75 * shallowClear), 0.92);
    col = mix(col, sky * parchment(qs) / uPaper, give);
    col = wash(col, uSunTint, 0.35 * uLow * water * shallowClear);
  }

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
    float landK = land * keep * calm * mix(0.85, 0.3 * smoothstep(-0.1, 0.15, fine), clear);
    col = glaze(col, mix(mix(ROCK_T, KELP_T, 0.45), KELP_T, clear), landK, 0.3 * land * calm * (1.0 - clear), q);
    col = glaze(col, SAND_T, 0.4 * sail * keep * calm, 0.0, q);
    col = mix(col, hatchInk(0.75), max(hull, mast) * keep * calm * 0.8);
    col = mix(col, hatchInk(0.3), 1.4 * gap * (1.0 - gap) * calm * near * (0.25 + 0.75 * max(land, max(hull, sail))));
  }

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
    float hb = 0.5 * dry * thin * lay.x * (1.0 - smoothstep(0.0, 0.3, own)) * water;
    if (hb > 0.0) col = mix(col, hatchInk(0.3), hb * hatching(hc, hdx, hdy, 0.4, 19.0));
    float bw = 0.9 * uRenderPx;
    col = mix(col, wash(uPaper, tt.rgb, 2.2), 0.85 * dry * thin * water * (1.0 - smoothstep(bw - 0.5, bw + 0.5, abs(own) / max(fo, 1e-5))));
  }

  float rx = log(max(1.0 + (f.y + 0.35 * wob + 0.12 * fine - RING0) / RING_D, 0.3)) / log(RING_G), fx = fwidth(rx);
  float kr = floor(rx + 0.5), rw2 = RING_CSS * uRenderPx * (1.0 - 0.08 * kr);
  float ring = (1.0 - smoothstep(rw2 - 0.5, rw2 + 0.5, abs(rx - kr) / max(fx, 1e-5))) * step(-0.5, kr) * step(kr, RINGS - 0.5)
             * pow(0.8, max(kr, 0.0)) * (0.75 + 0.6 * fine) * smoothstep(2.5, 5.0, 1.0 / max(fx, 1e-5)) * water * (1.0 - far);
  ring *= mix(1.0, smoothstep(10.0, 24.0, length(cameraPosition) - SEA_R - uSeaLevel), clear);
  ring *= 1.0 - smoothstep(0.3, 0.7, f.z);
  float cw = COAST_CSS * uRenderPx;
  float coast = 1.0 - smoothstep(cw - 0.5, cw + 0.5, abs(depth) / max(fwD, 1e-4));
  float shore = depth / max(fwD / upx, 0.02);
  float run = fract(uTime / 6.5 + wob * 1.7);
  float bore = (1.0 - smoothstep(0.0, 0.3, abs(f.y - mix(2.8, 0.0, run)))) * sin(run * 3.14159) * smoothstep(3.5, 0.5, depth);
  float off = (f.w > 0.02 && depth > -0.5 && shore < 1.2) ? offBeach(dir, f) : 0.0;
  if (off > 0.0) coast *= lipInk(dir, off);
  float foam = max((1.0 - smoothstep(0.15, 0.7 + 0.4 * wob, shore)) * (1.0 - 0.55 * off), 0.75 * bore) * water;
  vec2 xs = clear > 0.0 ? vec2(dot(P, uClearE), dot(P, uClearN)) : xp;
  float fwY = max(fwidth(f.y), 1e-4), surf = 0.0, face = 0.0, swellInk = 0.0, keel = 0.0, surfInk = 0.0;
  if (f.w > 0.02 && f.y < SURF_REACH && depth > -0.4 - SURF_WASH) {
    vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
    vec2 g = vec2(seaField(normalize(dir + t1 * (0.8 / SEA_R))).y, seaField(normalize(dir + t2 * (0.8 / SEA_R))).y) - f.y;
    vec3 seaward = normalize(t1 * g.x + t2 * g.y + dir * 1e-5);
    vec3 from = uClearE * sin(SURF_FROM) + uClearN * cos(SURF_FROM);
    float lit = smoothstep(SURF_LIT.x, SURF_LIT.y, dot(seaward, normalize(from - dir * dot(dir, from)))), reach = SURF_BREAK * lit;
    vec4 fo = seaField(normalize(dir + seaward * (SURF_OUT / SEA_R))), ff = seaField(normalize(dir + seaward * (SURF_FAR / SEA_R)));
    float open = f.w * lit * smoothstep(SURF_DEEP.x, SURF_DEEP.y, uSeaLevel - min(fo.x, ff.x)) * (1.0 - smoothstep(0.2, 0.6, max(f.z, max(fo.z, ff.z))));
    float exposed = open * smoothstep(SURF_STRIKE.x - reach, SURF_STRIKE.y - reach, f.x) * step(-0.4 - SURF_WASH * lit, depth);
    if (open > 0.0 && f.y > 1.6) {
      for (int k = 0; k < 3; k++) {
        float fk = float(k), rl = fract(f.y / 2.4 - uTime / 9.0 + 0.3 * wob + fk * 0.37) - 0.5;
        float lengths = step(0.62 - 0.12 * lit, vnoise(xs / 2.6 + vec2(fk * 5.3, floor(f.y / 2.4 - uTime / 9.0 + fk * 0.37) * 2.7)));
        swellInk = max(swellInk, (1.0 - smoothstep(0.5, 1.3, abs(rl) * 2.4 / fwY / uRenderPx)) * lengths * smoothstep(7.0, 5.0, f.y) * open);
      }
    }
    if (exposed > 0.0) {
      float s = f.y + 0.3 * wob + 0.08 * fine, detail = 1.0 - smoothstep(0.06, 0.22, upx);
      for (int k = 0; k < 3; k++) {
        float fk = float(k), t = uTime / 7.5 + fk / 3.0 + 0.45 * wob + 0.25 * vnoise(xs / 11.0 + fk * 3.1);
        float ph = fract(t), sk = mix(7.0, -3.2, ph), set = floor(t);
        float broke = smoothstep(2.0, 0.6, sk), spent = 1.0 - smoothstep(-1.4, -3.0, sk);
        float run = smoothstep(0.3, 0.42, vnoise(xs / 4.5 + vec2(fk * 7.7 + set * 3.3, set * 1.9)));
        float lineD = s - sk, back = 0.2 + 1.7 * broke * smoothstep(2.0, -1.5, sk);
        float lace = vnoise(xs / 0.45 + fk * 5.0 + set);
        float body = smoothstep(-fwY, fwY, lineD) * (1.0 - smoothstep(back * (0.25 + 0.75 * lace), back, lineD));
        surf = max(surf, body * broke * spent * run);
        surfInk = max(surfInk, (1.0 - smoothstep(0.5, 1.3, abs(lineD) / fwY / uRenderPx)) * broke * smoothstep(-1.0, 1.0, sk) * run
                               * step(0.32, vnoise(xs / 1.4 + vec2(fk * 2.1 + set * 1.7, set))));
        face = max(face, smoothstep(-0.55 - 0.3 * broke, -0.05, lineD) * step(lineD, 0.0) * smoothstep(4.0, 1.6, sk) * (1.0 - broke) * run);
        swellInk = max(swellInk, (1.0 - smoothstep(0.5, 1.3, abs(lineD) / fwY / uRenderPx)) * smoothstep(7.0, 5.5, sk) * (1.0 - smoothstep(3.5, 1.8, sk)) * run);
      }
      float rw = max(0.9, 5.0 * upx);
      float ribbon = (1.0 - smoothstep(rw, rw + 1.0 + upx, abs(s - 0.4))) * smoothstep(0.2, 0.34, vnoise(xs / 3.0));
      float ribbonInk = (1.0 - smoothstep(0.5, 1.2, abs(s - 0.4 - rw) / fwY / uRenderPx)) * smoothstep(0.24, 0.4, vnoise(xs / 3.0 + 7.0));
      float breathe = 0.5 + 0.5 * sin(6.2832 * (uTime / 7.5 + 0.45 * wob + 0.6 * vnoise(xs / 9.0)));
      float edge = 0.15 + (0.6 + 0.35 * breathe) * lit + 0.25 * fine, inner = -0.35 - 0.9 * lit + 0.6 * (vnoise(xs / 1.1) - 0.5);
      float lengths = smoothstep(0.62 - 0.4 * lit, 0.74 - 0.4 * lit, vnoise(xs / 3.4 + 4.0) + 0.15 * vnoise(xs / 0.8));
      float band = smoothstep(inner - 0.25, inner + 0.15, s) * (1.0 - smoothstep(edge - fwY, edge + fwY, s)) * lengths;
      float edgeInk = (1.0 - smoothstep(0.5, 1.3, abs(s - edge) / fwY / uRenderPx)) * lengths * smoothstep(0.3, 0.42, vnoise(xs / 1.3 + 9.0));
      float net = 1.0 - smoothstep(0.04, 0.1, abs(vnoise(xs / 0.55 + vec2(0.0, 0.02 * uTime)) - 0.5));
      float lace = net * smoothstep(inner - 1.2 - 2.4 * lit, inner - 0.2, s) * step(s, inner + 0.1) * smoothstep(0.2, 0.5, lit);
      surf = max(max(ribbon * 0.85 * (1.0 - detail), surf * detail), max(band, 0.8 * lace)) * exposed;
      surfInk = max(mix(0.6 * ribbonInk, surfInk, detail), 0.85 * edgeInk) * exposed;
      face *= exposed * detail;
      swellInk = max(swellInk * exposed * detail * near, swellInk * (1.0 - step(0.001, exposed)));
    }
  }
  float gentle = 0.0, ripple = 0.0, shoreLace = 1.0 - smoothstep(0.3, 1.1, shore), inshore = 0.0;
  float eyeH = length(cameraPosition) - SEA_R - uSeaLevel, upxTop = mix(0.09, 0.16, beach);
  float deckEye = max(1.0 - smoothstep(4.0, 7.0, eyeH), bEye);
  if (depth < 3.5 && f.w < 0.2 && upx < upxTop && water > 0.01 && deckEye > 0.01) {
    vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dir, t1);
    const float E = 0.7 / SEA_R;
    vec2 rise = vec2(seaField(normalize(dir + t1 * E)).x - seaField(normalize(dir - t1 * E)).x, seaField(normalize(dir + t2 * E)).x - seaField(normalize(dir - t2 * E)).x);
    float slopeS = length(rise) / 1.4, sd = depth / max(slopeS, 0.04);
    gentle = (1.0 - smoothstep(0.9, 1.4, slopeS)) * (1.0 - smoothstep(0.02, 0.2, f.w)) * (1.0 - smoothstep(mix(0.03, 0.09, beach), upxTop, upx)) * deckEye;
    if (gentle > 0.01) {
      float fs = max(fwidth(sd), 1e-4);
      float bayS = min(1.0, abs(vnoise(xs / 1.9 + 3.3) - 0.5) * 4.4), pulse = 0.85 + 0.15 * sin(uTime * 0.95 + 9.0 * wob);
      float sw = max((0.06 + 0.22 * bayS) * pulse + 0.03 * fine, 2.0 * fs);
      if (beach > 0.0) {
        float idB;
        vec4 cb = cells(xs / 2.6, idB);
        float bayH = smoothstep(0.0, 0.5, cb.y - cb.x);
        sw = mix(sw, max(sw, (1.5 + 6.0 * bayH * bayH) * pulse * fs), beach);
      }
      float edgeD = sd - sw;
      inshore = gentle * beach * (1.0 - smoothstep(4.5, 8.0, sd));
      float lens = (1.0 - smoothstep(-fs, fs, edgeD - max(0.05, 3.0 * fs) * (vnoise(xs / 0.5) - 0.5)))
                 * max(1.0 - smoothstep(0.2 * sw, 0.45 * sw, sd), smoothstep(0.42, 0.58, vnoise(xs / 0.28 + vec2(0.0, uTime * 0.1)) + 0.25 * fine));
      foam = mix(foam, max(lens, 0.75 * bore) * water, gentle);
      float edgeInk = (1.0 - smoothstep(cw - 0.5, cw + 0.5, abs(edgeD) / fs)) * smoothstep(0.25, 0.45, vnoise(xs / 1.1 + 5.0));
      coast = mix(coast, 0.8 * edgeInk, gentle);
      shoreLace = mix(shoreLace, (1.0 - smoothstep(sw + 0.1, sw + 0.6, sd)) * smoothstep(0.4, 0.6, vnoise(xs / 1.4 + wp * uTime * 0.05 + 2.0))
                  * (1.0 - smoothstep(0.05, 0.1, fs)), gentle);
      float ph = sqrt(max(edgeD, 0.0) + 0.3) * 4.2 + uTime / 3.4 + 0.5 * wob, wph = max(fwidth(ph), 1e-5);
      for (int k = 0; k < 2; k++) {
        float pk = ph + 0.5 * float(k), ci = floor(pk + 0.5);
        float env = smoothstep(0.42 + 0.08 * float(k) - 0.08 * beach, 0.62, vnoise(xs / mix(0.32, 1.1, beach) + vec2(ci * 7.3 + float(k) * 19.0, ci * 3.1)));
        ripple = max(ripple, (1.0 - smoothstep(0.6 * env, 0.6 * env + 0.9, abs(pk - ci) / wph / uRenderPx)) * step(0.02, env) * (1.0 - 0.4 * float(k)));
      }
      ripple *= gentle * smoothstep(0.15, 0.6, edgeD) * (1.0 - smoothstep(4.5, 8.0, sd)) * near * (1.0 - smoothstep(0.2, 0.4, wph));
    }
  }
  float laceZone = max(f.w * (1.0 - smoothstep(SURF_LACE.x, SURF_LACE.y, depth)) * mix(near, 1.0, clear), shoreLace * near) * water * mix(diag, 1.0, clear);
  if (laceZone > 0.02) {
    float idL, lcell = 0.8 * max(1.0, upx * uRenderPx * 6.0 / 0.8);
    vec2 lx = xs / lcell + wp * uTime * 0.05;
    lx += 0.5 * vec2(vnoise(lx * 0.6 + 3.7), vnoise(lx * 0.6 + 11.3)) + 0.32 * vec2(vnoise(lx * 1.7 + 7.9), vnoise(lx * 1.7 + 1.3)) - 0.41;
    vec4 cl = cells(lx, idL);
    float thread = vnoise(lx * 2.3 + 5.0 * idL), wall = (cl.y - cl.x) * lcell * 0.5 / upx / uRenderPx / (0.6 + 0.8 * thread);
    float net = (1.0 - smoothstep(0.4, 1.2, wall)) * smoothstep(0.32, 0.5, thread) * (0.55 + 0.45 * sin(uTime * 0.9 + 6.0 * wob + 3.0 * idL));
    keel = f.w * (1.0 - smoothstep(SURF_LACE.x, SURF_LACE.y, depth)) * water;
    foam = max(foam, laceZone * net * mix(1.0, 0.7, keel));
  }
  vec3 pl = P / 2.3, pb = (P + wind * uTime * 0.3) / 3.3, plx = dFdx(pl), ply = dFdy(pl), pbx = dFdx(pb), pby = dFdy(pb);
  float lead = 0.0;
  if (foam > 0.0) lead = smoothstep(0.42, 0.62, foam * (0.5 + 0.55 * q.grain + 0.45 * triGrad(tMarks, pl, tw, plx, ply).b));
  float fy = max(fwidth(f.y), 1e-5) * uRenderPx, drift = 0.0;
  float d1 = 1.0 - smoothstep(0.3, 1.0, abs(f.y - 1.4 - 0.6 * wob) / fy), d2 = 0.6 * (1.0 - smoothstep(0.3, 0.9, abs(f.y - 2.7 - 0.9 * wob) / fy));
  float dk = water * near * smoothstep(0.3, 1.0, depth) * (1.0 - lead);
  if (max(d1, d2) * dk > 0.0) {
    float br = triGrad(tMarks, pb, tw, pbx, pby).g;
    drift = max(d1 * step(0.45, br), d2 * step(0.5, br)) * dk;
  }

  float riding = mix(0.6, 1.0, smoothstep(-0.4, 0.6, vLift)) * water * smoothstep(0.8, 2.5, depth) * near * (1.0 - lead);
  float waves = 0.0, caps = 0.0, crestK = smoothstep(0.1, 0.6, vLift), capK = riding * smoothstep(0.3, 0.8, vLift);
  float sheltered = clear * smoothstep(0.3, 0.7, f.z);
  if (riding > 0.0) {
    waves = marks(P, dir, wind, upx, STROKE_CELL, uStrokes, 0.0, 0, 0.0);
    if (crestK > 0.0) waves = max(waves, crestK * marks(P, dir, wind, upx, 2.8 * STROKE_CELL, 0.5 * uStrokes, 13.0, 0, 0.0));
    if (sheltered > 0.0) waves = mix(waves, 0.5 * smoothstep(0.38, 0.68, vnoise(xp / 11.0 + 0.02 * uTime) + 0.3 * (vnoise(xp / 3.7) - 0.5))
                                            * marks(P, dir, wind, upx, 0.45 * STROKE_CELL, min(1.0, 1.4 * uStrokes), 31.0, 0, 0.0), sheltered);
    waves *= riding * (1.0 - 0.75 * inshore);
    if (capK > 0.0) caps = capK * marks(P, dir, wind, upx, 1.7 * STROKE_CELL, uCaps, 23.0, 0, 0.0);
  }
  float spin = uSquall > 0.01 ? uSquall * water * near * marks(P, dir, wind, upx, 1.8, 0.45, 67.0, 1, uTime * 3.0) : 0.0;

  vec3 white = leadWhite(), pen = penInk();
  col = mix(col, hatchInk(0.45), ring * 0.85);
  col = mix(col, white, lead * 0.9);
  col = glaze(col, TURQ_T, 0.55 * face, 0.0, q);
  col = mix(col, hatchInk(0.4), 0.35 * face * hatching(hc, hdx, hdy, 0.5, 29.0));
  col = mix(col, pen, swellInk * 0.6);
  col = mix(col, mix(parchment(q) * 1.06, white, 0.6), smoothstep(0.25, 0.55, surf * (0.6 + 0.5 * q.grain)) * 0.9);
  col = mix(col, pen, surfInk * 0.8);
  col = mix(col, white, drift * 0.7);
  col = mix(col, pen, laneInk * 0.8);
  col = mix(col, white, laneFoam * 0.85);
  col = mix(col, pen, waves * 0.95);
  col = mix(col, pen, ripple * (1.0 - lead) * mix(0.75, 0.5, beach));
  col = mix(col, white, max(caps * 0.95, spin * 0.6));
  col = mix(col, uInk, coast * 0.9);
  col = mix(col, uSkyHorizon * parchment(q) / uPaper, far * far * 0.6);
  if (sunUp > 0.001) {
    vec3 Hs = normalize(V + uSunDisc);
    float ch = max(dot(Hs, vNormal), 0.05), tn2 = (1.0 - ch * ch) / (ch * ch);
    float path = exp(-tn2 / 0.05) * sunUp * (1.0 - lead) * (1.0 - coast);
    if (path > 0.01) {
      vec3 toward = normalize(uSunDisc - dir * dot(uSunDisc, dir) + 1e-6);
      float gold = marks(P, dir, toward, 0.35 * upx, 0.6 * STROKE_CELL, clamp(1.8 * path - 0.1, 0.0, 0.95), 41.0, 0, 0.0) * diag;
      float dark = marks(P, dir, toward, 0.6 * upx, 0.6 * STROKE_CELL, 0.75 * smoothstep(0.03, 0.25, path) * (1.0 - 0.7 * smoothstep(0.45, 0.85, path)), 53.0, 0, 0.0) * diag * (1.0 - gold);
      col = mix(col, SUN_GOLD * parchment(q) / uPaper, 0.3 * smoothstep(0.3, 0.9, path));
      col = mix(col, pen, 0.75 * dark);
      col = mix(col, mix(mix(LEAF_LO, LEAF_HI, smoothstep(0.05, 0.3, path)), LEAF_GLINT, clamp(path + fine, 0.0, 1.0)), gold * smoothstep(0.08, 0.3, path));
    }
  }
#ifdef HEADS_PROBE
  outColor = vec4(heads, 0.0, 0.0, 1.0); outAux = vec4(0.0); return;
#endif
  writeInk(candle(col, vWorld), normalize(dir + 0.3 * (vNormal - dir)), (off > 0.0 ? lipInk(dir, off) : 1.0) * (1.0 - 0.85 * gentle));
}
`;

const WAKE_VERTEX =  `
${SWELL_GLSL}
${SHORE_SWELL_GLSL}
uniform float uTime;
uniform float uStill[${WAKE_SHIPS}];
in vec4 aFwd;
in vec4 aWake;
out vec3 vRest;
out vec3 vWorld;
out vec2 vUv;
out float vAge;
out float vSpeed;
out float vDie;
void main() {
  vec3 dir = normalize(position);
  float age = max(uTime - aWake.y, 0.0), still = uStill[gl_VertexID / ${2 * WAKE_PTS}];
  float open = still < 0.0 ? age : min(age, max(still - aWake.y, 0.0));
  float hw = aWake.w + min(0.36 * aWake.z * open, 7.0);
  vDie = still < 0.0 ? 1.0 : 1.0 - smoothstep(0.0, ${WAKE_DIE.toFixed(1)}, uTime - still);
  vec3 side = cross(dir, aFwd.xyz);
  side /= max(length(side), 1e-6);
  vec3 p = normalize(dir * SEA_R + side * aWake.x * hw);
  vec4 f = seaField(p);
  vec3 n;
  float lift;
  vec3 d = swell(p, uTime, shoreSwell(p, uSeaLevel - f.x), n, lift);
  vRest = p;
  vWorld = p * (SEA_R + uSeaLevel) + d;
  vUv = vec2(aWake.x, aFwd.w);
  vAge = age;
  vSpeed = aWake.z;
  vec3 e = cameraPosition - vWorld;
  float de = length(e);
  vec4 c = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  vec4 nearer = projectionMatrix * viewMatrix * vec4(vWorld + e * (min(0.4 + 0.01 * de, 0.5 * de) / de), 1.0);
  gl_Position = vec4(c.xy, nearer.z / nearer.w * c.w, c.w);
}
`;

const WAKE_FRAGMENT =  `
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
  float arm = smoothstep(0.5, 0.88, u) * (1.0 - smoothstep(0.93, 1.0, u)) * (1.0 - 0.6 * vAge / LIFE);
  float track = (1.0 - smoothstep(0.0, 0.5, u)) * exp(-0.5 * vAge);
  float dry = smoothstep(0.4, 0.62, max(arm, track) * (0.35 + 0.6 * q.grain + 0.55 * n1));
  float tr = vUv.y / (0.6 + 0.15 * vSpeed) + 0.3 * vUv.x * vUv.x, ft = max(fwidth(tr), 1e-5) * uRenderPx;
  float trans = (1.0 - smoothstep(0.4, 1.1, abs(fract(tr) - 0.5) / ft)) * (1.0 - smoothstep(0.55, 0.8, u)) * step(0.4, n2) * smoothstep(0.0, 0.6, vAge);
  float edge = (1.0 - smoothstep(0.4, 1.1, abs(u - 0.985) / fu)) * step(0.35, n1);
  float ink = max(0.55 * trans, 0.8 * edge);
  float a = max(0.95 * dry, ink) * life;
  if (a < 0.003) discard;
  writeVeil(candle(dry >= ink ? leadWhite() : penInk(), vWorld), a);
}
`;

export class Wakes {
  readonly geometry = new THREE.BufferGeometry();
  readonly ships = Array.from({ length: WAKE_SHIPS }, () => new THREE.Vector4());
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

  get triangles(): number {
    return this.geometry.index!.count / 3;
  }

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
      for (let j = WAKE_HEAD + 1; j < WAKE_PTS; j++) this.put(s, j, stern, f, o - half, t, 0, 0);
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

  stop(id: number, t: number): void {
    const s = this.ids.indexOf(id);
    if (s < 0 || this.still[s] >= 0) return;
    this.still[s] = t;
    this.ships[s].w = 0;
  }

  forget(id: number): void {
    const s = this.ids.indexOf(id);
    if (s < 0) return;
    this.ids[s] = -1;
    this.ships[s].w = 0;
    this.still[s] = -1;
    for (let j = 0; j < WAKE_PTS; j++) this.put(s, j, this.at[s], this.f.set(1, 0, 0), 0, -1e4, 0, 0);
    this.dirty = true;
  }

  commit(): void {
    if (!this.dirty) return;
    for (const name of ['position', 'aFwd', 'aWake']) this.geometry.getAttribute(name).needsUpdate = true;
    this.dirty = false;
  }

  dispose(): void {
    this.geometry.dispose();
  }

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
    this.swell = new Swell(geo, beachGates(geo));
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

  get triangles(): number {
    return this.mesh.geometry.index!.count / 3 + this.wakes.triangles;
  }

  setWind(p: V3, toward: V3, strength: number): void {
    this.swell.setWind(p, toward, strength);
    this.wind = strength;
    this.marks();
  }

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

  setStreams(arcs: readonly Arc[]): void {
    for (let i = this.fixed; i < MAX_LANES; i++) {
      const arc = arcs[i - this.fixed];
      if (arc) this.lay(i, arc);
      else this.local.uLaneN.value[i].w = 0;
    }
  }

  setTerritory(map: THREE.CubeTexture | null, moments: THREE.CubeTexture | null = null, slots = this.local.uFlood.value): void {
    this.local.tTerritory.value = map;
    this.local.tFlood.value = moments;
    this.local.uFlood.value = slots;
    this.local.uTerritory.value = map ? 1 : 0;
  }

  setStorm(at: V3, cos: number): void {
    this.local.uStormCalm.value.set(at.x, at.y, at.z, cos);
  }

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

export const seas = new WeakMap<THREE.Object3D, Sea>();

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
