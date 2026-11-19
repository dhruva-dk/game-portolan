// The sound's workshop: what the recipes (sounds/*.ts) build each sound from, sample by sample into plain Float32Arrays
// at the context's rate. Noise of a seeded random, the RBJ cookbook's filters (fixed, or swept along the sound), damped
// modes (wood, iron, a ward's ring), stick-slip trains (a creak), bubbles, and the envelopes and shaping that join them.
// Pure: no Web Audio here, so every sound can be made and measured headless (tools/audio.ts) and in node (tests).

/** A seeded random in [0, 1) (mulberry32). */
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

/** A sound's samples, each −1…1. */
export type Samples = Float32Array<ArrayBuffer>;

/** A sound being made: its samples, the rate, and its seeded random. */
export interface Take { x: Samples; rate: number; r: () => number }

/** A take `seconds` long at `rate`, its random seeded by `seed`. */
export const take = (seconds: number, rate: number, seed: number): Take =>
  ({ x: new Float32Array(Math.ceil(seconds * rate)), rate, r: rng(seed) });

/** A gain in decibels as a factor. */
export const db = (d: number) => 10 ** (d / 20);

export type Shape = 'lowpass' | 'highpass' | 'bandpass' | 'peak' | 'lowshelf' | 'highshelf';

/** The RBJ cookbook's biquad for `shape` at `f` Hz, `q`, `gain` dB (peak and shelves), into `c` (b0 b1 b2 a1 a2, a0 = 1). */
export function design(c: Float64Array, shape: Shape, f: number, q: number, gain: number, rate: number) {
  const w = (2 * Math.PI * Math.min(f, rate * 0.49)) / rate, cos = Math.cos(w), sin = Math.sin(w);
  const alpha = sin / (2 * q), A = 10 ** (gain / 40);
  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  if (shape === 'lowpass') [b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (shape === 'highpass') [b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (shape === 'bandpass') [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha];
  else if (shape === 'peak') [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
  else {
    const s = shape === 'lowshelf' ? 1 : -1, r = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - s * (A - 1) * cos + r);
    b1 = s * 2 * A * (A - 1 - s * (A + 1) * cos);
    b2 = A * (A + 1 - s * (A - 1) * cos - r);
    a0 = A + 1 + s * (A - 1) * cos + r;
    a1 = -s * 2 * (A - 1 + s * (A + 1) * cos);
    a2 = A + 1 + s * (A - 1) * cos - r;
  }
  c[0] = b0 / a0; c[1] = b1 / a0; c[2] = b2 / a0; c[3] = a1 / a0; c[4] = a2 / a0;
}

/** A frequency that holds, or one that moves along the sound (`t`, seconds from its start). */
export type Hz = number | ((t: number) => number);

/** Filters `x[from…to)` in place through one biquad; a moving frequency is followed every 16 samples. */
export function filter(t: Take, shape: Shape, f: Hz, q = 0.707, gain = 0, from = 0, to = t.x.length) {
  const c = new Float64Array(5), x = t.x;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  if (typeof f === 'number') design(c, shape, f, q, gain, t.rate);
  for (let i = from; i < to; i++) {
    if (typeof f !== 'number' && (i - from) % 16 === 0) design(c, shape, f(i / t.rate), q, gain, t.rate);
    const v = x[i], y = c[0] * v + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    x[i] = y;
  }
  return t;
}

/** A layer made apart and added into `t` at `at` s, times `gain`. */
export function mix(t: Take, layer: Take, at = 0, gain = 1) {
  const o = Math.round(at * t.rate);
  for (let i = 0; i < layer.x.length && o + i < t.x.length; i++) if (o + i >= 0) t.x[o + i] += layer.x[i] * gain;
  return t;
}

/** A fresh layer as long as `t`, its own seed drawn from `t`'s random. */
export const layer = (t: Take, seconds = t.x.length / t.rate): Take => take(seconds, t.rate, Math.floor(t.r() * 2 ** 31));

/** White noise into `t`, times `env(time)` (s). */
export function noise(t: Take, env: (s: number) => number = () => 1) {
  for (let i = 0; i < t.x.length; i++) t.x[i] += (t.r() * 2 - 1) * env(i / t.rate);
  return t;
}

/** Brown noise (white, leaked through an integrator): weight low, falling 6 dB an octave; times `env`. */
export function brown(t: Take, env: (s: number) => number = () => 1) {
  let y = 0;
  for (let i = 0; i < t.x.length; i++) {
    y = 0.985 * y + (t.r() * 2 - 1) * 0.15;
    t.x[i] += y * env(i / t.rate);
  }
  return t;
}

/** Damped modes, each `[Hz, seconds to fall 60 dB, amplitude]`, struck at `at` s; each a little detuned by the random. */
export function modes(t: Take, list: readonly (readonly [number, number, number])[], at = 0, detune = 0.01) {
  const o = Math.round(at * t.rate);
  for (const [f, t60, a] of list) {
    const hz = f * (1 + (t.r() * 2 - 1) * detune), k = Math.log(1000) / t60, phase = t.r() * 0.3;
    const n = Math.min(t.x.length - o, Math.ceil(t60 * 1.2 * t.rate));
    for (let i = 0; i < n; i++) {
      const s = i / t.rate;
      t.x[o + i] += a * Math.exp(-k * s) * Math.sin(2 * Math.PI * hz * s + phase);
    }
  }
  return t;
}

/** A sine whose frequency moves (`f(t)`), times `env(t)`: a thump's falling pitch, a bubble's rising one. */
export function tone(t: Take, f: (s: number) => number, env: (s: number) => number, at = 0, seconds = t.x.length / t.rate - at) {
  const o = Math.round(at * t.rate), n = Math.min(t.x.length - o, Math.ceil(seconds * t.rate));
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const s = i / t.rate;
    phase += (2 * Math.PI * f(s)) / t.rate;
    t.x[o + i] += Math.sin(phase) * env(s);
  }
  return t;
}

/** A stick-slip train: impulses at `rate(t)` a second (jittered by `jitter` of a period), each of height `env(t)`, from
 *  `at` s for `seconds`: what wood and rope do under load, before the resonance that colours it (filter after). */
export function slips(t: Take, rate: (s: number) => number, env: (s: number) => number, at: number, seconds: number, jitter = 0.25) {
  let s = 0;
  while (s < seconds) {
    const i = Math.round((at + s) * t.rate);
    if (i >= t.x.length) break;
    t.x[i] += env(s) * (0.6 + 0.4 * t.r()) * (t.r() < 0.5 ? -1 : 1);
    s += (1 + (t.r() * 2 - 1) * jitter) / Math.max(1, rate(s));
  }
  return t;
}

/** `count` bubbles from `at` over `spread` s: short rising sines, `low`…`high` Hz, each `gain`, fewer as they go. */
export function bubbles(t: Take, count: number, at: number, spread: number, low: number, high: number, gain: number) {
  for (let b = 0; b < count; b++) {
    const when = at + spread * t.r() ** 1.6, f0 = low + (high - low) * t.r(), life = 0.015 + 0.04 * t.r(), a = gain * (0.4 + 0.6 * t.r());
    tone(t, (s) => f0 * (1 + (s / life) * 0.6), (s) => a * Math.exp(-s / (life * 0.4)) * Math.min(1, s / 0.002), when, life * 2.2);
  }
  return t;
}

/** Sparse crackle: `count` tiny noise grains from `at` over `spread` s, each up to `gain`, thinning as they go. */
export function crackle(t: Take, count: number, at: number, spread: number, gain: number, grain = 0.004) {
  for (let k = 0; k < count; k++) {
    const when = at + spread * t.r() ** 2, a = gain * t.r(), o = Math.round(when * t.rate), n = Math.ceil(grain * t.rate * (0.5 + t.r()));
    for (let i = 0; i < n && o + i < t.x.length; i++) t.x[o + i] += a * (t.r() * 2 - 1) * (1 - i / n);
  }
  return t;
}

/** The echoes alone of `t` as it is, each `[delay s, gain]`, as a new layer (the sea's and the air's slap back). */
export function echoes(t: Take, list: readonly (readonly [number, number])[]): Take {
  const wet = layer(t);
  for (const [d, g] of list) {
    const o = Math.round(d * t.rate);
    for (let i = 0; i + o < t.x.length; i++) wet.x[i + o] += t.x[i] * g;
  }
  return wet;
}

/** Soft saturation (tanh, `drive` into it, the level kept): density without a hard edge. */
export function saturate(t: Take, drive: number) {
  const k = Math.tanh(drive);
  for (let i = 0; i < t.x.length; i++) t.x[i] = Math.tanh(t.x[i] * drive) / k;
  return t;
}

/** Takes out any DC (a blocker, a one-pole highpass at some 5 Hz), then fades over the first `attack` and last
 *  `release` seconds (no click at either end). */
export function finish(t: Take, attack = 0.0015, release = 0.02) {
  const x = t.x, n = x.length, k = 1 - (2 * Math.PI * 5) / t.rate;
  const a = Math.max(1, Math.round(attack * t.rate)), r = Math.max(1, Math.round(release * t.rate));
  let x1 = 0, y1 = 0;
  for (let i = 0; i < n; i++) {
    const y = x[i] - x1 + k * y1;
    x1 = x[i];
    y1 = y;
    x[i] = y * Math.min(1, i / a, (n - 1 - i) / r);
  }
  return t;
}

/** Scaled so its peak is `peak` (a sound's level is then its table's: bank.ts). */
export function normal(t: Take, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < t.x.length; i++) m = Math.max(m, Math.abs(t.x[i]));
  if (m > 0) for (let i = 0; i < t.x.length; i++) t.x[i] *= peak / m;
  return t;
}

/** Envelopes: rise over `a` s then fall with time constant `tau`; an exponential fall alone. */
export const ar = (a: number, tau: number) => (s: number) => (s < a ? s / a : Math.exp(-(s - a) / tau));
export const fall = (tau: number, at = 0) => (s: number) => (s < at ? 0 : Math.exp(-(s - at) / tau));
/** A swell: up over `up` s (a raised cosine), held, down over `down` s, ending at `end`. */
export const swell = (up: number, end: number, down: number) => (s: number) =>
  s < up ? 0.5 - 0.5 * Math.cos((Math.PI * s) / up)
  : s > end ? 0
  : s > end - down ? 0.5 + 0.5 * Math.cos((Math.PI * (s - end + down)) / down)
  : 1;
