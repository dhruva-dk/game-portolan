// Who holds the sea, as the water reads it (claims.ts): the frame's copy of the cells (world/cells.ts), kept from the
// Snapshot's Sea, with what the shader needs to draw the borders smooth and the changes as moving fronts. The first
// game's (agent-initial src/territory.ts Territory: load, change, settle, share), on this grid.
//
// Each cell keeps four bytes: who holds it, who held it before, and the smoothed share of its own holder over the
// 9 × 9 cells round it (a Gaussian, σ 1.6 cells, never under MIN_SHARE so a thin strip never vanishes, but only just over a half, so the border follows the smoothed share and not the cells’ edges; 255 when that
// whole window is one holder's: the shader can stop at one read there), now and before. And a moment, on the world's
// clock: when the change front reached it. A change keeps the cells' state before it for HOLD s, the shader drawing the
// old against the new as a front sweeps over (from the loop's own cells, a breadth-first spread alternately four- and
// eight-way for a near round front, smoothed twice), then the cells settle and forget it.
//
// The cells go to the GPU as two storage buffers, one word a cell, laid out a face at a time in (N + 2)² words: each
// face's cells within an apron one cell wide holding the next faces' cells along its edges (cells.ts wrapped), so the
// shader's 3 × 3 reads never leave a face's tile. What changed is sent as a range of words a face, never the whole.

import { CELLS, N, beyond, columnOf, faceOf, rowOf, wrapped } from '../world/cells';

/** Seconds a changed cell keeps who held it before, for the front; then it settles. */
export const HOLD = 8;
/** The least smoothed share a cell keeps of its own holder. */
const MIN_SHARE = 0.52;
/** The smoothing's spread, cells: wider than the first game's 1.15, as a ship's home here is only some 18 cells
 *  across, and a narrower one leaves its circle an octagon. */
const SIGMA = 1.6;
/** The smoothing window's reach, cells: (2·FLAT + 1)² of them. */
const FLAT = 4, WIN = 2 * FLAT + 1;
/** The padded face's side, and its words. */
export const SIDE = N + 2;
const TILE = SIDE * SIDE;
/** Words on the GPU: six padded faces. */
export const WORDS = 6 * TILE;

const SMOOTH = new Float32Array(WIN * WIN);
{
  let sum = 0;
  for (let k = 0; k < WIN * WIN; k++) {
    const i = (k % WIN) - FLAT, j = Math.floor(k / WIN) - FLAT;
    sum += SMOOTH[k] = Math.exp(-(i * i + j * j) / (2 * SIGMA * SIGMA));
  }
  for (let k = 0; k < WIN * WIN; k++) SMOOTH[k] /= sum;
}
/** The eight neighbours' steps, the four sides' first. */
const NBI = [1, -1, 0, 0, 1, -1, 1, -1];
const NBJ = [0, 0, 1, -1, 1, 1, -1, -1];

/** The cell di, dj cells from c, carried past a face's edge onto the next. */
function offset(c: number, di: number, dj: number): number {
  const i = columnOf(c) + di, j = rowOf(c) + dj;
  return i >= 0 && i < N && j >= 0 && j < N ? c + dj * N + di : beyond(faceOf(c), i, j);
}

/** A cell's word in its own face's tile. */
const slotOf = (c: number) => faceOf(c) * TILE + (rowOf(c) + 1) * SIDE + columnOf(c) + 1;
/** The apron's words, by the cell they copy (cells along a face's edge only). */
const APRON = new Map<number, number[]>();
for (let f = 0; f < 6; f++) {
  for (let k = -1; k <= N; k++) {
    for (const [i, j] of [[k, -1], [k, N], [-1, k], [N, k]] as const) {
      const c = wrapped(f, i, j), list = APRON.get(c) ?? [];
      const slot = f * TILE + (j + 1) * SIDE + i + 1;
      if (!list.includes(slot)) list.push(slot);
      APRON.set(c, list);
    }
  }
}

/** A change to draw (snapshot.ts SeaChange, less the cut): its cells, its holder after (0 open sea, else id + 1),
 *  when (world clock, s) and the cells its front spreads from (null: in from the changed water's edge). */
export interface Shift { cells: Int32Array; owner: number; time: number; from: Int32Array | null }

export function createClaimed() {
  const cells = new Uint8Array(CELLS * 4); // holder, before, share, share before
  const words = new Uint32Array(cells.buffer);
  const reveal = new Float32Array(CELLS).fill(-1e6);
  /** What goes to the GPU: the words and the moments, padded (SIDE, WORDS). */
  const gpuCells = new Uint32Array(WORDS), gpuReveal = new Float32Array(WORDS).fill(-1e6);
  const mark = new Int32Array(CELLS), seen = new Int32Array(CELLS), list = new Int32Array(CELLS), queue = new Int32Array(CELLS);
  const dirty = new Int32Array(CELLS), isDirty = new Uint8Array(CELLS);
  let dirtyCount = 0, epoch = 0;
  const settling: { until: number; cells: Int32Array }[] = [];
  const win = new Int32Array(WIN * WIN), nb = new Int32Array(8);

  const touch = (c: number) => {
    if (isDirty[c]) return;
    isDirty[c] = 1;
    dirty[dirtyCount++] = c;
  };
  const around = (c: number) => {
    for (let s = 0; s < 8; s++) nb[s] = offset(c, NBI[s], NBJ[s]);
    return nb;
  };
  const windowOf = (c: number) => {
    const i = columnOf(c), j = rowOf(c), inner = i >= FLAT && j >= FLAT && i < N - FLAT && j < N - FLAT;
    for (let dj = -FLAT, k = 0; dj <= FLAT; dj++) for (let di = -FLAT; di <= FLAT; di++, k++) win[k] = inner ? c + dj * N + di : offset(c, di, dj);
    return win;
  };
  /** The smoothed share of c's own holder over its window, a byte: 255 when the window is all hers. */
  const share = (c: number) => {
    const o = cells[c * 4], w = windowOf(c);
    let s = 0, flat = true;
    for (let k = 0; k < w.length; k++) {
      if (cells[w[k] * 4] === o) s += SMOOTH[k];
      else flat = false;
    }
    return flat ? 255 : Math.min(254, Math.round(Math.max(s, MIN_SHARE) * 255));
  };
  /** Lists the cells within FLAT of c not yet listed for this change; returns the new count. */
  const listWindow = (c: number, e: number, n: number, out: Int32Array) => {
    for (const x of windowOf(c)) {
      if (mark[x] === e) mark[x] = e + 1;
      else if (mark[x] !== e + 1 && mark[x] !== e + 2) mark[x] = e + 2;
      else continue;
      out[n++] = x;
    }
    return n;
  };
  const boundary = (c: number, e: number) => {
    for (const x of around(c)) if (mark[x] !== e && mark[x] !== e + 1) return true;
    return false;
  };

  /** The whole grid at once (a match's start), with no fronts. */
  function load(owner: Readonly<Uint8Array>) {
    let n = 0;
    settling.length = 0;
    for (let k = 0; k < dirtyCount; k++) isDirty[dirty[k]] = 0;
    dirtyCount = 0;
    reveal.fill(-1e6);
    for (let c = 0; c < CELLS; c++) {
      cells[c * 4] = cells[c * 4 + 1] = owner[c];
      cells[c * 4 + 2] = cells[c * 4 + 3] = 255;
      if (owner[c]) list[n++] = c;
    }
    const e = ++epoch * 3;
    let m = 0;
    for (let k = 0; k < n; k++) m = listWindow(list[k], e, m, queue);
    for (let k = 0; k < m; k++) cells[queue[k] * 4 + 2] = cells[queue[k] * 4 + 3] = share(queue[k]);
    gpuReveal.fill(-1e6);
    for (let c = 0; c < CELLS; c++) gpuCells[slotOf(c)] = words[c];
    for (const [c, slots] of APRON) for (const s of slots) gpuCells[s] = words[c];
  }

  /** Cells go to `owner` at `t0`, the front spreading from `from` (or in from the changed water's edge). */
  function change({ cells: changed, owner, time, from }: Shift) {
    if (!changed.length) return;
    let t0 = time;
    const e = ++epoch * 3;
    for (const c of changed) mark[c] = e;
    // the changed water's edge (a drain's sources too), and every cell within FLAT of it, either side
    let nbCount = 0, nl = 0;
    for (const c of changed) {
      if (!boundary(c, e)) continue;
      queue[nbCount++] = c;
      nl = listWindow(c, e, nl, list);
    }
    for (const c of changed) {
      cells[c * 4 + 1] = cells[c * 4];
      cells[c * 4 + 3] = cells[c * 4 + 2];
      cells[c * 4] = owner;
      cells[c * 4 + 2] = 255;
      touch(c);
    }
    for (let k = 0; k < nl; k++) {
      const c = list[k];
      if (mark[c] !== e + 2) continue;
      cells[c * 4 + 1] = cells[c * 4];
      cells[c * 4 + 3] = cells[c * 4 + 2];
      reveal[c] = Math.max(reveal[c], t0);
      touch(c);
    }
    for (let k = 0; k < nl; k++) cells[list[k] * 4 + 2] = share(list[k]);

    // the front: breadth first through the changed water, four- and eight-way by turns
    const inside = (x: number) => mark[x] === e || mark[x] === e + 1;
    let head = 0, tail = 0;
    if (from) {
      for (const c of from) {
        if (!inside(c) || seen[c] === e) continue;
        seen[c] = e;
        reveal[c] = 0;
        queue[tail++] = c;
      }
    }
    if (tail === 0) {
      for (let k = 0; k < nbCount; k++) {
        seen[queue[k]] = e;
        reveal[queue[k]] = 0;
      }
      tail = nbCount;
    }
    let layer = 0;
    while (head < tail) {
      const stop = tail, steps = ++layer & 1 ? 4 : 8;
      for (; head < stop; head++) {
        const n = around(queue[head]);
        for (let s = 0; s < steps; s++) {
          const x = n[s];
          if (!inside(x) || seen[x] === e) continue;
          seen[x] = e;
          reveal[x] = layer;
          queue[tail++] = x;
        }
      }
    }
    // twice a 3 × 3 average, to round off the spread's octagonal facets
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < tail; k++) {
        const c = queue[k];
        let sum = reveal[c], n = 1;
        for (const x of around(c)) {
          if (seen[x] !== e) continue;
          sum += reveal[x];
          n++;
        }
        reveal[c] = sum / n;
      }
    }
    const far = Math.max(1, layer - 1);
    // a flood races in from the loop; a sunk ship's water drains from its edge a beat after she goes down
    const span = owner ? Math.min(3.2, 0.7 + far * 0.022) : Math.min(2.8, 1.6 + far * 0.015);
    if (!owner) t0 += 0.3;
    for (const c of changed) reveal[c] = t0 + (span * (seen[c] === e ? reveal[c] : far)) / far;
    const all = new Int32Array(changed.length + nl);
    all.set(changed);
    all.set(list.subarray(0, nl), changed.length);
    settling.push({ until: t0 + span + HOLD, cells: all });
  }

  /** Cells whose fronts have long passed forget who held them before: one read settles them again. */
  function settle(now: number) {
    while (settling.length && settling[0].until <= now) {
      for (const c of settling.shift()!.cells) {
        if (reveal[c] > now - HOLD) continue;
        cells[c * 4 + 1] = cells[c * 4];
        cells[c * 4 + 3] = cells[c * 4 + 2];
        touch(c);
      }
    }
  }

  /** Copies the cells touched into the GPU's words; returns each face's range of words changed ([start, end) or
   *  empty), apron copies included. */
  function flush(): [number, number][] {
    const lo = new Array<number>(6).fill(WORDS), hi = new Array<number>(6).fill(-1);
    const put = (s: number, c: number) => {
      gpuCells[s] = words[c];
      gpuReveal[s] = reveal[c];
      const f = Math.floor(s / TILE);
      lo[f] = Math.min(lo[f], s);
      hi[f] = Math.max(hi[f], s);
    };
    for (let k = 0; k < dirtyCount; k++) {
      const c = dirty[k];
      isDirty[c] = 0;
      put(slotOf(c), c);
      const extra = APRON.get(c);
      if (extra) for (const s of extra) put(s, c);
    }
    dirtyCount = 0;
    return lo.map((l, f): [number, number] => (hi[f] < 0 ? [0, 0] : [l, hi[f] + 1]));
  }

  return {
    gpuCells, gpuReveal, load, change, settle, flush,
    /** Who holds cell c now (0 open sea, else id + 1). */
    ownerOf: (c: number) => cells[c * 4],
  };
}

export type Claimed = ReturnType<typeof createClaimed>;
