import type { Sea } from '../snapshot.ts';
import {
  CELLS,
  N,
  cellOf,
  columnOf,
  faceOf,
  rowOf,
  wrapped,
  type ReadCells,
} from '../world/cells.ts';
import { createCursor } from './cursor.ts';
import { createShares } from './shares.ts';

export const HOLD = 8;
export const SIDE = N + 2;
const TILE = SIDE * SIDE;
export const WORDS = 6 * TILE;

const slotOf = (c: number) =>
  faceOf(c) * TILE + (rowOf(c) + 1) * SIDE + columnOf(c) + 1;
const APRON = new Map<number, number[]>();
for (let f = 0; f < 6; f++) {
  for (let k = -1; k <= N; k++) {
    for (const [i, j] of [
      [k, -1],
      [k, N],
      [-1, k],
      [N, k],
    ] as const) {
      const c = wrapped(f, i, j),
        list = APRON.get(c) ?? [];
      const slot = f * TILE + (j + 1) * SIDE + i + 1;
      if (!list.includes(slot)) list.push(slot);
      APRON.set(c, list);
    }
  }
}

interface Shift {
  cells: ReadCells;
  owner: number | Uint8Array;
  time: number;
  from: ReadCells | null;
}

const SLICE = 1 << 11;
export const SLICES = 30;

const EMPTY = new Uint8Array(CELLS);

export function createClaimed(slices = SLICES) {
  const cells = new Uint8Array(CELLS * 4);
  const words = new Uint32Array(cells.buffer);
  const reveal = new Float32Array(CELLS).fill(-1e6);
  const gpuCells = new Uint32Array(WORDS),
    gpuReveal = new Float32Array(WORDS).fill(-1e6);
  const shares = createShares(cells);
  const mark = new Int32Array(CELLS),
    seen = new Int32Array(CELLS),
    list = new Int32Array(CELLS),
    queue = new Int32Array(CELLS);
  const dirty = new Int32Array(CELLS),
    isDirty = new Uint8Array(CELLS);
  let dirtyCount = 0,
    epoch = 0;
  const settling: { until: number; cells: Int32Array }[] = [];
  let settled = 0;
  const pending: Shift[] = [];
  let job: Generator<void, void, void> | null = null,
    now = 0;
  let used = 0;

  const touch = (c: number) => {
    if (isDirty[c]) return;
    isDirty[c] = 1;
    dirty[dirtyCount++] = c;
  };
  const { around, windowOf } = shares;
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
    for (const x of around(c))
      if (mark[x] !== e && mark[x] !== e + 1) return true;
    return false;
  };

  let spent = 0;
  const tick = (n: number) => {
    if ((spent += n) < SLICE) return false;
    spent = 0;
    return true;
  };
  let whole = false;

  function* loading(owner: ReadCells): Generator<void, void, void> {
    let n = 0;
    for (let c = 0; c < CELLS; c++) {
      cells[c * 4] = cells[c * 4 + 1] = owner[c];
      cells[c * 4 + 2] = cells[c * 4 + 3] = 255;
      shares.whole(c);
      reveal[c] = -1e6;
      if (owner[c]) list[n++] = c;
      if (tick(1 / 4)) yield;
    }
    const e = ++epoch * 3;
    let m = 0;
    for (let k = 0; k < n; k++) {
      m = listWindow(list[k], e, m, queue);
      if (tick(16)) yield;
    }
    for (let k = 0; k < m; k++) {
      cells[queue[k] * 4 + 2] = cells[queue[k] * 4 + 3] = shares.count(
        queue[k]
      );
      if (tick(32)) yield;
    }
    gpuReveal.fill(-1e6);
    for (let c = 0; c < CELLS; c++) {
      gpuCells[slotOf(c)] = words[c];
      if (tick(1 / 4)) yield;
    }
    for (const [c, slots] of APRON)
      for (const s of slots) gpuCells[s] = words[c];
    whole = true;
  }
  function load(owner: ReadCells) {
    [settling.length, settled, pending.length] = [0, 0, 0];
    for (let k = 0; k < dirtyCount; k++) isDirty[dirty[k]] = 0;
    dirtyCount = 0;
    job = loading(owner);
  }

  function* changing({
    cells: changed,
    owner,
    time,
    from,
  }: Shift): Generator<void, void, void> {
    if (!changed.length) return;
    const e = ++epoch * 3;
    for (let k = 0; k < changed.length; k++) mark[changed[k]] = e;
    let nbCount = 0,
      nl = 0;
    for (let k = 0; k < changed.length; k++) {
      const c = changed[k];
      if (boundary(c, e)) {
        queue[nbCount++] = c;
        nl = listWindow(c, e, nl, list);
      }
      if (tick(1)) yield;
    }
    const inside = (x: number) => mark[x] === e || mark[x] === e + 1;
    for (let k = 0; k < changed.length; k++) {
      const c = changed[k],
        was = cells[c * 4],
        to = typeof owner === 'number' ? owner : owner[k];
      cells[c * 4 + 1] = was;
      cells[c * 4 + 3] = cells[c * 4 + 2];
      const near = mark[c] === e + 1 && was !== to;
      if (near) shares.spread(c, was, to, inside);
      cells[c * 4] = to;
      cells[c * 4 + 2] = 255;
      shares.whole(c);
      touch(c);
      if (tick(near ? 8 : 1)) yield;
    }
    for (let k = 0; k < nl; k++) {
      const c = list[k];
      if (mark[c] !== e + 2) continue;
      cells[c * 4 + 1] = cells[c * 4];
      cells[c * 4 + 3] = cells[c * 4 + 2];
      touch(c);
    }
    for (let k = 0; k < nl; k++) {
      const x = list[k],
        again = inside(x) || shares.edged(x);
      cells[x * 4 + 2] = again ? shares.count(x) : shares.kept(x);
      if (tick(again ? 8 : 1)) yield;
    }

    let head = 0,
      tail = 0;
    if (from) {
      for (let k = 0; k < from.length; k++) {
        const c = from[k];
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
      const stop = tail,
        steps = ++layer & 1 ? 4 : 8;
      for (; head < stop; head++) {
        const n = around(queue[head]);
        for (let s = 0; s < steps; s++) {
          const x = n[s];
          if (!inside(x) || seen[x] === e) continue;
          seen[x] = e;
          reveal[x] = layer;
          queue[tail++] = x;
        }
        if (tick(2)) yield;
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < tail; k++) {
        const c = queue[k];
        let sum = reveal[c],
          n = 1;
        for (const x of around(c)) {
          if (seen[x] !== e) continue;
          sum += reveal[x];
          n++;
        }
        reveal[c] = sum / n;
        if (tick(1)) yield;
      }
    }
    let t0 = Math.max(time, now);
    const far = Math.max(1, layer - 1);
    const span = owner
      ? Math.min(3.2, 0.7 + far * 0.022)
      : Math.min(2.8, 1.6 + far * 0.015);
    if (!owner) t0 += 0.3;
    for (let k = 0; k < nl; k++)
      if (mark[list[k]] === e + 2)
        reveal[list[k]] = Math.max(reveal[list[k]], t0);
    for (let k = 0; k < changed.length; k++) {
      const c = changed[k];
      reveal[c] = t0 + (span * (seen[c] === e ? reveal[c] : far)) / far;
      if (tick(1)) yield;
    }
    const all = new Int32Array(changed.length + nl);
    all.set(changed);
    all.set(list.subarray(0, nl), changed.length);
    settling.push({ until: t0 + span + HOLD, cells: all });
  }

  function settle(most: number): number {
    let n = 0;
    while (settling.length && settling[0].until <= now && n < most) {
      const s = settling[0].cells;
      for (; settled < s.length && n < most; settled++, n++) {
        const c = s[settled];
        if (reveal[c] > now - HOLD) continue;
        cells[c * 4 + 1] = cells[c * 4];
        cells[c * 4 + 3] = cells[c * 4 + 2];
        touch(c);
      }
      if (settled < s.length) break;
      settling.shift();
      settled = 0;
    }
    return n;
  }

  const lo = new Array<number>(6),
    hi = new Array<number>(6);
  const ranges = Array.from({ length: 6 }, (): [number, number] => [0, 0]);
  let left = 0;
  const spend = (slice: (most: number) => number) => {
    for (let n = SLICE; n === SLICE && left > 0; )
      if ((n = slice(SLICE)) > 0) left--;
  };
  const put = (s: number, c: number) => {
    gpuCells[s] = words[c];
    gpuReveal[s] = reveal[c];
    const f = Math.floor(s / TILE);
    lo[f] = Math.min(lo[f], s);
    hi[f] = Math.max(hi[f], s);
  };
  function flush(most: number): number {
    let n = 0;
    for (; dirtyCount > 0 && n < most; n++) {
      const c = dirty[--dirtyCount];
      isDirty[c] = 0;
      put(slotOf(c), c);
      const i = columnOf(c),
        j = rowOf(c);
      if (i === 0 || j === 0 || i === N - 1 || j === N - 1)
        for (const s of APRON.get(c) ?? []) put(s, c);
    }
    return n;
  }

  const painted: number[] = [],
    painters: number[] = [];
  let paintedAt = 0;
  const paint = () => {
    if (!painted.length) return;
    const cells = Int32Array.from(painted);
    pending.push({
      cells,
      owner: Uint8Array.from(painters),
      time: paintedAt,
      from: cells,
    });
    painted.length = painters.length = 0;
  };

  const cursor = createCursor();
  return {
    gpuCells,
    gpuReveal,
    follow(sea: Sea | undefined): boolean {
      const { fresh, missed, from } = cursor.read(sea);
      if (fresh || missed) {
        load(sea?.owner ?? EMPTY);
        return true;
      }
      if (!sea) return false;
      for (let i = from; i < sea.changes.length; i++) {
        const k = sea.changes[i];
        if (k.kind === 'paint') {
          for (let j = 0; j < k.cells.length; j++) {
            painted.push(k.cells[j]);
            painters.push(k.ship + 1);
          }
          paintedAt = k.time;
          continue;
        }
        paint();
        if (k.kind === 'claim') {
          const loop = k.cells;
          const from = Int32Array.from({ length: k.loop }, (_, j) => loop[j]);
          pending.push({
            cells: k.cells,
            owner: k.ship + 1,
            time: k.time,
            from,
          });
        } else if (k.kind === 'home') {
          pending.push({
            cells: k.cells,
            owner: k.ship + 1,
            time: k.time,
            from: Int32Array.of(cellOf(k.at)),
          });
        } else if (k.kind === 'drain') {
          pending.push({ cells: k.cells, owner: 0, time: k.time, from: null });
        }
      }
      paint();
      return false;
    },
    work(clock: number): readonly (readonly [start: number, end: number])[] {
      now = clock;
      lo.fill(WORDS);
      hi.fill(-1);
      left = slices;
      for (;;) {
        if (!job) spend(flush);
        if (left <= 0 || (!job && !pending.length)) break;
        job ??= changing(pending.shift()!);
        let done = false;
        while (!done && left > 0) {
          left--;
          done = !!job.next().done;
        }
        if (done) job = null;
      }
      if (!job) {
        spend(settle);
        spend(flush);
      }
      used = slices - left;
      for (let f = 0; f < 6; f++) {
        ranges[f][0] = whole ? f * TILE : hi[f] < 0 ? 0 : lo[f];
        ranges[f][1] = whole ? (f + 1) * TILE : hi[f] < 0 ? 0 : hi[f] + 1;
      }
      whole = false;
      return ranges;
    },
    used: () => used,
    idle: () => !job && !pending.length && dirtyCount === 0,
    ownerOf: (c: number) => cells[c * 4],
    shareAt: (c: number) => cells[c * 4 + 2],
  };
}
