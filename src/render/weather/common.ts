// What every weather effect shares: the uniforms they all read by reference, the light model (sun, moon and sky
// at any point of the sphere, from the sun's direction alone), a tileable noise texture, the local frame and the
// exponential map that lays flat offsets onto the sphere, and a seeded random source so captures repeat.
import * as THREE from 'three';

export interface Vec3Like { x: number; y: number; z: number }

/** The weather kinds, the same names the world uses. */
export type WeatherKind = 'clear' | 'fog' | 'rain' | 'thunder' | 'calm' | 'snow' | 'ash';

export const KINDS: readonly WeatherKind[] = ['clear', 'fog', 'rain', 'thunder', 'calm', 'snow', 'ash'];

/** Radiance of a white surface square to the full sun, in the scene's linear HDR units (three's sun at ~3 / pi). */
export const SUN_I = 1.0;

/** Uniforms every weather material holds by reference; the weather sets them once per frame. */
export interface Shared {
  uTime: { value: number };
  uRadius: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uMoonDir: { value: THREE.Vector3 };
  uNoise: { value: THREE.Texture };
  /** Aerial haze: the colour far things fade to, and its density per metre. */
  uHaze: { value: THREE.Color };
  uHazeDensity: { value: number };
  /** Overall brightness, to match the host renderer's exposure. */
  uGain: { value: number };
  /** World size of one screen pixel at one metre: keeps far particles at least a pixel wide. */
  uPixel: { value: number };
}

export function makeShared(radius: number): Shared {
  return {
    uTime: { value: 0 },
    uRadius: { value: radius },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
    uMoonDir: { value: new THREE.Vector3(-0.3, -0.8, -0.5).normalize() },
    uNoise: { value: makeNoiseTexture() },
    uHaze: { value: new THREE.Color(0.6, 0.66, 0.74) },
    uHazeDensity: { value: 0.0008 },
    uGain: { value: 1 },
    uPixel: { value: 0.0015 },
  };
}

// ---------------------------------------------------------------- GLSL

/** Hashes, the light model and haze. Every weather shader starts with this. */
export const COMMON_GLSL = /* glsl */ `
uniform float uTime, uRadius, uGain, uHazeDensity, uPixel;
uniform vec3 uSunDir, uMoonDir, uHaze;
uniform sampler2D uNoise;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash31(float p) { vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

// Two unit tangents at up: east and north, robust at the poles.
void tangents(vec3 up, out vec3 e, out vec3 n) {
  vec3 a = abs(up.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  e = normalize(cross(a, up));
  n = cross(up, e);
}

// Lays a flat offset d (metres, in the tangent plane at c) onto the sphere along a great circle: a unit vector.
vec3 expMap(vec3 c, vec3 d) {
  float l = length(d);
  if (l < 1e-4) return c;
  float a = l / uRadius;
  return c * cos(a) + (d / l) * sin(a);
}

// The sun's light at a point with local up 'up' and height h above the sea. The horizon dips as you climb, so
// cloud tops keep the sunset after the sea has lost it, and the light reddens near the horizon.
float sunUp(vec3 up, float h) { return dot(up, uSunDir) + sqrt(2.0 * max(h, 0.0) / uRadius); }
vec3 sunColor(vec3 up, float h) {
  float e = sunUp(up, h);
  vec3 c = mix(vec3(1.0, 0.34, 0.1), vec3(1.0, 0.93, 0.84), smoothstep(0.0, 0.32, e));
  return c * smoothstep(-0.035, 0.05, e) * ${SUN_I.toFixed(3)};
}
float nightAt(vec3 up) { return 1.0 - smoothstep(-0.22, 0.04, dot(up, uSunDir)); }
vec3 moonColor(vec3 up) {
  return vec3(0.52, 0.62, 0.9) * 0.2 * smoothstep(-0.03, 0.12, dot(up, uMoonDir)) * nightAt(up);
}
// The sky's light from all round: blue by day, rose at twilight, deep blue at night with a little moonlight.
vec3 skyAmbient(vec3 up) {
  float e = dot(up, uSunDir);
  float day = smoothstep(-0.16, 0.3, e);
  float dusk = exp(-e * e * 30.0) * smoothstep(-0.32, -0.02, e);
  vec3 c = vec3(0.014, 0.018, 0.036);
  c += vec3(0.26, 0.33, 0.44) * day;
  c += vec3(0.24, 0.11, 0.12) * dusk;
  c += vec3(0.035, 0.045, 0.08) * smoothstep(-0.03, 0.15, dot(up, uMoonDir)) * nightAt(up);
  return c;
}
vec3 haze(vec3 col, float dist) { return mix(col, uHaze, 1.0 - exp(-dist * uHazeDensity)); }
// For additive light: it fades into the haze instead of turning into it.
vec3 hazeAdd(vec3 col, float dist) { return col * exp(-dist * uHazeDensity); }
`;

/** The same light model on the CPU, for the fog colour handed back to the host and for the dev page. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function skyAmbient(up: Vec3Like, sun: Vec3Like, moon: Vec3Like, out: THREE.Color): THREE.Color {
  const e = dot(up, sun), day = smoothstep(-0.16, 0.3, e), dusk = Math.exp(-e * e * 30) * smoothstep(-0.32, -0.02, e);
  const night = 1 - smoothstep(-0.22, 0.04, e), m = smoothstep(-0.03, 0.15, dot(up, moon)) * night;
  return out.setRGB(
    0.014 + 0.26 * day + 0.24 * dusk + 0.035 * m,
    0.018 + 0.33 * day + 0.11 * dusk + 0.045 * m,
    0.036 + 0.44 * day + 0.12 * dusk + 0.08 * m,
  );
}

export function sunColor(up: Vec3Like, h: number, sun: Vec3Like, radius: number, out: THREE.Color): THREE.Color {
  const e = dot(up, sun) + Math.sqrt((2 * Math.max(h, 0)) / radius), warm = smoothstep(0, 0.32, e), vis = smoothstep(-0.035, 0.05, e) * SUN_I;
  return out.setRGB(vis, (0.34 + (0.93 - 0.34) * warm) * vis, (0.1 + (0.84 - 0.1) * warm) * vis);
}

export const dot = (a: Vec3Like, b: Vec3Like): number => a.x * b.x + a.y * b.y + a.z * b.z;

// ---------------------------------------------------------------- frames on the sphere

export interface Frame { c: THREE.Vector3; e: THREE.Vector3; n: THREE.Vector3 }

export const newFrame = (): Frame => ({ c: new THREE.Vector3(), e: new THREE.Vector3(), n: new THREE.Vector3() });

/** The unit centre and its east and north tangents (east is Y x c, as in the simulation's localFrame), as GLSL tangents(). */
export function frameAt(at: Vec3Like, out: Frame): Frame {
  out.c.set(at.x, at.y, at.z).normalize();
  const c = out.c;
  if (Math.abs(c.y) < 0.99) out.e.set(c.z, 0, -c.x).normalize();
  else out.e.set(0, -c.z, c.y).normalize();
  out.n.crossVectors(c, out.e);
  return out;
}

/** The point at east/north offsets (metres along the surface) from the frame's centre, h metres above the sea. */
export function placeOn(f: Frame, de: number, dn: number, h: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const l = Math.sqrt(de * de + dn * dn);
  if (l < 1e-6) return out.copy(f.c).multiplyScalar(radius + h);
  const a = l / radius, s = Math.sin(a) / l, c = Math.cos(a);
  out.set(
    f.c.x * c + (f.e.x * de + f.n.x * dn) * s,
    f.c.y * c + (f.e.y * de + f.n.y * dn) * s,
    f.c.z * c + (f.e.z * de + f.n.z * dn) * s,
  );
  return out.multiplyScalar(radius + h);
}

/** Great-circle distance in metres between two directions. */
export function surfaceDistance(a: Vec3Like, b: Vec3Like, radius: number): number {
  const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z);
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (la * lb)))) * radius;
}

// ---------------------------------------------------------------- randomness

/** mulberry32: a small seeded generator, so every capture of the same inputs looks the same. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- noise

function periodicValue(size: number, period: number, seed: number): Float32Array {
  const r = rng(seed), lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period, fy = (y / size) * period, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
      ty = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
      const x1 = (ix + 1) % period, y1 = (iy + 1) % period;
      const a = lat[iy * period + ix], b = lat[iy * period + x1], c = lat[y1 * period + ix], d = lat[y1 * period + x1];
      out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

function fbm(size: number, base: number, seed: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  for (let o = 0; o < octaves; o++) {
    const n = periodicValue(size, base << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    amp *= 0.5;
  }
  return out;
}

/** Inverted cellular noise, summed over two scales: round, cauliflower billows for cloud puffs. */
function billows(size: number, cells: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  for (const [k, w] of [[cells, 0.65], [cells * 2, 0.35]] as const) {
    const r = rng(seed + k), pts = new Float32Array(k * k * 2);
    for (let i = 0; i < pts.length; i++) pts[i] = r();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * k, fy = (y / size) * k, ix = Math.floor(fx), iy = Math.floor(fy);
        let best = 9;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const cx = ix + ox, cy = iy + oy, wx = ((cx % k) + k) % k, wy = ((cy % k) + k) % k, j = (wy * k + wx) * 2;
            const dx = cx + pts[j] - fx, dy = cy + pts[j + 1] - fy;
            best = Math.min(best, dx * dx + dy * dy);
          }
        }
        out[y * size + x] += (1 - Math.min(1, Math.sqrt(best))) * w;
      }
    }
  }
  return out;
}

function normalise(a: Float32Array): Float32Array {
  let lo = Infinity, hi = -Infinity;
  for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo);
  return a;
}

/** Tileable noise: R broad fbm, G mid fbm, B fine fbm, A billows. */
export function makeNoiseTexture(): THREE.DataTexture {
  const N = 256, chans = [fbm(N, 4, 11, 5), fbm(N, 8, 23, 5), fbm(N, 32, 37, 3), billows(N, 6, 41)].map(normalise);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(chans[c][i] * 255);
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- geometry

/** A unit quad, positions in [-0.5, 0.5], drawn once per instance. */
export function instancedQuad(count: number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1);
  g.index = q.index;
  g.setAttribute('position', q.getAttribute('position'));
  g.setAttribute('uv', q.getAttribute('uv'));
  g.instanceCount = count;
  return g;
}

/** Per-instance random seeds in [0, 1), four per instance. */
export function seeds(count: number, seed: number): THREE.InstancedBufferAttribute {
  const r = rng(seed), a = new Float32Array(count * 4);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return new THREE.InstancedBufferAttribute(a, 4);
}

/** A transparent shader material that reads the shared uniforms. */
export function weatherMaterial(
  shared: Shared, own: Record<string, THREE.IUniform>, vertexShader: string, fragmentShader: string,
  { additive = false, side = THREE.FrontSide }: { additive?: boolean; side?: THREE.Side } = {},
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, ...own },
    vertexShader: COMMON_GLSL + vertexShader,
    fragmentShader: COMMON_GLSL + fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side,
  });
}

/** Ends every fragment shader: tone mapping and output colour space, which are no-ops into an HDR target. */
export const FRAG_END = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;

/** A mesh that is never culled: its vertices are placed in the shader. */
export function shaderMesh(g: THREE.BufferGeometry, m: THREE.Material, order: number): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return mesh;
}
