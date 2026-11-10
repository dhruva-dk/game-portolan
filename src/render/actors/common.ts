// Shared by every actor: the planet's frame (up, forward and right at any point on the sphere), the sea surface with
// its swell and tide, the uniforms all actor materials read, a tileable noise texture, and the scanned textures.
import * as THREE from 'three';
import { loadAstc } from '../gpu/astc.ts';
import { lampEmissive } from './tsl/kit.ts';
import type { Vec3 } from './view.ts';

export const TAU = Math.PI * 2;
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The planet's mean radius in metres, and the sea level over it (the tide); set by the actors from options and view. */
export const SEA = { radius: 554, level: 0 };

// ---------------------------------------------------------------- shared uniforms

/** Uniforms every actor material shares by reference. */
export const AU = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uNoise: { value: null as THREE.Texture | null },
  uNight: { value: 0 }, // at the focus, for things lit as one (lanterns, windows)
};

/** Gives a material the lamps' glow: the planet makes it a node material (its properties copied over) and sets
 *  what it gives off at the lamps' scale. */
export function patch<T extends THREE.Material>(m: T): T {
  if ('emissive' in m) (m as { emissiveNode?: unknown }).emissiveNode = lampEmissive();
  return m;
}

// ---------------------------------------------------------------- the planet's frame

const UP = new THREE.Vector3(), FWD = new THREE.Vector3(), RIGHT = new THREE.Vector3();

export const v3 = (p: Vec3, out = new THREE.Vector3()): THREE.Vector3 => out.set(p.x, p.y, p.z);

/** Local up at a world point. */
export const upAt = (p: Vec3, out = new THREE.Vector3()): THREE.Vector3 => out.set(p.x, p.y, p.z).normalize();

/**
 * A ship-style frame at a point: +y up (away from the centre), +z forward along `head` laid into the tangent plane,
 * +x to port (y cross z). `alt` lifts it off the sphere of radius `r`.
 */
export function frameAt(p: Vec3, head: Vec3, r: number, out: THREE.Matrix4): THREE.Matrix4 {
  upAt(p, UP);
  FWD.set(head.x, head.y, head.z);
  FWD.addScaledVector(UP, -FWD.dot(UP));
  if (FWD.lengthSq() < 1e-10) tangents(UP, FWD, RIGHT);
  FWD.normalize();
  RIGHT.crossVectors(UP, FWD);
  return out.makeBasis(RIGHT, UP, FWD).setPosition(UP.x * r, UP.y * r, UP.z * r);
}

/** Two tangents at an up vector, for spreading things over the water. */
export function tangents(up: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): void {
  a.set(0, 1, 0);
  if (Math.abs(up.y) > 0.9) a.set(1, 0, 0);
  a.addScaledVector(up, -a.dot(up)).normalize();
  b.crossVectors(up, a);
}

/** A tangent direction on the water at angle `ang` round an up vector, plus `lift` along it. */
export function around(up: THREE.Vector3, ang: number, out: number, lift: number, res: THREE.Vector3): THREE.Vector3 {
  tangents(up, T1, T2);
  return res.copy(T1).multiplyScalar(Math.cos(ang) * out).addScaledVector(T2, Math.sin(ang) * out).addScaledVector(up, lift);
}
const T1 = new THREE.Vector3(), T2 = new THREE.Vector3();

// ---------------------------------------------------------------- the sea

/** The swell, as plane waves through the whole planet: seamless on the sphere, and long where they meet it end-on. */
const SWELL: [Vec3, number, number][] = [
  // direction, wavelength (m), amplitude (m)
  [{ x: 0.8, y: 0.25, z: 0.55 }, 26, 0.2],
  [{ x: -0.3, y: 0.6, z: 0.75 }, 15, 0.11],
  [{ x: 0.5, y: -0.7, z: 0.5 }, 9.5, 0.065],
  [{ x: -0.85, y: 0.1, z: -0.5 }, 5.8, 0.035],
];
const WAVES = SWELL.map(([d, L, A]) => {
  const n = Math.hypot(d.x, d.y, d.z), k = TAU / L;
  return { x: d.x / n, y: d.y / n, z: d.z / n, k, w: Math.sqrt(9.81 * k), A };
});

/** Height of the default swell at a world point. The integration can hand the stage's own in through the options. */
export function swell(p: Vec3, t: number): number {
  let h = 0;
  for (const v of WAVES) h += Math.sin((v.x * p.x + v.y * p.y + v.z * p.z) * v.k - v.w * t) * v.A;
  return h;
}

export type WaveFn = (p: Vec3, t: number) => number;
export const sea = { wave: swell as WaveFn, time: 0 };

/** The sea surface's radius under a world point, swell and tide included. */
export function seaRadius(p: Vec3): number {
  return SEA.radius + SEA.level + sea.wave(p, sea.time);
}

/** The point on the sea surface under (or over) a world point, lifted `lift` metres. */
export function onSea(p: Vec3, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  out.set(p.x, p.y, p.z).normalize();
  const r = SEA.radius + SEA.level + sea.wave(out.clone().multiplyScalar(SEA.radius), sea.time) + lift;
  return out.multiplyScalar(r);
}

/** How dark it is at a world point: 0 in full day, 1 at night, from the sun's height there. */
export function nightAt(p: Vec3): number {
  const s = AU.uSunDir.value, l = Math.hypot(p.x, p.y, p.z) || 1;
  return 1 - smooth(-0.14, 0.12, (p.x * s.x + p.y * s.y + p.z * s.z) / l);
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

function fbm(size: number, base: number, seed: number, oct: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5, total = 0;
  for (let o = 0; o < oct; o++) {
    const n = periodicNoise(size, base << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < out.length; i++) { out[i] /= total; lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}

/** Four channels of tileable fbm noise at different scales. */
export function makeNoise(): THREE.DataTexture {
  const N = 256, ch = [fbm(N, 4, 1, 5), fbm(N, 8, 2, 5), fbm(N, 16, 3, 4), fbm(N, 32, 4, 3)];
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = ch[c][i] * 255;
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- the scanned textures (credited in CREDITS.md)

export interface ActorTextures {
  hull_d: THREE.Texture; hull_n: THREE.Texture;
  deck_d: THREE.Texture; deck_n: THREE.Texture;
  linen_d: THREE.Texture;
  noise: THREE.DataTexture;
  ready: Promise<void>;
}

/** Loads the hull, deck and sailcloth scans from `base` (the public tex/ folder). Materials can use them at once. */
export function loadTextures(base: string): ActorTextures {
  const pending: Promise<unknown>[] = [];
  const load = (name: string, srgb: boolean) => {
    let t!: THREE.Texture;
    pending.push(new Promise((ok) => { t = loadAstc(base + name, srgb, ok, () => ok(null)); }));
    t.name = `ship/${name}`;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const noise = makeNoise();
  AU.uNoise.value = noise;
  const tex = {
    hull_d: load('hull_d.jpg', true), hull_n: load('hull_n.jpg', false),
    deck_d: load('deck_d.jpg', true), deck_n: load('deck_n.jpg', false),
    linen_d: load('linen_d.jpg', true), noise,
  };
  return { ...tex, ready: Promise.all(pending).then(() => undefined) };
}

/** Where the public textures live: the site root in development, beside the page in a build. */
export const TEX_BASE = import.meta.env?.DEV ? '/tex/' : 'tex/';
