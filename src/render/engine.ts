// The renderer's core, ported from the rewrite's src/gfx/engine.ts onto the real sphere: an HDR scene target, bloom,
// the filmic grade, quality tiers, procedural noise and the photographic textures (credited in CREDITS.md).
//
// The planet's air and light are woven into every material through three's shader chunks (see planet.ts): any
// material with `fog: true` gets the atmosphere, the sea's absorption below the waterline and the Storm's tint, and
// every lit material gets the day and night of the sphere (the planet's own shadow and the sky's light by local sun
// height). Materials need the shared uniforms in U: give them with patch(), or Stage adds them on its own.
import * as THREE from 'three';
import { installPlanetChunks } from './planet.ts';

// ---------------------------------------------------------------- shared uniforms

/** Uniforms every material shares by reference: time, sun, moon, air, sea level, noise, the Storm. */
export const U = {
  uTime: { value: 0 },
  /** Unit vector toward the sun, in the planet's frame (the planet's centre is the origin). */
  uSunDir: { value: new THREE.Vector3(0.3, 0.5, 0.2).normalize() },
  uMoonDir: { value: new THREE.Vector3(-0.3, -0.5, -0.2).normalize() },
  /** The sun's colour where the camera is (for effects that light themselves). */
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  /** The horizon's colour where the camera is. */
  uFogColor: { value: new THREE.Color(0.6, 0.66, 0.72) },
  /** The glow the air takes toward the sun. */
  uFogSun: { value: new THREE.Color(0.9, 0.8, 0.7) },
  uFogDensity: { value: 0.0016 },
  uFogFalloff: { value: 0.012 },
  uMist: { value: new THREE.Vector4(0.005, 0.2, 1, 0) }, // density, falloff, wisps, unused
  uNoise: { value: null as THREE.Texture | null },
  /** The wind at the camera, a tangent vector in metres per second, scaled down. */
  uWind: { value: new THREE.Vector3(0.8, 0, 0.3) },
  /** How far the wind has run so far: what ripples and gusts scroll by. */
  uDrift: { value: new THREE.Vector3() },
  /** 1 when it is night where the camera is. */
  uNight: { value: 0 },
  uFlash: { value: 0 },
  /** x: the planet's radius, y: the sea's radius (radius plus tide), z: the tide, w: unused. */
  uPlanet: { value: new THREE.Vector4(554, 554, 0, 0) },
  /** The air's colours at five sun heights: fog, sun, sky light, ground light (see planet.ts). */
  uKey: { value: Array.from({ length: 20 }, () => new THREE.Color()) },
  /** The safe circle: its centre (unit vector) and the cosine of its angular radius. */
  uStorm: { value: new THREE.Vector4(0, 1, 0, -2) },
  uStormOn: { value: 0 },
  /** The sea's body colour (rgb) and clarity (a) over the planet, by latitude and longitude. */
  uSeaTint: { value: null as THREE.Texture | null },
  /** The water the regions' events move (lift.ts): each disc's middle and how far it moves the sea now; its radius,
   *  fade and region channel in uSeaShare; and whether any moves it at all. */
  uLiftAt: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
  uLiftR: { value: Array.from({ length: 5 }, () => new THREE.Vector4(1, 1, 0, 0)) },
  uLiftOn: { value: 0 },
  uSeaShare: { value: null as THREE.Texture | null },
  // three refreshes these on every fogged material; the atmosphere replaces what they would do
  fogColor: { value: new THREE.Color() },
  fogNear: { value: 1 },
  fogFar: { value: 2 },
  fogDensity: { value: 0 },
};

installPlanetChunks();

export type Shader = THREE.WebGLProgramParametersWithUniforms;

/** Gives a material the shared uniforms; `hook` edits its shader, and `key` names the edit for the program cache. */
export function patch<T extends THREE.Material>(m: T, key = 'base', hook?: (s: Shader) => void): T {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    hook?.(s);
  };
  m.customProgramCacheKey = () => key;
  m.userData.planet = true;
  return m;
}

/** Gives every material under root the shared uniforms, keeping any shader edit it already has. */
export function patchAll(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (m.userData.planet) continue;
      m.userData.planet = true;
      if (m instanceof THREE.ShaderMaterial) {
        for (const [k, v] of Object.entries(U)) if (!(k in m.uniforms)) m.uniforms[k] = v;
        m.needsUpdate = true;
        continue;
      }
      const prior = m.onBeforeCompile, key = m.customProgramCacheKey.bind(m);
      m.onBeforeCompile = (s, r) => {
        Object.assign(s.uniforms, U);
        prior.call(m, s, r);
      };
      m.customProgramCacheKey = () => `planet|${key()}`;
      m.needsUpdate = true;
    }
  });
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
export type LayerName = (typeof TERRAIN_LAYERS)[number];
export const LAYER = Object.fromEntries(TERRAIN_LAYERS.map((n, i) => [n, i])) as Record<LayerName, number>;

export interface Textures {
  terrain: THREE.DataArrayTexture;
  terrainN: THREE.DataArrayTexture;
  /** Single maps by name and suffix, e.g. hull_d, linen_n: for the ships and props. */
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

/** Where public/ is served from, for the game's index.html and the dev pages alike. */
export const TEX_BASE = `${import.meta.env.BASE_URL}tex/`;

export async function loadTextures(progress: (f: number) => void = () => {}): Promise<Textures> {
  const base = TEX_BASE;
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

export const newGrade = (): Grade => ({
  exposure: 1, bloom: 0.5, threshold: 1.1, sat: 1, contrast: 1, vignette: 0.55, lift: new THREE.Color(), gain: new THREE.Color(1, 1, 1), warm: 0,
});

/**
 * A quality tier. scale: render resolution; msaa: samples; shadow: the sun's shadow map; reflect: the sea's
 * reflection, as a share of the screen; detail: how close terrain chunks split (higher is finer); depth: the finest
 * terrain level; puffs: cloud puffs per weather system.
 */
export interface Quality { name: string; scale: number; msaa: number; shadow: number; reflect: number; detail: number; depth: number; puffs: number }
export const QUALITY: Record<string, Quality> = {
  battery: { name: 'battery', scale: 0.62, msaa: 0, shadow: 1024, reflect: 0.25, detail: 1.0, depth: 5, puffs: 24 },
  balanced: { name: 'balanced', scale: 0.78, msaa: 2, shadow: 2048, reflect: 0.35, detail: 1.3, depth: 6, puffs: 40 },
  cinematic: { name: 'cinematic', scale: 0.95, msaa: 4, shadow: 2048, reflect: 0.5, detail: 1.7, depth: 6, puffs: 60 },
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
  /** Turn off to hold the render scale still (captures, measurements). */
  adaptive = true;
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
    if (this.adaptive) {
      if (mean > 1 / 28 && this.scale > 0.6) { this.scale = Math.max(0.6, this.scale - 0.08); this.resize(); }
      else if (mean < 1 / 50 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.04); this.resize(); }
    }
  }
}
