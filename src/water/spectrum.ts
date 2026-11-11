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
export function initialSpectrum(N: number, L: number, sea: Sea, seed = 1): Float32Array {
  const S = spectrum(sea), dk = (2 * Math.PI) / L, gauss = normals(seed);
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
