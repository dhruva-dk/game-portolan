// src/sim/math.ts: accuracy of the deterministic functions against the engine's own Math.* (V8's fdlibm port,
// itself within 1 ulp) over the stated ranges, the generator against a reference sfc32, the quality of its
// streams and of hash32, and speed (reported, not asserted). Ranges and measured worst errors are printed as a
// table (copied into progress.html's log).
//   node --test tests/sim/math.test.ts
import { cpuNow } from '../cpu.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../../src/sim/math.ts';

// ---------------------------------------------------------------------------------------------------------------
// Accuracy

interface Case {
  name: string;
  range: string;
  f: (x: number, y: number) => number;
  ref: (x: number, y: number) => number;
  /** Random arguments. */
  sample: (r: m.Rng) => [number, number];
  /** Arguments that probe edges: zeros, quadrant boundaries, ends of the range. */
  special: [number, number][];
  /** Error bound as a function of the true value: absolute where values are bounded, relative where not. */
  bound: (ref: number) => number;
  relative?: boolean;
}

const uni = (r: m.Rng, lo: number, hi: number) => m.rngRange(r, lo, hi);
/** Log-uniform magnitude in [10^a, 10^b] with a random sign. */
const logUni = (r: m.Rng, a: number, b: number) => (m.rngChance(r, 0.5) ? -1 : 1) * Math.pow(10, uni(r, a, b));
const ABS = 4.5e-16; // 4 ulp of 1: the bound for functions with values in [−π, π]
const quarterTurns = (k: number): [number, number][] => Array.from({ length: k }, (_, i) => [(i - k / 2) * (Math.PI / 4), 0]);

const CASES: Case[] = [
  {
    name: 'dsin', range: '|x| ≤ 2π', f: m.dsin, ref: Math.sin, sample: (r) => [uni(r, -2 * Math.PI, 2 * Math.PI), 0],
    special: [[0, 0], [1e-300, 0], [-1e-8, 0], ...quarterTurns(17)], bound: () => ABS,
  },
  {
    name: 'dsin', range: '|x| ≤ TRIG_RANGE (1.6e6)', f: m.dsin, ref: Math.sin, sample: (r) => [logUni(r, -3, Math.log10(m.TRIG_RANGE)), 0],
    special: [[m.TRIG_RANGE, 0], [-m.TRIG_RANGE, 0], [355, 0], [103993, 0]], bound: () => ABS,
  },
  {
    name: 'dcos', range: '|x| ≤ 2π', f: m.dcos, ref: Math.cos, sample: (r) => [uni(r, -2 * Math.PI, 2 * Math.PI), 0],
    special: [[0, 0], [1e-300, 0], ...quarterTurns(17)], bound: () => ABS,
  },
  {
    name: 'dcos', range: '|x| ≤ TRIG_RANGE (1.6e6)', f: m.dcos, ref: Math.cos, sample: (r) => [logUni(r, -3, Math.log10(m.TRIG_RANGE)), 0],
    special: [[m.TRIG_RANGE, 0], [-m.TRIG_RANGE, 0], [355, 0], [103993, 0]], bound: () => ABS,
  },
  {
    name: 'dtan', range: '|x| ≤ 1e4, relative', f: m.dtan, ref: Math.tan, sample: (r) => [logUni(r, -6, 4), 0],
    special: [[0.785, 0], [1.5707, 0], [-1.5707, 0], [3, 0]], bound: (v) => 1e-15 * Math.abs(v), relative: true,
  },
  {
    name: 'datan', range: 'all reals', f: m.datan, ref: Math.atan, sample: (r) => [logUni(r, -12, 12), 0],
    special: [[0, 0], [1, 0], [-1, 0], [1e-300, 0], [1e300, 0], [Infinity, 0], [-Infinity, 0], [0.1989, 0], [5.0273, 0]],
    bound: () => ABS * 2,
  },
  {
    name: 'datan2', range: 'all (y, x)', f: m.datan2, ref: Math.atan2, sample: (r) => [logUni(r, -8, 8), logUni(r, -8, 8)],
    special: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1e-300, -1], [-1e-300, -1], [1, 1e-300], [0, 0]],
    bound: () => ABS * 2,
  },
  {
    name: 'dasin', range: '[−1, 1]', f: m.dasin, ref: Math.asin, sample: (r) => [uni(r, -1, 1), 0],
    special: [[1, 0], [-1, 0], [0, 0], [1 - 1e-15, 0], [-(1 - 1e-12), 0], [0.5, 0], [1e-200, 0]], bound: () => ABS * 2,
  },
  {
    name: 'dacos', range: '[−1, 1]', f: m.dacos, ref: Math.acos, sample: (r) => [uni(r, -1, 1), 0],
    special: [[1, 0], [-1, 0], [0, 0], [1 - 1e-15, 0], [-(1 - 1e-12), 0], [0.5, 0]], bound: () => ABS * 2,
  },
  {
    name: 'dexp', range: '[−745, 709.78], relative', f: m.dexp, ref: Math.exp, sample: (r) => [uni(r, -708, 709), 0],
    special: [[0, 0], [1, 0], [-1, 0], [1e-300, 0], [709.78, 0], [-708, 0], [0.34657, 0], [-0.34657, 0]],
    bound: (v) => 1e-15 * Math.abs(v), relative: true,
  },
  {
    name: 'dlog', range: '(0, ∞), relative to max(1, |ln x|)', f: m.dlog, ref: Math.log,
    sample: (r) => [Math.pow(10, uni(r, -307, 308)), 0],
    special: [[1, 0], [2, 0], [0.5, 0], [Math.SQRT2, 0], [Math.SQRT1_2, 0], [1 + 1e-15, 0], [1 - 1e-15, 0], [5e-324, 0],
      [2.2250738585072014e-308, 0], [1.7976931348623157e308, 0], [Math.E, 0]],
    bound: (v) => 1e-15 * Math.max(1, Math.abs(v)),
  },
];

test('the d* functions are accurate on their stated ranges', (t) => {
  const rows: string[] = ['function | range | samples | worst abs error | worst rel error | bound'];
  for (const c of CASES) {
    const r = m.rngFrom(0x5eed);
    let worstAbs = 0, worstRel = 0, n = 0;
    const check = (x: number, y: number) => {
      const got = c.f(x, y), want = c.ref(x, y);
      n++;
      if (got === want) return;
      const err = Math.abs(got - want);
      assert.ok(err <= c.bound(want), `${c.name}(${x}${c.f.length > 1 ? `, ${y}` : ''}) = ${got}, Math gives ${want}`);
      worstAbs = Math.max(worstAbs, err);
      if (want !== 0) worstRel = Math.max(worstRel, err / Math.abs(want));
    };
    for (const [x, y] of c.special) check(x, y);
    for (let i = 0; i < 200_000; i++) check(...c.sample(r));
    rows.push(`${c.name} | ${c.range} | ${n} | ${worstAbs.toExponential(2)} | ${worstRel.toExponential(2)} | ${c.relative ? 'rel 1e-15' : c.bound(1).toExponential(1)}`);
  }
  for (const row of rows) t.diagnostic(row);
});

test('the d* functions handle the edges of their domains', () => {
  assert.equal(m.dexp(710), Infinity);
  assert.equal(m.dexp(-746), 0);
  assert.equal(m.dexp(-745), Math.exp(-745)); // the smallest subnormal
  assert.equal(m.dlog(0), -Infinity);
  assert.ok(Number.isNaN(m.dlog(-1)));
  assert.equal(m.dlog(Infinity), Infinity);
  assert.ok(Number.isNaN(m.dasin(1.0000001)));
  assert.ok(Number.isNaN(m.dsin(Infinity)));
  for (const f of [m.dsin, m.dcos, m.dtan, m.datan, m.dexp, m.dlog, m.dasin, m.dacos]) assert.ok(Number.isNaN(f(NaN)));
  // Beyond TRIG_RANGE the reduction loses accuracy gracefully; it stays deterministic everywhere.
  assert.ok(Math.abs(m.dsin(1e9) - Math.sin(1e9)) < 1e-6);
});

// ---------------------------------------------------------------------------------------------------------------
// Vectors

test('vector helpers', () => {
  const a = m.v3(1, 2, 3), b = m.v3(-2, 0.5, 4), out = m.v3();
  assert.equal(m.dot(a, b), 11);
  assert.deepEqual(m.cross(out, a, b), { x: 6.5, y: -10, z: 4.5 });
  assert.equal(m.dot(m.cross(out, a, b), a), 0);
  assert.deepEqual(m.addScaled(out, a, b, 2), { x: -3, y: 3, z: 11 });
  assert.equal(m.length(m.v3(3, 4, 12)), 13);
  assert.ok(Math.abs(m.length(m.normalize(m.v3(1e-100, 3e-100, -2e-100))) - 1) < 1e-15);
  assert.deepEqual(m.normalize(m.v3()), { x: 0, y: 0, z: 0 });
  assert.equal(m.set(out, 1, 2, 3), out);
  assert.deepEqual(out, a);
});

// ---------------------------------------------------------------------------------------------------------------
// Randomness

/** sfc32 as published with PractRand (C, uint32 arithmetic), written independently of math.ts. */
function referenceSfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + ((c << 3) >>> 0)) >>> 0;
    c = ((((c << 21) | (c >>> 11)) >>> 0) + t) >>> 0;
    return t;
  };
}

test('rngU32 is sfc32', () => {
  const r = new Uint32Array([0xdeadbeef, 0x01234567, 0x89abcdef, 0xfffffffe]);
  const ref = referenceSfc32(r[0], r[1], r[2], r[3]);
  for (let i = 0; i < 100_000; i++) assert.equal(m.rngU32(r), ref());
});

test('generators are reproducible and their outputs well distributed', () => {
  const a = m.rngFrom(7), b = m.rngFrom(7), c = m.rngFrom(8);
  let differ = 0;
  for (let i = 0; i < 1000; i++) {
    const x = m.rngU32(a);
    assert.equal(x, m.rngU32(b));
    if (x !== m.rngU32(c)) differ++;
  }
  assert.ok(differ > 990, 'neighbouring seeds give unrelated sequences');

  // Chi-square over 256 buckets (255 degrees of freedom: mean 255, sd 22.6) and every output bit balanced.
  const r = m.rngFrom(1), buckets = new Float64Array(256), ones = new Float64Array(32), N = 1 << 20;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const k = m.rngInt(r, 256);
    assert.ok(k >= 0 && k < 256);
    buckets[k]++;
    const u = m.rngU32(r);
    for (let bit = 0; bit < 32; bit++) ones[bit] += (u >>> bit) & 1;
    const f = m.rngFloat(r);
    assert.ok(f >= 0 && f < 1);
    sum += f;
  }
  const chi = buckets.reduce((s, o) => s + (o - N / 256) ** 2 / (N / 256), 0);
  assert.ok(chi > 255 - 5 * 22.6 && chi < 255 + 5 * 22.6, `chi-square ${chi}`);
  for (const o of ones) assert.ok(Math.abs(o - N / 2) < 5 * Math.sqrt(N / 4), 'output bits balanced');
  assert.ok(Math.abs(sum / N - 0.5) < 5 * Math.sqrt(1 / 12 / N), 'rngFloat mean');

  const g = m.rngFrom(3);
  for (let i = 0; i < 10_000; i++) {
    const x = m.rngRange(g, -3, 5);
    assert.ok(x >= -3 && x < 5);
  }
  assert.equal(m.rngInt(new Uint32Array([0, 0, 0xffffffff, 0xffffffff]), 1), 0);
  let heads = 0;
  for (let i = 0; i < 100_000; i++) if (m.rngChance(g, 0.3)) heads++;
  assert.ok(Math.abs(heads / 100_000 - 0.3) < 5 * Math.sqrt(0.21 / 100_000));
});

test('hash32 mixes fully, so stream seeds are independent', () => {
  // Flipping any one input bit flips each output bit with probability ½: mean 16 of 32.
  const r = m.rngFrom(11);
  let flips = 0, trials = 0;
  for (let i = 0; i < 2000; i++) {
    const a = m.rngU32(r), b = m.rngU32(r), h = m.hash32(a, b);
    for (let bit = 0; bit < 32; bit++) {
      for (const [x, y] of [[(a ^ (1 << bit)) >>> 0, b], [a, (b ^ (1 << bit)) >>> 0]]) {
        let d = (h ^ m.hash32(x, y)) >>> 0, c = 0;
        while (d) { c += d & 1; d >>>= 1; }
        flips += c;
        trials++;
      }
    }
  }
  assert.ok(Math.abs(flips / trials - 16) < 0.1, `avalanche ${flips / trials}`);

  // Streams of one seed, and one stream of neighbouring seeds, start uncorrelated.
  const firsts = new Set<number>();
  for (let s = 0; s < 64; s++) for (let seed = 0; seed < 64; seed++) firsts.add(m.rngU32(m.rngFrom(m.hash32(seed, s))));
  assert.ok(firsts.size > 4090, 'no repeated first outputs among 4096 streams');
});

// ---------------------------------------------------------------------------------------------------------------
// Speed (reported only: timing assertions would be flaky)

test('speed of the d* functions against Math.*', (t) => {
  const N = 2_000_000, xs = new Float64Array(N), r = m.rngFrom(5);
  for (let i = 0; i < N; i++) xs[i] = m.rngRange(r, -10, 10);
  const time = (f: (x: number) => number) => {
    let s = 0;
    const t0 = cpuNow();
    for (let i = 0; i < N; i++) s += f(xs[i]);
    return [((cpuNow() - t0) * 1e6) / N, s] as const;
  };
  const pairs: [string, (x: number) => number, (x: number) => number][] = [
    ['sin', m.dsin, Math.sin], ['cos', m.dcos, Math.cos], ['tan', m.dtan, Math.tan], ['atan', m.datan, Math.atan],
    ['asin', (x) => m.dasin(x / 10), (x) => Math.asin(x / 10)], ['exp', m.dexp, Math.exp], ['log', (x) => m.dlog(x + 10.5), (x) => Math.log(x + 10.5)],
  ];
  for (const [name, d, ref] of pairs) {
    time(d); time(ref); // warm up
    t.diagnostic(`${name}: d* ${time(d)[0].toFixed(1)} ns, Math ${time(ref)[0].toFixed(1)} ns`);
  }
});
