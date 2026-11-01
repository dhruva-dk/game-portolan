// The renderer: an HDR scene target, bloom, filmic grade, a shared atmosphere woven into every material, procedural
// noise, and the photographic textures (credited in CREDITS.md).
import * as THREE from 'three';

// ---------------------------------------------------------------- shared uniforms

/** Uniforms every material shares by reference: time, sun, atmosphere, noise. */
export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.5, 0.2).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uFogColor: { value: new THREE.Color(0.6, 0.66, 0.72) },
  uFogSun: { value: new THREE.Color(0.9, 0.8, 0.7) },
  uFogDensity: { value: 0.0016 },
  uFogFalloff: { value: 0.012 },
  uMist: { value: new THREE.Vector4(0.03, 0.18, 1, 0) }, // density, falloff, wisps, unused
  uNoise: { value: null as THREE.Texture | null },
  uWind: { value: new THREE.Vector2(0.8, 0.3) },
  uDrift: { value: new THREE.Vector2() }, // how far the wind has run so far: what ripples and gusts scroll by
  uNight: { value: 0 },
  uGlobe: { value: new THREE.Vector4(3000, 1, 0, 0) }, // radius, on, focus x, focus z: see Globe
  // three refreshes these on every fogged material; the atmosphere below replaces what they would do
  fogColor: { value: new THREE.Color() },
  fogNear: { value: 1 },
  fogFar: { value: 2 },
  fogDensity: { value: 0 },
};

// ---------------------------------------------------------------- the globe

/**
 * The world is simulated flat and drawn on a globe. Each frame the sea is wrapped round a sphere whose top touches the
 * focus (your ship): an inverse stereographic projection, conformal, so near the focus nothing changes at all and far
 * away the sea falls below the horizon and islands shrink as they round it. The radius tightens with the camera's
 * height, so the sea is a gentle curve from a deck and a whole small planet from the sky.
 */
export const GLOBE = /* glsl */ `
uniform vec4 uGlobe;
vec3 globePos(vec3 p) {
  if (uGlobe.y < 0.5) return p;
  vec2 d = p.xz - uGlobe.zw;
  float R = uGlobe.x, t2 = dot(d, d) / (4.0 * R * R), k = 1.0 / (1.0 + t2);
  vec3 n = vec3(d.x * k / R, (1.0 - t2) * k, d.y * k / R);
  // heights shrink faster than the ground round the curve, so far peaks lie down along the limb instead of bristling
  return vec3(uGlobe.z, -R, uGlobe.w) + n * (R + p.y * k * k);
}
// turns a direction at flat point p the way the globe turns the ground there (sgn -1: back again)
vec3 globeTurn(vec3 p, vec3 v, float sgn) {
  vec2 d = p.xz - uGlobe.zw;
  float rho = length(d);
  if (uGlobe.y < 0.5 || rho < 1e-3) return v;
  float t = rho / (2.0 * uGlobe.x), k = 1.0 / (1.0 + t * t), c = (1.0 - t * t) * k, s = 2.0 * t * k * sgn;
  vec3 u = vec3(d.y, 0.0, -d.x) / rho;
  return v * c + cross(u, v) * s + u * dot(u, v) * (1.0 - c);
}
vec3 globeDir(vec3 p, vec3 v) { return globeTurn(p, v, 1.0); }
vec3 globeUndir(vec3 p, vec3 v) { return globeTurn(p, v, -1.0); }`;
THREE.ShaderChunk.common += GLOBE;
// every built-in material goes through these three: positions and normals land on the globe, the flat point is kept
THREE.ShaderChunk.project_vertex = /* glsl */ `
vec4 globeP = vec4(transformed, 1.0);
#ifdef USE_BATCHING
globeP = batchingMatrix * globeP;
#endif
#ifdef USE_INSTANCING
globeP = instanceMatrix * globeP;
#endif
vec3 globeFlat = (modelMatrix * globeP).xyz;
vec4 mvPosition = viewMatrix * vec4(globePos(globeFlat), 1.0);
gl_Position = projectionMatrix * mvPosition;`;
THREE.ShaderChunk.worldpos_vertex = THREE.ShaderChunk.worldpos_vertex.replace(/#endif\s*$/, 'worldPosition.xyz = globePos(worldPosition.xyz);\n#endif');
THREE.ShaderChunk.defaultnormal_vertex = THREE.ShaderChunk.defaultnormal_vertex.replace('transformedNormal = normalMatrix * transformedNormal;', `transformedNormal = normalMatrix * transformedNormal;
{
  vec4 gp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  gp = instanceMatrix * gp;
  #endif
  vec3 gf = (modelMatrix * gp).xyz;
  mat3 vm = mat3(viewMatrix);
  transformedNormal = vm * globeDir(gf, transpose(vm) * transformedNormal);
}`);

/** The same wrap on the CPU, for anything placed on screen by hand and for aiming through the curve. */
export class Globe {
  static R = 3000;
  static on = true;
  static fx = 0;
  static fz = 0;

  /** Points the globe at the focus and sets its radius from the camera's height above the sea. */
  static update(fx: number, fz: number, camY: number, on = true): void {
    Globe.fx = fx; Globe.fz = fz; Globe.on = on;
    Globe.R = Math.max(520, 3200 / (1 + Math.max(0, camY - 20) / 140));
    U.uGlobe.value.set(Globe.R, on ? 1 : 0, fx, fz);
  }

  static pos(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    if (!Globe.on) return out.set(x, y, z);
    const dx = x - Globe.fx, dz = z - Globe.fz, R = Globe.R, t2 = (dx * dx + dz * dz) / (4 * R * R), k = 1 / (1 + t2);
    const s = R + y * k * k;
    return out.set(Globe.fx + (dx * k / R) * s, -R + (1 - t2) * k * s, Globe.fz + (dz * k / R) * s);
  }

  /** From the globe back to the flat world. */
  static flat(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    if (!Globe.on) return out.copy(p);
    const R = Globe.R, vx = p.x - Globe.fx, vy = p.y + R, vz = p.z - Globe.fz;
    const r = Math.hypot(vx, vy, vz), nx = vx / r, ny = vy / r, nz = vz / r;
    const q = 2 * R / (1 + ny), dx = nx * q, dz = nz * q;
    const k = 1 / (1 + (dx * dx + dz * dz) / (4 * R * R));
    return out.set(Globe.fx + dx, (r - R) / (k * k), Globe.fz + dz);
  }
}

// culling asks where a thing is drawn, not where it is simulated: every camera sees the globe
{
  const base = THREE.Frustum.prototype.intersectsSphere, c = new THREE.Vector3(), sphere = new THREE.Sphere();
  THREE.Frustum.prototype.intersectsSphere = function (this: THREE.Frustum, s: THREE.Sphere): boolean {
    if (!Globe.on) return base.call(this, s);
    sphere.set(Globe.pos(s.center.x, s.center.y, s.center.z, c), s.radius * 1.1);
    return base.call(this, sphere);
  };
}

const depths = new Map<string, THREE.MeshDepthMaterial>();
/** Shadow casters need a depth material that knows the globe: three's own default cannot take its uniforms. */
export function globeShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.castShadow || m.customDepthMaterial) return;
    const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const map = src.alphaTest > 0 ? src.map : null, key = `${map?.uuid ?? ''}|${src.alphaTest}`;
    let d = depths.get(key);
    if (!d) {
      d = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: src.alphaTest }), 'globe-depth');
      depths.set(key, d);
    }
    m.customDepthMaterial = d;
  });
}

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
// the air is measured in the flat world: its tuning holds near you, and the globe's limb hazes over like a sky
vFogWorld = globeFlat;
#endif`;
export const ATMOSPHERE = /* glsl */ `
uniform vec3 uFogColor, uFogSun, uSunDir;
uniform float uFogDensity, uFogFalloff, uTime;
uniform vec4 uMist;
uniform sampler2D uNoise;
// optical depth along d through air thinning with height; each exponential taken alone so neither overflows up high
float fogDepth(float a, float b, vec3 o, vec3 d) {
  float L = length(d), y0 = max(o.y, -5.0), y1 = max(o.y + d.y, -5.0), dy = y1 - y0, e0 = exp(-b * y0);
  return abs(b * dy) > 1e-3 ? a * L * (e0 - exp(-b * y1)) / (b * dy) : a * L * e0;
}
vec3 atmosphere(vec3 col, vec3 wp) {
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  vec3 dir = d / max(dist, 1e-3);
  float od = fogDepth(uFogDensity, uFogFalloff, cameraPosition, d);
  float wisp = texture(uNoise, wp.xz * 0.004 + uTime * vec2(0.004, 0.0015)).r;
  wisp = mix(1.0, smoothstep(0.25, 0.75, wisp) * 1.6, uMist.z);
  od += fogDepth(uMist.x * wisp, uMist.y, cameraPosition, d) * smoothstep(0.0, 40.0, dist);
  float f = 1.0 - exp(-od);
  float s = max(dot(dir, uSunDir), 0.0);
  vec3 fc = mix(uFogColor, uFogSun, pow(s, 6.0) * 0.85 + pow(s, 32.0) * 0.15);
  return mix(col, fc, f);
}`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
varying vec3 vFogWorld;
${ATMOSPHERE}
#endif`;
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
gl_FragColor.rgb = atmosphere(gl_FragColor.rgb, vFogWorld);
#endif`;

export type Shader = THREE.WebGLProgramParametersWithUniforms;

/** Gives a material the shared uniforms; `hook` edits its shader, and `key` names the edit for the program cache. */
export function patch<T extends THREE.Material>(m: T, key = 'base', hook?: (s: Shader) => void): T {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    hook?.(s);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// ---------------------------------------------------------------- noise

function periodicNoise(size: number, period: number, seed: number): Float32Array {
  const lat = new Float32Array(period * period);
  let s = seed;
  for (let i = 0; i < lat.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; lat[i] = s / 4294967296; }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * period, fy = (y / size) * period, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * tx * (tx * (tx * 6 - 15) + 10); ty = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const a = lat[(iy % period) * period + (ix % period)], b = lat[(iy % period) * period + ((ix + 1) % period)];
    const c = lat[((iy + 1) % period) * period + (ix % period)], d = lat[((iy + 1) % period) * period + ((ix + 1) % period)];
    out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  return out;
}

function fbmTile(size: number, base: number, seed: number, oct = 5): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5, total = 0;
  for (let o = 0; o < oct; o++) {
    const n = periodicNoise(size, base << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function normalise(a: Float32Array): Float32Array {
  let lo = Infinity, hi = -Infinity;
  for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo);
  return a;
}

/** Four channels of tileable fbm noise at different scales. */
export function makeNoiseTexture(): THREE.DataTexture {
  const N = 256, chans = [fbmTile(N, 4, 1), fbmTile(N, 8, 2), fbmTile(N, 16, 3, 4), fbmTile(N, 32, 4, 3)].map(normalise);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = chans[c][i] * 255;
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** A tileable normal map of small wind ripples for the water. */
export function makeRippleNormals(): THREE.DataTexture {
  const N = 512, h = new Float32Array(N * N);
  const layers: [number, number, number][] = [[8, 1, 11], [16, 0.55, 12], [32, 0.3, 13], [64, 0.14, 14]];
  for (const [p, a, s] of layers) {
    const n = periodicNoise(N, p, s);
    for (let i = 0; i < h.length; i++) h[i] += (1 - Math.abs(n[i] * 2 - 1)) * a; // ridged: sharp crests
  }
  const data = new Uint8Array(N * N * 4), k = 7;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = h[y * N + ((x + N - 1) % N)], r = h[y * N + ((x + 1) % N)], d = h[((y + N - 1) % N) * N + x], u = h[((y + 1) % N) * N + x];
    const nx = (l - r) * k, ny = (d - u) * k, len = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    data[i] = (nx / len * 0.5 + 0.5) * 255; data[i + 1] = (ny / len * 0.5 + 0.5) * 255; data[i + 2] = (1 / len * 0.5 + 0.5) * 255; data[i + 3] = h[y * N + x] / 2 * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- textures

export const TERRAIN_LAYERS = ['grass', 'forest', 'cliff', 'moss', 'pebbles', 'sand', 'snow', 'burnt', 'lichen'] as const;
export const LAYER = Object.fromEntries(TERRAIN_LAYERS.map((n, i) => [n, i])) as Record<(typeof TERRAIN_LAYERS)[number], number>;

export interface Textures {
  terrain: THREE.DataArrayTexture;
  terrainN: THREE.DataArrayTexture;
  maps: Record<string, THREE.Texture>;
  noise: THREE.DataTexture;
  ripples: THREE.DataTexture;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

function arrayTexture(imgs: HTMLImageElement[], size: number, srgb: boolean): THREE.DataArrayTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = new Uint8Array(size * size * 4 * imgs.length);
  imgs.forEach((img, i) => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    data.set(ctx.getImageData(0, 0, size, size).data, i * size * size * 4);
  });
  const t = new THREE.DataArrayTexture(data, size, size, imgs.length);
  t.format = THREE.RGBAFormat;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export async function loadTextures(progress: (f: number) => void): Promise<Textures> {
  const base = 'tex/';
  const singles = ['bark_sakura', 'bark_pine', 'bark_cedar', 'hull', 'deck', 'linen', 'moss', 'lichen', 'cliff'];
  const urls = [
    ...TERRAIN_LAYERS.flatMap((n) => [`${base}${n}_d.jpg`, `${base}${n}_n.jpg`]),
    ...singles.flatMap((n) => [`${base}${n}_d.jpg`, `${base}${n}_n.jpg`]),
  ];
  let done = 0;
  const imgs = await Promise.all(urls.map(async (u) => { const i = await loadImage(u); progress(++done / urls.length); return [u, i] as const; }));
  const byUrl = new Map(imgs);
  const terrain = arrayTexture(TERRAIN_LAYERS.map((n) => byUrl.get(`${base}${n}_d.jpg`)!), 1024, true);
  const terrainN = arrayTexture(TERRAIN_LAYERS.map((n) => byUrl.get(`${base}${n}_n.jpg`)!), 1024, false);
  const maps: Record<string, THREE.Texture> = {};
  for (const n of singles) for (const [suffix, srgb] of [['d', true], ['n', false]] as const) {
    const t = new THREE.Texture(byUrl.get(`${base}${n}_${suffix}.jpg`)!);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    maps[`${n}_${suffix}`] = t;
  }
  const noise = makeNoiseTexture();
  U.uNoise.value = noise;
  return { terrain, terrainN, maps, noise, ripples: makeRippleNormals() };
}

// ---------------------------------------------------------------- post

const FS_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsMaterial(frag: string, uniforms: Record<string, THREE.IUniform>, additive = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false,
    ...(additive ? { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation } : { blending: THREE.NoBlending }),
  });
}

const PREFILTER = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  // one bad pixel must not bloom into a blot
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + 0.5, 0.0, 1.0);
  soft = soft * soft * 0.5;
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(40.0)), 1.0);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 a = texture(tSrc, vUv + t * vec2(-2, -2)).rgb, b = texture(tSrc, vUv + t * vec2(0, -2)).rgb, c = texture(tSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 d = texture(tSrc, vUv + t * vec2(-2, 0)).rgb, e = texture(tSrc, vUv).rgb, f = texture(tSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture(tSrc, vUv + t * vec2(-2, 2)).rgb, h = texture(tSrc, vUv + t * vec2(0, 2)).rgb, i = texture(tSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 j = texture(tSrc, vUv + t * vec2(-1, -1)).rgb, k = texture(tSrc, vUv + t * vec2(1, -1)).rgb;
  vec3 l = texture(tSrc, vUv + t * vec2(-1, 1)).rgb, m = texture(tSrc, vUv + t * vec2(1, 1)).rgb;
  vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(o, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uScatter; varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 s = texture(tSrc, vUv + t * vec2(-1, -1)).rgb + texture(tSrc, vUv + t * vec2(1, -1)).rgb
         + texture(tSrc, vUv + t * vec2(-1, 1)).rgb + texture(tSrc, vUv + t * vec2(1, 1)).rgb;
  s += (texture(tSrc, vUv + t * vec2(0, -1)).rgb + texture(tSrc, vUv + t * vec2(0, 1)).rgb
      + texture(tSrc, vUv + t * vec2(-1, 0)).rgb + texture(tSrc, vUv + t * vec2(1, 0)).rgb) * 2.0;
  s += texture(tSrc, vUv).rgb * 4.0;
  gl_FragColor = vec4(s / 16.0 * uScatter, 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene, tBloom;
uniform float uExposure, uBloom, uSat, uContrast, uVignette, uTime, uStorm, uHurt, uLow, uFlash, uWarm;
uniform vec3 uLift, uGain, uFlashColor;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) {
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(O * RRTAndODTFit(I * (c / 0.6)), 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 q = vUv - 0.5;
  vec3 c = texture(tScene, vUv).rgb;
  c += texture(tBloom, vUv).rgb * uBloom;
  c *= uExposure;
  float l0 = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l0) * vec3(0.55, 0.42, 0.95) + c * vec3(0.25, 0.15, 0.45), uStorm * 0.75);
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat * (1.0 - uLow * 0.6));
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  c = c * uGain + uLift * (1.0 - c) * (1.0 - l);
  c *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), uWarm);
  float r2 = dot(q * vec2(1.25, 1.0), q * vec2(1.25, 1.0));
  c *= 1.0 - r2 * uVignette;
  float edge = smoothstep(0.12, 0.42, r2);
  c = mix(c, vec3(0.75, 0.05, 0.02), edge * clamp(uHurt, 0.0, 1.0) * 0.65);
  c = mix(c, vec3(0.25, 0.0, 0.02), edge * uLow * (0.35 + 0.15 * sin(uTime * 5.0)));
  c = mix(c, uFlashColor, uFlash);
  c = srgb(clamp(c, 0.0, 1.0));
  c += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 200.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export interface Grade {
  exposure: number; bloom: number; threshold: number; sat: number; contrast: number; vignette: number;
  lift: THREE.Color; gain: THREE.Color; warm: number;
}

export interface Quality { scale: number; msaa: number; shadow: number; reflect: number; grass: number; name: string }
export const QUALITY: Record<string, Quality> = {
  battery: { name: 'battery', scale: 0.62, msaa: 0, shadow: 1024, reflect: 0.25, grass: 0.5 },
  balanced: { name: 'balanced', scale: 0.78, msaa: 2, shadow: 2048, reflect: 0.35, grass: 0.8 },
  cinematic: { name: 'cinematic', scale: 0.95, msaa: 4, shadow: 2048, reflect: 0.5, grass: 1 },
};

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  quality: Quality = QUALITY.balanced;
  scale = 1; // adaptive multiplier on the quality's render scale
  width = 1;
  height = 1;
  private target!: THREE.WebGLRenderTarget;
  private mips: THREE.WebGLRenderTarget[] = [];
  private readonly quad: THREE.Mesh;
  private readonly fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fsScene = new THREE.Scene();
  private readonly prefilter = fsMaterial(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } });
  private readonly down = fsMaterial(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private readonly up = fsMaterial(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.85 } }, true);
  readonly composite = fsMaterial(COMPOSITE, {
    tScene: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.6 }, uSat: { value: 1 },
    uContrast: { value: 1 }, uVignette: { value: 0.6 }, uTime: { value: 0 }, uStorm: { value: 0 }, uHurt: { value: 0 }, uLow: { value: 0 },
    uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) }, uLift: { value: new THREE.Color(0, 0, 0) }, uGain: { value: new THREE.Color(1, 1, 1) },
    uWarm: { value: 0 },
  });
  private frameTimes: number[] = [];
  stats = { fps: 0, ms: 0, calls: 0, tris: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.scale = 1;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = this.canvas.clientWidth || innerWidth, ch = this.canvas.clientHeight || innerHeight;
    const s = dpr * this.quality.scale * this.scale;
    const w = Math.max(320, Math.round(cw * s)), h = Math.max(200, Math.round(ch * s));
    if (w === this.width && h === this.height && this.target?.samples === this.quality.msaa) return;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.quality.msaa, depthBuffer: true });
    for (const m of this.mips) m.dispose();
    this.mips = [];
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < 6 && mw > 4 && mh > 4; i++, mw >>= 1, mh >>= 1) this.mips.push(new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, depthBuffer: false }));
  }

  get aspect(): number {
    return this.width / this.height;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = true): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    if (clear) this.renderer.clear(true, false, false);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  /** Renders the scene through the bloom and grade to the screen. `before` runs first (reflections, wakes); the shadow map is drawn once, by whichever pass comes first. */
  render(scene: THREE.Scene, camera: THREE.Camera, grade: Grade, dt: number, before?: () => void): void {
    const r = this.renderer;
    r.info.autoReset = false;
    r.info.reset();
    r.shadowMap.needsUpdate = true;
    before?.();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    // bloom
    const m = this.mips;
    this.prefilter.uniforms.tSrc.value = this.target.texture;
    this.prefilter.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
    this.prefilter.uniforms.uThreshold.value = grade.threshold;
    this.pass(this.prefilter, m[0]);
    for (let i = 1; i < m.length; i++) {
      this.down.uniforms.tSrc.value = m[i - 1].texture;
      this.down.uniforms.uTexel.value.set(1 / m[i - 1].width, 1 / m[i - 1].height);
      this.pass(this.down, m[i]);
    }
    for (let i = m.length - 2; i >= 0; i--) {
      this.up.uniforms.tSrc.value = m[i + 1].texture;
      this.up.uniforms.uTexel.value.set(1 / m[i + 1].width, 1 / m[i + 1].height);
      this.pass(this.up, m[i], false);
    }
    const u = this.composite.uniforms;
    u.tScene.value = this.target.texture;
    u.tBloom.value = m[0].texture;
    u.uExposure.value = grade.exposure;
    u.uBloom.value = grade.bloom;
    u.uSat.value = grade.sat;
    u.uContrast.value = grade.contrast;
    u.uVignette.value = grade.vignette;
    u.uLift.value.copy(grade.lift);
    u.uGain.value.copy(grade.gain);
    u.uWarm.value = grade.warm;
    u.uTime.value = U.uTime.value;
    this.pass(this.composite, null);
    this.stats.calls = r.info.render.calls;
    this.stats.tris = r.info.render.triangles;
    this.adapt(dt);
  }

  /** Nudges the render scale to hold the frame rate. */
  private adapt(dt: number): void {
    if (dt <= 0 || dt > 0.25) return;
    const ft = this.frameTimes;
    ft.push(dt);
    if (ft.length < 45) return;
    const mean = ft.reduce((a, b) => a + b, 0) / ft.length;
    ft.length = 0;
    this.stats.fps = 1 / mean;
    this.stats.ms = mean * 1000;
    if (adaptive.on) {
      if (mean > 1 / 28 && this.scale > 0.6) { this.scale = Math.max(0.6, this.scale - 0.08); this.resize(); }
      else if (mean < 1 / 50 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.04); this.resize(); }
    }
  }
}

export const adaptive = { on: true };
