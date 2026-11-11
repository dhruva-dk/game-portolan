// The sea's wave spectrum, on the CPU: how much of the sea's height lives at each wavevector, and one random sea drawn
// from it for the FFT to move on (Tessendorf, "Simulating Ocean Water", 2001).
//
// The sea state is fetch-limited (Hasselmann et al. 1973, JONSWAP) and capped at a fully developed sea
// (Pierson–Moskowitz). The spectrum's shape is JONSWAP's; its spread about the wind is Donelan–Banner's (as in
// Horvath, "Empirical directional wave spectra for computer graphics", 2015). Its scale is set so that its variance is
// exactly (Hs/4)²: the sea is as high as the sea state says.
//
// Pure arithmetic: no three, so it runs in node for the tests.

export const G = 9.81;

/** The sea's significant height (m) and the peak's angular frequency (rad/s) for a wind (m/s) over a fetch (m). */
export function seaState(wind: number, fetch: number) {
  const U = Math.max(wind, 0.5), F = Math.max(fetch, 50);
  const hs = Math.min(1.6e-3 * U * Math.sqrt(F / G), (0.21 * U * U) / G);
  const peak = Math.max(22 * Math.cbrt((G * G) / (U * F)), (0.855 * G) / U);
  return { hs, peak };
}

const GAMMA = 3.3;

/** JONSWAP's shape over angular frequency, without its scale α. */
export function jonswap(w: number, peak: number): number {
  if (w <= 0) return 0;
  const sigma = w <= peak ? 0.07 : 0.09;
  const r = Math.exp(-((w - peak) ** 2) / (2 * sigma * sigma * peak * peak));
  return ((G * G) / w ** 5) * Math.exp(-1.25 * (peak / w) ** 4) * GAMMA ** r;
}

/** Donelan–Banner spreading: the share of the waves at frequency w running θ off the wind, over −π…π it sums to 1. */
export function spread(w: number, peak: number, theta: number): number {
  const x = w / peak;
  const beta = x < 0.95 ? 2.61 * x ** 1.3 : x < 1.6 ? 2.28 * x ** -1.3 : 10 ** (-0.4 + 0.8393 * Math.exp(-0.567 * Math.log(x * x)));
  const t = Math.atan2(Math.sin(theta), Math.cos(theta));
  const sech = 1 / Math.cosh(beta * t);
  return (beta / (2 * Math.tanh(beta * Math.PI))) * sech * sech;
}

/** The scale α that makes ∫ α·jonswap dω = (hs/4)². */
function scale(hs: number, peak: number): number {
  let sum = 0;
  const top = peak * 30, steps = 6000, dw = top / steps;
  for (let i = 1; i <= steps; i++) sum += jonswap(i * dw, peak) * dw;
  return (hs / 4) ** 2 / sum;
}

export interface Sea { wind: number; heading: number; fetch: number }

/**
 * The spectrum over the wavevector plane, m⁴ (variance per dkx·dkz): S(ω)·D(θ)·(dω/dk)/k, with deep water's ω² = g k.
 * Returns a function of (kx, kz) for this sea.
 */
export function spectrum(sea: Sea): (kx: number, kz: number) => number {
  const { hs, peak } = seaState(sea.wind, sea.fetch);
  const alpha = scale(hs, peak);
  return (kx, kz) => {
    const k = Math.hypot(kx, kz);
    if (k === 0) return 0;
    const w = Math.sqrt(G * k);
    return alpha * jonswap(w, peak) * spread(w, peak, Math.atan2(kz, kx) - sea.heading) * (0.5 * Math.sqrt(G / k)) / k;
  };
}

/** The wavenumbers a patch holds, rad/m: [from, to). Patches of different sizes hold different bands, so no wave is drawn twice. */
export type Band = [number, number];

const banded = (S: (kx: number, kz: number) => number, [lo, hi]: Band) => (kx: number, kz: number) => {
  const k = Math.hypot(kx, kz);
  return k >= lo && k < hi ? S(kx, kz) : 0;
};

/** The mean square slope (both axes together) of the waves an N×N patch L wide holds in its band. */
export function meanSquareSlope(N: number, L: number, sea: Sea, band: Band): number {
  const S = banded(spectrum(sea), band), dk = (2 * Math.PI) / L;
  let sum = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const kx = (x - N / 2) * dk, kz = (y - N / 2) * dk;
    sum += (kx * kx + kz * kz) * S(kx, kz) * dk * dk;
  }
  return sum;
}

/**
 * How alike two reads of one drawn sea are, (x, z) metres apart on an N×N patch L wide: the correlation of their
 * heights, Σ S(k)·cos(k·lag) / Σ S(k), over the `modes` wavevectors that hold the most of it (the rest only add
 * to the total), so it is quick enough to be asked often.
 */
export function likeness(N: number, L: number, sea: Sea, band: Band, modes = 96): (x: number, z: number) => number {
  const S = banded(spectrum(sea), band), dk = (2 * Math.PI) / L;
  const all: [number, number, number][] = [];
  let total = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const kx = (x - N / 2) * dk, kz = (y - N / 2) * dk;
    // a real sea's height holds k and −k alike
    const s = (S(kx, kz) + S(-kx, -kz)) / 2;
    if (s > 0) all.push([kx, kz, s]);
    total += s;
  }
  const top = all.sort((a, b) => b[2] - a[2]).slice(0, modes);
  return (x, z) => {
    let sum = 0;
    for (const [kx, kz, s] of top) sum += s * Math.cos(kx * x + kz * z);
    return total > 0 ? sum / total : 0;
  };
}

/** The sea's whole mean square slope, ripples included, by wind (Cox & Munk 1954, clean surface). */
export const coxMunk = (wind: number) => 0.003 + 5.12e-3 * wind;

/** The share of the sea white with breaking waves, by wind (Monahan & O'Muircheartaigh 1980). */
export const whitecaps = (wind: number) => Math.min(3.84e-6 * Math.max(wind, 0) ** 3.41, 0.5);

/** The z with P(Z < z) = p for a standard normal Z (Acklam's rational approximation, ~1e-9). */
export function normalQuantile(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normalQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** A seeded generator of standard normal numbers (mulberry32, Box–Muller). */
function normals(seed: number) {
  let s = seed >>> 0;
  const uniform = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

/**
 * One sea drawn from the spectrum, for an N×N grid of wavevectors over a patch L metres wide: texel (x, y) holds
 * k = ((x − N/2), (y − N/2))·2π/L. Each texel is (h₀(k), conj h₀(−k)) as RGBA, so the GPU can move it on in time
 * without looking anywhere else. E|h₀|² = S·Δk²/2, so the height's variance, Σ|h̃|², is the spectrum's.
 * The same seed gives the same sea, so a change of wind changes the waves' sizes, not where they are.
 */
export function initialSpectrum(N: number, L: number, sea: Sea, seed = 1, band: Band = [0, Infinity]): Float32Array {
  const S = banded(spectrum(sea), band), dk = (2 * Math.PI) / L, gauss = normals(seed);
  const h0 = new Float64Array(N * N * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = (dk * Math.sqrt(S((x - N / 2) * dk, (y - N / 2) * dk))) / 2;
    h0[(y * N + x) * 2] = gauss() * a;
    h0[(y * N + x) * 2 + 1] = gauss() * a;
  }
  const out = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, j = ((N - y) % N) * N + ((N - x) % N);
    out[i * 4] = h0[i * 2];
    out[i * 4 + 1] = h0[i * 2 + 1];
    out[i * 4 + 2] = h0[j * 2];
    out[i * 4 + 3] = -h0[j * 2 + 1];
  }
  return out;
}
