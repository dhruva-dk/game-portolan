// The sea's waves as a spectrum (Tessendorf, "Simulating Ocean Water", 2001), in the empirical form Horvath gives in
// "Empirical Directional Wave Spectra for Computer Graphics" (DigiPro 2015): a JONSWAP wind sea grown by the wind's
// speed over its fetch, spread about the wind by Donelan and Banner's sech², plus a swell, long and narrow, from a
// storm somewhere else.
//
// Three cascades of 256² modes cover it, from 250 m down to a few centimetres; each holds its own band of
// wavenumbers so no wave is counted twice. The GPU builds every mode from the same hash and the same formulas as here,
// so the CPU can sum the longest waves itself, at any point and time, for the hulls to ride exactly the swell that is
// drawn.

/** Modes along each side of a cascade. */
export const N = 256;
/** Each cascade's tile, metres. Their ratios are not whole, so their repeats never line up. */
export const SIZES = [250, 37, 6.3] as const;
export const CASCADES = SIZES.length;
export const G = 9.81;
/** Cascade c holds the modes with |k| in [CUTS[c], CUTS[c + 1]): each starts six of the next one's modes in, where
 *  the next one's grid of wavenumbers has grown fine enough to carry them. */
export const CUTS = [0, (6 * 2 * Math.PI) / SIZES[1], (6 * 2 * Math.PI) / SIZES[2], 1e9];

/** How the sea is: what the weather and the wind make of it. */
export interface SeaState {
  /** Wind speed ten metres over the sea, m/s. */
  wind: number;
  /** Where the wind blows toward, radians in the waves' frame (0 along its first axis). */
  heading: number;
  /** How far the wind has blown over open water, metres: short fetches keep the sea short and steep. */
  fetch: number;
  /** The swell's significant height, metres, its peak wavelength, metres, and where it runs, radians. */
  swell: number;
  swellLength: number;
  swellHeading: number;
  /** How far the crests lean and sharpen (Tessendorf's λ). */
  chop: number;
}

export const CALM_SEA: SeaState = { wind: 6, heading: 0, fetch: 6000, swell: 0.45, swellLength: 32, swellHeading: 0.5, chop: 0.9 };

/** What the spectrum is built from, worked out once for a sea state: JONSWAP's α and peak for the wind sea and the
 *  swell, and the directions as unit vectors. */
export interface SpectrumParams {
  windAlpha: number;
  windPeak: number;
  windDir: [number, number];
  swellAlpha: number;
  swellPeak: number;
  swellDir: [number, number];
}

const GAMMA = 3.3;
const SWELL_GAMMA = 7;
/** How tightly the swell runs along its heading: cos^(2s) of half the angle off it. */
export const SWELL_SPREAD = 36;

export function spectrumParams(s: SeaState): SpectrumParams {
  const U = Math.max(s.wind, 0.5), F = Math.max(s.fetch, 50);
  // fetch-limited JONSWAP (Hasselmann et al. 1973)
  const windAlpha = 0.076 * Math.pow((U * U) / (F * G), 0.22);
  const windPeak = 22 * Math.pow((G * G) / (U * F), 1 / 3);
  // a swell of significant height H: m0 = (H/4)², and the JONSWAP shape's integral α g²/(5 ωp⁴) grown by its peak
  const swellPeak = Math.sqrt((G * 2 * Math.PI) / Math.max(s.swellLength, 1));
  const m0 = (s.swell / 4) ** 2;
  const swellAlpha = (m0 * 5 * swellPeak ** 4) / (G * G) * (1 - 0.287 * Math.log(SWELL_GAMMA));
  return {
    windAlpha, windPeak, windDir: [Math.cos(s.heading), Math.sin(s.heading)],
    swellAlpha, swellPeak, swellDir: [Math.cos(s.swellHeading), Math.sin(s.swellHeading)],
  };
}

function jonswap(w: number, alpha: number, peak: number, gamma: number): number {
  if (w <= 1e-4) return 0;
  const sigma = w <= peak ? 0.07 : 0.09;
  const r = Math.exp(-((w - peak) ** 2) / (2 * sigma * sigma * peak * peak));
  return ((alpha * G * G) / w ** 5) * Math.exp(-1.25 * (peak / w) ** 4) * Math.pow(gamma, r);
}

/** Donelan and Banner's spreading about the wind (1985), normalised over the circle. */
function donelanBanner(w: number, peak: number, theta: number): number {
  const r = w / peak;
  const beta = r < 0.95 ? 2.61 * Math.pow(r, 1.3) : r < 1.6 ? 2.28 * Math.pow(r, -0.65) : Math.pow(10, -0.4 + 0.8393 * Math.exp(-0.567 * Math.log(r * r)));
  const c = Math.cosh(beta * theta);
  return beta / (2 * Math.tanh(beta * Math.PI)) / (c * c);
}

/** Variance density over the plane of wavenumbers, m⁴: E(k) = S(ω) D(θ) (dω/dk) / k. */
export function spectrum(kx: number, kz: number, p: SpectrumParams): number {
  const k = Math.hypot(kx, kz);
  if (k < 1e-6) return 0;
  const w = Math.sqrt(G * k);
  const dwdk = G / (2 * w);
  const cosW = (kx * p.windDir[0] + kz * p.windDir[1]) / k;
  const sinW = (kz * p.windDir[0] - kx * p.windDir[1]) / k;
  const wind = jonswap(w, p.windAlpha, p.windPeak, GAMMA) * donelanBanner(w, p.windPeak, Math.atan2(sinW, cosW));
  const cosS = (kx * p.swellDir[0] + kz * p.swellDir[1]) / k;
  const half = Math.sqrt(Math.max(0, (1 + cosS) / 2));
  const swell = jonswap(w, p.swellAlpha, p.swellPeak, SWELL_GAMMA) * (Math.sqrt(SWELL_SPREAD + 0.25) / (2 * Math.sqrt(Math.PI))) * Math.pow(half, 2 * SWELL_SPREAD);
  // the shortest ripples die in the water's own viscosity
  return ((wind + swell) * dwdk) / k * Math.exp(-k * k * 1e-4);
}

/** PCG's hash (Jarzynski and Olano, "Hash Functions for GPU Rendering", JCGT 2020), the GPU's to the bit. */
export function pcg(v: number): number {
  const state = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> (((state >>> 28) + 4) >>> 0)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

/** The pair of Gaussian numbers mode (x, y) of cascade c starts from. */
export function gaussian(c: number, x: number, y: number, seed: number, out: [number, number]): [number, number] {
  const s = (((c * N + y) * N + x) * 2 + seed * 2 * N * N * CASCADES) >>> 0;
  const u1 = (pcg(s) + 0.5) / 4294967296, u2 = (pcg(s + 1) + 0.5) / 4294967296;
  const r = Math.sqrt(-2 * Math.log(u1));
  out[0] = r * Math.cos(2 * Math.PI * u2);
  out[1] = r * Math.sin(2 * Math.PI * u2);
  return out;
}

/** The signed mode number of index i along a side. */
export const modeOf = (i: number): number => (i < N / 2 ? i : i - N);

/**
 * The longest waves, summed directly on the CPU: every mode of the first cascade within a few of the origin that
 * carries any energy. Their sum is the swell the hulls ride; the shorter waves only rock them, and the GPU draws those.
 */
export class LongWaves {
  /** Per mode: kx, kz, ω, and the complex amplitude h0 (re, im). */
  modes = new Float32Array(0);
  count = 0;
  #g: [number, number] = [0, 0];

  /** Rebuilds the modes for a sea state. */
  update(p: SpectrumParams, seed: number, reach = 10, limit = 160): void {
    const list: number[] = [];
    const L = SIZES[0], dk = (2 * Math.PI) / L;
    const found: [number, number, number, number, number][] = [];
    let total = 0;
    for (let my = -reach; my <= reach; my++) for (let mx = -reach; mx <= reach; mx++) {
      const kx = mx * dk, kz = my * dk, k = Math.hypot(kx, kz);
      if (k === 0 || k >= CUTS[1]) continue;
      const a = 0.5 * Math.sqrt(spectrum(kx, kz, p)) * dk;
      const [gr, gi] = gaussian(0, (mx + N) % N, (my + N) % N, seed, this.#g);
      const e = (gr * gr + gi * gi) * a * a;
      if (e < 1e-9) continue;
      found.push([kx, kz, Math.sqrt(G * k), gr * a, gi * a]);
      total += e;
    }
    // the largest first, and no more than carry nearly all the long waves' energy
    const energy = (m: number[]) => m[3] * m[3] + m[4] * m[4];
    found.sort((a, b) => energy(b) - energy(a));
    let kept = 0;
    for (const m of found) {
      if (list.length / 5 >= limit || kept > total * 0.995) break;
      list.push(...m);
      kept += energy(m);
    }
    this.modes = Float32Array.from(list);
    this.count = list.length / 5;
  }

  /** Height (m) at q, a point in the waves' frame, at time t; with slope, also the rise per metre along each axis. */
  at(qx: number, qz: number, t: number, slope?: [number, number]): number {
    const m = this.modes;
    let h = 0, sx = 0, sz = 0;
    for (let i = 0; i < this.count; i++) {
      const o = i * 5, kx = m[o], kz = m[o + 1];
      const ph = kx * qx + kz * qz - m[o + 2] * t;
      const c = Math.cos(ph), s = Math.sin(ph);
      // 2 Re(h0 e^{iφ}) and its gradient
      const re = m[o + 3] * c - m[o + 4] * s, im = m[o + 3] * s + m[o + 4] * c;
      h += 2 * re;
      sx -= 2 * im * kx;
      sz -= 2 * im * kz;
    }
    if (slope) { slope[0] = sx; slope[1] = sz; }
    return h;
  }
}
