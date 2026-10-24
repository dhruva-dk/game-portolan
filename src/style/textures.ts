// The style's generated textures, made once at startup on the CPU (about 50 ms) and shared by every material, the
// ink composite and the interface. All tile seamlessly and are sampled in world, object or scrap coordinates (never
// across the screen, except the frame's deckle). Their GPU sizes are reported for the texture-memory budget.
//
//   tPaper  512², read at a screen-stable octave of the anchor frame (style/glsl.ts, paperAt):
//           R  fibre: parchment's grain of short fibres, light and dark, over a fine tooth
//           G  granulation: clumped pigment particles that settle in the paper's valleys in deeper washes
//           B  mottle: smooth noise, four cells a tile (the cloudy formation of the skin; also line wobble)
//           A  bloom: domain-warped noise whose level sets have the frilled edge a wet wash leaves where it backs
//              into a drying one (soft bleed at glaze edges); also smooth noise for stroke wobble and crinkle
//   tMarks  256², read at fixed world scales (stains and foxing are the same on the globe and the chart):
//           R  foxing: sparse rust-brown spots with soft halos
//           G  stains: broad tide-marked water stains, darker at their drying edge
//           B  dry brush: bristle streaks broken by the paper's tooth, along x (foam, lead-white flicks)
//           A  unused (opaque)
import * as THREE from 'three';

export interface StyleTextures {
  paper: THREE.DataTexture;
  marks: THREE.DataTexture;
}

/** Bytes a mipmapped RGBA8 square texture of this size occupies on the GPU. */
export function textureBytes(t: THREE.DataTexture): number {
  const { width, height } = t.image;
  return Math.round(width * height * 4 * (t.generateMipmaps ? 4 / 3 : 1));
}

export function createStyleTextures(): StyleTextures {
  return { paper: paperTexture(512), marks: marksTexture(256) };
}

// ---------------------------------------------------------------------------------------------------------------

/** A small, fast seeded generator (mulberry32). Rendering only: the simulation has its own. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Add tileable value noise to `out` (size², row-major): `period` lattice cells across the tile, quintic
 * interpolation, scaled by `amp`. Successive calls at doubling periods build fractal noise.
 */
function addNoise(out: Float32Array, size: number, period: number, seed: number, amp: number): void {
  const r = rng(seed), lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = r() * 2 - 1;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const cell = size / period;
  for (let y = 0; y < size; y++) {
    const gy = y / cell, y0 = Math.floor(gy), ty = fade(gy - y0);
    const r0 = (y0 % period) * period, r1 = ((y0 + 1) % period) * period;
    for (let x = 0; x < size; x++) {
      const gx = x / cell, x0 = Math.floor(gx), tx = fade(gx - x0);
      const c0 = x0 % period, c1 = (x0 + 1) % period;
      const top = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * tx;
      const bottom = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * tx;
      out[y * size + x] += (top + (bottom - top) * ty) * amp;
    }
  }
}

/** Fractal tileable noise in roughly [-1, 1]: octaves from `period` upward, each half the amplitude. */
function fbm(size: number, period: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0;
  for (let o = 0; o < octaves && period << o <= size; o++, amp *= 0.5) {
    addNoise(out, size, period << o, seed + o * 101, amp);
    norm += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Splat a value at a fractional position with bilinear weights, wrapping round the tile. */
function splat(out: Float32Array, size: number, x: number, y: number, v: number): void {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const m = size - 1;
  const i00 = (y0 & m) * size, i10 = ((y0 + 1) & m) * size, c0 = x0 & m, c1 = (x0 + 1) & m;
  out[i00 + c0] += v * (1 - fx) * (1 - fy);
  out[i00 + c1] += v * fx * (1 - fy);
  out[i10 + c0] += v * (1 - fx) * fy;
  out[i10 + c1] += v * fx * fy;
}

/** Rescale a field so its mean maps to 0.5 and `spread` standard deviations reach 0 and 1. */
function normalise(f: Float32Array, spread: number): Float32Array {
  let mean = 0;
  for (const v of f) mean += v;
  mean /= f.length;
  let variance = 0;
  for (const v of f) variance += (v - mean) ** 2;
  const sd = Math.sqrt(variance / f.length) || 1;
  for (let i = 0; i < f.length; i++) f[i] = Math.min(Math.max(0.5 + (f[i] - mean) / (sd * spread * 2), 0), 1);
  return f;
}

function pack(size: number, channels: [Float32Array, Float32Array, Float32Array, Float32Array]): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(channels[c][i] * 255);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------------------------

function paperTexture(size: number): THREE.DataTexture {
  // Fibre: a fine tooth, then thousands of short, slightly curved fibres, some darker and some lighter than the
  // ground, laid in every direction (parchment is skin, with no machine direction).
  const fibre = fbm(size, 64, 3, 11);
  for (let i = 0; i < fibre.length; i++) fibre[i] *= 0.35;
  const r = rng(12);
  for (let n = 0; n < 9000; n++) {
    let x = r() * size, y = r() * size, a = r() * Math.PI * 2;
    const len = 6 + r() ** 2 * 44, bend = (r() - 0.5) * 0.12, v = (r() < 0.62 ? -1 : 0.8) * (0.25 + r() * 0.75);
    for (let s = 0; s < len; s += 0.7) {
      const taper = Math.sin((s / len) * Math.PI);
      splat(fibre, size, x, y, v * taper * 0.55);
      x += Math.cos(a) * 0.7;
      y += Math.sin(a) * 0.7;
      a += bend;
    }
  }
  normalise(fibre, 2.2);

  // Granulation: pigment particles clump into specks four to eight texels across, more where the paper's tooth dips.
  const grain = new Float32Array(size * size);
  addNoise(grain, size, 128, 21, 1);
  addNoise(grain, size, 64, 22, 0.9);
  for (let i = 0; i < grain.length; i++) {
    const v = grain[i] * 0.55 - (fibre[i] - 0.5) * 0.9;
    grain[i] = v > 0 ? v ** 1.4 : -((-v) ** 1.4) * 0.6;
  }
  normalise(grain, 2.0);

  const mottle = normalise(fbm(size, 4, 5, 31), 2.0);

  // Bloom: a field warped by two others, so its level sets have the frilled, cauliflower edge of a backrun.
  const warpX = fbm(size, 8, 3, 81), warpY = fbm(size, 8, 3, 82), base = fbm(size, 8, 5, 83);
  const bloom = new Float32Array(size * size);
  const reach = size / 24;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = (x + Math.round(warpX[y * size + x] * reach) + size) & (size - 1);
      const wy = (y + Math.round(warpY[y * size + x] * reach) + size) & (size - 1);
      bloom[y * size + x] = base[wy * size + wx];
    }
  }
  normalise(bloom, 2.0);
  return pack(size, [fibre, grain, mottle, bloom]);
}

function marksTexture(size: number): THREE.DataTexture {
  const r = rng(51);

  // Foxing: rust spots of every size, most of them tiny, each a dense core in a soft irregular halo.
  const fox = new Float32Array(size * size);
  const ring = fbm(size, 16, 3, 52);
  for (let n = 0; n < 34; n++) {
    const cx = r() * size, cy = r() * size, rad = 0.8 + r() ** 3 * 5.5, halo = rad * (2.2 + r() * 1.6);
    const strength = 0.45 + r() * 0.55, ext = Math.ceil(halo * 1.6);
    for (let dy = -ext; dy <= ext; dy++) {
      for (let dx = -ext; dx <= ext; dx++) {
        const x = (Math.floor(cx) + dx) & (size - 1), y = (Math.floor(cy) + dy) & (size - 1);
        const d = Math.hypot(dx + Math.floor(cx) - cx, dy + Math.floor(cy) - cy) * (1 + ring[y * size + x] * 0.45);
        const core = Math.max(0, 1 - d / rad), soft = Math.max(0, 1 - d / halo);
        const i = y * size + x;
        fox[i] = Math.max(fox[i], strength * Math.min(1, core * 1.8 + soft * soft * 0.35));
      }
    }
  }

  // Stains: where broad low-frequency noise crosses a level, water once stood and dried: a faint body and a
  // darker tide line at its edge.
  const field = fbm(size, 2, 5, 61);
  const stain = new Float32Array(size * size);
  for (let i = 0; i < stain.length; i++) {
    const v = field[i] - 0.28;
    const tide = Math.exp(-((v / 0.035) ** 2));
    stain[i] = Math.min(1, (v > 0 ? 0.3 : 0) * Math.min(1, v / 0.05) + tide * 0.75);
  }

  // Dry brush: bristle tracks along x, each its own darkness, broken where the loaded brush skipped the tooth.
  const bristle = new Float32Array(size * size), skip = fbm(size, 8, 4, 71);
  const tracks = new Float32Array(size);
  for (let y = 0; y < size; y++) tracks[y] = r();
  for (let y = 0; y < size; y++) {
    const t = (tracks[y] + tracks[(y + 1) & (size - 1)] * 0.6 + tracks[(y + size - 1) & (size - 1)] * 0.6) / 2.2;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      bristle[i] = Math.min(1, Math.max(0, (t - 0.35) * 1.8 + skip[i] * 0.9));
    }
  }

  return pack(size, [fox, stain, bristle, new Float32Array(size * size).fill(1)]);
}
