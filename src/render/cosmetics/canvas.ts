// Small shared tools for the cosmetics' canvas-drawn textures: canvases, a seeded random, tileable value noise,
// the scanned images (loaded once, drawn into canvases when they arrive) and texture wrappers.
import * as THREE from 'three';

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export const ctx2d = (c: HTMLCanvasElement): Ctx => c.getContext('2d', { willReadFrequently: false })!;

/** mulberry32: a small seeded random in 0..1. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A string's seed. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Tileable value noise on a `period`-cell lattice, summed over `octaves`, in 0..1. */
export function noiseField(size: number, period: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size), r = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0, p = period; o < octaves; o++, p *= 2, amp *= 0.5) {
    const lat = Float32Array.from({ length: p * p }, () => r());
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = (i / size) * p, y = (j / size) * p, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
      const a = lat[y0 * p + x0], b = lat[y0 * p + x1], c = lat[y1 * p + x0], d = lat[y1 * p + x1];
      out[j * size + i] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    total += amp;
  }
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return out;
}

/** A noise field as a grey canvas, 0..1 mapped through lo..hi. */
export function noiseCanvas(size: number, period: number, octaves: number, seed: number, lo = 0, hi = 255): HTMLCanvasElement {
  const c = makeCanvas(size), x = ctx2d(c), img = x.createImageData(size, size), n = noiseField(size, period, octaves, seed);
  for (let k = 0; k < n.length; k++) { const v = lo + (hi - lo) * n[k]; img.data[4 * k] = img.data[4 * k + 1] = img.data[4 * k + 2] = v; img.data[4 * k + 3] = 255; }
  x.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- the scanned images

/** Where public/tex/cosmetics is served from: '/' in the dev server, './' in the built app. */
const BASE = `${import.meta.env?.BASE_URL ?? '/'}tex/cosmetics/`;
export const texUrl = (name: string) => `${BASE}${name}.jpg`;

const images = new Map<string, HTMLImageElement>();
const waiting = new Map<string, (() => void)[]>();
/** The scanned image, if it has arrived; otherwise starts loading it and calls `then` when it does. */
export function image(name: string, then?: () => void): HTMLImageElement | null {
  const im = images.get(name);
  if (im && im.complete && im.naturalWidth > 0) return im;
  if (then) (waiting.get(name) ?? waiting.set(name, []).get(name)!).push(then);
  if (!im) {
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => { for (const f of waiting.get(name) ?? []) f(); waiting.delete(name); };
    el.src = texUrl(name);
    images.set(name, el);
  }
  return null;
}
/** Resolves once every named image has loaded. */
export const imagesReady = (names: readonly string[]): Promise<void> =>
  Promise.all(names.map((n) => new Promise<void>((done) => { if (image(n, done)) done(); }))).then(() => undefined);

const loader = new THREE.TextureLoader();
const maps = new Map<string, THREE.Texture>();
/** A scanned map as a repeating texture, shared; colour maps in sRGB, data maps linear. */
export function scannedMap(name: string, colour: boolean): THREE.Texture {
  let t = maps.get(name);
  if (!t) {
    t = loader.load(texUrl(name));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    maps.set(name, t);
  }
  return t;
}
/** A shared scanned map with its own repeat (a clone shares the image but not the transform). */
export function tiledMap(name: string, colour: boolean, rx: number, ry: number, rotation = 0): THREE.Texture {
  const t = scannedMap(name, colour).clone();
  t.repeat.set(rx, ry);
  t.rotation = rotation;
  t.needsUpdate = true;
  return t;
}

/** A canvas as a texture. */
export function canvasTexture(c: HTMLCanvasElement, colour = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/**
 * A scanned image turned into a soft-light detail layer: grey 128 where it is average, lighter and darker round it,
 * so it textures a colour without tinting it. Cached per image and size.
 */
const details = new Map<string, HTMLCanvasElement>();
export function detailLayer(name: string, size: number, strength: number, then?: () => void): HTMLCanvasElement | null {
  const key = `${name}:${size}:${strength}`;
  const have = details.get(key);
  if (have) return have;
  const im = image(name, then);
  if (!im) return null;
  const c = makeCanvas(size), x = ctx2d(c);
  x.drawImage(im, 0, 0, size, size);
  const d = x.getImageData(0, 0, size, size), p = d.data;
  let mean = 0;
  for (let k = 0; k < p.length; k += 4) mean += 0.3 * p[k] + 0.55 * p[k + 1] + 0.15 * p[k + 2];
  mean /= p.length / 4;
  for (let k = 0; k < p.length; k += 4) {
    const l = 0.3 * p[k] + 0.55 * p[k + 1] + 0.15 * p[k + 2], v = 128 + (l - mean) * strength;
    p[k] = p[k + 1] = p[k + 2] = Math.max(0, Math.min(255, v));
  }
  x.putImageData(d, 0, 0);
  details.set(key, c);
  return c;
}

/** Fills a canvas with an image tiled `n` times each way, through a blend mode. */
export function tile(x: Ctx, src: CanvasImageSource, w: number, h: number, nx: number, ny: number, op: GlobalCompositeOperation, alpha = 1): void {
  x.save();
  x.globalCompositeOperation = op;
  x.globalAlpha = alpha;
  const tw = w / nx, th = h / ny;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) x.drawImage(src, i * tw, j * th, tw + 0.5, th + 0.5);
  x.restore();
}

export const css = (c: THREE.Color | number | string, a = 1): string => {
  const col = c instanceof THREE.Color ? c : new THREE.Color(c);
  return a >= 1 ? `#${col.getHexString()}` : `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
};

/** A gold-leaf fill: a diagonal gradient through pale and deep gold, for gilding drawn into canvases. */
export function goldLeaf(x: Ctx, x0: number, y0: number, x1: number, y1: number, tone: 'gold' | 'silver' | 'bronze' = 'gold'): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  const stops = tone === 'gold' ? ['#8a5a14', '#f6d77a', '#b8862c', '#fff1b8', '#9a6a1c']
    : tone === 'silver' ? ['#7a808a', '#f4f6fa', '#9aa2ae', '#ffffff', '#868c96'] : ['#5a3214', '#e0a060', '#8a5228', '#f2c08a', '#6a3a18'];
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}
