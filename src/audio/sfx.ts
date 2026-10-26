import {
  ad, between, Biquad, brown, buf, fade, filter, fm, hash, hump, loopify, loudness, mix, modes, normalize, peak, pink, pluck, rng,
  samples, scale, scatter, shape, softclip, SR, sweep, TAU, tone, white, type Buf, type FilterType, type Rng,
} from './dsp.ts';

export type Bus = 'sfx' | 'ambience' | 'ui';

export interface SoundDef {
  make: (r: Rng, v: number) => Buf | Buf[];
  variants: number;
  bus: Bus;
  priority: number;
  gain: number;
  max: number;
  loop: boolean;
  jitter: number;
}

const n = samples;
const D4 = 293.66;

function normAll(chs: Buf[], to: number): Buf[] {
  const p = Math.max(...chs.map(peak));
  if (p > 1e-9) for (const c of chs) scale(c, to / p);
  return chs;
}

function burst(r: Rng, s: number, type: FilterType, f: number, q: number, a: number, d: number): Buf {
  return shape(filter(white(n(s), r), type, f, q), (t) => ad(t, a, d));
}

function thump(s: number, f0: number, f1: number, d: number): Buf {
  return tone(n(s), (t) => f1 + (f0 - f1) * Math.exp(-t / (d * 0.35)), (t) => ad(t, 0.002, d));
}

function knock(r: Rng, f: number, d = 0.06, s = 0.4): Buf {
  const ex = burst(r, 0.004, 'lp', 4000, 0.7, 0.0003, 0.0012);
  const ms = [1, 2.32, 3.95, 5.6, 7.9].map((k, j) => ({ f: f * k * between(r, 0.97, 1.03), d: d / (1 + j * 0.7), g: 1 / (1 + j) }));
  return normalize(modes(ex, ms, n(s)), 1);
}

function metal(r: Rng, f: number, d: number, s = d * 5): Buf {
  const ex = burst(r, 0.002, 'hp', 2000, 0.7, 0.0002, 0.0006);
  const ms = [1, 2.756, 5.404, 8.933, 13.34].map((k, j) => ({ f: f * k * between(r, 0.995, 1.005), d: d / (1 + j * 0.8), g: 1 / (1 + j * 0.5) }));
  return normalize(modes(ex, ms, n(s)), 1);
}

const BELL_K = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166];
const BELL_D = [1.6, 1, 0.8, 0.7, 0.55, 0.4, 0.35, 0.3, 0.2];
const BELL_G = [0.6, 1, 0.7, 0.5, 0.8, 0.35, 0.3, 0.25, 0.15];
function bellOf(r: Rng, f: number, d: number, s: number): Buf {
  const ex = burst(r, 0.003, 'lp', 6000, 0.7, 0.0002, 0.001);
  return normalize(modes(ex, BELL_K.map((k, j) => ({ f: f * k * between(r, 0.998, 1.002), d: d * BELL_D[j], g: BELL_G[j] })), n(s)), 1);
}

function stickSlip(r: Rng, len: number, r0: number, r1: number, freqs: readonly number[], d: number): Buf {
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

function bubbles(into: Buf, r: Rng, from: number, to: number, perSecond: number, g: number): void {
  scatter(r, from, to, perSecond, (at) => {
    const f0 = between(r, 500, 2200), d = between(r, 0.015, 0.05), a = between(r, 0.3, 1);
    mix(into, tone(n(d * 4), (t) => f0 * (1 + (t / d) * 0.6), (t) => ad(t, 0.001, d)), at, g * a);
  });
}

function splinters(into: Buf, r: Rng, from: number, to: number, perSecond: number, g: number): void {
  scatter(r, from, to, perSecond, (at) => {
    const a = r() * r();
    mix(into, burst(r, 0.012, 'hp', between(r, 2500, 6000), 0.8, 0.0002, between(r, 0.001, 0.004)), at, g * a);
  });
}

function crunch(into: Buf, r: Rng, from: number, to: number, count: number, g: number): void {
  for (let k = 0; k < count; k++) mix(into, knock(r, between(r, 250, 2400), between(r, 0.01, 0.04), 0.2), between(r, from, to), g * between(r, 0.3, 1));
}

function crackles(into: Buf, r: Rng, from: number, to: number, perSecond: number, g: number): void {
  scatter(r, from, to, perSecond, (at) => {
    const a = Math.min(1, 0.12 / (r() + 0.04));
    mix(into, burst(r, 0.008, 'hp', between(r, 1500, 4000), 0.8, 0.0002, between(r, 0.0005, 0.002)), at, g * a);
  });
}

function bowed(r: Rng, s: number, f: number, a: (t: number) => number): Buf {
  const N = n(s), x = new Float32Array(N), vib = between(r, 4.5, 5.5);
  let p = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    p += (TAU * f * (1 + 0.004 * Math.sin(TAU * vib * t) * Math.min(1, t * 2))) / SR;
    let v = 0;
    for (let h = 1; h <= 6; h++) v += (Math.sin(p * h) / h) * (h % 2 ? 1 : 0.6);
    x[i] = v * a(t);
  }
  filter(x, 'lp', 2200);
  return filter(x, 'peak', 900, 1.2, 4);
}

function canvasFlap(r: Rng): Buf {
  const x = burst(r, 0.14, 'bp', between(r, 500, 1100), 1.1, 0.002, 0.028);
  return mix(x, thump(0.12, 150, 90, 0.03), 0, 0.4);
}

function gullNote(r: Rng, s: number, f0: number, fp: number, f1: number): Buf {
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

function stereo(L: number, xf: number, _r: Rng, ch: (c: number, N: number) => Buf, to: number): Buf[] {
  const N = n(L + xf);
  const out = [0, 1].map((c) => {
    const x = ch(c, N), m = n(xf), body = x.length - m, o = x.slice(0, body);
    for (let i = 0; i < m; i++) { const t = i / m; o[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[body + i] * Math.cos((t * Math.PI) / 2); }
    return o;
  });
  return normAll(out, to);
}

function creak(r: Rng): Buf {
  const k = between(r, 0.85, 1.2), r0 = between(r, 18, 40);
  return normalize(stickSlip(r, between(r, 0.9, 1.6), r0, r0 * between(r, 1.3, 2.6), [190, 410, 640, 980, 1460, 2210].map((f) => f * k), 0.05), 0.7);
}

function block(r: Rng): Buf {
  const x = buf(0.6);
  mix(x, knock(r, between(r, 900, 1300), 0.05, 0.4), 0, 1);
  mix(x, fm(n(0.18), (t) => 1700 + (900 * t) / 0.18, 1.5, () => 1.4, (t) => hump(t / 0.18) * 0.25), between(r, 0.02, 0.05));
  mix(x, stickSlip(r, 0.3, 60, 90, [520, 1040, 1650], 0.02), 0.05, 0.3);
  return normalize(x, 0.55);
}

function canvasFill(r: Rng): Buf {
  const x = buf(0.9);
  mix(x, thump(0.6, between(r, 65, 80), 44, 0.18), 0, 1);
  mix(x, shape(filter(white(n(0.6), r), 'lp', 420), (t) => ad(t, 0.012, 0.14)), 0, 0.8);
  mix(x, burst(r, 0.3, 'bp', 2600, 0.8, 0.004, 0.07), 0, 0.3);
  mix(x, canvasFlap(r), 0.14, 0.35);
  return normalize(x, 0.7);
}

function canvasFlog(r: Rng): Buf {
  const s = 1.6, x = buf(s);
  for (let t = 0; t < s - 0.15; t += between(r, 0.065, 0.14)) mix(x, canvasFlap(r), t, hump(t / s, 0.7) * between(r, 0.4, 1));
  return normalize(x, 0.65);
}

function slap(r: Rng): Buf {
  const x = buf(0.8);
  mix(x, shape(filter(brown(n(0.5), r), 'lp', 700), (t) => ad(t, 0.004, 0.11)), 0, 1);
  mix(x, burst(r, 0.4, 'bp', 1800, 0.7, 0.01, 0.08), 0, 0.25);
  bubbles(x, r, 0.05, 0.6, 10, 0.15);
  return normalize(x, 0.6);
}

function cannon(r: Rng): Buf[] {
  const N = n(2.8), out = [new Float32Array(N), new Float32Array(N)];
  const crack = burst(r, 0.06, 'hp', 1500, 0.7, 0.0004, 0.007);
  const boom = thump(1.5, between(r, 95, 125), between(r, 33, 42), between(r, 0.38, 0.5));
  const blast = brown(n(1.8), r);
  sweep(blast, 'lp', (t) => 120 + 4200 * Math.exp(-t * 9), 0.8);
  shape(blast, (t) => ad(t, 0.002, 0.32));
  const recoil = knock(r, between(r, 120, 170), 0.09, 0.5);
  out.forEach((o, c) => {
    const tail = shape(filter(pink(N, r), 'lp', 300), (t) => ad(t, 0.06, 0.85));
    mix(o, crack, c * 0.0006, 0.9); mix(o, boom, 0, 1.1); mix(o, blast, 0.001 * c, 0.9); mix(o, tail, 0.01, 0.55); mix(o, recoil, 0.04, 0.35);
  });
  normAll(out, 1);
  out.forEach((o) => softclip(o, 1.6));
  return normAll(out, 0.95);
}

function cannonFar(r: Rng): Buf[] {
  const N = n(4.5), out = [new Float32Array(N), new Float32Array(N)], boom = thump(1.6, 70, 32, 0.5);
  out.forEach((o, c) => {
    mix(o, boom, 0, 1);
    mix(o, shape(filter(brown(n(2), r), 'lp', 220), (t) => ad(t, 0.02, 0.35)), 0, 0.9);
    for (let k = 0; k < 5; k++) {
      const e = shape(filter(brown(n(2), r), 'lp', 260 - k * 35), (t) => ad(t, 0.08 + k * 0.04, 0.5 + k * 0.15));
      mix(o, e, 0.25 + k * 0.45 + between(r, -0.08, 0.08) + c * 0.03, 0.55 / (1 + k * 0.5));
    }
  });
  return normAll(out, 0.85);
}

function whistle(r: Rng): Buf {
  const s = between(r, 0.55, 0.8), N = n(s), f = (u: number): number => 2700 - 1700 * Math.pow(u, 1.3);
  const x = sweep(white(N, r), 'bp', f, 14);
  shape(x, (t) => hump((t / s) * 0.9, 1.5));
  mix(x, tone(N, (t) => f(t / s), (t) => 0.02 * hump(t / s, 2)));
  return normalize(x, 0.5);
}

function splash(r: Rng): Buf {
  const x = buf(1.5);
  mix(x, tone(n(0.3), (t) => 90 + 340 * Math.exp(-t / 0.02), (t) => ad(t, 0.001, 0.05)), 0, 0.7);
  mix(x, burst(r, 0.9, 'bp', between(r, 2800, 4200), 0.6, 0.004, 0.22), 0.015, 0.7);
  mix(x, shape(filter(pink(n(1.3), r), 'lp', 900), (t) => ad(t, 0.06, 0.32)), 0.12, 0.9);
  bubbles(x, r, 0.2, 1.1, 14, 0.12);
  return normalize(x, 0.8);
}

function thud(r: Rng): Buf {
  const x = buf(0.9);
  mix(x, shape(filter(brown(n(0.6), r), 'lp', 350), (t) => ad(t, 0.003, 0.1)), 0, 1);
  mix(x, thump(0.6, 80, 40, 0.16), 0, 0.8);
  scatter(r, 0.05, 0.5, 18, (at) => { const a = r(); mix(x, burst(r, 0.02, 'bp', between(r, 1500, 4000), 1, 0.0005, 0.004), at, 0.15 * a); });
  return normalize(x, 0.8);
}

function hit(r: Rng): Buf {
  const x = buf(1.3);
  mix(x, burst(r, 0.03, 'hp', 2200, 0.7, 0.0003, 0.004), 0, 0.9);
  crunch(x, r, 0, 0.16, 8 + Math.floor(r() * 6), 0.7);
  splinters(x, r, 0.03, 0.7, 45, 0.5);
  mix(x, thump(0.5, 95, 50, 0.14), 0, 0.8);
  return normalize(x, 0.95);
}

function ram(r: Rng): Buf {
  const x = buf(2.2);
  mix(x, thump(1.2, 70, 30, 0.45), 0, 1.2);
  mix(x, stickSlip(r, 1.6, 10, 34, [92, 170, 284, 446, 690], 0.14), 0.05, 0.9);
  crunch(x, r, 0, 0.35, 16, 0.6);
  splinters(x, r, 0.05, 1.2, 40, 0.45);
  mix(x, shape(filter(pink(n(1.6), r), 'lp', 650), (t) => ad(t, 0.12, 0.5)), 0.1, 0.6);
  return normalize(x, 0.95);
}

function scrape(r: Rng): Buf {
  const N = n(1.6), ex = white(N, r);
  let w = 0.5;
  for (let i = 0; i < N; i++) {
    if ((i & 63) === 0) w = Math.min(1, Math.max(0.1, w + (r() - 0.5) * 0.35));
    ex[i] *= w * hump(i / N, 0.5) * 0.2;
  }
  const x = normalize(modes(ex, [310, 720, 1150, 1730, 2600, 3400].map((f, j) => ({ f: f * between(r, 0.9, 1.1), d: 0.025 / (1 + j * 0.3), g: 1 / (1 + j * 0.4) })), N), 0.7);
  filter(x, 'lp', 4000);
  mix(x, thump(0.7, 62, 34, 0.22), 0, 0.8);
  mix(x, burst(r, 0.03, 'hp', 2000, 0.7, 0.0003, 0.004), 0, 0.4);
  return normalize(x, 0.85);
}

function ignite(r: Rng): Buf {
  const w = pink(n(1.4), r);
  sweep(w, 'lp', (t) => 250 + 3300 * Math.min(1, t * 3) * Math.exp(-t * 1.5), 0.9);
  shape(w, (t) => ad(t, 0.22, 0.45));
  crackles(w, r, 0.1, 1.3, 40, 0.35);
  return normalize(w, 0.8);
}

function crackle(r: Rng): Buf {
  const L = 3, xf = 0.3, roar = filter(pink(n(L + xf), r), 'lp', 450);
  shape(roar, (t) => 0.25 * (0.75 + 0.25 * Math.sin((TAU * t * 2) / L)));
  crackles(roar, r, 0, L + xf, 35, 0.8);
  return normalize(loopify(roar, xf), 0.6);
}

function groan(r: Rng): Buf {
  const s = 5, N = n(s), x = new Float32Array(N), k = between(r, 0.85, 1.15), gr = between(r, 3, 6);
  mix(x, stickSlip(r, 3.2, 6, 20, [68, 124, 203, 331, 512].map((f) => f * k), 0.3), 0, 1);
  mix(x, stickSlip(r, 2.2, 14, 9, [88, 160, 262, 410].map((f) => f * k), 0.25), 1.9, 0.8);
  mix(x, shape(filter(brown(N, r), 'lp', 400), (t) => ad(t - 1, 0.8, 2.5) * (0.5 + 0.5 * Math.sin(TAU * gr * t))), 0, 0.5);
  bubbles(x, r, 1.5, 4.8, 22, 0.1);
  mix(x, shape(sweep(pink(N, r), 'lp', (t) => 300 + 1500 * t, 0.7), (t) => ad(t - 3.2, 0.6, 0.8)), 0, 0.5);
  return normalize(fade(x, 0, 0.3), 0.9);
}

function explosion(r: Rng): Buf[] {
  const N = n(3.4), out = [new Float32Array(N), new Float32Array(N)];
  const crack = burst(r, 0.08, 'hp', 1200, 0.7, 0.0003, 0.01), boom = thump(2, 80, 26, 0.7);
  const blast = shape(sweep(brown(n(2.4), r), 'lp', (t) => 100 + 5200 * Math.exp(-t * 6), 0.8), (t) => ad(t, 0.002, 0.55));
  out.forEach((o) => {
    mix(o, crack, 0, 1); mix(o, boom, 0, 1.2); mix(o, blast, 0, 1);
    mix(o, shape(filter(pink(N, r), 'lp', 220), (t) => ad(t, 0.1, 1.1)), 0, 0.6);
    splinters(o, r, 0.05, 1.6, 30, 0.35);
  });
  normAll(out, 1);
  out.forEach((o) => softclip(o, 2.2));
  return normAll(out, 0.97);
}

function mortar(r: Rng): Buf {
  const x = buf(1.8);
  mix(x, thump(1.2, 78, 30, 0.35), 0, 1.2);
  mix(x, shape(filter(brown(n(1), r), 'lp', 800), (t) => ad(t, 0.002, 0.22)), 0, 0.9);
  mix(x, shape(sweep(white(n(1.4), r), 'bp', (t) => 700 + 900 * t, 10), (t) => 0.12 * hump(t / 1.4)), 0.15);
  return normalize(x, 0.9);
}

function coin(r: Rng): Buf {
  const x = buf(0.8), f = between(r, 2500, 3700);
  mix(x, metal(r, f, between(r, 0.12, 0.22), 0.8), 0, 1);
  mix(x, metal(r, f * between(r, 1.01, 1.04), 0.08, 0.4), between(r, 0.05, 0.11), 0.45);
  mix(x, burst(r, 0.01, 'hp', 5000, 0.7, 0.0001, 0.0008), 0, 0.3);
  return normalize(x, 0.6);
}

function chestLand(r: Rng): Buf {
  const x = buf(1.2), f = between(r, 105, 135);
  const box = modes(burst(r, 0.006, 'lp', 3000, 0.7, 0.0003, 0.002), [1, 2.08, 3.27, 4.61, 6.3].map((k, j) => ({ f: f * k, d: 0.12 / (1 + j * 0.6), g: 1 / (1 + j * 0.5) })), n(1));
  mix(x, normalize(box, 1), 0, 1);
  mix(x, thump(0.5, 92, 52, 0.12), 0, 0.9);
  mix(x, metal(r, between(r, 820, 980), 0.07, 0.4), 0.008, 0.25);
  for (let k = 0; k < 5; k++) mix(x, coin(r), between(r, 0.015, 0.22), 0.12);
  return normalize(x, 0.9);
}

const CHEST_NOTES: readonly (readonly number[])[] = [[], [880], [880, 1318.5], [587.33, 880, 1174.66], [587.33, 739.99, 880, 1174.66, 1760]];

function chestOpen(r: Rng, tier: number): Buf {
  const s = 1.4 + tier * 0.35, x = buf(s), notes = CHEST_NOTES[tier];
  mix(x, stickSlip(r, 0.35, 30, 55, [380, 760, 1210, 1830], 0.04), 0, 0.35);
  mix(x, knock(r, 2100, 0.03, 0.2), 0.36, 0.5);
  if (tier === 0) {
    mix(x, knock(r, 160, 0.1, 0.6), 0.4, 0.8);
    for (let k = 0; k < 3; k++) mix(x, coin(r), 0.45 + k * between(r, 0.05, 0.1), 0.15);
  }
  notes.forEach((f, j) => {
    mix(x, normalize(pluck(n(1.6), f, r, 0.65, 0.9975), 1), 0.42 + j * 0.085, 0.45);
    mix(x, metal(r, f * 2, 0.4, 1.4), 0.42 + j * 0.085, 0.08 * tier);
  });
  if (tier >= 2) scatter(r, 0.45, s - 0.2, 10 * tier, (at) => { const a = r(); mix(x, metal(r, between(r, 4000, 8000), 0.05, 0.3), at, 0.05 * a); });
  if (tier >= 4) mix(x, bellOf(r, D4, 0.9, 2), 0.4, 0.3);
  return normalize(x, 0.5 + tier * 0.08);
}

function bank(r: Rng): Buf {
  const x = buf(2);
  for (let k = 0; k < 14; k++) mix(x, metal(r, 2300 + k * 90 + between(r, -60, 60), 0.12, 0.5), 0.55 * Math.sqrt(k / 14), 0.3 + 0.02 * k);
  mix(x, knock(r, 150, 0.1, 0.6), 0.75, 0.9);
  mix(x, bellOf(r, 1046.5, 0.7, 1.2), 0.8, 0.35);
  mix(x, bellOf(r, 1568, 0.6, 1.1), 0.86, 0.25);
  return normalize(x, 0.85);
}

function chord(r: Rng, v: number): Buf[] {
  const k = Math.min(3, v), s = 2.8 + k * 0.5, N = n(s), out = [new Float32Array(N), new Float32Array(N)];
  [1, 1.5, 2, 2.5, 3, 4].slice(0, 3 + k).forEach((m, j) => {
    const p = normalize(pluck(n(2.2), D4 * m, r, 0.6, 0.9978), 1);
    mix(out[j % 2], p, j * 0.075, 0.5);
    mix(out[(j + 1) % 2], p, j * 0.075 + 0.012, 0.25);
  });
  [0.5, 0.75, 1, 1.25].slice(0, 2 + Math.min(2, k)).forEach((m, j) => {
    const b = bowed(r, s - 0.1, D4 * m, (t) => ad(t - 0.12, 0.5, 0.9 + k * 0.35));
    mix(out[0], b, 0, 0.22);
    mix(out[1], b, 0.007 * (j + 1), 0.22);
  });
  return normAll(out, 0.8);
}

function broken(r: Rng): Buf {
  const x = buf(1.5);
  mix(x, burst(r, 0.02, 'hp', 2500, 0.7, 0.0002, 0.003), 0, 1);
  mix(x, shape(sweep(white(n(0.25), r), 'bp', (t) => 3200 - 2800 * t, 3), (t) => ad(t, 0.005, 0.06)), 0.004, 0.8);
  for (const [a, b] of [[523.25, 440], [554.37, 466.16]]) {
    mix(x, fm(n(1.3), (t) => b + (a - b) * Math.exp(-t / 0.25), 2, (t) => 1.2 * Math.exp(-t / 0.3), (t) => ad(t, 0.008, 0.45)), 0.06, 0.35);
  }
  return normalize(x, 0.75);
}

function lead(r: Rng): Buf {
  const x = buf(1.2);
  mix(x, canvasFlap(r), 0, 0.7);
  mix(x, canvasFlap(r), 0.13, 0.5);
  mix(x, bellOf(r, 1174.66, 0.45, 1), 0.18, 0.45);
  return normalize(x, 0.65);
}

function gull(r: Rng): Buf {
  const x = buf(1.8), count = 2 + Math.floor(r() * 3);
  let t = 0;
  for (let k = 0; k < count && t < 1.5; k++) {
    const first = k === 0, s = first ? between(r, 0.28, 0.38) : between(r, 0.14, 0.22), base = between(r, 1150, 1450);
    mix(x, gullNote(r, s, base * 0.9, base * 1.75, base * (first ? 0.85 : 1.05)), t, first ? 1 : 0.8);
    t += s + between(r, 0.04, 0.1);
  }
  return normalize(x, 0.6);
}

function kek(r: Rng): Buf {
  const x = buf(0.7), count = 3 + Math.floor(r() * 3);
  for (let k = 0; k < count; k++) mix(x, gullNote(r, 0.06, 1700, 2100, 1800), k * 0.11, 0.8);
  return normalize(x, 0.5);
}

function wings(r: Rng): Buf {
  const x = buf(0.9), gap = between(r, 0.1, 0.13);
  for (let k = 0; k < 5; k++) mix(x, burst(r, 0.12, 'bp', between(r, 250, 420), 0.8, 0.012, 0.04), k * gap, 1 - k * 0.12);
  return normalize(x, 0.5);
}

function dive(r: Rng): Buf {
  const x = buf(1.6);
  mix(x, shape(sweep(pink(n(1.1), r), 'bp', (t) => 500 + 2000 * hump(t, 1.3), 2), (t) => hump(t / 1.1)), 0, 1);
  mix(x, gullNote(r, 0.3, 1300, 2400, 1200), 0.85, 0.7);
  return normalize(x, 0.6);
}

function whale(r: Rng): Buf {
  const s = 4.5, a = between(r, 130, 160), b = between(r, 340, 420), c = between(r, 200, 250);
  const f = (t: number): number => {
    const u = t / s;
    return u < 0.4 ? a + (b - a) * (0.5 - 0.5 * Math.cos((Math.PI * u) / 0.4)) : b + (c - b) * (0.5 - 0.5 * Math.cos((Math.PI * (u - 0.4)) / 0.6));
  };
  const x = filter(fm(n(s), f, 0.5, () => 0.9, (t) => hump(t / s, 0.8)), 'bp', 600, 0.8), out = x.slice();
  mix(out, x, 0.13, 0.35); mix(out, x, 0.29, 0.22); mix(out, x, 0.47, 0.14);
  return normalize(filter(out, 'lp', 1800), 0.5);
}

function seal(r: Rng): Buf {
  const x = buf(1);
  for (let k = 0, t = 0; k < 3; k++, t += between(r, 0.2, 0.27)) {
    const s = between(r, 0.12, 0.18), f0 = between(r, 420, 560);
    mix(x, filter(fm(n(s), (u) => f0 * (1 + 0.4 * hump(u / s)), 1.5, (u) => 3 * hump(u / s), (u) => hump(u / s, 0.6)), 'bp', 900, 1.2), t);
  }
  return normalize(x, 0.6);
}

function puffin(r: Rng): Buf {
  const s = 0.9, N = n(s), x = new Float32Array(N), f = between(r, 200, 240), am = between(r, 26, 34);
  let p = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    p += (TAU * f * (1 - (0.15 * t) / s)) / SR;
    x[i] = (Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.3 * Math.sin(3 * p)) * (0.5 + 0.5 * Math.sin(TAU * am * t)) * hump(t / s, 0.7);
  }
  return normalize(filter(x, 'bp', 700, 0.9), 0.5);
}

function iceGrind(r: Rng): Buf {
  const N = n(2.5), ex = white(N, r);
  let w = 0.5;
  for (let i = 0; i < N; i++) {
    if ((i & 127) === 0) w = Math.min(1, Math.max(0, w + (r() - 0.5) * 0.5));
    ex[i] *= w * w * hump(i / N, 0.5) * 0.2;
  }
  const x = normalize(modes(ex, [1180, 1870, 2690, 3910, 5200].map((f, j) => ({ f: f * between(r, 0.9, 1.1), d: 0.04 / (1 + j * 0.3), g: 1 / (1 + j * 0.3) })), N), 0.6);
  scatter(r, 0.1, 2.3, 4, (at) => { const a = r(); mix(x, burst(r, 0.05, 'bp', between(r, 2000, 5000), 2, 0.0005, 0.008), at, 0.6 * a); });
  return normalize(x, 0.7);
}

function erupt(r: Rng): Buf[] {
  const N = n(4.5), out = [new Float32Array(N), new Float32Array(N)];
  out.forEach((o) => {
    mix(o, shape(filter(brown(N, r), 'lp', 95), (t) => ad(t, 0.35, 1.6)), 0, 1);
    mix(o, thump(2, 55, 24, 0.8), 0, 0.9);
    mix(o, shape(filter(white(N, r), 'hp', 2800), (t) => 0.18 * ad(t - 0.5, 0.6, 1.5)));
    scatter(r, 0.2, 3, 8, (at) => { const a = r(); mix(o, thump(0.3, between(r, 90, 160), 60, 0.05), at, 0.3 * a); });
  });
  return normAll(out, 0.95);
}

function thunder(r: Rng): Buf[] {
  const N = n(5.5), out = [new Float32Array(N), new Float32Array(N)], crack = burst(r, 0.15, 'bp', 1400, 0.6, 0.001, 0.03);
  out.forEach((o, c) => {
    mix(o, crack, c * 0.004, 0.6);
    for (let k = 0; k < 7; k++) {
      const at = between(r, 0, 2.8), a = between(r, 0.03, 0.25), d = between(r, 0.4, 1.1);
      mix(o, shape(filter(brown(n(3), r), 'lp', between(r, 180, 420)), (t) => ad(t, a, d)), at, between(r, 0.4, 1));
    }
  });
  return normAll(out, 0.9);
}

function bell(r: Rng): Buf {
  return normalize(bellOf(r, between(r, 480, 640), 1.1, 3.2), 0.7);
}

function patch(r: Rng): Buf {
  const x = buf(1.5);
  for (let k = 0; k < 3; k++) {
    mix(x, knock(r, between(r, 1700, 2100), 0.04, 0.3), 0.1 + k * 0.3, 0.8);
    mix(x, metal(r, between(r, 3000, 3400), 0.04, 0.25), 0.1 + k * 0.3, 0.25);
  }
  mix(x, stickSlip(r, 0.4, 40, 70, [600, 1200, 1900], 0.02), 1, 0.3);
  return normalize(x, 0.6);
}

function ward(r: Rng): Buf {
  const s = 2.4, N = n(s), x = new Float32Array(N);
  [880, 1318.5, 1760, 2217.5].forEach((f, j) => mix(x, fm(N, () => f * (1 + 0.002 * j), 3.5, (t) => 1.8 * Math.exp(-t / 0.5), (t) => ad(t, 0.35 + j * 0.06, 0.7)), 0, 0.25));
  mix(x, shape(filter(white(N, r), 'hp', 6500), (t) => 0.04 * ad(t, 0.4, 0.6)));
  return normalize(x, 0.55);
}

function fogFlask(r: Rng): Buf {
  const s = 2.4, N = n(s), x = new Float32Array(N);
  mix(x, tone(n(0.15), (t) => 380 + 600 * Math.exp(-t / 0.012), (t) => ad(t, 0.0005, 0.02)), 0, 0.7);
  mix(x, burst(r, 0.02, 'hp', 3000, 0.7, 0.0002, 0.002), 0, 0.4);
  mix(x, shape(sweep(pink(N, r), 'bp', (t) => 2600 - 2000 * t, 1.2), (t) => ad(t - 0.1, 0.35, 0.8)), 0, 0.8);
  mix(x, tone(N, (t) => 110 * (1 + 0.01 * Math.sin(TAU * 5 * t)), (t) => 0.06 * ad(t - 0.2, 0.5, 1)));
  return normalize(x, 0.55);
}

function gust(r: Rng): Buf {
  const s = 1.8, N = n(s), x = new Float32Array(N);
  mix(x, shape(sweep(pink(N, r), 'bp', (t) => 300 + 1100 * hump(t, 0.8), 1.4), (t) => hump(t / s, 1.2)));
  mix(x, tone(N, (t) => 900 + (500 * t) / s, (t) => 0.05 * hump(t / s, 2)));
  return normalize(x, 0.65);
}

function flare(r: Rng): Buf {
  const x = buf(2.2), fz = filter(white(n(0.5), r), 'hp', 3500);
  for (let i = 0; i < fz.length; i++) fz[i] *= 0.3 + 0.7 * r();
  mix(x, shape(fz, (t) => 0.5 * hump(t / 0.5, 0.3)), 0, 0.6);
  mix(x, shape(sweep(white(n(0.6), r), 'bp', (t) => 600 + 2600 * t, 4), (t) => hump(t / 0.6)), 0.45, 0.6);
  mix(x, burst(r, 0.05, 'hp', 1500, 0.7, 0.0003, 0.008), 1.1, 1);
  mix(x, thump(0.4, 180, 90, 0.06), 1.1, 0.5);
  crackles(x, r, 1.15, 2.1, 30, 0.25);
  return normalize(x, 0.75);
}

function rush(r: Rng): Buf {
  const s = 2.6, N = n(s), w = brown(N, r), p = pink(N, r);
  for (let i = 0; i < N; i++) w[i] = w[i] * 0.7 + p[i] * 0.5;
  sweep(w, 'bp', (t) => 380 + 900 * hump(t), 0.8);
  shape(w, (t) => hump(t / s, 0.9) * (0.75 + 0.25 * Math.sin(TAU * 2.2 * t)));
  bubbles(w, r, 0.3, 2.3, 18, 0.08);
  return normalize(w, 0.75);
}

function tap(r: Rng): Buf {
  const x = buf(0.15);
  mix(x, knock(r, between(r, 1800, 2300), 0.018, 0.15), 0, 1);
  mix(x, burst(r, 0.01, 'hp', 5000, 0.7, 0.0002, 0.001), 0, 0.3);
  return normalize(x, 0.5);
}

function page(r: Rng): Buf {
  const N = n(0.55), x = filter(white(N, r), 'bp', between(r, 2400, 3400), 0.6);
  let w = 0.5;
  for (let i = 0; i < N; i++) {
    if ((i & 63) === 0) w = Math.min(1, Math.max(0.05, w + (r() - 0.5) * 0.6));
    x[i] *= w;
  }
  shape(x, (t) => hump(t / 0.42, 0.8));
  mix(x, burst(r, 0.2, 'lp', 320, 0.7, 0.01, 0.05), 0.3, 0.5);
  return normalize(x, 0.45);
}

function quill(r: Rng): Buf {
  const x = buf(0.7);
  for (const from of [0, 0.33]) {
    scatter(r, from, from + 0.28, 45, (at) => {
      const a = between(r, 0.3, 1);
      mix(x, burst(r, 0.012, 'bp', between(r, 3500, 7000), 3, 0.0005, 0.003), at, a * hump((at - from) / 0.28, 0.5));
    });
  }
  return normalize(x, 0.4);
}

function twoNotes(r: Rng, a: number, b: number, to: number): Buf {
  const x = buf(0.8);
  mix(x, pluck(n(0.8), a, r, 0.7, 0.997), 0, 0.6);
  mix(x, pluck(n(0.7), b, r, 0.7, 0.997), 0.09, 0.6);
  return normalize(x, to);
}

function sea(r: Rng): Buf[] {
  return stereo(6, 0.6, r, (c, N) => {
    const b = filter(brown(N, r), 'lp', 480), p = filter(pink(N, r), 'lp', 1300), h = filter(white(N, r), 'hp', 3800), x = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / SR, sw = 0.55 + 0.45 * Math.sin((TAU * t) / 6 + c * 1.1), fz = 0.5 + 0.5 * Math.sin((TAU * t * 3) / 6 + c * 2);
      x[i] = b[i] * 0.9 + p[i] * 0.55 * sw * sw + h[i] * 0.05 * fz * sw;
    }
    return x;
  }, 0.6);
}

function swell(r: Rng): Buf[] {
  return stereo(8, 0.8, r, (c, N) => shape(filter(brown(N, r), 'lp', 110), (t) => 0.6 + 0.4 * Math.sin((TAU * t * 2) / 8 + c * 0.7)), 0.6);
}

function surf(r: Rng): Buf[] {
  return stereo(12, 1, r, (c, N) => {
    const x = scale(filter(brown(N, r), 'lp', 300), 0.25);
    for (const at of [1 + c * 0.15, 6.9 - c * 0.1]) {
      mix(x, shape(sweep(pink(n(5), r), 'lp', (t) => 350 + 3200 * Math.exp(-t * 4), 0.7), (t) => ad(t, 0.22, 1.3)), at);
      mix(x, shape(filter(white(n(5), r), 'hp', 2400), (t) => 0.25 * ad(t - 0.2, 0.5, 1.8)), at);
    }
    return x;
  }, 0.7);
}

function wind(r: Rng): Buf[] {
  return stereo(6, 0.6, r, (c, N) => {
    const x = filter(filter(pink(N, r), 'bp', 520, 0.45), 'lp', 2500), ph = r() * TAU;
    return shape(x, (t) => 0.65 + 0.35 * Math.sin((TAU * t * 2) / 6 + ph) * Math.sin((TAU * t * 3) / 6 + c));
  }, 0.6);
}

function rigging(r: Rng): Buf[] {
  return stereo(6, 0.6, r, (c, N) => {
    const x = new Float32Array(N), span = N / SR;
    [620, 905, 1340].forEach((f0, j) => {
      const ph = r() * TAU, dr = between(r, 0.03, 0.07);
      const w = sweep(white(N, r), 'bp', (u) => f0 * (1 + dr * Math.sin((TAU * u * span * (j + 1)) / 6 + ph)), 30);
      mix(x, shape(w, (t) => 0.5 + 0.5 * Math.sin((TAU * t * (j + 1)) / 6 + ph + c)), 0, 1 / (1 + j * 0.4));
    });
    return x;
  }, 0.5);
}

function rain(r: Rng): Buf[] {
  return stereo(5, 0.5, r, (_c, N) => {
    const x = scale(filter(pink(N, r), 'hp', 1500), 0.35);
    scatter(r, 0, N / SR, 700, (at) => { const a = r() * r(); mix(x, burst(r, 0.006, 'bp', between(r, 2000, 7000), 1.5, 0.0002, 0.0012), at, a * 0.6); });
    return x;
  }, 0.55);
}

function storm(r: Rng): Buf[] {
  return stereo(8, 0.8, r, (c, N) => {
    const b = filter(brown(N, r), 'lp', 240), p = filter(pink(N, r), 'lp', 1100), ph = r() * TAU, span = N / SR;
    const howl = sweep(white(N, r), 'bp', (u) => 380 * (1 + 0.25 * Math.sin((TAU * u * span * 2) / 8 + ph)), 5), x = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const sg = 0.6 + 0.4 * Math.sin((TAU * (i / SR) * 3) / 8 + ph + c);
      x[i] = b[i] * 1.1 + p[i] * 0.6 * sg + howl[i] * 0.5 * sg;
    }
    return x;
  }, 0.75);
}

function maelstrom(r: Rng): Buf[] {
  return stereo(8, 0.8, r, (c, N) => {
    const b = filter(brown(N, r), 'lp', 150), span = N / SR, x = new Float32Array(N);
    const w = sweep(pink(N, r), 'bp', (u) => 300 + 600 * (0.5 + 0.5 * Math.sin((TAU * u * span * 2) / 8 + c * Math.PI)), 1.2);
    for (let i = 0; i < N; i++) x[i] = b[i] * (0.8 + 0.2 * Math.sin((TAU * (i / SR) * 4) / 8)) + w[i] * 0.7;
    return x;
  }, 0.8);
}

function night(r: Rng): Buf[] {
  return stereo(4, 0.4, r, (c, N) => {
    const x = new Float32Array(N), f = between(r, 4200, 4700), per = c ? 10 : 9, chirp = tone(n(0.02), () => f, (t) => hump(t / 0.02));
    for (let k = 0; k < per * 1.1; k++) for (let p = 0; p < 3; p++) mix(x, chirp, (k * 4) / per + c * 0.13 + p * 0.033, 0.5);
    return filter(x, 'hp', 2000);
  }, 0.35);
}

function harbour(r: Rng): Buf[] {
  return stereo(12, 1, r, (c, N) => {
    const x = new Float32Array(N);
    for (let k = 0; k < 9; k++) mix(x, slap(r), k * 1.35 + c * 0.2 + between(r, 0, 0.2), 0.35 * between(r, 0.5, 1));
    mix(x, stickSlip(r, 0.9, 20, 35, [240, 520, 860], 0.05), 3 + c * 4, 0.2);
    mix(x, knock(r, 240, 0.08, 0.5), 5.5 + c * 0.9, 0.15);
    mix(x, bellOf(r, 415, 1, 3), 7.5 + c * 0.03, c ? 0.12 : 0.18);
    return x;
  }, 0.5);
}

function steam(r: Rng): Buf {
  const L = 3, x = filter(filter(white(n(L), r), 'hp', 2600), 'lp', 9000), ph = r() * TAU;
  shape(x, (t) => 0.6 + 0.4 * Math.sin((TAU * t * 2) / L + ph));
  return normalize(fade(x, 0.002, 0.002), 0.55);
}

function def(make: SoundDef['make'], variants: number, bus: Bus, priority: number, gain: number, max: number, extra: Partial<SoundDef> = {}): SoundDef {
  return { make, variants, bus, priority, gain, max, loop: false, jitter: 0.04, ...extra };
}
const LOOP = { loop: true, jitter: 0 };
const TUNED = { jitter: 0 };

export const SOUNDS = {
  creak: def(creak, 4, 'sfx', 3, 0.45, 3),
  block: def(block, 3, 'sfx', 2, 0.4, 2),
  canvasFill: def(canvasFill, 3, 'sfx', 3, 0.55, 2),
  canvasFlog: def(canvasFlog, 2, 'sfx', 3, 0.5, 2),
  slap: def(slap, 4, 'sfx', 2, 0.4, 3),
  cannon: def(cannon, 4, 'sfx', 7, 1, 10),
  cannonFar: def(cannonFar, 3, 'sfx', 6, 0.9, 6),
  whistle: def(whistle, 3, 'sfx', 3, 0.5, 4),
  splash: def(splash, 4, 'sfx', 4, 0.7, 6),
  thud: def(thud, 3, 'sfx', 4, 0.6, 4),
  hit: def(hit, 4, 'sfx', 8, 0.95, 6),
  ram: def(ram, 2, 'sfx', 8, 1, 2),
  scrape: def(scrape, 2, 'sfx', 7, 0.85, 2),
  ignite: def(ignite, 2, 'sfx', 6, 0.7, 3),
  crackle: def(crackle, 1, 'sfx', 5, 0.5, 4, LOOP),
  groan: def(groan, 2, 'sfx', 9, 0.95, 2),
  explosion: def(explosion, 3, 'sfx', 8, 1, 4),
  mortar: def(mortar, 2, 'sfx', 6, 0.85, 3),
  coin: def(coin, 6, 'sfx', 5, 0.5, 6),
  chestLand: def(chestLand, 2, 'sfx', 8, 0.85, 2),
  open0: def((r) => chestOpen(r, 0), 1, 'sfx', 9, 0.8, 1, TUNED),
  open1: def((r) => chestOpen(r, 1), 1, 'sfx', 9, 0.8, 1, TUNED),
  open2: def((r) => chestOpen(r, 2), 1, 'sfx', 9, 0.8, 1, TUNED),
  open3: def((r) => chestOpen(r, 3), 1, 'sfx', 9, 0.8, 1, TUNED),
  open4: def((r) => chestOpen(r, 4), 1, 'sfx', 9, 0.8, 1, TUNED),
  bank: def(bank, 1, 'sfx', 9, 0.8, 1),
  chord: def(chord, 4, 'sfx', 10, 0.85, 1, TUNED),
  broken: def(broken, 2, 'sfx', 9, 0.85, 1, TUNED),
  lead: def(lead, 1, 'sfx', 6, 0.6, 1),
  gull: def(gull, 6, 'sfx', 4, 0.6, 3),
  kek: def(kek, 3, 'sfx', 4, 0.5, 2),
  wings: def(wings, 2, 'sfx', 3, 0.45, 2),
  dive: def(dive, 2, 'sfx', 5, 0.65, 2),
  patch: def(patch, 1, 'sfx', 6, 0.7, 1),
  ward: def(ward, 1, 'sfx', 6, 0.65, 1, TUNED),
  fogFlask: def(fogFlask, 1, 'sfx', 6, 0.7, 1),
  gust: def(gust, 1, 'sfx', 6, 0.7, 1),
  flare: def(flare, 1, 'sfx', 6, 0.75, 1),
  rush: def(rush, 2, 'sfx', 6, 0.7, 1),
  erupt: def(erupt, 1, 'sfx', 7, 1, 1),
  thunder: def(thunder, 3, 'ambience', 6, 0.95, 2),
  bell: def(bell, 3, 'ambience', 4, 0.5, 2),
  whale: def(whale, 3, 'ambience', 3, 0.55, 1),
  seal: def(seal, 3, 'ambience', 3, 0.45, 1),
  puffin: def(puffin, 2, 'ambience', 2, 0.4, 1),
  iceGrind: def(iceGrind, 2, 'ambience', 4, 0.55, 1),
  tap: def(tap, 4, 'ui', 10, 0.6, 3),
  page: def(page, 3, 'ui', 10, 0.6, 2),
  quill: def(quill, 3, 'ui', 10, 0.55, 2),
  confirm: def((r) => twoNotes(r, 587.33, 880, 0.5), 1, 'ui', 10, 0.6, 2, TUNED),
  back: def((r) => twoNotes(r, 880, 587.33, 0.45), 1, 'ui', 10, 0.6, 2, TUNED),
  sea: def(sea, 1, 'ambience', 10, 1, 1, LOOP),
  swell: def(swell, 1, 'ambience', 10, 1, 1, LOOP),
  surf: def(surf, 1, 'ambience', 10, 1, 1, LOOP),
  wind: def(wind, 1, 'ambience', 10, 1, 1, LOOP),
  rigging: def(rigging, 1, 'ambience', 10, 1, 1, LOOP),
  rain: def(rain, 1, 'ambience', 10, 1, 1, LOOP),
  storm: def(storm, 1, 'ambience', 10, 1, 1, LOOP),
  maelstrom: def(maelstrom, 1, 'ambience', 10, 1, 1, LOOP),
  night: def(night, 1, 'ambience', 10, 1, 1, LOOP),
  harbour: def(harbour, 1, 'ambience', 10, 1, 1, LOOP),
  steam: def(steam, 1, 'ambience', 10, 1, 1, LOOP),
} satisfies Record<string, SoundDef>;

export type SoundName = keyof typeof SOUNDS;
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

export function render(name: SoundName, v = 0): Buf[] {
  const d: SoundDef = SOUNDS[name], out = d.make(rng((hash(name) ^ Math.imul(v + 1, 0x9e3779b1)) >>> 0), v);
  const chs = Array.isArray(out) ? out : [out];
  if (!d.loop) for (const c of chs) fade(c, 0, 0.02);
  return chs;
}

export class Bank {
  private readonly cache = new Map<string, Buf[]>();
  ms = 0;
  get(name: SoundName, v: number): Buf[] {
    const key = `${name}:${v}`;
    let chs = this.cache.get(key);
    if (!chs) {
      const t0 = performance.now();
      chs = render(name, v);
      this.ms += performance.now() - t0;
      this.cache.set(key, chs);
    }
    return chs;
  }
  put(name: SoundName, v: number, chs: Buf[]): void { this.cache.set(`${name}:${v}`, chs); }
  has(name: SoundName, v: number): boolean { return this.cache.has(`${name}:${v}`); }
}

export function measure(chs: readonly Buf[]): { seconds: number; peak: number; loudness: number; finite: boolean } {
  let finite = true;
  for (const c of chs) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) { finite = false; break; }
  return { seconds: chs[0].length / SR, peak: Math.max(...chs.map(peak)), loudness: loudness(chs), finite };
}

export { Biquad };
