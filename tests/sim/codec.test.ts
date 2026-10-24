// src/sim/codec.ts and the match state: random values of every kind round-trip bit for bit, encoding is
// canonical, bad values and bad bytes are refused, the hash sees every bit, and a realistic match snapshot is
// small.
//   node --test tests/sim/codec.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bool, bytes, decode, encode, f64, hash64, int, list, rec, words, type Format, type Kind } from '../../src/sim/codec.ts';
import { dot, rngChance, rngFloat, rngFrom, rngInt, rngRange, rngU32, v3, type Rng } from '../../src/sim/math.ts';
import { R, TERRITORY, cellDir } from '../../src/sim/sphere.ts';
import { MATCH_FORMAT, SHIPS, createMatch, decodeMatch, encodeMatch, matchHash, type MatchState } from '../../src/sim/state.ts';

/** A random value of a kind, reaching the corners: −0, subnormals, extremes, long runs and noise. */
function randomValue(kind: Kind, r: Rng): unknown {
  switch (kind.t) {
    case 'f64': {
      const special = [0, -0, 5e-324, -1.7976931348623157e308, 1 / 3, Math.PI];
      return rngChance(r, 0.2) ? special[rngInt(r, special.length)] : (rngFloat(r) - 0.5) * 10 ** rngInt(r, 40);
    }
    case 'int': {
      const special = [0, -1, 1, 127, 128, -129, 2 ** 31, -(2 ** 52) + 1, 2 ** 52 - 1];
      return rngChance(r, 0.3) ? special[rngInt(r, special.length)] : Math.round((rngFloat(r) - 0.5) * 2 ** rngInt(r, 52)) + 0; // + 0: no −0
    }
    case 'bool':
      return rngChance(r, 0.5);
    case 'bytes': {
      const a = new Uint8Array(kind.length);
      for (let i = 0; i < a.length; ) {
        const run = rngChance(r, 0.5) ? 1 : 1 + rngInt(r, 300);
        a.fill(rngChance(r, 0.3) ? rngU32(r) & 255 : rngInt(r, 11), i, i + run);
        i += run;
      }
      return a;
    }
    case 'words':
      return Uint32Array.from({ length: kind.length }, () => rngU32(r));
    case 'list':
      return Array.from({ length: kind.length ?? rngInt(r, 6) }, () => randomValue(kind.of, r));
    case 'rec': {
      const o: Record<string, unknown> = {};
      for (const [name, k] of kind.fields) o[name] = randomValue(k, r);
      return o;
    }
  }
}

const POINT = rec(['x', f64], ['y', f64], ['z', f64]);
const SAMPLE = rec(
  ['n', int],
  ['flag', bool],
  ['pos', POINT],
  ['path', list(int)],
  ['crowd', list(rec(['alive', bool], ['at', POINT], ['marks', list(f64)]), 3)],
  ['map', bytes(5000)],
  ['seeds', list(words(4))],
  ['nested', list(list(int))],
);
const SAMPLE_FORMAT: Format<typeof SAMPLE> = { magic: 'TEST', version: 3, schema: SAMPLE };

test('random values of every kind round-trip bit for bit, and encoding is canonical', () => {
  const r = rngFrom(99);
  for (let i = 0; i < 500; i++) {
    const v = randomValue(SAMPLE, r) as Parameters<typeof encode<typeof SAMPLE>>[1];
    const b = encode(SAMPLE_FORMAT, v);
    const back = decode(SAMPLE_FORMAT, b);
    assert.deepStrictEqual(back, v); // Object.is on numbers: −0 stays −0
    assert.deepEqual(encode(SAMPLE_FORMAT, back), b);
  }
});

test('values that do not fit the schema are refused, naming the field', () => {
  const v = randomValue(SAMPLE, rngFrom(1)) as Record<string, any>;
  const bad = (change: (o: Record<string, any>) => void, where: RegExp) => {
    const o = structuredClone(v);
    change(o);
    assert.throws(() => encode(SAMPLE_FORMAT, o as never), where);
  };
  bad((o) => (o.pos.y = NaN), /TEST\.pos\.y is not a finite number/);
  bad((o) => (o.pos.x = Infinity), /pos\.x/);
  bad((o) => (o.n = 1.5), /TEST\.n is not an integer/);
  bad((o) => (o.n = 2 ** 52), /TEST\.n/);
  bad((o) => (o.flag = 1), /flag is not a boolean/);
  bad((o) => (o.map = new Uint8Array(4999)), /map is not a Uint8Array\(5000\)/);
  bad((o) => (o.crowd = o.crowd.slice(1)), /crowd is not an array of 3/);
  bad((o) => (o.crowd[2].marks[0] = undefined), /TEST\.crowd\.2\.marks\.0/);
  bad((o) => (o.seeds = [new Uint32Array(3)]), /seeds\.0 is not a Uint32Array\(4\)/);
  bad((o) => delete o.pos, /pos is not a record/);

  // Integers have no sign of zero: −0 (from Math.round(−0.2), say) is stored as 0.
  const o = structuredClone(v);
  o.n = -0;
  assert.ok(Object.is(decode(SAMPLE_FORMAT, encode(SAMPLE_FORMAT, o as never)).n, 0));
});

test('bytes that are not an intact encoding are refused', () => {
  const small = rec(['a', int], ['b', bool], ['m', bytes(10)], ['w', words(1)], ['l', list(f64, 2)]);
  const fmt: Format<typeof small> = { magic: 'TINY', version: 1, schema: small };
  const good = encode(fmt, { a: -300, b: true, m: new Uint8Array([1, 1, 1, 2, 2, 0, 0, 0, 0, 9]), w: new Uint32Array([7]), l: [0.5, -2] });
  assert.ok(decode(fmt, good));
  for (let k = 0; k < good.length; k++) assert.throws(() => decode(fmt, good.subarray(0, k)), RangeError, `prefix ${k}`);
  const corrupt = (at: number, value: number) => {
    const b = good.slice();
    b[at] = value;
    return b;
  };
  assert.throws(() => decode(fmt, Uint8Array.of(...good, 0)), /trailing bytes/);
  assert.throws(() => decode(fmt, corrupt(0, 0x58)), /not this format/);
  assert.throws(() => decode({ ...fmt, version: 2 }, good), /version 1, expected 2/);
  // Layout: 4 magic, 1 version, 2 varint a, 1 bool, then runs (3×1, 2×2, 4×0, 1×9).
  assert.throws(() => decode(fmt, corrupt(7, 2)), /bad boolean/);
  assert.throws(() => decode(fmt, corrupt(8, 0)), /bad run/); // a run of zero
  assert.throws(() => decode(fmt, corrupt(8, 11)), /bad run/); // past the end of the array
  const longVarint = Uint8Array.of(...good.subarray(0, 5), ...new Array(9).fill(0x80), 1);
  assert.throws(() => decode(fmt, longVarint), /bad varint/);
  // A real that is not finite cannot come from encode.
  const nan = good.slice();
  new DataView(nan.buffer).setFloat64(nan.length - 16, NaN, true);
  assert.throws(() => decode(fmt, nan), /non-finite real/);
});

test('hash64 sees every bit', () => {
  const r = rngFrom(5);
  const b = Uint8Array.from({ length: 37 }, () => rngU32(r) & 255);
  const h = hash64(b), seen = new Set([h]);
  let flipped = 0;
  for (let bit = 0; bit < b.length * 8; bit++) {
    const c = b.slice();
    c[bit >> 3] ^= 1 << (bit & 7);
    const hc = hash64(c);
    seen.add(hc);
    for (let i = 0; i < 16; i += 8) {
      let d = (parseInt(h.slice(i, i + 8), 16) ^ parseInt(hc.slice(i, i + 8), 16)) >>> 0;
      while (d) { flipped += d & 1; d >>>= 1; }
    }
  }
  assert.equal(seen.size, b.length * 8 + 1, 'every single-bit change gives a new hash');
  assert.ok(Math.abs(flipped / (b.length * 8) - 32) < 1.5, `about half the 64 hash bits flip (${flipped / (b.length * 8)})`);
  assert.equal(hash64(b), h);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.notEqual(hash64(new Uint8Array(0)), hash64(new Uint8Array(1)), 'length counts');
});

/** A match state as it might look late in a match: ten ships' waters as caps around scattered homes, open trails. */
function lateMatch(seed: number): MatchState {
  const s = createMatch({ seed }), r = rngFrom(seed), p = v3();
  const homes = Array.from({ length: SHIPS }, () => cellDir(TERRITORY, rngInt(r, TERRITORY.cells), v3()));
  const within = homes.map(() => Math.cos(rngRange(r, 15, 60) / R)); // waters 15–60 u in radius
  for (let c = 0; c < TERRITORY.cells; c++) {
    cellDir(TERRITORY, c, p);
    for (let i = 0; i < SHIPS; i++) if (dot(p, homes[i]) > within[i]) s.owner[c] = i + 1;
  }
  for (let i = 0; i < SHIPS; i++) for (let k = 0; k < 400; k++) s.trail[rngInt(r, TERRITORY.cells)] = i + 1;
  for (const ship of s.ships) ship.course = Array.from({ length: rngInt(r, 50) }, () => rngInt(r, TERRITORY.cells));
  s.tick = 12_345;
  return s;
}

test('match states round-trip, and a late-match snapshot is small', (t) => {
  const fresh = createMatch({ seed: 1 });
  assert.deepStrictEqual(decodeMatch(encodeMatch(fresh)), fresh);
  t.diagnostic(`fresh match snapshot ${encodeMatch(fresh).length} bytes`);

  const late = lateMatch(77), b = encodeMatch(late);
  assert.deepStrictEqual(decodeMatch(b), late);
  assert.equal(matchHash(decodeMatch(b)), matchHash(late));
  t.diagnostic(`late-match snapshot ${(b.length / 1024).toFixed(1)} KB (target ≤ 300 KB)`);
  assert.ok(b.length <= 300 * 1024);

  // Random states of the match schema too, run-heavy territory and all.
  const r = rngFrom(3);
  for (let i = 0; i < 5; i++) {
    const v = randomValue(MATCH_FORMAT.schema, r) as MatchState;
    assert.deepStrictEqual(decodeMatch(encodeMatch(v)), v);
  }
});

test('the match hash depends on every part of the state', () => {
  const base = lateMatch(5), h = matchHash(base);
  const changes: ((s: MatchState) => void)[] = [
    (s) => s.tick++,
    (s) => (s.seed ^= 1),
    (s) => (s.rng[3][2] ^= 1 << 30),
    (s) => (s.ships[9].sail = (s.ships[9].sail + 1) % 3),
    (s) => s.ships[4].course.push(0),
    (s) => (s.owner[TERRITORY.cells - 1] ^= 1),
    (s) => (s.trail[0] ^= 4),
  ];
  for (const change of changes) {
    const s = decodeMatch(encodeMatch(base));
    change(s);
    assert.notEqual(matchHash(s), h, change.toString());
  }
});
