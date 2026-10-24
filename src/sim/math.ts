// Deterministic math for the simulation and the career.
//
// JavaScript engines agree bit for bit on + − × ÷, Math.sqrt and the other operations IEEE 754 rounds exactly,
// but not on Math.sin, Math.exp and the other transcendental functions: V8 (Node, Chromium) and JavaScriptCore
// (Safari, the iOS app's web view) return different last bits. Everything here is built from the exact
// operations only, so every result is a pure function of the input bits on every engine. Accuracy against the
// engines' own functions is measured over the stated ranges by tests/sim/math.test.ts (worst cases under 1e-15).

export const PI = 3.141592653589793;
export const HALF_PI = PI / 2;

// ---------------------------------------------------------------------------------------------------------------
// Trigonometry. x is reduced to r = x − k·π/2 with |r| ≤ π/4 by Cody–Waite: π/2 = PIO2_HI + PIO2_LO, where
// PIO2_HI keeps only its top 33 bits so k·PIO2_HI is exact for |k| < 2^20, and the subtraction x − k·PIO2_HI is
// exact (Sterbenz). The reduction is then accurate to half an ulp of r plus |k|·3.6e-27, for |x| < 2^20·π/2
// ≈ 1.6e6 (TRIG_RANGE). Larger arguments stay deterministic but lose accuracy. Taylor polynomials on |r| ≤ π/4
// are truncated where the next term is below 1e-19.

/** |x| below which dsin, dcos and dtan keep full accuracy. */
export const TRIG_RANGE = 1048576 * HALF_PI; // 2^20·π/2
const TWO_OVER_PI = 2 / PI;
const PIO2_HI = 1.5707963267341256; // 0x3FF921FB54400000
const PIO2_LO = 6.077100506506192e-11; // 0x3DD0B4611A626331: π/2 − PIO2_HI to 3.5e-27

// 1/n! with the sign of the series term; every factorial here is an exact double.
const S3 = -1 / 6, S5 = 1 / 120, S7 = -1 / 5040, S9 = 1 / 362880, S11 = -1 / 39916800, S13 = 1 / 6227020800;
const S15 = -1 / 1307674368000, S17 = 1 / 355687428096000;
const C2 = -1 / 2, C4 = 1 / 24, C6 = -1 / 720, C8 = 1 / 40320, C10 = -1 / 3628800, C12 = 1 / 479001600;
const C14 = -1 / 87178291200, C16 = 1 / 20922789888000;

/** sin r for |r| ≤ π/4 (truncation error < 1e-19). */
function sinKernel(r: number): number {
  const z = r * r;
  return r + r * z * (S3 + z * (S5 + z * (S7 + z * (S9 + z * (S11 + z * (S13 + z * (S15 + z * S17)))))));
}

/** cos r for |r| ≤ π/4 (truncation error < 3e-18). */
function cosKernel(r: number): number {
  const z = r * r;
  return 1 + z * (C2 + z * (C4 + z * (C6 + z * (C8 + z * (C10 + z * (C12 + z * (C14 + z * C16)))))));
}

export function dsin(x: number): number {
  const k = Math.round(x * TWO_OVER_PI);
  const r = x - k * PIO2_HI - k * PIO2_LO;
  switch (k & 3) {
    case 0: return sinKernel(r);
    case 1: return cosKernel(r);
    case 2: return -sinKernel(r);
    default: return -cosKernel(r);
  }
}

export function dcos(x: number): number {
  const k = Math.round(x * TWO_OVER_PI);
  const r = x - k * PIO2_HI - k * PIO2_LO;
  switch (k & 3) {
    case 0: return cosKernel(r);
    case 1: return -sinKernel(r);
    case 2: return -cosKernel(r);
    default: return sinKernel(r);
  }
}

export function dtan(x: number): number {
  const k = Math.round(x * TWO_OVER_PI);
  const r = x - k * PIO2_HI - k * PIO2_LO;
  return k & 1 ? -cosKernel(r) / sinKernel(r) : sinKernel(r) / cosKernel(r);
}

// ---------------------------------------------------------------------------------------------------------------
// Inverse trigonometry. atan on [0, 1] halves its argument twice with atan t = 2·atan(t / (1 + √(1 + t²))),
// bringing it below tan(π/16) ≈ 0.199, where the alternating series through t^21 is accurate to 1.3e-17.

const A3 = -1 / 3, A5 = 1 / 5, A7 = -1 / 7, A9 = 1 / 9, A11 = -1 / 11, A13 = 1 / 13, A15 = -1 / 15, A17 = 1 / 17;
const A19 = -1 / 19, A21 = 1 / 21;

/** atan t for t in [0, 1]. */
function atanUnit(t: number): number {
  let y = t / (1 + Math.sqrt(1 + t * t));
  y = y / (1 + Math.sqrt(1 + y * y));
  const z = y * y;
  return 4 * (y + y * z * (A3 + z * (A5 + z * (A7 + z * (A9 + z * (A11 + z * (A13 + z * (A15 + z * (A17 + z * (A19 + z * A21))))))))));
}

export function datan(x: number): number {
  const a = x < 0 ? -x : x;
  const r = a > 1 ? HALF_PI - atanUnit(1 / a) : atanUnit(a);
  return x < 0 ? -r : r;
}

/** The angle of the point (x, y) from the +x axis, in (−π, π]. */
export function datan2(y: number, x: number): number {
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
  let r = ay > ax ? HALF_PI - atanUnit(ax / ay) : ax === 0 ? 0 : atanUnit(ay / ax);
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}

// √(1 − x²) as √((1 − x)(1 + x)): 1 − x is exact near |x| = 1, where 1 − x·x would lose the low bits.
export function dasin(x: number): number {
  return datan2(x, Math.sqrt((1 - x) * (1 + x)));
}

export function dacos(x: number): number {
  return datan2(Math.sqrt((1 - x) * (1 + x)), x);
}

// ---------------------------------------------------------------------------------------------------------------
// Exponential and logarithm. ln 2 = LN2_HI + LN2_LO with LN2_HI's low 21 bits zero, so k·LN2_HI is exact for
// every exponent k a double can have.

const LN2_HI = 0.6931471803691238; // 0x3FE62E42FEE00000
const LN2_LO = 1.9082149292705877e-10; // 0x3DEA39EF35793C76: ln 2 − LN2_HI to 1.2e-26
const INV_LN2 = 1 / LN2_HI;
const EXP_MAX = 709.782712893384; // ln(largest double)
const EXP_MIN = -745.1332191019412; // ln(2^-1075): below it e^x rounds to 0
const E2 = 1 / 2, E3 = 1 / 6, E4 = 1 / 24, E5 = 1 / 120, E6 = 1 / 720, E7 = 1 / 5040, E8 = 1 / 40320;
const E9 = 1 / 362880, E10 = 1 / 3628800, E11 = 1 / 39916800, E12 = 1 / 479001600, E13 = 1 / 6227020800;

// 2^k for every normal exponent, built by exact doubling and halving: POW2[k + 1022] = 2^k, k in [−1022, 1023].
const POW2 = new Float64Array(2046);
POW2[1022] = 1;
for (let i = 1023; i < 2046; i++) POW2[i] = POW2[i - 1] * 2;
for (let i = 1021; i >= 0; i--) POW2[i] = POW2[i + 1] * 0.5;

/** e^x. x = k·ln 2 + r with |r| ≤ ln 2 / 2; e^r by Taylor through r^13 (truncation < 6e-18), scaled by 2^k. */
export function dexp(x: number): number {
  if (x > EXP_MAX) return Infinity;
  if (x < EXP_MIN) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  const p = 1 + r * (1 + r * (E2 + r * (E3 + r * (E4 + r * (E5 + r * (E6 + r * (E7 + r * (E8 + r * (E9 + r * (E10 + r * (E11 + r * (E12 + r * E13))))))))))));
  if (k > 1023) return p * POW2[2045] * 2; // only within ln 2 of EXP_MAX
  if (k < -1022) return p * POW2[k + 2044] * POW2[0]; // subnormal results: p·2^(k+1022), then one rounding by 2^-1022
  return p * POW2[k + 1022];
}

const SQRT2 = Math.SQRT2;
const MIN_NORMAL = 2.2250738585072014e-308;
const TWO_54 = 18014398509481984; // 2^54
const L3 = 1 / 3, L5 = 1 / 5, L7 = 1 / 7, L9 = 1 / 9, L11 = 1 / 11, L13 = 1 / 13, L15 = 1 / 15, L17 = 1 / 17;
const L19 = 1 / 19;
const BITS = new DataView(new ArrayBuffer(8));

/**
 * ln x. x = m·2^e with m in (√½, √2], read from the bits; ln m = 2·atanh s with s = (m − 1)/(m + 1), |s| ≤ 0.172,
 * by its series through s^19 (relative truncation < 3e-17).
 */
export function dlog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return x;
  let e = 0;
  if (x < MIN_NORMAL) {
    x *= TWO_54;
    e = -54;
  }
  BITS.setFloat64(0, x);
  const hi = BITS.getUint32(0);
  e += (hi >>> 20) - 1023;
  BITS.setUint32(0, (hi & 0x000fffff) | 0x3ff00000);
  let m = BITS.getFloat64(0);
  if (m > SQRT2) {
    m *= 0.5;
    e += 1;
  }
  const s = (m - 1) / (m + 1);
  const z = s * s;
  const lnm = 2 * (s + s * z * (L3 + z * (L5 + z * (L7 + z * (L9 + z * (L11 + z * (L13 + z * (L15 + z * (L17 + z * L19)))))))));
  return e * LN2_HI + (lnm + e * LN2_LO);
}

// ---------------------------------------------------------------------------------------------------------------
// Vectors: plain mutable objects; functions write to an `out` argument so hot loops allocate nothing.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });

export function set(out: V3, x: number, y: number, z: number): V3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const length = (a: V3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

export function cross(out: V3, a: V3, b: V3): V3 {
  return set(out, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

/** out = a + b·s */
export function addScaled(out: V3, a: V3, b: V3, s: number): V3 {
  return set(out, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
}

/** Scales a to unit length in place; the zero vector (or one whose squared length underflows) stays as it is. */
export function normalize(a: V3): V3 {
  const l = length(a);
  return l > 0 ? set(a, a.x / l, a.y / l, a.z / l) : a;
}

// ---------------------------------------------------------------------------------------------------------------
// Seeded randomness. An Rng is the four-word state of sfc32 (Chris Doty-Humphrey's Small Fast Counting generator
// from PractRand: 128-bit state, a counter that guarantees a period of at least 2^32, strong statistical quality),
// kept in a plain Uint32Array so it lives inside the match state and survives a snapshot. Independent streams are
// seeded with hash32(seed, stream).

export type Rng = Uint32Array;

/** Murmur3's 32-bit finaliser: a bijection on uint32 with full avalanche. */
export function fmix32(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A well-mixed uint32 from two uint32s, e.g. a stream seed from a match seed and a stream id. */
export function hash32(a: number, b: number): number {
  return fmix32((a ^ fmix32((b + 0x9e3779b9) >>> 0)) >>> 0);
}

/** A generator seeded from a uint32 through splitmix32, warmed up by twelve outputs. */
export function rngFrom(seed: number): Rng {
  const r = new Uint32Array(4);
  let s = seed >>> 0;
  for (let i = 0; i < 4; i++) {
    s = (s + 0x9e3779b9) >>> 0;
    r[i] = fmix32(s);
  }
  for (let i = 0; i < 12; i++) rngU32(r);
  return r;
}

/** The next uniform uint32. */
export function rngU32(r: Rng): number {
  const a = r[0], b = r[1], c = r[2], d = r[3];
  const t = (a + b + d) >>> 0;
  r[3] = d + 1;
  r[0] = b ^ (b >>> 9);
  r[1] = c + (c << 3);
  r[2] = ((c << 21) | (c >>> 11)) + t;
  return t;
}

/** Uniform in [0, 1), in steps of 2^-32. */
export function rngFloat(r: Rng): number {
  return rngU32(r) * 2.3283064365386963e-10;
}

/** Uniform in [lo, hi). */
export function rngRange(r: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rngFloat(r);
}

/** Uniform integer in [0, n) for 0 < n ≤ 2^32 (bias below n·2^-32). */
export function rngInt(r: Rng, n: number): number {
  return Math.floor(rngU32(r) * 2.3283064365386963e-10 * n);
}

/** True with probability p. */
export function rngChance(r: Rng, p: number): boolean {
  return rngFloat(r) < p;
}
