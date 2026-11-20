// The smoothed shares of who holds the sea (claimed.ts): over the window of
// (2·FLAT + 1)² cells round each cell, a Gaussian (σ SIGMA cells) of how much
// of it its own holder holds, kept as a byte the shader draws the borders by.
//
// Each cell's share is kept counted (the weights of the cells its holder's), so
// a cell changing holder moves only the sums round it, by its weight in each
// (spread), not every window's whole count again: a cell's weight in another's
// window is the other's in its own, while both windows lie on one face. Those
// reaching past a face's edge are counted afresh (count) instead.
//
// Pure: no three, so it runs in node for the tests (it names its imports with
// .ts, as claimed.ts does).

import { N, beyond, columnOf, faceOf, rowOf } from '../world/cells.ts';

/** The least smoothed share a cell keeps of its own holder. */
const MIN_SHARE = 0.52;
/**
 * The smoothing's spread, cells: wider than 1.15, as a ship's home here is only
 * some 18 cells across, and a narrower one leaves its circle an octagon.
 */
const SIGMA = 1.6;
/** The smoothing window's reach, cells: (2·FLAT + 1)² of them. */
const FLAT = 4,
  WIN = 2 * FLAT + 1;

const SMOOTH = new Float64Array(WIN * WIN);
{
  let sum = 0;
  for (let k = 0; k < WIN * WIN; k++) {
    const i = (k % WIN) - FLAT,
      j = Math.floor(k / WIN) - FLAT;
    sum += SMOOTH[k] = Math.exp(-(i * i + j * j) / (2 * SIGMA * SIGMA));
  }
  for (let k = 0; k < WIN * WIN; k++) SMOOTH[k] /= sum;
}
/**
 * A sum of the weights over FLAT_SUM is a whole window one holder's: the least
 * weight (a corner's) is far over what a sum kept by adding and taking drifts.
 */
const FLAT_SUM = 1 - SMOOTH[0] / 2;
/** A share counted, as a byte: 255 when the window is all its holder's. */
const shareOf = (s: number) =>
  s > FLAT_SUM ? 255 : Math.min(254, Math.round(Math.max(s, MIN_SHARE) * 255));
/** The eight neighbours' steps, the four sides' first. */
const NBI = [1, -1, 0, 0, 1, -1, 1, -1];
const NBJ = [0, 0, 1, -1, 1, 1, -1, -1];

/** The cell di, dj cells from c, carried past a face's edge onto the next. */
function offset(c: number, di: number, dj: number): number {
  const i = columnOf(c) + di,
    j = rowOf(c) + dj;
  return i >= 0 && i < N && j >= 0 && j < N
    ? c + dj * N + di
    : beyond(faceOf(c), i, j);
}

/** Whether c's window reaches past its face's edge. */
const edged = (c: number) => {
  const i = columnOf(c),
    j = rowOf(c);
  return i < FLAT || j < FLAT || i >= N - FLAT || j >= N - FLAT;
};

/**
 * The shares over `cells` (four bytes a cell, its holder first: claimed.ts),
 * every one counted whole (a window one holder's) until told otherwise.
 */
export function createShares(cells: Uint8Array) {
  const sums = new Float64Array(cells.length / 4).fill(1);
  const win = new Int32Array(WIN * WIN),
    nb = new Int32Array(8);

  /** The cells of c's window, row by row (reused: read before the next). */
  const windowOf = (c: number) => {
    const inner = !edged(c);
    for (let dj = -FLAT, k = 0; dj <= FLAT; dj++) {
      for (let di = -FLAT; di <= FLAT; di++, k++)
        win[k] = inner ? c + dj * N + di : offset(c, di, dj);
    }
    return win;
  };

  return {
    windowOf,
    edged,
    /**
     * The eight cells round c (its four sides' first), straight across the
     * face away from its edges (reused: read before the next).
     */
    around(c: number) {
      const i = columnOf(c),
        j = rowOf(c);
      if (i > 0 && j > 0 && i < N - 1 && j < N - 1)
        for (let s = 0; s < 8; s++) nb[s] = c + NBJ[s] * N + NBI[s];
      else for (let s = 0; s < 8; s++) nb[s] = offset(c, NBI[s], NBJ[s]);
      return nb;
    },
    /** c's share counted afresh over its window, as a byte. */
    count(c: number) {
      const o = cells[c * 4],
        w = windowOf(c);
      let s = 0;
      for (let k = 0; k < w.length; k++)
        if (cells[w[k] * 4] === o) s += SMOOTH[k];
      sums[c] = s;
      return shareOf(s);
    },
    /** c's window all its holder's: its share whole. */
    whole(c: number) {
      sums[c] = 1;
    },
    /** c's share as kept, as a byte. */
    kept: (c: number) => shareOf(sums[c]),
    /**
     * c changing holder from `was` to `to`: the sums of its window's cells
     * moved by its weight in theirs, but for those changing with it (`moving`)
     * and those whose windows reach past their face's edge (to be counted
     * afresh).
     */
    spread(c: number, was: number, to: number, moving: (x: number) => boolean) {
      const w = windowOf(c);
      for (let k = 0; k < w.length; k++) {
        const x = w[k];
        if (edged(x) || moving(x)) continue;
        const o = cells[x * 4];
        if (o === was) sums[x] -= SMOOTH[k];
        else if (o === to) sums[x] += SMOOTH[k];
      }
    },
  };
}
