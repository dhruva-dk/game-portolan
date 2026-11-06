// Procedural noise baked into small tileable textures: value noise with a quintic fade, summed into fbm at a few
// scales, so shaders can look up rich variation with one fetch instead of working noise out per pixel.
import * as THREE from 'three';

export function periodicNoise(size: number, period: number, seed: number): Float32Array {
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

export function fbmTile(size: number, base: number, seed: number, oct = 5): Float32Array {
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

let shared: THREE.DataTexture | null = null;

/** One noise texture for every GPU material that reads it, so a material reading it twice binds it once. */
export const sharedNoise = (): THREE.DataTexture => (shared ??= makeNoiseTexture());

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

