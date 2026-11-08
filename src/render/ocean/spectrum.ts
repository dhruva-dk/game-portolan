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

/** The sea's significant wave height, metres: four times the root of its variance, the wind sea's and the swell's,
 *  each the integral of its JONSWAP spectrum. */
export function significantHeight(p: SpectrumParams): number {
  const m0 = (alpha: number, peak: number, gamma: number) => (alpha * G * G) / (5 * peak ** 4) / (1 - 0.287 * Math.log(gamma));
  return 4 * Math.sqrt(m0(p.windAlpha, p.windPeak, GAMMA) + m0(p.swellAlpha, p.swellPeak, SWELL_GAMMA));
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

/** Each cascade's RMS curvature of the surface, 1/m: sqrt(∫ E(k) k⁴ d²k) over its band of wavenumbers, up to the
 *  finest its grid holds. How strongly that cascade's waves focus light, and so how deep before they overfocus. */
export function curvatureRms(p: SpectrumParams): number[] {
  return SIZES.map((L, c) => {
    const lo = Math.max(CUTS[c], (2 * Math.PI) / L), hi = Math.min(CUTS[c + 1], (Math.PI * N) / L);
    const RADII = 96, ANGLES = 64;
    let sum = 0;
    for (let i = 0; i < RADII; i++) {
      // log-spaced in k, which is where the spectrum's shape lives
      const k0 = lo * Math.pow(hi / lo, i / RADII), k1 = lo * Math.pow(hi / lo, (i + 1) / RADII), k = Math.sqrt(k0 * k1);
      for (let j = 0; j < ANGLES; j++) {
        const a = ((j + 0.5) / ANGLES) * 2 * Math.PI;
        sum += spectrum(k * Math.cos(a), k * Math.sin(a), p) * k ** 4 * k * (k1 - k0) * ((2 * Math.PI) / ANGLES);
      }
    }
    return Math.sqrt(sum);
  });
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
 *
 * The modes lie on the first cascade's lattice, k = (mx, my) 2π/L, so a mode's turn at q, e^{ik·q}, is a product of
 * powers of e^{i2πqx/L} and e^{i2πqz/L}: a point costs four trigonometric calls and the rest is multiplication, where
 * a cosine and a sine for every mode at every point (every hull's samples, every wake's points, everything afloat)
 * was the largest single cost on the CPU in a fight. The modes' turns with time are worked out once for each t.
 */
export class LongWaves {
  /** Per mode: mx, my (lattice steps from the origin), ω, and the complex amplitude h0 (re, im). */
  modes = new Float32Array(0);
  count = 0;
  #g: [number, number] = [0, 0];
  #reach = 0;
  /** e^{-iωt} per mode, for the time #t. */
  #turn = new Float64Array(0);
  #t = NaN;
  /** e^{i m 2πq/L} for m from −reach to reach, along each axis: re, im interleaved. */
  #px = new Float64Array(0);
  #pz = new Float64Array(0);

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
      found.push([mx, my, Math.sqrt(G * k), gr * a, gi * a]);
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
    this.#reach = reach;
    this.#turn = new Float64Array(this.count * 2);
    this.#t = NaN;
    this.#px = new Float64Array((2 * reach + 1) * 2);
    this.#pz = new Float64Array((2 * reach + 1) * 2);
  }

  /** Height (m) at q, a point in the waves' frame, at time t. */
  at(qx: number, qz: number, t: number): number {
    const m = this.modes, n = this.count, turn = this.#turn, px = this.#px, pz = this.#pz, r = this.#reach;
    if (t !== this.#t) {
      this.#t = t;
      for (let i = 0; i < n; i++) {
        const w = m[i * 5 + 2] * t;
        turn[i * 2] = Math.cos(w);
        turn[i * 2 + 1] = -Math.sin(w);
      }
    }
    const dk = (2 * Math.PI) / SIZES[0];
    powers(px, r, dk * qx);
    powers(pz, r, dk * qz);
    let h = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 5, x = (m[o] + r) * 2, z = (m[o + 1] + r) * 2;
      // e^{iφ} = e^{i kx qx} e^{i kz qz} e^{-iωt}
      const ar = px[x] * pz[z] - px[x + 1] * pz[z + 1], ai = px[x] * pz[z + 1] + px[x + 1] * pz[z];
      const tr = turn[i * 2], ti = turn[i * 2 + 1];
      const er = ar * tr - ai * ti, ei = ar * ti + ai * tr;
      // 2 Re(h0 e^{iφ})
      h += 2 * (m[o + 3] * er - m[o + 4] * ei);
    }
    return h;
  }
}

/** e^{i j a} for j from −reach to reach into out (re, im interleaved, j = 0 at out[2 reach]). */
function powers(out: Float64Array, reach: number, a: number): void {
  const c = Math.cos(a), s = Math.sin(a), o = reach * 2;
  out[o] = 1;
  out[o + 1] = 0;
  for (let j = 1; j <= reach; j++) {
    const ur = out[o + (j - 1) * 2], ui = out[o + (j - 1) * 2 + 1];
    out[o + j * 2] = ur * c - ui * s;
    out[o + j * 2 + 1] = ur * s + ui * c;
    out[o - j * 2] = out[o + j * 2];
    out[o - j * 2 + 1] = -out[o + j * 2 + 1];
  }
}
