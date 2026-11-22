// The fleet's job on Math itself (jobs.ts JOBS math): every function of Math on
// a draw of numbers, its results hashed by their bits, so two machines' runs
// say which functions come out differently on them, and on how many inputs;
// and a few calls known to differ, each one's result in full.
//
// Node only (tools/).

import { createHash } from 'node:crypto';
import { random } from '../../../src/world/random.ts';

/** Inputs each function is tried on, and how many of its first results are kept by their lowest byte. */
const INPUTS = 200_000,
  LOW = 4096;

/**
 * What stands for a NaN where numbers are hashed by their bits: a NaN's own
 * bits (its sign, its payload) are the processor's to choose, and no rule of
 * the language tells them apart.
 */
const NAN = -123456789.125;

/**
 * Calls of Math found to come out one unit in the last place apart between
 * Node on arm64 (macOS) and Node on x86-64 (Linux), the same Node and V8: the
 * least a reader needs to see it for themselves.
 */
const WITNESSES: readonly (readonly [string, ...number[]])[] = [
  ['sin', -0.49086459428071977],
  ['cos', 3.9921385888010263],
  ['tan', 0.565532622858882],
  ['asin', 0.48408400863409046],
  ['acos', 0.7361950092017651],
  ['atan', 0.3656917978078127],
  ['atan2', 0.9130924686789513, 3.600821429863572],
  ['exp', -1.0496402755379677],
  ['log', 0.42019358836114407],
  ['log1p', 0.4103884503245354],
  ['cosh', -1.01445066742599],
];

/**
 * A draw of numbers for a Math function to be tried on: small and large, of
 * both signs, round and not, and the edges.
 */
function draws(seed: number, n: number): Float64Array {
  const next = random(seed),
    out = new Float64Array(n);
  const edges = [0, -0, 1, -1, 0.5, Math.PI, Math.E, 1e-300, 1e300, 2 ** 53];
  for (let i = 0; i < n; i++) {
    const u = next() * 2 - 1,
      scale = [1, Math.PI, 10, 1e3, 1e-6, 1e9][i % 6];
    out[i] =
      i < edges.length
        ? edges[i]
        : i % 7 === 0
          ? Math.round(u * 40)
          : u * scale;
  }
  return out;
}

/** A number's bits, in hex, the highest first. */
const bits = (v: number) =>
  Buffer.from(new Float64Array([v]).buffer)
    .reverse()
    .toString('hex');

export function math(shard: string) {
  const x = draws(Number(shard), INPUTS),
    y = draws(Number(shard) + 1, INPUTS),
    out = new Float64Array(INPUTS),
    by: Record<string, string> = {},
    low: Record<string, string> = {};
  const call = (name: string, args: number[]): number =>
    Number(Reflect.apply(Reflect.get(Math, name), Math, args));
  for (const name of Object.getOwnPropertyNames(Math).sort()) {
    if (typeof Reflect.get(Math, name) !== 'function' || name === 'random')
      continue;
    for (let i = 0; i < INPUTS; i++) {
      const v = call(name, [x[i], y[i]]);
      out[i] = Number.isNaN(v) ? NAN : v;
    }
    by[name] = createHash('sha256')
      .update(new Uint8Array(out.buffer))
      .digest('hex');
    // the lowest byte of each of the first results: on how many two machines differ
    low[name] = Buffer.from(
      new Uint8Array(out.buffer, 0, LOW * 8).filter((_, i) => i % 8 === 0)
    ).toString('hex');
  }
  return {
    inputs: INPUTS,
    by,
    counted: LOW,
    low,
    witnesses: WITNESSES.map(([name, ...args]) => ({
      call: `Math.${name}(${args.join(', ')})`,
      bits: bits(call(name, args)),
    })),
  };
}
