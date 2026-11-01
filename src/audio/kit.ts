// The building blocks every sound is made from: bursts of filtered noise, pitched thumps, modal knocks for wood,
// metal and glass, creaks, bubbles, splinters, shards and whooshes. Most are ported from the old game's bank.
import {
  ad, between, brown, filter, hump, mix, modes, normalize, peak, pink, samples, scale, scatter, shape, sweep, SR, TAU, tone,
  white, type Buf, type FilterType, type Rng,
} from './dsp.ts';

export const n = samples;

export function normAll(chs: Buf[], to: number): Buf[] {
  const p = Math.max(...chs.map(peak));
  if (p > 1e-9) for (const c of chs) scale(c, to / p);
  return chs;
}

/** Two empty channels of s seconds. */
export const pair = (s: number): [Buf, Buf] => [new Float32Array(n(s)), new Float32Array(n(s))];

/** Filtered white noise with an attack-decay envelope. */
export function burst(r: Rng, s: number, type: FilterType, f: number, q: number, a: number, d: number): Buf {
  return shape(filter(white(n(s), r), type, f, q), (t) => ad(t, a, d));
}

/** A sine whose pitch falls from f0 to f1: the body of every boom. */
export function thump(s: number, f0: number, f1: number, d: number): Buf {
  return tone(n(s), (t) => f1 + (f0 - f1) * Math.exp(-t / (d * 0.35)), (t) => ad(t, 0.002, d));
}

/** Low noise through a falling lowpass: the blast of a gun or an explosion. */
export function blast(r: Rng, s: number, top: number, fall: number, d: number): Buf {
  const x = brown(n(s), r);
  sweep(x, 'lp', (t) => 110 + top * Math.exp(-t * fall), 0.8);
  return shape(x, (t) => ad(t, 0.002, d));
}

/** Wood: a short excitation through five inharmonic modes. */
export function knock(r: Rng, f: number, d = 0.06, s = 0.4): Buf {
  const ex = burst(r, 0.004, 'lp', 4000, 0.7, 0.0003, 0.0012);
  const ms = [1, 2.32, 3.95, 5.6, 7.9].map((k, j) => ({ f: f * k * between(r, 0.97, 1.03), d: d / (1 + j * 0.7), g: 1 / (1 + j) }));
  return normalize(modes(ex, ms, n(s)), 1);
}

/** Metal: bar-like partials that ring. */
export function metal(r: Rng, f: number, d: number, s = d * 5): Buf {
  const ex = burst(r, 0.002, 'hp', 2000, 0.7, 0.0002, 0.0006);
  const ms = [1, 2.756, 5.404, 8.933, 13.34].map((k, j) => ({ f: f * k * between(r, 0.995, 1.005), d: d / (1 + j * 0.8), g: 1 / (1 + j * 0.5) }));
  return normalize(modes(ex, ms, n(s)), 1);
}

const GLASS_K = [1, 2.32, 4.25, 6.63, 9.38, 12.1];
/** Glass: bright, closely clustered partials with a long ring; the shield is made of this. */
export function glass(r: Rng, f: number, d: number, s = d * 4): Buf {
  const ex = burst(r, 0.002, 'hp', 3000, 0.7, 0.0001, 0.0005);
  const ms: { f: number; d: number; g: number }[] = [];
  GLASS_K.forEach((k, j) => {
    const fj = f * k * between(r, 0.99, 1.01);
    ms.push({ f: fj, d: d / (1 + j * 0.35), g: 1 / (1 + j * 0.4) });
    ms.push({ f: fj * between(r, 1.002, 1.006), d: d / (1 + j * 0.35), g: 0.6 / (1 + j * 0.4) }); // a beating twin
  });
  return normalize(modes(ex, ms, n(s)), 1);
}

const BELL_K = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166];
const BELL_D = [1.6, 1, 0.8, 0.7, 0.55, 0.4, 0.35, 0.3, 0.2];
const BELL_G = [0.6, 1, 0.7, 0.5, 0.8, 0.35, 0.3, 0.25, 0.15];
/** A struck metal bowl: rich inharmonic partials. Used for stinger tails, never for tunes. */
export function bowl(r: Rng, f: number, d: number, s: number): Buf {
  const ex = burst(r, 0.003, 'lp', 6000, 0.7, 0.0002, 0.001);
  return normalize(modes(ex, BELL_K.map((k, j) => ({ f: f * k * between(r, 0.998, 1.002), d: d * BELL_D[j], g: BELL_G[j] })), n(s)), 1);
}

/** Friction: impulses at a rising rate through resonant modes. Creaks, groans and ratchets. */
export function stickSlip(r: Rng, len: number, r0: number, r1: number, freqs: readonly number[], d: number): Buf {
  const N = n(len), x = new Float32Array(N), wob = between(r, 2, 5);
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    ph += ((r0 + (r1 - r0) * t * t) * (1 + 0.12 * Math.sin((TAU * wob * i) / SR))) / SR;
    if (ph >= 1) { ph -= 1; x[i] = (0.4 + r()) * hump(t, 0.6); }
  }
  const out = modes(x, freqs.map((f, j) => ({ f: f * between(r, 0.97, 1.03), d: d / (1 + j * 0.4), g: 1 / (1 + j * 0.5) })), N);
  return normalize(filter(out, 'hp', 90), 1);
}

/** A ship's timbers creaking. */
export function creak(r: Rng, k = between(r, 0.85, 1.2)): Buf {
  const r0 = between(r, 18, 40);
  return normalize(stickSlip(r, between(r, 0.9, 1.6), r0, r0 * between(r, 1.3, 2.6), [190, 410, 640, 980, 1460, 2210].map((f) => f * k), 0.05), 0.7);
}

/** Rising sine blips: air escaping under water. */
export function bubbles(into: Buf, r: Rng, from: number, to: number, perSecond: number, g: number, lo = 500, hi = 2200): void {
  scatter(r, from, to, perSecond, (at) => {
    const f0 = between(r, lo, hi), d = between(r, 0.015, 0.05), a = between(r, 0.3, 1);
    mix(into, tone(n(d * 4), (t) => f0 * (1 + (t / d) * 0.6), (t) => ad(t, 0.001, d)), at, g * a);
  });
}

/** Tiny bright ticks: wood fibres tearing. */
export function splinters(into: Buf, r: Rng, from: number, to: number, perSecond: number, g: number): void {
  scatter(r, from, to, perSecond, (at) => {
    const a = r() * r();
    mix(into, burst(r, 0.012, 'hp', between(r, 2500, 6000), 0.8, 0.0002, between(r, 0.001, 0.004)), at, g * a);
  });
}

/** A cluster of wood knocks: planks breaking. */
export function crunch(into: Buf, r: Rng, from: number, to: number, count: number, g: number): void {
  for (let k = 0; k < count; k++) mix(into, knock(r, between(r, 250, 2400), between(r, 0.01, 0.04), 0.2), between(r, from, to), g * between(r, 0.3, 1));
}

/** Sparse sharp clicks: fire and embers. */
export function crackles(into: Buf, r: Rng, from: number, to: number, perSecond: number, g: number): void {
  scatter(r, from, to, perSecond, (at) => {
    const a = Math.min(1, 0.12 / (r() + 0.04));
    mix(into, burst(r, 0.008, 'hp', between(r, 1500, 4000), 0.8, 0.0002, between(r, 0.0005, 0.002)), at, g * a);
  });
}

/** Glass fragments: many small bright rings, thinning out. */
export function shards(into: Buf, r: Rng, from: number, to: number, perSecond: number, g: number, lo = 2500, hi = 7000): void {
  scatter(r, from, to, perSecond, (at) => {
    const u = (at - from) / Math.max(1e-3, to - from);
    if (r() < u * 0.7) return; // thinning
    mix(into, glass(r, between(r, lo, hi), between(r, 0.03, 0.12), 0.25), at, g * between(r, 0.15, 1) * (1 - 0.6 * u));
  });
}

/** Pebbles and grit: small rock knocks. */
export function grit(into: Buf, r: Rng, from: number, to: number, perSecond: number, g: number): void {
  scatter(r, from, to, perSecond, (at) => {
    mix(into, knock(r, between(r, 1200, 3800), between(r, 0.004, 0.012), 0.06), at, g * between(r, 0.2, 1));
  });
}

/** Sail canvas snapping once. */
export function canvasFlap(r: Rng): Buf {
  const x = burst(r, 0.14, 'bp', between(r, 500, 1100), 1.1, 0.002, 0.028);
  return mix(x, thump(0.12, 150, 90, 0.03), 0, 0.4);
}

/** Air moving: pink noise through a bandpass that sweeps from f0 to f1 and back down. */
export function whoosh(r: Rng, s: number, f0: number, f1: number, q = 1.2, power = 1): Buf {
  const x = pink(n(s), r);
  sweep(x, 'bp', (t) => f0 + (f1 - f0) * hump(t, 0.8), q);
  return shape(x, (t) => hump(t / s, power));
}

/** A rising noise sweep that ends abruptly, for the lead-in to a stinger. */
export function riser(r: Rng, s: number, f0: number, f1: number): Buf {
  const x = pink(n(s), r);
  sweep(x, 'bp', (t) => f0 * Math.pow(f1 / f0, t * t), 1.6);
  return shape(x, (t) => Math.pow(Math.min(1, t / s), 2.2) * (t < s - 0.01 ? 1 : 0));
}

/** One harsh bird note with a pitch arc, from the old gull. */
export function gullNote(r: Rng, s: number, f0: number, fp: number, f1: number): Buf {
  const N = n(s), x = new Float32Array(N), rasp = between(r, 28, 42), H = [1, 0.7, 0.5, 0.3, 0.2];
  let p = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N, f = t < 0.25 ? f0 + (fp - f0) * (t / 0.25) : fp + (f1 - fp) * ((t - 0.25) / 0.75);
    p += (TAU * f) / SR;
    let v = 0;
    for (let h = 0; h < 5; h++) v += Math.sin(p * (h + 1)) * H[h];
    x[i] = v * (0.65 + 0.35 * Math.sin((TAU * rasp * i) / SR)) * hump(t, 0.5);
  }
  const breath = shape(filter(white(N, r), 'bp', fp * 1.5, 2), (t) => 0.25 * hump(t / s, 1));
  mix(x, breath);
  filter(x, 'bp', 2400, 0.9);
  return normalize(filter(x, 'hp', 600), 1);
}

/** A clean whistled bird note sliding along a curve: songbirds and jungle birds. */
export function chirp(s: number, f: (u: number) => number, a: (u: number) => number = (u) => hump(u, 0.6), harm = 0.15): Buf {
  const N = n(s), x = new Float32Array(N);
  let p = 0;
  for (let i = 0; i < N; i++) {
    const u = i / N;
    p += (TAU * f(u)) / SR;
    x[i] = (Math.sin(p) + harm * Math.sin(2 * p)) * a(u);
  }
  return x;
}

/** A water drop: a short rising sine 'plink'. */
export function drop(r: Rng, f = between(r, 900, 2200), d = between(r, 0.03, 0.07)): Buf {
  const s = d * 5, x = tone(n(s), (t) => f * (1 + 1.6 * Math.min(1, t / d)), (t) => ad(t, 0.0008, d));
  mix(x, burst(r, 0.01, 'hp', 3000, 0.7, 0.0002, 0.0015), 0, 0.2);
  return x;
}

/** A water splash of a given size (0 small, 1 huge). */
export function splashOf(r: Rng, size: number, s = 1 + size * 1.5): Buf {
  const x = new Float32Array(n(s));
  mix(x, tone(n(0.3), (t) => 80 + (300 - size * 120) * Math.exp(-t / 0.02), (t) => ad(t, 0.001, 0.05 + size * 0.05)), 0, 0.7);
  mix(x, burst(r, 0.6 + size, 'bp', between(r, 2400, 3800) - size * 900, 0.6, 0.004, 0.16 + size * 0.2), 0.012, 0.7);
  mix(x, shape(filter(pink(n(s * 0.85), r), 'lp', 900 - size * 300), (t) => ad(t, 0.05 + size * 0.06, 0.25 + size * 0.45)), 0.1, 0.9 + size * 0.3);
  // the water falling back
  scatter(r, 0.25 + size * 0.2, s * 0.9, 25 + size * 50, (at) => mix(x, burst(r, 0.03, 'bp', between(r, 1500, 5000), 1, 0.001, 0.008), at, between(r, 0.05, 0.2)));
  bubbles(x, r, 0.2, s * 0.8, 10 + size * 20, 0.12);
  return x;
}

/** A seamless stereo loop: render each channel L + xf seconds long and crossfade the tail into the head. */
export function stereoLoop(L: number, xf: number, ch: (c: number, N: number) => Buf, to: number): Buf[] {
  const N = n(L + xf);
  const out = [0, 1].map((c) => {
    const x = ch(c, N), m = n(xf), body = x.length - m, o = x.slice(0, body);
    for (let i = 0; i < m; i++) { const t = i / m; o[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[body + i] * Math.cos((t * Math.PI) / 2); }
    return o;
  });
  return normAll(out, to);
}

/** Slow random swells for a bed: a smooth curve between lo and hi that wraps around the loop length. */
export function swells(r: Rng, L: number, count: number, lo: number, hi: number): (t: number) => number {
  const ph = [...Array(count)].map(() => r() * TAU), k = [...Array(count)].map((_, j) => j + 1);
  return (t) => {
    let v = 0;
    for (let j = 0; j < count; j++) v += Math.sin((TAU * k[j] * t) / L + ph[j]) / k[j];
    return lo + (hi - lo) * (0.5 + 0.35 * v);
  };
}

export { ad, between, brown, filter, hump, mix, modes, normalize, pink, scale, scatter, shape, sweep, SR, TAU, tone, white };
