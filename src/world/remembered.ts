// A function of a point remembered: its answers kept by the point's exact bits, so each is worked out once while it
// stays in the table. Pure arithmetic over the point alone.

import type { Vec3 } from './sphere.ts';

/**
 * `read`, a function of the point alone, through a table of its last 2^bits answers kept by the point's exact bits:
 * the same answers, each worked out once while it stays in the table (a ship's hull read again where she lies, step
 * after step). Nothing is made per read.
 */
export function remembered(read: (p: Vec3) => number, bits = 12): (p: Vec3) => number {
  const size = 1 << bits, mask = size - 1;
  const keys = new Uint32Array(size * 6), held = new Uint8Array(size), values = new Float64Array(size);
  const word = new Float64Array(3), half = new Uint32Array(word.buffer);
  return (p) => {
    word[0] = p[0];
    word[1] = p[1];
    word[2] = p[2];
    let h = 0x811c9dc5;
    for (let i = 0; i < 6; i++) h = Math.imul(h ^ half[i], 0x01000193);
    const at = (h ^ (h >>> 16)) & mask, k = at * 6;
    if (held[at] && keys[k] === half[0] && keys[k + 1] === half[1] && keys[k + 2] === half[2] && keys[k + 3] === half[3]
      && keys[k + 4] === half[4] && keys[k + 5] === half[5]) return values[at];
    const v = read(p);
    for (let i = 0; i < 6; i++) keys[k + i] = half[i];
    held[at] = 1;
    values[at] = v;
    return v;
  };
}
