// The ocean: swell, surface mesh, water shading (reflection, refraction, absorption), surf, foam,
// wakes, glitter paths and bioluminescence. Territory tint comes from territory.ts.
import * as THREE from 'three';
import { R, SHIPS, HN, smoothstep, wind, cellOf, faceDir, v3, type V3 } from './sim.ts';
import { fbm, hash, sampleCube } from './craft.ts';
import type { World } from './world.ts';
import { LAYER } from './post.ts';
import { COMMON_GLSL, MAX_LIGHTS, POINT_LIGHTS_GLSL, SHADOW_GLSL, SKY_GLSL, WIND_GLSL } from './sky.ts';
import { TERRITORY_GLSL } from './territory.ts';
import type { Ctx, Frame } from './main.ts';

// ---------------------------------------------------------------------------------------------
// Swell: a sum of great-circle Gerstner waves whose weights follow the local wind, so the sea always
// runs with the wind and is seamless everywhere on the sphere, poles included. Shallows and lagoons
// are sheltered, and bores of surf run up every exposed shore. The same function exists in
// TypeScript (ships, floating props, the camera) and GLSL (surface, terrain swash, trails, foam).
const WAVES = 24;
export const GRAVITY = 14; // world units / s², tuned for a lively sea at game speed
const waveA: THREE.Vector4[] = []; // propagation axis xyz, wavenumber k
const waveB: THREE.Vector4[] = []; // amplitude, angular frequency, phase, steepness
for (let i = 0; i < WAVES; i++) {
  // golden-angle spiral gives evenly spread axes without a fixed symmetry
  const y = 1 - (2 * (i + 0.5)) / WAVES, r = Math.sqrt(1 - y * y), th = i * 2.39996323;
  const lambda = 5 * Math.pow(40 / 5, ((i * 7) % WAVES) / (WAVES - 1));
  const k = (2 * Math.PI) / lambda;
  waveA.push(new THREE.Vector4(r * Math.cos(th), y, r * Math.sin(th), k));
  waveB.push(new THREE.Vector4(lambda * 0.05, Math.sqrt(GRAVITY * k), (i * 1.618) % (2 * Math.PI), 0.65));
}

/** Shared by every material that rides the swell. uSwellAmp is the storm-scaled master amplitude. */
export const SWELL_UNIFORMS = {
  uWaveA: { value: waveA },
  uWaveB: { value: waveB },
  uSwellAmp: { value: 1 },
  tSea: { value: null as THREE.CubeTexture | null }, // sea state, see seaState() below
};

/**
 * Needs WIND_GLSL. vec3 swell(vec3 unitDir, float t, float simT, out vec3 normal) → displacement (add it to
 * unitDir·R). Also defines vec4 seaState(vec3 unitDir): x height above sea level, y signed distance to the
 * coast (>0 navigable water), z shelter (0.15 lagoon … 1 open sea), w surf exposure 0..1.
 */
export const SWELL_GLSL = /* glsl */ `
uniform vec4 uWaveA[${WAVES}];
uniform vec4 uWaveB[${WAVES}];
uniform float uSwellAmp;
uniform samplerCube tSea;
vec4 seaState(vec3 p) {
  // the cube texels hold the sim's equal-angle grid, so warp the lookup direction to match
  vec3 q = p / max(max(abs(p.x), abs(p.y)), abs(p.z));
  return textureLod(tSea, atan(q) * 1.2732395, 0.0);
}
// Surf: bores run up exposed shores every few seconds and drain back. Returns the lift; brk = breaking foam.
float surf(vec3 p, vec4 sea, float t, out float brk) {
  float zone = smoothstep(3.0, 1.2, -sea.x) * (1.0 - smoothstep(0.4, 0.75, sea.x));
  vec3 q = p * ${R.toFixed(1)};
  float along = 0.3 * sin(dot(q, vec3(0.11, 0.05, -0.07))) + 0.2 * sin(dot(q, vec3(-0.04, 0.09, 0.06)));
  float u = fract(sea.y / 5.5 + t / 6.5 + along);
  float e = zone * sea.w * (0.65 + 0.35 * sin(t * 0.23 + along * 9.0));
  brk = e * smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.06, 0.6, u)) * smoothstep(2.6, 0.5, -sea.x);
  return 0.22 * e * sqrt(uSwellAmp) * (1.0 - u) * (1.0 - u) * smoothstep(0.0, 0.06, u);
}
// Whitecaps: crests that fold and stand high break. lift: height above the rest surface; extra: added fold (short
// waves riding the crest, or a head start for spray that leaves before the foam shows)
float whitecap(float fold, float lift, float extra) {
  return smoothstep(0.25, 0.55, fold + 0.12 * lift / max(uSwellAmp * 0.6, 0.2) + extra);
}
// fold: horizontal compression of the Gerstner crests (whitecaps break where it nears 1); sea: seaState(p);
// surfing: x breaking foam of the surf, y its lift
vec3 swellFull(vec3 p, float t, float simT, out vec3 nrm, out float fold, out vec4 sea, out vec2 surfing) {
  sea = seaState(p);
  vec3 w = windAt(p, simT);
  float ws = length(w);
  vec3 wd = w / max(ws, 1e-4);
  float amp = uSwellAmp * (0.55 + 0.45 * min(ws, 1.4)) * sea.z;
  float wgt[${WAVES}];
  float total = 1e-3;
  for (int i = 0; i < ${WAVES}; i++) {
    vec3 D = uWaveA[i].xyz;
    float c = dot(p, D), s = 1.0 - c * c;
    wgt[i] = s * s * smoothstep(-0.1, 0.9, dot(D - c * p, wd) * inversesqrt(max(s, 1e-8)));
    total += wgt[i];
  }
  vec3 disp = vec3(0.0), slope = vec3(0.0);
  fold = 0.0;
  for (int i = 0; i < ${WAVES}; i++) {
    float wi = wgt[i] / total;
    if (wi < 1e-3) continue;
    vec3 D = uWaveA[i].xyz;
    float k = uWaveA[i].w, c = dot(p, D);
    vec3 tang = (D - c * p) * inversesqrt(max(1.0 - c * c, 1e-8));
    float a = uWaveB[i].x * amp * wi;
    float ph = k * ${R.toFixed(1)} * asin(clamp(c, -1.0, 1.0)) - uWaveB[i].y * t + uWaveB[i].z;
    float sn = sin(ph), cs = cos(ph), q = uWaveB[i].w * a;
    disp += p * (a * sn) + tang * (q * cs);
    slope += tang * (a * k * cs);
    fold += q * k * sn;
  }
  surfing.y = surf(p, sea, t, surfing.x);
  disp += p * surfing.y;
  nrm = normalize(p * (1.0 - fold) - slope);
  return disp;
}
vec3 swell(vec3 p, float t, float simT, out vec3 nrm) {
  float fold;
  vec4 sea;
  vec2 surfing;
  return swellFull(p, t, simT, nrm, fold, sea, surfing);
}
`;

// Sea state on a cube grid of SEA cells per face edge (the world's grid, 2×2 averaged): height, coast
// distance, shelter, exposure. Surf and shelter vary over several units, so the coarser grid loses nothing.
const SEA = HN / 2;
let seaGrid: Float32Array | null = null;
const sea4 = [0, 0, 1, 0];
/** Bilinear lookup of the sea-state grid within one face, matching the GPU cube filtering. */
function seaAt(p: V3): number[] {
  if (seaGrid) sampleCube(seaGrid, SEA, p, sea4, 4);
  return sea4;
}

function surfLift(p: V3, s: number[], t: number, amp: number): number {
  const zone = smoothstep(3, 1.2, -s[0]) * (1 - smoothstep(0.4, 0.75, s[0]));
  if (zone <= 0) return 0;
  const along = 0.3 * Math.sin(R * (p.x * 0.11 + p.y * 0.05 - p.z * 0.07)) + 0.2 * Math.sin(R * (-p.x * 0.04 + p.y * 0.09 + p.z * 0.06));
  const x = s[1] / 5.5 + t / 6.5 + along, u = x - Math.floor(x);
  const e = zone * s[3] * (0.65 + 0.35 * Math.sin(t * 0.23 + along * 9));
  return 0.22 * e * Math.sqrt(amp) * (1 - u) * (1 - u) * smoothstep(0, 0.06, u);
}

const W = v3(), Q = v3();
const wgt = new Float64Array(WAVES);
const disp = { h: 0, hx: 0, hy: 0, hz: 0, sx: 0, sy: 0, sz: 0, fold: 0 };
/** Displacement of the surface point whose rest direction is q (weights from swellWeights). */
function swellDisp(q: V3, t: number, amp: number): void {
  let h = 0, hx = 0, hy = 0, hz = 0, sx = 0, sy = 0, sz = 0, fold = 0;
  for (let i = 0; i < WAVES; i++) {
    if (wgt[i] < 1e-3) continue;
    const D = waveA[i], B = waveB[i];
    const c = q.x * D.x + q.y * D.y + q.z * D.z;
    const il = 1 / Math.sqrt(Math.max(1 - c * c, 1e-8));
    const tx = (D.x - c * q.x) * il, ty = (D.y - c * q.y) * il, tz = (D.z - c * q.z) * il;
    const a = B.x * amp * wgt[i];
    const ph = D.w * R * Math.asin(Math.max(-1, Math.min(1, c))) - B.y * t + B.z;
    const sn = Math.sin(ph), cs = Math.cos(ph), qa = B.w * a * cs, sl = a * D.w * cs;
    h += a * sn;
    hx += tx * qa; hy += ty * qa; hz += tz * qa;
    sx += tx * sl; sy += ty * sl; sz += tz * sl;
    fold += B.w * a * D.w * sn;
  }
  disp.h = h; disp.hx = hx; disp.hy = hy; disp.hz = hz; disp.sx = sx; disp.sy = sy; disp.sz = sz; disp.fold = fold;
}

/**
 * TypeScript twin of SWELL_GLSL. Writes the height of the sea surface straight above p into out.w and its
 * normal into out.xyz. The GPU moves surface points sideways (Gerstner), so this finds the rest point whose
 * displaced position lies over p before reading the height there.
 */
export function swell(p: V3, t: number, simT: number, out: THREE.Vector4): THREE.Vector4 {
  const s = seaAt(p);
  wind(p, simT, W);
  const ws = Math.hypot(W.x, W.y, W.z), iw = 1 / Math.max(ws, 1e-4);
  const amp = SWELL_UNIFORMS.uSwellAmp.value * (0.55 + 0.45 * Math.min(ws, 1.4)) * s[2];
  let total = 1e-3;
  for (let i = 0; i < WAVES; i++) {
    const D = waveA[i];
    const c = p.x * D.x + p.y * D.y + p.z * D.z, sq = 1 - c * c;
    const al = ((D.x - c * p.x) * W.x + (D.y - c * p.y) * W.y + (D.z - c * p.z) * W.z) * iw / Math.sqrt(Math.max(sq, 1e-8));
    wgt[i] = sq * sq * smoothstep(-0.1, 0.9, al);
    total += wgt[i];
  }
  for (let i = 0; i < WAVES; i++) wgt[i] /= total;
  Q.x = p.x; Q.y = p.y; Q.z = p.z;
  for (let it = 0; it < 4; it++) {
    swellDisp(Q, t, amp);
    if (it === 3) break;
    Q.x = p.x - disp.hx / R; Q.y = p.y - disp.hy / R; Q.z = p.z - disp.hz / R;
    const l = Math.hypot(Q.x, Q.y, Q.z);
    Q.x /= l; Q.y /= l; Q.z /= l;
  }
  const f = 1 - disp.fold;
  out.set(Q.x * f - disp.sx, Q.y * f - disp.sy, Q.z * f - disp.sz, 0).normalize();
  out.w = disp.h + surfLift(Q, seaAt(Q), t, SWELL_UNIFORMS.uSwellAmp.value);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Sea-state cube: the world's height and coast grids plus two blurred openness fields — shelter (how much
// swell reaches a spot) and exposure (how hard surf breaks on its shore) — uploaded as a cube texture whose
// texels sit exactly on the sim's equal-angle cells, so hardware filtering is seamless across faces.

/** Box-blur a cube-grid field in place; borders read across into the neighbouring faces. */
function blurCube(a: Float32Array, n: number, r: number): void {
  const m = n + 2 * r, pad = new Float32Array(m * m), row = new Float32Array(m * m), out = new Float32Array(a.length);
  const d = v3(), k = 1 / (2 * r + 1);
  for (let f = 0; f < 6; f++) {
    for (let jj = 0; jj < m; jj++) for (let ii = 0; ii < m; ii++) {
      const i = ii - r, j = jj - r;
      pad[jj * m + ii] = i >= 0 && i < n && j >= 0 && j < n ? a[f * n * n + j * n + i]
        : a[cellOf(faceDir(f, ((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1, d), n)];
    }
    for (let jj = 0; jj < m; jj++) {
      let s = 0;
      for (let ii = 0; ii < 2 * r + 1; ii++) s += pad[jj * m + ii];
      for (let ii = r; ii < m - r; ii++) {
        row[jj * m + ii] = s * k;
        if (ii + r + 1 < m) s += pad[jj * m + ii + r + 1] - pad[jj * m + ii - r];
      }
    }
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let jj = 0; jj < 2 * r + 1; jj++) s += row[jj * m + i + r];
      for (let j = 0; j < n; j++) {
        out[f * n * n + j * n + i] = s * k;
        if (j + 2 * r + 1 < m) s += row[(j + 2 * r + 1) * m + i + r] - row[j * m + i + r];
      }
    }
  }
  a.set(out);
}

function bakeSea(world: World): THREE.CubeTexture {
  const n = SEA, cells = 6 * n * n;
  const height = new Float32Array(cells), coast = new Float32Array(cells);
  for (let c = 0; c < cells; c++) {
    const f = Math.floor(c / (n * n)), j = Math.floor((c % (n * n)) / n), i = c % n;
    for (let k = 0; k < 4; k++) {
      const w = f * HN * HN + (2 * j + (k >> 1)) * HN + 2 * i + (k & 1);
      height[c] += world.heights[w] / 4;
      coast[c] += world.coast[w] / 4;
    }
  }
  const near = new Float32Array(cells), far = new Float32Array(cells);
  for (let c = 0; c < cells; c++) near[c] = far[c] = Math.max(0, -height[c]);
  blurCube(near, n, 3);
  blurCube(near, n, 3);
  blurCube(far, n, 7);
  blurCube(far, n, 7);
  const grid = new Float32Array(cells * 4);
  for (let c = 0; c < cells; c++) {
    grid[c * 4] = height[c];
    grid[c * 4 + 1] = coast[c];
    grid[c * 4 + 2] = 0.15 + 0.85 * smoothstep(1, 10, near[c]);
    grid[c * 4 + 3] = smoothstep(0.5, 6, far[c]);
  }
  seaGrid = grid;
  // GL cube face f, texel (s, t) → direction with |major| = 1 (GL ES 3.0 cube map table)
  const glDir = [
    (s: number, t: number, o: V3) => { o.x = 1; o.y = -t; o.z = -s; },
    (s: number, t: number, o: V3) => { o.x = -1; o.y = -t; o.z = s; },
    (s: number, t: number, o: V3) => { o.x = s; o.y = 1; o.z = t; },
    (s: number, t: number, o: V3) => { o.x = s; o.y = -1; o.z = -t; },
    (s: number, t: number, o: V3) => { o.x = s; o.y = -t; o.z = 1; },
    (s: number, t: number, o: V3) => { o.x = -s; o.y = -t; o.z = -1; },
  ];
  const d = v3(), half = THREE.DataUtils.toHalfFloat, faces: THREE.DataTexture[] = [];
  for (let f = 0; f < 6; f++) {
    const data = new Uint16Array(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      glDir[f](((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1, d);
      // texel coordinates are equal-angle: undo the warp to find the true direction
      d.x = Math.tan((d.x * Math.PI) / 4); d.y = Math.tan((d.y * Math.PI) / 4); d.z = Math.tan((d.z * Math.PI) / 4);
      const c = cellOf(d, n) * 4, o = (j * n + i) * 4;
      for (let k = 0; k < 4; k++) data[o + k] = half(grid[c + k]);
    }
    faces.push(new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType));
  }
  const cube = new THREE.CubeTexture(faces);
  cube.format = THREE.RGBAFormat;
  cube.type = THREE.HalfFloatType;
  cube.minFilter = cube.magFilter = THREE.LinearFilter;
  cube.generateMipmaps = false;
  cube.needsUpdate = true;
  return cube;
}

// ---------------------------------------------------------------------------------------------
// Lacy foam: a tileable web of bubble walls at three scales over drifting patchiness. Thresholding it at a
// rising level dissolves dense foam into lace and then into scattered threads, which is how foam decays.
function foamTexture(): THREE.DataTexture {
  const N = 512;
  const wrap = (a: number, n: number) => ((a % n) + n) % n;
  const tiled = (x: number, y: number, n: number, s: number) => fbm(x, y, 0, s, 4, n, n);
  const cell = [0, 0]; // distance to the nearest feature point, gap to the second (cell units)
  const worley = (x: number, y: number, n: number, s: number) => {
    const i = Math.floor(x), j = Math.floor(y);
    let d1 = 9, d2 = 9;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
      const wi = wrap(i + a, n), wj = wrap(j + b, n);
      const d = Math.hypot(i + a + 0.1 + 0.8 * hash(wi, wj, 0, s) - x, j + b + 0.1 + 0.8 * hash(wi, wj, 0, s + 7) - y);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    cell[0] = d1; cell[1] = d2 - d1;
  };
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const n = tiled(u * 3, v * 3, 3, 1), m = tiled(u * 6 + 3, v * 6, 6, 5), mix = tiled(u * 2 + 7, v * 2, 2, 41);
    const wx = (tiled(u * 4, v * 4, 4, 11) - 0.5) * 0.16, wy = (tiled(u * 4 + 5, v * 4, 4, 13) - 0.5) * 0.16;
    worley((u + wx) * 7, (v + wy) * 7, 7, 21);
    const web1 = Math.exp(-cell[1] * (6 + 6 * m)) * (0.6 + 0.4 * Math.min(1, cell[0] * 1.5));
    worley((u + wx * 0.7) * 17, (v + wy * 0.7) * 17, 17, 31);
    const web2 = Math.exp(-cell[1] * (5 + 5 * m));
    worley((u + wx * 0.4) * 41, (v + wy * 0.4) * 41, 41, 47);
    const web3 = Math.exp(-cell[1] * 5), bubble = Math.exp(-cell[0] * cell[0] * 18);
    const big = Math.min(1, Math.max(0, (mix - 0.35) * 3));
    const web = big * web1 + (1 - big) * web2 * 0.95 + 0.35 * web3 * (0.3 + m);
    const o = (y * N + x) * 4;
    data[o] = 255 * Math.max(0, Math.min(1, 0.7 * web + 0.55 * (n - 0.5) + 0.12 * bubble * m + 0.12));
    data[o + 1] = 255 * n;
    data[o + 2] = 255 * bubble;
    data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------
// A tangent frame carried over the sphere by parallel transport. Local coordinates of a direction p are
// o + R·(p·t1, p·t2); o accumulates the travel so world-fixed points keep their coordinates.
class Carrier {
  readonly n = new THREE.Vector3(0, 1, 0);
  readonly t1 = new THREE.Vector3(1, 0, 0);
  readonly t2 = new THREE.Vector3(0, 0, -1);
  ox = 0;
  oy = 0;
  private readonly q = new THREE.Quaternion();

  moveTo(dir: THREE.Vector3): void {
    this.ox += R * dir.dot(this.t1);
    this.oy += R * dir.dot(this.t2);
    this.q.setFromUnitVectors(this.n, dir);
    this.t1.applyQuaternion(this.q);
    this.t1.addScaledVector(dir, -this.t1.dot(dir)).normalize();
    this.t2.crossVectors(dir, this.t1);
    this.n.copy(dir);
  }
}

/**
 * Opaque scene depth captured by the pipeline this frame: float sceneDepth(vec2 uv) → view distance (uCameraFar where
 * nothing was drawn). Uniforms come from Pipeline.u.
 */
export const SCENE_DEPTH_GLSL = /* glsl */ `
uniform sampler2D tSceneDepth;
uniform float uCameraNear, uCameraFar;
float sceneDepth(vec2 uv) {
  float d = textureLod(tSceneDepth, uv, 0.0).x;
  return uCameraNear * uCameraFar / (uCameraFar - d * (uCameraFar - uCameraNear));
}
`;

/** Vertex shader for full-screen passes drawn with drawPass(): vUv runs 0..1 across the target. */
export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
const quadScene = new THREE.Scene().add(quad);
const quadCamera = new THREE.Camera();
quad.frustumCulled = false;
/** Draw a full-screen pass: material over the whole of target (its viewport and scissor apply). */
export function drawPass(r: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget): void {
  quad.material = material;
  r.setRenderTarget(target);
  r.render(quadScene, quadCamera);
}

// ---------------------------------------------------------------------------------------------
// Short waves: two tileable height fields (chop and ripples) summed from lattice waves with real dispersion,
// re-rendered every frame. The spectrum leans into the wind at the player; mipmaps carry slope variance
// (x, y slope, mean squared slope, height) so distant water widens the sun path instead of aliasing.
const DETAIL_WAVES = 64;
const DETAIL = [
  { period: 13, nMin: 3, nMax: 17, steep: 0.035 }, // chop, 0.75–4.3 units
  { period: 3.1, nMin: 2.5, nMax: 18, steep: 0.03 }, // ripples, 0.17–1.2 units
];
function latticeWaves(period: number, nMin: number, nMax: number, steep: number, seed: number): THREE.Vector4[] {
  const out: THREE.Vector4[] = [], used = new Set<number>();
  for (let i = 0; out.length < DETAIL_WAVES; i++) {
    const r = nMin * Math.pow(nMax / nMin, (i * 0.618034 + seed * 0.37) % 1);
    const a = i * 2.39996323 + seed;
    const m = Math.round(r * Math.cos(a)), n = Math.round(r * Math.sin(a));
    if ((m === 0 && n === 0) || used.has(m * 1000 + n)) continue;
    used.add(m * 1000 + n);
    const k = (2 * Math.PI * Math.hypot(m, n)) / period;
    // xy lattice vector, z amplitude (world units at full strength), w angular frequency
    out.push(new THREE.Vector4(m, n, (steep / k) * (0.7 + 0.6 * ((i * 0.754877) % 1)), Math.sqrt(GRAVITY * k)));
  }
  return out;
}

const DETAIL_FRAG = /* glsl */ `
uniform vec4 uWaves[${DETAIL_WAVES}];
uniform float uPeriod, uTime, uAmp;
uniform vec2 uWind;
varying vec2 vUv;
void main() {
  float h = 0.0;
  vec2 s = vec2(0.0);
  for (int i = 0; i < ${DETAIL_WAVES}; i++) {
    vec4 w = uWaves[i];
    vec2 kd = normalize(w.xy);
    float along = dot(kd, uWind);
    float a = w.z * uAmp * (0.12 + 0.88 * max(along, 0.0) * max(along, 0.0));
    float ph = 6.2831853 * dot(w.xy, vUv) - w.w * uTime + float(i) * 2.17;
    h += a * sin(ph);
    s += (a * cos(ph) * 6.2831853 / uPeriod) * w.xy;
  }
  gl_FragColor = vec4(s, dot(s, s), h);
}
`;

// ---------------------------------------------------------------------------------------------
// Wake map: a square around the player in the carrier's coordinates holding a shallow-water wave simulation
// (x now, y previous step), foam (z) and agitation (w, what bioluminescence and churn feed on). Hulls push the
// water aside, so bow waves, V arms and stern waves emerge from the simulation and follow every turn; foam is
// laid along the churned band astern and on steep wave crests, spreads and dissolves.
const WAKE_N = 1024;
const WAKE_SIZES = [192, 384, 768]; // world units across, chosen by camera distance
const WAKE_DT = 1 / 60;
const WAVE_SPEED = 3.3; // world units / s; with ships at ≈9 u/s the arms open at ≈21°
const KICKS = 8;

const WAKE_FRAG = /* glsl */ `
uniform sampler2D tState;
uniform vec2 uShift; // whole-texel scroll when the map recentres
uniform float uScale; // ratio of the previous map size to the current one (1 unless the size changed)
uniform float uSize, uC2, uKickOn, uKeep;
const float DT = ${WAKE_DT};
uniform vec2 uCentre; // carrier coordinates of the map centre minus the carrier offset
uniform vec3 uAnchor, uE1, uE2;
uniform vec4 uShipA[${SHIPS}]; // carrier xy, heading xy
uniform vec4 uShipB[${SHIPS}]; // length, speed factor, presence, sinking burst
uniform vec4 uKick[${KICKS}]; // carrier xy, radius, strength
varying vec2 vUv;
vec4 state(vec2 uv) {
  uv = (uv - 0.5) * uScale + 0.5 + uShift;
  // a select rather than a product, so a reset clears even a map that holds garbage
  return uKeep > 0.5 && all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0))) ? texture(tState, uv) : vec4(0.0);
}
void main() {
  float px = 1.0 / ${WAKE_N}.0;
  vec4 s = state(vUv);
  vec4 n = state(vUv + vec2(0.0, px)), so = state(vUv - vec2(0.0, px));
  vec4 e = state(vUv + vec2(px, 0.0)), w = state(vUv - vec2(px, 0.0));
  float lap = n.x + so.x + e.x + w.x - 4.0 * s.x;
  vec2 X = (vUv - 0.5) * uSize + uCentre;
  float r2 = dot(X, X);
  vec3 p = normalize(uAnchor * sqrt(max(${(R * R).toFixed(1)} - r2, 0.0)) + X.x * uE1 + X.y * uE2);
  // strong damping: the bow-wave arms die out within a few hull lengths, as a ship's wake does
  float h = s.x + (s.x - s.y) * (1.0 - 1.4 * DT) + uC2 * lap - 0.08 * s.x * DT;
  vec2 grad = vec2(e.x - w.x, n.x - so.x) / (2.0 * px * uSize);
  // the arms sweep sideways as they spread, so the water shader draws their breaking crests live; they only
  // leave a brief flicker of agitation here
  float foam = s.z * exp(-DT / 4.5) + 0.1 * (n.z + so.z + e.z + w.z - 4.0 * s.z);
  float agit = s.w * exp(-DT / 1.0) + max(length(grad) - 0.2, 0.0) * 0.8 * DT;
  for (int i = 0; i < ${SHIPS}; i++) {
    vec4 a = uShipA[i], b = uShipB[i];
    vec2 d = X - a.xy;
    float hl = b.x * 0.5, hb = b.x * 0.13;
    if (b.z <= 0.0 || dot(d, d) > b.x * b.x * 2.5) continue;
    float along = dot(d, a.zw), side = abs(dot(d, vec2(-a.w, a.z)));
    float el = (along / hl) * (along / hl) + (side / hb) * (side / hb);
    // thin-ship source: the bow lifts water and the stern draws it down with no net change, so a hull sits in
    // its own bow and stern waves rather than in a pit
    h += 0.18 * b.y * b.z * (along > 0.0 ? min(along / hl, 1.0) : max(along / hl, -1.0) * 0.45) * exp(-side * side / (hb * hb)) * smoothstep(1.3, 0.8, abs(along) / hl) * DT;
    float stern = smoothstep(hb * 1.5, hb * 0.2, side) * smoothstep(-hl * 2.6, -hl * 0.9, along) * smoothstep(-hl * 0.5, -hl, along);
    float bow = smoothstep(hl * 0.2, hl * 0.95, along) * smoothstep(1.9, 1.1, el) * smoothstep(0.7, 1.0, el);
    float rim = smoothstep(1.7, 1.05, el) * smoothstep(0.75, 1.05, el);
    float src = (stern * 2.2 + bow * 1.6 + rim * 0.8) * b.y + b.w * smoothstep(2.5, 0.5, el) * 3.0;
    foam += src * b.z * DT * 2.0;
    agit += src * b.z * DT * 3.0;
  }
  for (int i = 0; i < ${KICKS}; i++) {
    vec4 k = uKick[i];
    if (k.w == 0.0) continue;
    vec2 d = X - k.xy;
    float q = dot(d, d) / (k.z * k.z), g = exp(-q) * uKickOn;
    // a ring of chop around a burst of whitewater, never a mound
    h += k.w * 0.12 * (1.0 - q) * g;
    foam += abs(k.w) * g * 1.5;
    agit += abs(k.w) * g * 2.0;
  }
  // land and the far hemisphere stay still; the rim of the map absorbs outgoing waves
  vec2 edge = min(vUv, 1.0 - vUv);
  float keep = smoothstep(0.0, 0.03, min(edge.x, edge.y));
  if (seaState(p).x > -0.25 || r2 > ${(R * R * 0.81).toFixed(1)}) { h = 0.0; keep = 0.0; }
  gl_FragColor = vec4(h * keep, s.x * keep, min(foam, 3.0) * keep, min(agit, 3.0) * keep);
}
`;

// ---------------------------------------------------------------------------------------------
// Surface mesh: polar rings around the point under the camera, spaced by asinh so screen-space density stays
// even from the hull beside you to the horizon, which the outer ring always reaches. One mesh covers the
// whole visible cap from deck level to orbit, so there are no LOD seams or pops.
const RINGS = 288;
const SEGS = 384;
function polarGrid(): THREE.BufferGeometry {
  const pos = new Float32Array((RINGS + 1) * SEGS * 3);
  for (let i = 0; i <= RINGS; i++) for (let k = 0; k < SEGS; k++) {
    const o = (i * SEGS + k) * 3;
    pos[o] = i / RINGS;
    pos[o + 1] = (k / SEGS) * Math.PI * 2;
  }
  const index = new Uint32Array(RINGS * SEGS * 6);
  for (let i = 0, o = 0; i < RINGS; i++) for (let k = 0; k < SEGS; k++) {
    const a = i * SEGS + k, b = i * SEGS + ((k + 1) % SEGS), c = a + SEGS, d = b + SEGS;
    index.set([a, c, b, b, c, d], o);
    o += 6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

const WATER_VERT = /* glsl */ `
uniform float uTime, uSimTime;
uniform vec3 uGridN, uGridT1, uGridT2;
uniform vec2 uGrid; // camera height / R, asinh stretch
uniform vec3 uE1, uE2;
uniform sampler2D tDetail0;
uniform vec2 uDetailO0;
uniform sampler2D tWake;
uniform vec3 uWakeO; // carrier offset of the map, map size
${WIND_GLSL}
${SWELL_GLSL}
${SKY_GLSL}
${POINT_LIGHTS_GLSL}
varying vec3 vWorld;
varying vec3 vDir;
varying vec3 vNormal;
varying vec4 vSea; // fold, lift above the rest surface, breaking surf, shelter
varying vec3 vShore; // exposure, ground height, surf run-up 0..1
// lighting that varies slowly over the sea is evaluated per vertex: sun (shadow map aside) and ambient scale,
// moon, lanterns, and the haze (colour, transmittance)
varying vec4 vSun;
varying vec3 vMoon;
varying vec3 vPoint;
varying vec4 vFog;
void main() {
  float s = position.x, phi = position.y;
  float th = uGrid.x * sinh(uGrid.y * s);
  vec3 p = cos(th) * uGridN + sin(th) * (cos(phi) * uGridT1 + sin(phi) * uGridT2);
  vec3 n;
  float fold;
  vec4 sea;
  vec2 surfing;
  vec3 d = swellFull(p, uTime, uSimTime, n, fold, sea, surfing);
  // chop and wake waves lift the silhouette, filtered to the vertex spacing so they never alias or swim
  float spacing = ${R.toFixed(1)} * max(uGrid.x * uGrid.y * cosh(uGrid.y * s) / ${RINGS}.0, sin(th) * ${((2 * Math.PI) / SEGS).toFixed(5)});
  vec2 X = ${R.toFixed(1)} * vec2(dot(p, uE1), dot(p, uE2));
  float lod = log2(max(spacing * 256.0 / ${DETAIL[0].period.toFixed(1)}, 1.0)) + 1.0;
  float chop = textureLod(tDetail0, (X + uDetailO0) / ${DETAIL[0].period.toFixed(1)}, lod).w * smoothstep(0.6, 0.2, spacing);
  vec2 wuv = (X + uWakeO.xy) / uWakeO.z + 0.5;
  float wake = textureLod(tWake, wuv, 0.0).x * smoothstep(0.5, 0.42, max(abs(wuv.x - 0.5), abs(wuv.y - 0.5)));
  vec3 world = p * (${R.toFixed(1)} + (chop + wake) * sea.z) + d;
  vWorld = world;
  vDir = p;
  vNormal = n;
  vSea = vec4(fold, dot(d, p), surfing.x, sea.z);
  vShore = vec3(sea.wx, surfing.y / (0.22 * sqrt(uSwellAmp)));
  bool sunKey = skySunKey();
  vSun = vec4(uSky.sunE * (sunKey ? skyKeyVisibility(world, uSky.sunDir) : skyAltVisibility(world, uSky.sunDir)), skyAmbientScale(world));
  vMoon = uSky.moonE * (sunKey ? skyAltVisibility(world, uSky.moonDir) : skyKeyVisibility(world, uSky.moonDir));
  vPoint = skyPointLights(world, normalize(world), 0.3);
  vFog = vec4(skyFogColor(normalize(world - cameraPosition)), skyFogT(world));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

// a function: territory.ts imports this module, so its GLSL is only read once both have loaded
const waterFrag = () => /* glsl */ `
uniform mat4 projectionMatrix;
uniform float uTime, uNight, uStorm, uRain;
uniform vec3 uAmbient;
uniform samplerCube tSkyCube;
uniform sampler2D tSceneColor;
uniform vec2 uResolution;
uniform vec3 uAnchor, uE1, uE2;
uniform sampler2D tDetail0, tDetail1, tFoam, tWake;
uniform vec2 uDetailO0, uDetailO1, uFoamO;
uniform vec3 uWakeO;
${COMMON_GLSL}
${WIND_GLSL}
${SWELL_GLSL}
${SKY_GLSL}
${SHADOW_GLSL}
${SCENE_DEPTH_GLSL}
${POINT_LIGHTS_GLSL}
${TERRITORY_GLSL}
varying vec3 vWorld;
varying vec3 vDir;
varying vec3 vNormal;
varying vec4 vSea;
varying vec3 vShore;
varying vec4 vSun;
varying vec3 vMoon;
varying vec3 vPoint;
varying vec4 vFog;

const vec3 ABSORB = vec3(1.25, 0.24, 0.11) + 0.12; // per world unit of water path, a little turbidity included
const vec3 DEEP = vec3(0.0035, 0.016, 0.034); // single-scattering colour of open water
const vec3 STORM_SEA = vec3(0.011, 0.026, 0.028); // churned grey-green water under the storm
const vec3 SSS = vec3(0.05, 0.42, 0.36); // light through thin crests
const vec3 SSS_LOW = vec3(0.4, 0.3, 0.12); // the same under a low golden sun
const float PI = 3.14159265;

vec3 viewAt(vec2 uv, float z) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3((ndc + vec2(projectionMatrix[2][0], projectionMatrix[2][1])) * z / vec2(projectionMatrix[0][0], projectionMatrix[1][1]), -z);
}

// Screen-space reflection: march the reflected ray across the opaque depth and refine the hit. Rays that
// leave the screen or pass behind everything fall back to the sky cube (which also carries the clouds).
vec4 trace(vec3 Pw, vec3 Rw) {
  vec3 o = (viewMatrix * vec4(Pw, 1.0)).xyz;
  vec3 d = normalize(mat3(viewMatrix) * Rw);
  float len = min(-o.z * 1.5 + 20.0, 120.0);
  if (d.z > 0.0) len = min(len, (-o.z - uCameraNear * 1.5) / d.z);
  vec4 h0 = projectionMatrix * vec4(o, 1.0), h1 = projectionMatrix * vec4(o + d * len, 1.0);
  float k0 = 1.0 / h0.w, k1 = 1.0 / h1.w;
  vec2 s0 = h0.xy * k0 * 0.5 + 0.5, s1 = h1.xy * k1 * 0.5 + 0.5, dir = s1 - s0;
  // clip the segment to the screen
  float tMax = 1.0;
  if (dir.x != 0.0) tMax = min(tMax, max(-s0.x / dir.x, (1.0 - s0.x) / dir.x));
  if (dir.y != 0.0) tMax = min(tMax, max(-s0.y / dir.y, (1.0 - s0.y) / dir.y));
  int steps = int(clamp(length(dir * uResolution) * tMax / 80.0, 3.0, 5.0));
  float tPrev = 0.0, tHit = -1.0;
  for (int i = 1; i <= 5; i++) {
    if (i > steps) break;
    float t = (float(i) - 0.5) / float(steps);
    t *= t * tMax;
    float rz = 1.0 / mix(k0, k1, t), sz = sceneDepth(mix(s0, s1, t));
    if (rz > sz && rz - sz < max(1.0, rz * 0.08)) { tHit = t; break; }
    tPrev = t;
  }
  if (tHit < 0.0) return vec4(0.0);
  for (int i = 0; i < 3; i++) {
    float t = 0.5 * (tPrev + tHit);
    if (1.0 / mix(k0, k1, t) > sceneDepth(mix(s0, s1, t))) tHit = t; else tPrev = t;
  }
  vec2 uv = mix(s0, s1, tHit), b = min(uv, 1.0 - uv);
  return vec4(textureLod(tSceneColor, uv, 0.0).rgb, smoothstep(0.0, 0.05, min(b.x, b.y)) * smoothstep(1.0, 0.8, tHit / tMax));
}

// One compare tap in whichever cascade covers p: the wavy surface hides the harder edge, and sky's filtered
// four-to-eight-tap lookup costs more than the rest of the water's lighting together.
float keyShadow(vec3 p, float viewDepth) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 c = (viewDepth < uKeyShadowSplit.y ? uKeyShadowMatrix : uKeyShadowMatrixFar) * vec4(p, 1.0);
  c.xyz /= c.w;
  return c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ? 1.0 : texture(tKeyShadow, c.xyz);
}

// Gaussian slope distribution (variance s2 per axis) seen through the half vector, with Fresnel and masking
float glint(vec3 N, vec3 V, vec3 L, float s2) {
  float nl = dot(N, L);
  if (nl <= 0.0) return 0.0;
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 1e-3), nv = max(dot(N, V), 1e-3);
  float p = exp(-(1.0 - nh * nh) / (nh * nh * 2.0 * s2)) / (2.0 * PI * s2);
  float f = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  float nu = nv * inversesqrt(max(2.0 * s2 * (1.0 - nv * nv), 1e-6));
  float lam = nu < 1.6 ? (1.0 - 1.259 * nu + 0.396 * nu * nu) / (3.535 * nu + 2.181 * nu * nu) : 0.0;
  return f * p / (4.0 * nv * nh * nh * nh * nh * (1.0 + lam));
}

// rain: expanding rings from drops on two offset lattices
vec2 rainRings(vec2 X, float t) {
  vec2 sl = vec2(0.0);
  for (int l = 0; l < 3; l++) {
    vec2 g = X / 0.45 + float(l) * vec2(0.37, 0.71), id = floor(g), f = fract(g) - 0.5;
    float h = hash13(vec3(id, float(l)));
    float age = fract(t * 1.3 + h * 7.0);
    vec2 q = f - (vec2(hash13(vec3(id, 3.0 + float(l))), hash13(vec3(id, 5.0 + float(l)))) - 0.5) * 0.5;
    float r = length(q), rr = age * 0.4;
    float w = sin((r - rr) * 60.0) * smoothstep(0.08, 0.0, abs(r - rr)) * (1.0 - age) * (1.0 - age);
    sl += q / max(r, 1e-3) * w * step(h, 0.3 + 0.7 * uRain);
  }
  return sl * 0.25;
}

void main() {
  vec4 tint, tfx;
  territory(vDir, tint, tfx);
  vec3 P = vWorld, up = normalize(P);
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 t1 = normalize(uE1 - up * dot(uE1, up)), t2 = cross(up, t1);
  vec2 X = ${R.toFixed(1)} * vec2(dot(vDir, uE1), dot(vDir, uE2));

  // short waves; mip-averaged slopes keep their variance, which widens the glitter with distance
  vec4 d0 = texture(tDetail0, (X + uDetailO0) / ${DETAIL[0].period.toFixed(1)});
  vec4 d1 = texture(tDetail1, (X + uDetailO1) / ${DETAIL[1].period.toFixed(1)});
  vec2 slope = (d0.xy + d1.xy) * vSea.w;
  float s2 = 0.0008 + 0.5 * max(d0.z - dot(d0.xy, d0.xy) + d1.z - dot(d1.xy, d1.xy), 0.0) * vSea.w;

  // wake simulation: wave slopes, foam and agitation
  vec2 wuv = (X + uWakeO.xy) / uWakeO.z + 0.5;
  float wfade = smoothstep(0.5, 0.42, max(abs(wuv.x - 0.5), abs(wuv.y - 0.5))) * step(0.1, dot(vDir, uAnchor));
  vec4 wk = vec4(0.0);
  float arms = 0.0;
  if (wfade > 0.0) {
    wk = texture(tWake, wuv);
    float wpx = 1.0 / ${WAKE_N}.0;
    vec2 wslope = vec2(texture(tWake, wuv + vec2(wpx, 0.0)).x - wk.x, texture(tWake, wuv + vec2(0.0, wpx)).x - wk.x)
      / (wpx * uWakeO.z) * wfade;
    wk *= wfade;
    slope += wslope;
    arms = smoothstep(0.14, 0.35, length(wslope)); // breaking crests of the bow waves
  }
  // churned water astern and on the flood front: broken, turbulent facets
  float churn = min(wk.w, 1.5) + tfx.w + min(tfx.z, 1.0) * 0.5;
  if (churn > 0.01) {
    slope += (vec2(vnoise(vec3(X * 2.3, uTime * 1.7)), vnoise(vec3(X * 2.3 + 7.0, uTime * 1.7))) - 0.5) * churn * 0.35;
    s2 += churn * 0.01;
  }
  if (uRain > 0.01) slope += rainRings(X, uTime) * uRain * smoothstep(0.08, 0.02, fwidth(X.x));

  vec3 N = normalize(vNormal - slope.x * t1 - slope.y * t2);
  // facets turned away from the eye would reflect the sea itself; bend them back
  N = normalize(N + V * max(0.0, 0.05 - dot(N, V)));
  float nv = max(dot(N, V), 1e-3);
  // a touch flatter than Schlick: the low sky reaches further across the sea, as in a painted seascape
  float F = 0.02 + 0.98 * pow(1.0 - nv, 4.0);

  // light: sun and moon as they reach this spot (terminator, haze, clouds, storm), the key one shadowed
  float zw = -(viewMatrix * vec4(P, 1.0)).z;
  float shadow = keyShadow(P, zw);
  bool sunKey = skySunKey();
  vec3 sunE = vSun.rgb * (sunKey ? shadow : 1.0);
  vec3 moonE = vMoon * (sunKey ? 1.0 : shadow);
  vec3 L = sunKey ? uSky.sunDir : uSky.moonDir;
  vec3 keyE = sunKey ? sunE : moonE;
  float amb = vSun.a;
  vec3 lightIn = sunE * max(dot(up, uSky.sunDir), 0.0) + moonE * max(dot(up, uSky.moonDir), 0.0)
    + uAmbient * (PI * amb) + skyFlash() + vPoint;

  // reflection: screen-space trace over the sky cube, blurred by the unresolved slopes
  vec3 Rw = reflect(-V, N);
  Rw = normalize(Rw + up * max(0.0, 0.03 - dot(Rw, up)));
  vec3 refl = textureLod(tSkyCube, Rw, clamp(log2(sqrt(s2) * 160.0), 0.0, 6.0)).rgb * amb + skyFlash() * 0.25;
  // rays climbing steeply leave the scene within a few pixels: only grazing ones can meet hulls and islands
  if (F > 0.1 && dist < 150.0 && dot(Rw, up) < 0.5) {
    vec4 ss = trace(P, Rw);
    refl = mix(refl, ss.rgb, ss.a);
  }

  // refraction: the opaque scene behind the surface, absorbed along the path through the water
  vec2 suv = gl_FragCoord.xy / uResolution;
  float zs0 = sceneDepth(suv);
  vec3 Nv = mat3(viewMatrix) * (N - up);
  vec2 ruv = suv + Nv.xy * clamp(zs0 - zw, 0.0, 3.0) * 0.6 / zw;
  float zs = sceneDepth(ruv);
  if (zs < zw) { ruv = suv; zs = zs0; }
  float thick = (zs - zw) * dist / zw;
  vec3 Pb = cameraPosition + viewAt(ruv, zs) * mat3(viewMatrix);
  // nothing behind (past the seabed's rim seen from orbit) is open ocean
  float depth = zs < uCameraFar * 0.999 ? max(length(P) - length(Pb), 0.0) : 60.0;
  float cosT = sqrt(1.0 - (1.0 - nv * nv) / 1.78);
  vec3 T = exp(-ABSORB * depth * (1.0 + 1.0 / cosT));
  vec3 body = mix(DEEP, STORM_SEA, uStorm) * lightIn;
  // anything standing above the seabed (hulls, posts, stacks) is lit underwater only by what slips past it from the
  // side: darken it, so a hull's waterline reads as foam over a dim hull rather than a bright contour
  float standing = smoothstep(0.4, 1.5, length(Pb) - ${R.toFixed(1)} - vShore.y);
  vec3 under = textureLod(tSceneColor, ruv, 0.0).rgb * T * (1.0 - 0.85 * standing) + body * (1.0 - T);

  // territory: the water body seen through the surface shifts a third of the way to the owner's hue at its own
  // brightness; reflections, glitter, waves and foam stay those of the sea
  float lum = dot(under, vec3(0.2126, 0.7152, 0.0722)), tl = max(dot(tint.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.01);
  under = mix(under, tint.rgb / tl * lum, tint.a * 0.3) * (1.0 - 0.35 * tfx.w);

  // sun and moon glitter paths
  float sigma = s2 + uStorm * 0.004;
  vec3 spec = vec3(0.0);
  if (sunE.g > 1e-4) spec += sunE * min(glint(N, V, uSky.sunDir, sigma + 0.0002), 150.0);
  if (moonE.g > 1e-4) spec += moonE * min(glint(N, V, uSky.moonDir, sigma + 0.0001), 150.0);

  // light through backlit crests: turquoise by day, gold in a low sun
  float back = pow(max(dot(V, -L), 0.0), 3.0) * 0.8 + 0.1 * max(dot(V, -L) + 1.0, 0.0);
  vec3 sssCol = mix(SSS, SSS_LOW, 1.0 - smoothstep(0.08, 0.45, dot(up, L)));
  vec3 sss = (sssCol * keyE * back * 0.12 * (1.0 - F) + SSS * DEEP * lightIn * 2.0) * smoothstep(-0.2, 1.0, vSea.y / max(uSwellAmp * 0.6, 0.2)) * vSea.w;

  // lantern and beacon streaks wobbling on the swell
  vec3 pl = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i] - P;
    float ld = max(length(d), 1e-3);
    if (ld > uLightRange[i]) continue;
    float fall = pow(1.0 - pow(ld / uLightRange[i], 4.0), 2.0) / max(ld * ld, 0.01);
    pl += uLightColor[i] * fall * min(glint(N, V, d / ld, s2 + 0.0015), 40.0);
  }

  // foam: whitecaps, breaking surf, the swash on the sand, collars where anything pierces the surface,
  // wakes and the territory border
  float white = whitecap(vSea.x, vSea.y, d0.w * 0.5) * (0.2 + 0.8 * uStorm);
  float collar = (1.0 - smoothstep(0.0, 0.45 + 0.4 * vSea.w, thick)) * (0.35 + 0.65 * vSea.w);
  // the sheet of each bore runs up the sand white and thins to lace as it drains back
  float swash = (1.0 - smoothstep(0.0, 0.3, depth)) * smoothstep(0.15, 0.5, vShore.x) * smoothstep(-2.5, -1.0, vShore.y)
    * (0.25 + 0.9 * vShore.z);
  float foamy = max(max(white, vSea.z * 1.2), max(collar, swash));
  vec3 col = under * (1.0 - F) + refl * F + spec + sss + pl;
  // most open water carries no foam at all: only fetch the lace where something could show
  if (foamy + wk.z + wk.w + arms + tfx.y + uStorm > 0.002) {
    vec2 fuv = (X + uFoamO) / 7.0;
    vec4 f0 = texture(tFoam, fuv), f1 = texture(tFoam, fuv * 2.37 + 0.31);
    // in a gale the whole sea is streaked with the remains of broken crests
    float streaks = uStorm * 0.45 * smoothstep(0.35, 0.75, f1.g) * vSea.w;
    // the wake breaks into patches and lace: its amounts are mottled by the foam's own coarse noise
    float amount = foamy + (wk.z * 0.95 + arms * 0.75) * (0.35 + 0.8 * f1.g) + tfx.y + streaks;
    // rising amounts fill the lace in; even the densest foam keeps holes
    float a = min(amount, 0.82);
    float cover = smoothstep(1.0 - a, 1.15 - a, f0.r * 0.6 + f1.r * 0.4) * min(amount * 2.0, 1.0);
    vec3 foamCol = vec3(0.85) * (0.8 + 0.2 * f0.g) * (lightIn * 0.32 + keyE * 0.25 * max(dot(N, L), 0.0));
    col = mix(col, foamCol, cover);
    // bioluminescence: twinkling sparks where the water is being churned right now, strongest in deep night
    float stir = wk.w + arms * 0.25 + vSea.z * 0.8 + white * 0.3 + collar * 0.3 + swash * 0.4;
    float spark = smoothstep(0.3, 0.8, f1.b) * (0.5 + 0.5 * sin(uTime * 9.0 + f0.g * 50.0)) + 0.1;
    col += BIOLUM * uNight * uNight * min(stir, 1.2) * spark * 0.5;
  }
  // the luminous border edge and the flood front
  col += tint.rgb * (tfx.x + tfx.z);

  gl_FragColor = vec4(mix(vFog.rgb, col, vFog.a), 1.0);
}
`;

export class Ocean {
  private readonly ctx: Ctx;
  private readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly anchor = new Carrier(); // detail textures and the wake map
  private readonly grid = new Carrier(); // surface mesh, under the camera
  private readonly detail: THREE.WebGLRenderTarget[];
  private readonly detailMat: THREE.ShaderMaterial;
  private readonly detailWaves: THREE.Vector4[][];
  private readonly wake: THREE.WebGLRenderTarget[];
  private readonly wakeMat: THREE.ShaderMaterial;
  private wakeRead = 0;
  private wakeSize = WAKE_SIZES[0];
  private wakeCx = 0; // carrier coordinates of the wake map centre (whole texels)
  private wakeCy = 0;
  private wakeAcc = 0;
  private wakeStale = true; // cleared by the first simulation step after construction or a jump
  private kickCount = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly windV = v3();
  private camera: THREE.Camera | null = null;

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    SWELL_UNIFORMS.tSea.value = bakeSea(ctx.world);

    const half = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.detail = DETAIL.map(() => new THREE.WebGLRenderTarget(256, 256, { ...half, wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, anisotropy: 8 }));
    this.detailWaves = DETAIL.map((d, i) => latticeWaves(d.period, d.nMin, d.nMax, d.steep, i * 3 + 1));
    this.detailMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: DETAIL_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uWaves: { value: this.detailWaves[0] }, uPeriod: { value: 1 }, uTime: { value: 0 }, uAmp: { value: 1 },
        uWind: { value: new THREE.Vector2(1, 0) } },
    });

    this.wake = [0, 1].map(() => new THREE.WebGLRenderTarget(WAKE_N, WAKE_N, { ...half, minFilter: THREE.LinearFilter }));
    this.wakeMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: WIND_GLSL + SWELL_GLSL + WAKE_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        ...SWELL_UNIFORMS, tState: { value: null }, uShift: { value: new THREE.Vector2() }, uScale: { value: 1 },
        uSize: { value: this.wakeSize }, uC2: { value: 0 }, uKickOn: { value: 0 }, uKeep: { value: 0 },
        uCentre: { value: new THREE.Vector2() }, uAnchor: { value: this.anchor.n }, uE1: { value: this.anchor.t1 },
        uE2: { value: this.anchor.t2 },
        uShipA: { value: Array.from({ length: SHIPS }, () => new THREE.Vector4()) },
        uShipB: { value: Array.from({ length: SHIPS }, () => new THREE.Vector4()) },
        uKick: { value: Array.from({ length: KICKS }, () => new THREE.Vector4()) },
      },
    });

    this.mat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: waterFrag(),
      uniforms: {
        ...ctx.sky.u,
        ...SWELL_UNIFORMS,
        ...ctx.pipeline.u,
        ...ctx.territory.u,
        uGridN: { value: new THREE.Vector3() }, uGridT1: { value: new THREE.Vector3() }, uGridT2: { value: new THREE.Vector3() },
        uGrid: { value: new THREE.Vector2(0.01, 1) },
        uAnchor: { value: this.anchor.n }, uE1: { value: this.anchor.t1 }, uE2: { value: this.anchor.t2 },
        tDetail0: { value: this.detail[0].texture }, tDetail1: { value: this.detail[1].texture },
        uDetailO0: { value: new THREE.Vector2() }, uDetailO1: { value: new THREE.Vector2() },
        tFoam: { value: foamTexture() }, uFoamO: { value: new THREE.Vector2() },
        tWake: { value: this.wake[0].texture }, uWakeO: { value: new THREE.Vector3(0, 0, this.wakeSize) },
      },
    });
    this.mesh = new THREE.Mesh(polarGrid(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.WATER);
    this.mesh.onBeforeRender = (_r, _s, cam) => this.placeGrid(cam);
    ctx.scene.add(this.mesh);
    // link both offscreen programs now, each with its own target bound, rather than in the middle of play
    const r = ctx.pipeline.renderer;
    for (const [material, target] of [[this.detailMat, this.detail[0]], [this.wakeMat, this.wake[0]]] as const) drawPass(r, material, target);
    r.setRenderTarget(null);
  }

  /** Centre the rings under whichever camera is drawing and stretch them out to its horizon. */
  private placeGrid(cam: THREE.Camera): void {
    const u = this.mat.uniforms;
    const dist = cam.position.length(), h = Math.max(0.3, dist - R);
    const n = u.uGridN.value.copy(cam.position).divideScalar(dist);
    if (cam === this.camera) {
      // the main view carries its frame along so the rings never spin under the eye
      this.grid.moveTo(n);
      u.uGridT1.value.copy(this.grid.t1);
    } else {
      // any tangent will do for other views (the globe menu)
      const t1 = u.uGridT1.value.set(-n.z, 0, n.x);
      if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
      t1.normalize();
    }
    u.uGridT2.value.crossVectors(n, u.uGridT1.value);
    // past the geometric horizon by the reach of the tallest crests
    const thMax = Math.acos(Math.min(1, R / (R + h))) + Math.sqrt((2 * (1 + 2 * SWELL_UNIFORMS.uSwellAmp.value)) / R) * 1.2;
    const hr = h / R;
    u.uGrid.value.set(hr, Math.asinh(thMax / hr));
  }

  update(f: Frame): void {
    this.camera = f.camera;
    SWELL_UNIFORMS.uSwellAmp.value = 1 + 1.8 * f.env.storm;
    const u = this.mat.uniforms;
    // carrier follows the player; large jumps (respawn, teleports) clear the wake history
    this.tmp.copy(f.focus).normalize();
    const jump = this.tmp.distanceTo(this.anchor.n) * R;
    this.anchor.moveTo(this.tmp);
    for (let i = 0; i < DETAIL.length; i++) {
      const p = DETAIL[i].period;
      (i ? u.uDetailO1 : u.uDetailO0).value.set(this.anchor.ox % p, this.anchor.oy % p);
    }
    u.uFoamO.value.set(this.anchor.ox % 7, this.anchor.oy % 7);
    this.renderDetail(f);
    if (jump > this.wakeSize * 0.25) this.wakeStale = true;
    this.renderWake(f);
  }

  private renderDetail(f: Frame): void {
    const r = this.ctx.pipeline.renderer, m = this.detailMat.uniforms;
    wind(this.anchor.n, f.simTime, this.windV);
    const wx = this.windV.x * this.anchor.t1.x + this.windV.y * this.anchor.t1.y + this.windV.z * this.anchor.t1.z;
    const wy = this.windV.x * this.anchor.t2.x + this.windV.y * this.anchor.t2.y + this.windV.z * this.anchor.t2.z;
    const ws = Math.max(Math.hypot(wx, wy), 1e-6);
    m.uWind.value.set(wx / ws, wy / ws);
    m.uTime.value = f.t;
    for (let i = 0; i < DETAIL.length; i++) {
      m.uWaves.value = this.detailWaves[i];
      m.uPeriod.value = DETAIL[i].period;
      m.uAmp.value = (0.45 + 0.55 * Math.min(ws, 1.5)) * (1 + 1.6 * f.env.storm) + (i ? 0.6 * f.env.rain : 0);
      drawPass(r, this.detailMat, this.detail[i]);
    }
    r.setRenderTarget(null);
  }

  private renderWake(f: Frame): void {
    const r = this.ctx.pipeline.renderer, m = this.wakeMat.uniforms, u = this.mat.uniforms;
    const a = this.anchor;
    // ships in carrier coordinates
    for (let i = 0; i < SHIPS; i++) {
      const p = f.poses[i], A = m.uShipA.value[i], B = m.uShipB.value[i];
      const up = this.tmp.copy(p.pos).normalize();
      const on = p.visible && up.dot(a.n) > 0.3 ? (1 - p.sink) * p.rise : 0;
      const fx = p.fwd.dot(a.t1), fy = p.fwd.dot(a.t2), fl = Math.hypot(fx, fy) || 1;
      A.set(R * up.dot(a.t1), R * up.dot(a.t2), fx / fl, fy / fl);
      const burst = p.visible ? Math.max(p.sink * (1 - p.sink), (1 - p.rise) * p.rise) * 4 : 0;
      B.set(p.length, Math.min(p.speed / 9, 1.4), Math.max(on, burst > 0 ? 1 : 0), burst);
    }
    this.collectKicks(f);
    // the sea under a paused match stays as it is
    if (!f.paused) this.wakeAcc = Math.min(this.wakeAcc + f.dt, WAKE_DT * 3);
    // size by camera distance
    const camDist = f.camera.position.distanceTo(f.focus);
    const size = WAKE_SIZES[camDist < 40 ? 0 : camDist < 110 ? 1 : 2], texel = size / WAKE_N;
    let first = true;
    while (this.wakeAcc >= WAKE_DT) {
      this.wakeAcc -= WAKE_DT;
      // recentre in whole texels (resampling only when the size changes); committed only by a step that applies it
      const old = this.wakeSize;
      let sx = 0, sy = 0;
      if (this.wakeStale || size !== old || Math.abs(a.ox - this.wakeCx) > size * 0.1 || Math.abs(a.oy - this.wakeCy) > size * 0.1) {
        const cx = Math.round(a.ox / texel) * texel, cy = Math.round(a.oy / texel) * texel;
        sx = (cx - this.wakeCx) / old;
        sy = (cy - this.wakeCy) / old;
        this.wakeCx = cx;
        this.wakeCy = cy;
        this.wakeSize = size;
      }
      m.uShift.value.set(sx, sy);
      m.uScale.value = size / old;
      m.uKeep.value = this.wakeStale ? 0 : 1;
      m.uSize.value = size;
      m.uC2.value = Math.pow((WAVE_SPEED * WAKE_DT) / texel, 2);
      m.uCentre.value.set(this.wakeCx - a.ox, this.wakeCy - a.oy);
      m.uKickOn.value = first ? 1 : 0;
      m.tState.value = this.wake[this.wakeRead].texture;
      drawPass(r, this.wakeMat, this.wake[1 - this.wakeRead]);
      this.wakeRead = 1 - this.wakeRead;
      this.wakeStale = false;
      first = false;
    }
    r.setRenderTarget(null);
    if (!first) this.kickCount = 0;
    u.tWake.value = this.wake[this.wakeRead].texture;
    u.uWakeO.value.set(a.ox - this.wakeCx, a.oy - this.wakeCy, this.wakeSize);
  }

  /** Splashes for sinkings, respawns, collisions and groundings. */
  private collectKicks(f: Frame): void {
    if (this.kickCount === 0) for (const v of this.wakeMat.uniforms.uKick.value as THREE.Vector4[]) v.set(0, 0, 1, 0);
    for (const e of f.events) {
      if (e.type === 'sink') this.kick(this.tmp.set(e.pos.x, e.pos.y, e.pos.z), 3.5, -1.2);
      else if (e.type === 'respawn') this.kick(f.poses[e.ship].pos, 3.5, 1.2);
      else if (e.type === 'bump') this.kick(this.tmp.copy(f.poses[e.a].pos).add(f.poses[e.b].pos).multiplyScalar(0.5), 2, 0.4 * Math.min(1, e.strength / 6));
      else if (e.type === 'ground') this.kick(f.poses[e.ship].pos, 2, 0.4 * Math.min(1, e.strength / 6));
    }
  }

  private kick(p: THREE.Vector3, radius: number, strength: number): void {
    const a = this.anchor, up = this.tmp2.copy(p).normalize();
    if (this.kickCount >= KICKS || up.dot(a.n) < 0.3) return;
    (this.wakeMat.uniforms.uKick.value as THREE.Vector4[])[this.kickCount++].set(R * up.dot(a.t1), R * up.dot(a.t2), radius, strength);
  }
}
