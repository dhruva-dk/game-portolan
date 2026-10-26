export const SR = 32000;
export type Buf = Float32Array;
export type Rng = () => number;

export function rng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const between = (r: Rng, a: number, b: number): number => a + (b - a) * r();
export const samples = (s: number): number => Math.max(1, Math.round(s * SR));
export const buf = (s: number): Buf => new Float32Array(samples(s));
export const TAU = Math.PI * 2;

export function white(n: number, r: Rng): Buf {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}

export function pink(n: number, r: Rng): Buf {
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return x;
}

export function brown(n: number, r: Rng): Buf {
  const x = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = (y + 0.02 * (r() * 2 - 1)) / 1.02;
    x[i] = y * 3.5;
  }
  return x;
}

export type FilterType = 'lp' | 'hp' | 'bp' | 'peak' | 'notch';

export class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  set(type: FilterType, f: number, q = 0.707, db = 0): this {
    const w = (TAU * Math.min(Math.max(f, 10), SR * 0.45)) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'notch') { b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { const A = Math.pow(10, db / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export function filter(x: Buf, type: FilterType, f: number, q = 0.707, db = 0): Buf {
  const b = new Biquad().set(type, f, q, db);
  for (let i = 0; i < x.length; i++) x[i] = b.tick(x[i]);
  return x;
}

export function sweep(x: Buf, type: FilterType, f: (t: number) => number, q = 0.707): Buf {
  const b = new Biquad(), n = x.length;
  for (let i = 0; i < n; i++) {
    if ((i & 31) === 0) b.set(type, f(i / n), q);
    x[i] = b.tick(x[i]);
  }
  return x;
}

export const ad = (t: number, a: number, d: number): number => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));
export const hump = (t: number, p = 1): number => Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, t)))), p);

export function shape(x: Buf, env: (t: number) => number): Buf {
  for (let i = 0; i < x.length; i++) x[i] *= env(i / SR);
  return x;
}

export interface Mode { f: number; d: number; g: number }

export function modes(x: Buf, ms: readonly Mode[], n = x.length): Buf {
  const out = new Float32Array(n);
  for (const m of ms) {
    if (m.f <= 0 || m.f >= SR * 0.46) continue;
    const r = Math.exp(-1 / (m.d * SR)), w = (TAU * m.f) / SR, a1 = 2 * r * Math.cos(w), a2 = -r * r, g = m.g * Math.sin(w);
    let y1 = 0, y2 = 0;
    const end = Math.min(n, x.length + Math.ceil(m.d * SR * 9));
    for (let i = 0; i < end; i++) {
      const y = a1 * y1 + a2 * y2 + g * (i < x.length ? x[i] : 0);
      y2 = y1; y1 = y;
      out[i] += y;
    }
  }
  return out;
}

export function tone(n: number, f: (t: number) => number, a: (t: number) => number, phase = 0): Buf {
  const x = new Float32Array(n);
  let p = phase;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] = Math.sin(p) * a(t);
    p += (TAU * f(t)) / SR;
  }
  return x;
}

export function fm(n: number, fc: (t: number) => number, ratio: number, k: (t: number) => number, a: (t: number) => number): Buf {
  const x = new Float32Array(n);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = fc(t);
    x[i] = Math.sin(pc + k(t) * Math.sin(pm)) * a(t);
    pc += (TAU * f) / SR;
    pm += (TAU * f * ratio) / SR;
  }
  return x;
}

export function pluck(n: number, f: number, r: Rng, bright = 0.5, loss = 0.996): Buf {
  const P = Math.max(2, SR / f - 0.5), L = Math.ceil(P) + 2, line = new Float32Array(L), x = new Float32Array(n);
  const lp = new Biquad().set('lp', 800 + bright * 9000, 0.7);
  for (let i = 0; i < L; i++) line[i] = lp.tick(r() * 2 - 1);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const rd = (w - P + L * 4) % L, i0 = Math.floor(rd), fr = rd - i0;
    const a = line[i0 % L] * (1 - fr) + line[(i0 + 1) % L] * fr, b = line[(i0 + L - 1) % L] * (1 - fr) + line[i0 % L] * fr;
    const y = i < L ? line[w] : loss * (a * (0.5 + 0.5 * bright) + b * (0.5 - 0.5 * bright));
    line[w] = y;
    x[i] = y;
    w = (w + 1) % L;
  }
  return x;
}

export function mix(into: Buf, x: Buf, at = 0, g = 1): Buf {
  const o = Math.round(at * SR);
  for (let i = 0, n = Math.min(x.length, into.length - o); i < n; i++) if (o + i >= 0) into[o + i] += x[i] * g;
  return into;
}

export function scale(x: Buf, g: number): Buf {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

export function peak(x: Buf): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; }
  return p;
}

export function normalize(x: Buf, to: number): Buf {
  const p = peak(x);
  return p > 1e-9 ? scale(x, to / p) : x;
}

export function fade(x: Buf, a: number, b: number): Buf {
  const na = samples(a), nb = samples(b), n = x.length;
  for (let i = 0; i < Math.min(na, n); i++) x[i] *= i / na;
  for (let i = 0; i < Math.min(nb, n); i++) x[n - 1 - i] *= i / nb;
  return x;
}

export function softclip(x: Buf, drive: number): Buf {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k;
  return x;
}

export function loopify(x: Buf, xf: number): Buf {
  const m = samples(xf), n = x.length - m, out = x.slice(0, n);
  for (let i = 0; i < m; i++) {
    const t = i / m;
    out[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[n + i] * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

export function scatter(r: Rng, from: number, to: number, perSecond: number, grain: (at: number) => void): void {
  let t = from;
  for (;;) {
    t += -Math.log(1 - r() * 0.999) / perSecond;
    if (t >= to) return;
    grain(t);
  }
}

export function loudness(chs: readonly Buf[]): number {
  const w = samples(0.4), hop = samples(0.1), n = chs[0].length;
  let best = 0;
  for (let s = 0; s < Math.max(1, n - w + hop); s += hop) {
    let e = 0, c = 0;
    for (const x of chs) for (let i = s; i < Math.min(n, s + w); i++) { e += x[i] * x[i]; c++; }
    if (c) best = Math.max(best, e / c);
  }
  return 10 * Math.log10(Math.max(best, 1e-12));
}
