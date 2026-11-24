import { N, beyond, columnOf, faceOf, rowOf } from '../../world/cells.ts';

const MIN_SHARE = 0.52;
const SIGMA = 1.6;
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
const FLAT_SUM = 1 - SMOOTH[0] / 2;
const shareOf = (s: number) =>
  s > FLAT_SUM ? 255 : Math.min(254, Math.round(Math.max(s, MIN_SHARE) * 255));
const NBI = [1, -1, 0, 0, 1, -1, 1, -1];
const NBJ = [0, 0, 1, -1, 1, 1, -1, -1];

function offset(c: number, di: number, dj: number): number {
  const i = columnOf(c) + di,
    j = rowOf(c) + dj;
  return i >= 0 && i < N && j >= 0 && j < N
    ? c + dj * N + di
    : beyond(faceOf(c), i, j);
}

const edged = (c: number) => {
  const i = columnOf(c),
    j = rowOf(c);
  return i < FLAT || j < FLAT || i >= N - FLAT || j >= N - FLAT;
};

export function createShares(cells: Uint8Array) {
  const sums = new Float64Array(cells.length / 4).fill(1);
  const win = new Int32Array(WIN * WIN),
    nb = new Int32Array(8);

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
    around(c: number) {
      const i = columnOf(c),
        j = rowOf(c);
      if (i > 0 && j > 0 && i < N - 1 && j < N - 1)
        for (let s = 0; s < 8; s++) nb[s] = c + NBJ[s] * N + NBI[s];
      else for (let s = 0; s < 8; s++) nb[s] = offset(c, NBI[s], NBJ[s]);
      return nb;
    },
    count(c: number) {
      const o = cells[c * 4],
        w = windowOf(c);
      let s = 0;
      for (let k = 0; k < w.length; k++)
        if (cells[w[k] * 4] === o) s += SMOOTH[k];
      sums[c] = s;
      return shareOf(s);
    },
    whole(c: number) {
      sums[c] = 1;
    },
    kept: (c: number) => shareOf(sums[c]),
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
