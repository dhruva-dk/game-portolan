// The captains' ink as fields the sea's shader reads, worked out here when water changes hands and never between: the
// first Portolan's border and flood, baked on the CPU instead of every frame on the GPU.
//
// Borders are the 0.5 contour of each owner's share of the water, smoothed over a Gaussian window of cells and carried
// by a quadratic B-spline, so a staircase of cells becomes a clean curve without moving. Each cube face is a tile of two
// texels a cell inside a one-texel apron, and near a face's edge the neighbouring faces' lattices are blended in, so a
// border keeps its curve over the cube's edges and corners.
//
//   a  lower owner, higher owner, the field between them (0.5 on the border, 1 alone), the captain whose run is playing
//   b  the same pair and field as they stood before that run, and how far through the run the front gets here (0…1)
//   t  a trail: its captain (and in the top bits how it is going), distance from its line, its width, its run share
//
// Bytes throughout, so a flood or a trail going needs one clock in a uniform per captain and no upload while it plays.
import { GRID, TERRITORY, cellDir, cellOf, faceDir } from '../../sim/sphere.ts';
import { INK } from '../../sim/tables.ts';
import { v3, type V3 } from '../../sim/math.ts';

const N = GRID, NN = N * N, CELLS = 6 * NN;
/** Bake texels per face edge, and the face's tile with its one-texel apron. */
export const BN = 2 * N;
export const TILE = BN + 2;
const BYTES = TILE * TILE * 6 * 4;
/** Smoothing radius in cells; a cell owning this whole neighbourhood alone is flat (share byte 255). */
const FLAT = 3, WIN = 2 * FLAT + 1;
/** The lowest smoothed share a cell keeps of its own owner, so thin strips and single cells never vanish. */
const MIN_SHARE = 0.62;
/** Bake texels of distance a trail's field covers (t's second byte runs 0…1 over it). */
export const RANGE = 3.5;
/** A trail's width code, 1 (a hair) to 7 (the full line), scaled into its byte. */
export const WIDTH_SCALE = 36;
/** How a trail is going, in the top bits of t's first byte. */
export const GOING = { live: 0, absorbed: 1, broken: 2, dissolving: 3 } as const;
/** Seconds a flood takes (a cell of depth takes `perCell`), and a drain, after `delay`. */
const FLOOD = { min: 1, max: 2, perCell: 0.08 } as const;
const DRAIN = { min: 1.6, max: 2.8, perCell: 0.015, delay: 0.3 } as const;
/** How long a run's previous water stays on record past its end, seconds. */
const HOLD = 2.5;

const SMOOTH = new Float32Array(WIN * WIN);
{
  let sum = 0;
  for (let k = 0; k < WIN * WIN; k++) {
    const i = (k % WIN) - FLAT, j = Math.floor(k / WIN) - FLAT;
    sum += SMOOTH[k] = Math.exp(-(i * i + j * j) / (2 * 1.15 * 1.15));
  }
  for (let k = 0; k < WIN * WIN; k++) SMOOTH[k] /= sum;
}
const NBI = [1, -1, 0, 0, 1, -1, 1, -1], NBJ = [0, 0, 1, -1, 1, 1, -1, -1];

const D = v3(), E = v3(), P0 = v3(), SA = v3(), SB = v3();

/** A claim's flood or a sunk ship's drain to play, for cells that changed hands this reading. */
export interface InkRun {
  ship: number;
  kind: 'claim' | 'freed';
  /** Where a flood starts: the closed loop's cells. A drain starts from its edges. */
  from: readonly number[];
}

/** A region of a texture's face that has changed, in tile texels. */
export interface InkRect {
  tex: 'a' | 'b' | 't';
  face: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Per face, a rectangle of cells (empty when hi < 0). */
interface Box {
  lo: Int32Array;
  hi: Int32Array;
  left: Int32Array;
  right: Int32Array;
}

const box = (): Box => ({ lo: new Int32Array(6).fill(N), hi: new Int32Array(6).fill(-1), left: new Int32Array(6).fill(N), right: new Int32Array(6).fill(-1) });

interface Stamped {
  /** Bytes offsets into t, and which sample of the trail stamped each. */
  at: number[];
  k: number[];
  /** Per face, x0, y0, x1, y1 (empty when x1 < x0): the texels not yet sent, and all it covers. */
  rect: Int32Array;
  all: Int32Array;
}

const noRect = () => Int32Array.from({ length: 24 }, (_, i) => (i % 4 < 2 ? TILE : -1));
const stamped = (): Stamped => ({ at: [], k: [], rect: noRect(), all: noRect() });

function wrapped(f: number, x: number, y: number): number {
  return cellOf(TERRITORY, faceDir(f, ((x + 0.5) / N) * 2 - 1, ((y + 0.5) / N) * 2 - 1, D));
}

/** The cell (di, dj) from c; past a face's edge the step carries on over the neighbouring face. */
function offset(c: number, di: number, dj: number): number {
  const f = Math.floor(c / NN), r = c - f * NN, j = Math.floor(r / N), i = r - j * N, x = i + di, y = j + dj;
  return x >= 0 && x < N && y >= 0 && y < N ? c + dj * N + di : wrapped(f, x, y);
}

/** The faces across a face's edges: toward −u, +u, −v, +v. */
const ACROSS = Array.from({ length: 6 }, (_, f) => [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([u, v]) => {
  faceDir(f, u * 1.4, v * 1.4, E);
  return Math.floor(cellOf(TERRITORY, E) / NN);
}));

/** `p`'s equal-angle place in face `f`'s coordinates, whichever face it lies on. */
export function placeIn(f: number, p: V3, out: { u: number; v: number }): void {
  let gu: number, gv: number, m: number;
  switch (f) {
    case 0: gu = -p.z; gv = p.y; m = p.x; break;
    case 1: gu = p.z; gv = p.y; m = -p.x; break;
    case 2: gu = p.x; gv = -p.z; m = p.y; break;
    case 3: gu = p.x; gv = p.z; m = -p.y; break;
    case 4: gu = p.x; gv = p.y; m = p.z; break;
    default: gu = -p.x; gv = p.y; m = -p.z;
  }
  out.u = Math.atan2(gu, m) * (4 / Math.PI);
  out.v = Math.atan2(gv, m) * (4 / Math.PI);
}

const smooth01 = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** The owners met in a lattice's stencil: up to three, each with its surplus over `base`. */
class Gather {
  id = [-1, -1, -1];
  e = [0, 0, 0];
  base = 0;
  reset(pair?: readonly [number, number]): void {
    this.id[0] = pair ? pair[0] : -1;
    this.id[1] = pair ? (pair[0] === pair[1] ? -2 : pair[1]) : -1;
    this.id[2] = pair ? -2 : -1;
    this.e[0] = this.e[1] = this.e[2] = 0;
    this.base = 0;
  }
  add(id: number, b: number, w: number): void {
    this.base += w * (1 - b);
    const c = w * (2 * b - 1);
    for (let s = 0; s < 3; s++) {
      if (id === this.id[s] || this.id[s] === -1) {
        this.id[s] = id;
        this.e[s] += c;
        return;
      }
    }
  }
  /** The two strongest owners, the lower index first; a lone owner stands twice. */
  pair(out: [number, number]): void {
    const { id, e, base } = this;
    const m = (s: number) => (id[s] < 0 ? -9 : base + e[s]);
    const a = m(1) > m(0) ? (m(2) > m(1) ? 2 : 1) : m(2) > m(0) ? 2 : 0;
    const b0 = a === 0 ? (m(2) > m(1) ? 2 : 1) : a === 1 ? (m(2) > m(0) ? 2 : 0) : m(1) > m(0) ? 1 : 0;
    const b = id[b0] < 0 ? a : b0;
    out[0] = Math.min(id[a], id[b]);
    out[1] = Math.max(id[a], id[b]);
  }
  /** The field toward pair[0] against pair[1], −1…1; a lone owner is measured against everyone else. */
  field(pair: readonly [number, number]): number {
    const { id, e, base } = this;
    const of = (o: number) => (id[0] === o ? e[0] : id[1] === o ? e[1] : e[2]);
    return pair[0] === pair[1] ? 2 * (base + of(pair[0])) - 1 : of(pair[0]) - of(pair[1]);
  }
}

const GATHER = new Gather(), PAIR: [number, number] = [0, 0], PLACE = { u: 0, v: 0 }, PLACE0 = { u: 0, v: 0 };
const WU = new Float64Array(3), WV = new Float64Array(3);

export class InkField {
  readonly a = new Uint8Array(BYTES);
  readonly b = new Uint8Array(BYTES);
  readonly t = new Uint8Array(BYTES);
  /** What has changed since the last time it was read. */
  readonly rects: InkRect[] = [];

  readonly #owner = new Uint8Array(CELLS);
  readonly #share = new Uint8Array(CELLS).fill(255);
  /** Per cell: the captain + 1 whose run is playing there, and how far through it the front arrives. */
  readonly #run = new Uint8Array(CELLS);
  readonly #front = new Float32Array(CELLS);
  readonly #mark = new Int32Array(CELLS);
  readonly #seen = new Int32Array(CELLS);
  readonly #list = new Int32Array(CELLS);
  readonly #queue = new Int32Array(CELLS);
  readonly #changed = new Int32Array(CELLS);
  readonly #was = new Uint8Array(CELLS);
  #epoch = 0;
  /** Boxes of the runs still playing, by captain + 1, and when each is done with. */
  readonly #playing: ({ box: Box; until: number } | null)[] = Array.from({ length: 32 }, () => null);

  readonly #live: Stamped[] = Array.from({ length: 32 }, stamped);
  readonly #ghost: Stamped[] = Array.from({ length: 32 }, stamped);
  /** Per captain + 1: how many cells of their trail are stamped, and the first of them. */
  readonly #laid = new Int32Array(32);
  readonly #first = new Int32Array(32).fill(-1);

  constructor() {
    this.reset();
  }

  /** Open water everywhere and no trails, the whole of every texture to be sent again. */
  reset(): void {
    const { a, t } = this;
    const b = this.b;
    for (let o = 0; o < BYTES; o += 4) {
      a[o] = a[o + 1] = a[o + 3] = 0;
      a[o + 2] = 255;
      b[o] = b[o + 1] = b[o + 3] = 0;
      b[o + 2] = 255;
      t[o] = t[o + 2] = t[o + 3] = 0;
      t[o + 1] = 255;
    }
    this.#owner.fill(0);
    this.#share.fill(255);
    this.#run.fill(0);
    this.#front.fill(0);
    this.#playing.fill(null);
    this.#laid.fill(0);
    this.#first.fill(-1);
    for (let i = 0; i < 32; i++) {
      this.#live[i] = stamped();
      this.#ghost[i] = stamped();
    }
    this.rects.length = 0;
    for (const tex of ['a', 'b', 't'] as const) for (let face = 0; face < 6; face++) this.rects.push({ tex, face, x: 0, y: 0, w: TILE, h: TILE });
  }

  // ---------------------------------------------------------------- who holds what

  /**
   * Brings the fields up to `owner`. Water that changed hands under a run floods or drains along a front; any other
   * change simply shows. Returns each run's seconds and the delay before it starts, in the order given.
   */
  update(owner: Uint8Array, runs: readonly InkRun[], time: number): { len: number; delay: number }[] {
    for (const r of runs) this.#finish(r.ship + 1);
    const own = this.#owner, changed = this.#changed, was = this.#was, mark = this.#mark, list = this.#list;
    const e = ++this.#epoch * 3;
    let n = 0;
    for (let c = 0; c < CELLS; c++) {
      if (own[c] === owner[c]) continue;
      was[c] = own[c];
      own[c] = owner[c];
      mark[c] = e;
      changed[n++] = c;
    }
    const out: { len: number; delay: number }[] = [];
    if (n === 0) {
      for (let k = 0; k < runs.length; k++) out.push({ len: 1, delay: 0 });
      return out;
    }
    // a changed cell at the edge of its change, and every cell within reach of one: their shares depend on the change
    let nl = 0;
    for (let k = 0; k < n; k++) if (this.#edgeOf(changed[k], e)) nl = this.#listWindow(changed[k], e, nl, list);
    const touched = box();
    for (let k = 0; k < n; k++) {
      this.#share[changed[k]] = 255;
      this.#touch(changed[k], touched);
    }
    for (let k = 0; k < nl; k++) {
      this.#touch(list[k], touched);
    }
    for (let k = 0; k < nl; k++) this.#share[list[k]] = this.#shareOf(list[k]);

    for (const r of runs) out.push(this.#run_(r, n, e, time, touched));
    this.#bake(touched);
    return out;
  }

  /** The front of one run through the cells it changed: from the loop, or inward from the edges of what drains. */
  #run_(r: InkRun, n: number, e: number, time: number, touched: Box): { len: number; delay: number } {
    const mark = r.ship + 1, drain = r.kind === 'freed', changed = this.#changed, was = this.#was, own = this.#owner;
    const seen = this.#seen, q = this.#queue, front = this.#front, run = this.#run;
    const mine = (c: number) => (drain ? own[c] === 0 && was[c] === mark && this.#mark[c] >= e && this.#mark[c] <= e + 1 : own[c] === mark && this.#mark[c] >= e && this.#mark[c] <= e + 1);
    const se = this.#epoch * 3 + mark * 8;
    let tail = 0;
    if (!drain) {
      for (const c of r.from) {
        if (mine(c) && seen[c] !== se) {
          seen[c] = se;
          front[c] = 0;
          q[tail++] = c;
        }
      }
    }
    if (tail === 0) {
      // nothing of the loop itself is new water: start from the region's edges
      for (let k = 0; k < n; k++) {
        const c = changed[k];
        if (!mine(c) || seen[c] === se) continue;
        let edge = false;
        for (let s = 0; s < 8 && !edge; s++) edge = !mine(offset(c, NBI[s], NBJ[s]));
        if (edge) {
          seen[c] = se;
          front[c] = 0;
          q[tail++] = c;
        }
      }
    }
    // a walk out from the sources, four neighbours and eight in turn, for a front near enough round
    let head = 0, layer = 0;
    while (head < tail) {
      const stop = tail, steps = ++layer & 1 ? 4 : 8;
      for (; head < stop; head++) {
        const c = q[head];
        for (let s = 0; s < steps; s++) {
          const x = offset(c, NBI[s], NBJ[s]);
          if (mine(x) && seen[x] !== se) {
            seen[x] = se;
            front[x] = layer;
            q[tail++] = x;
          }
        }
      }
    }
    // the water round it reshapes as the front comes past: each cell there takes the front of the changed cell it adjoins
    for (let k = 0; k < tail; k++) {
      const c = q[k];
      for (let s = 0; s < 8; s++) {
        const x = offset(c, NBI[s], NBJ[s]);
        if (this.#mark[x] === e + 2 && run[x] === 0 && seen[x] !== se) {
          seen[x] = se;
          front[x] = front[c];
          q[tail++] = x;
        }
      }
    }
    // two passes of a 3×3 average take the corners off it
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < tail; k++) {
        const c = q[k];
        let sum = front[c], m = 1;
        for (let s = 0; s < 8; s++) {
          const x = offset(c, NBI[s], NBJ[s]);
          if (seen[x] === se) {
            sum += front[x];
            m++;
          }
        }
        front[c] = sum / m;
      }
    }
    const far = Math.max(1, layer - 1);
    for (let k = 0; k < tail; k++) {
      front[q[k]] = Math.min(1, front[q[k]] / far);
      run[q[k]] = mark;
    }
    const len = drain
      ? Math.min(DRAIN.max, DRAIN.min + far * DRAIN.perCell)
      : Math.min(FLOOD.max, Math.max(FLOOD.min, far * FLOOD.perCell));
    const delay = drain ? DRAIN.delay : 0;
    this.#playing[mark] = { box: { lo: touched.lo.slice(), hi: touched.hi.slice(), left: touched.left.slice(), right: touched.right.slice() }, until: time + delay + len + HOLD };
    return { len, delay };
  }

  /** Runs that have played out forget what the water was, so their texels settle back to costing one read. */
  settle(time: number): void {
    for (let m = 0; m < 32; m++) {
      const p = this.#playing[m];
      if (p && p.until <= time) this.#finish(m);
    }
  }

  #finish(mark: number): void {
    const p = this.#playing[mark];
    if (!p) return;
    this.#playing[mark] = null;
    const { lo, hi, left, right } = p.box, { a, b } = this, run = this.#run;
    for (let f = 0; f < 6; f++) {
      if (hi[f] < 0) continue;
      for (let j = lo[f]; j <= hi[f]; j++) {
        for (let i = left[f]; i <= right[f]; i++) {
          const c = f * NN + j * N + i;
          if (run[c] === mark) run[c] = 0;
        }
      }
      const x0 = Math.max(0, left[f] * 2 - 4), x1 = Math.min(TILE, right[f] * 2 + 8), y0 = Math.max(0, lo[f] * 2 - 4), y1 = Math.min(TILE, hi[f] * 2 + 8);
      for (let y = y0; y < y1; y++) {
        let o = ((f * TILE + y) * TILE + x0) * 4 + 3;
        for (let x = x0; x < x1; x++, o += 4) {
          if (a[o] !== mark) continue;
          a[o] = 0;
          // the water before a run is the water now once it has played
          b[o - 3] = a[o - 3];
          b[o - 2] = a[o - 2];
          b[o - 1] = a[o - 1];
          b[o] = 0;
        }
      }
      this.rects.push({ tex: 'a', face: f, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      this.rects.push({ tex: 'b', face: f, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }

  /** Whether a changed cell borders something other than its own new water. */
  #edgeOf(c: number, e: number): boolean {
    const m = this.#mark, own = this.#owner;
    for (let s = 0; s < 8; s++) {
      const x = offset(c, NBI[s], NBJ[s]);
      if ((m[x] !== e && m[x] !== e + 1) || own[x] !== own[c]) return true;
    }
    return false;
  }

  #listWindow(c: number, e: number, n: number, out: Int32Array): number {
    const m = this.#mark;
    for (let dj = -FLAT; dj <= FLAT; dj++) {
      for (let di = -FLAT; di <= FLAT; di++) {
        const x = offset(c, di, dj);
        if (m[x] === e) m[x] = e + 1;
        else if (m[x] !== e + 1 && m[x] !== e + 2) m[x] = e + 2;
        else continue;
        out[n++] = x;
      }
    }
    return n;
  }

  /** A cell's smoothed share of its own owner, as a byte; 255 for one that owns its whole window alone. */
  #shareOf(c: number): number {
    const own = this.#owner, o = own[c];
    let s = 0, flat = true;
    for (let dj = -FLAT, k = 0; dj <= FLAT; dj++) {
      for (let di = -FLAT; di <= FLAT; di++, k++) {
        if (own[offset(c, di, dj)] === o) s += SMOOTH[k];
        else flat = false;
      }
    }
    return flat ? 255 : Math.min(254, Math.round(Math.max(s, MIN_SHARE) * 255));
  }

  /** Counts a changed cell for baking; near a face's edge the neighbouring tile reads it too. */
  #touch(c: number, b: Box): void {
    this.#extend(c, b);
    const r = c % NN, j = Math.floor(r / N), i = r - j * N;
    if (i > 2 && j > 2 && i < N - 3 && j < N - 3) return;
    for (let s = 0; s < 8; s++) this.#extend(offset(c, NBI[s] * 3, NBJ[s] * 3), b);
  }

  #extend(c: number, b: Box): void {
    const f = Math.floor(c / NN), r = c - f * NN, j = Math.floor(r / N), i = r - j * N;
    if (j < b.lo[f]) b.lo[f] = j;
    if (j > b.hi[f]) b.hi[f] = j;
    if (i < b.left[f]) b.left[f] = i;
    if (i > b.right[f]) b.right[f] = i;
  }

  // ---------------------------------------------------------------- the bake

  #bake({ lo, hi, left, right }: Box): void {
    const m = 5;
    for (let f = 0; f < 6; f++) {
      if (hi[f] < 0) continue;
      const x0 = Math.max(0, left[f] * 2 + 1 - m), x1 = Math.min(TILE, right[f] * 2 + 3 + m);
      const y0 = Math.max(0, lo[f] * 2 + 1 - m), y1 = Math.min(TILE, hi[f] * 2 + 3 + m);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.#bakeTexel(f, x, y);
      this.rects.push({ tex: 'a', face: f, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      this.rects.push({ tex: 'b', face: f, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }

  #cell(f: number, cx: number, cy: number): number {
    return cx >= 0 && cy >= 0 && cx < N && cy < N ? f * NN + cy * N + cx : wrapped(f, Math.max(-1, Math.min(N, cx)), Math.max(-1, Math.min(N, cy)));
  }

  /** One face's lattice at (u, v): gathers every owner of the 3×3 cells round the nearest centre into GATHER. */
  #lattice(f: number, u: number, v: number): void {
    const px = (u + 1) * (N / 2) - 0.5, py = (v + 1) * (N / 2) - 0.5;
    const cx = Math.max(0, Math.min(N - 1, Math.floor(px + 0.5))), cy = Math.max(0, Math.min(N - 1, Math.floor(py + 0.5)));
    const fx = px - cx, fy = py - cy;
    WU[0] = 0.5 * (0.5 - fx) * (0.5 - fx); WU[1] = 0.75 - fx * fx; WU[2] = 0.5 * (0.5 + fx) * (0.5 + fx);
    WV[0] = 0.5 * (0.5 - fy) * (0.5 - fy); WV[1] = 0.75 - fy * fy; WV[2] = 0.5 * (0.5 + fy) * (0.5 + fy);
    const own = this.#owner, share = this.#share;
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const c = this.#cell(f, cx + i - 1, cy + j - 1);
        GATHER.add(own[c], share[c] / 255, WU[i] * WV[j]);
      }
    }
  }

  #bakeTexel(f: number, x: number, y: number): void {
    const o = ((f * TILE + y) * TILE + x) * 4, { a, b } = this;
    const u = (x - 0.5) * (2 / BN) - 1, v = (y - 0.5) * (2 / BN) - 1;
    const cx = Math.max(0, Math.min(N - 1, Math.floor((u + 1) * (N / 2)))), cy = Math.max(0, Math.min(N - 1, Math.floor((v + 1) * (N / 2))));
    const c0 = f * NN + cy * N + cx;
    // a box round a change holds water it did not touch, and perhaps another captain's flood still playing
    if (cx > 1 && cy > 1 && cx < N - 2 && cy < N - 2 && !this.#fresh(c0)) return;
    const run = this.#runNear(c0);
    if (run) {
      // what the water was until the front arrives
      b[o] = a[o];
      b[o + 1] = a[o + 1];
      b[o + 2] = a[o + 2];
      b[o + 3] = Math.round(this.#frontAt(f, u, v) * 255);
    }
    a[o + 3] = run;
    if (this.#share[c0] === 255 && cx > 0 && cy > 0 && cx < N - 1 && cy < N - 1) {
      a[o] = a[o + 1] = this.#owner[c0];
      a[o + 2] = 255;
    } else {
      this.#blend(f, u, v, o);
    }
    if (!run) {
      b[o] = a[o];
      b[o + 1] = a[o + 1];
      b[o + 2] = a[o + 2];
      b[o + 3] = 0;
    }
  }

  /** The field at one texel from its own face's lattice, and near an edge the lattices of the faces across it. */
  #blend(f: number, u: number, v: number, o: number): void {
    const a = this.a;
    // near an edge the faces across it are blended in, with weights that are a smooth partition of unity
    const p = faceDir(f, u, v, P0);
    const m0 = (1 - Math.abs(u)) * (N / 2), m1 = (1 - Math.abs(v)) * (N / 2);
    GATHER.reset();
    this.#lattice(f, u, v);
    GATHER.pair(PAIR);
    let field = 0, sum = 0;
    const weigh = (g: number, gu: number, gv: number) => {
      const h = smooth01((1 - Math.abs(gu)) * (N / 2) + 0.5) * smooth01((1 - Math.abs(gv)) * (N / 2) + 0.5);
      if (g !== f) {
        GATHER.reset(PAIR);
        this.#lattice(g, gu, gv);
      }
      field += GATHER.field(PAIR) * h;
      sum += h;
    };
    weigh(f, u, v);
    if (m0 < 0.5) {
      const g = ACROSS[f][u < 0 ? 0 : 1];
      placeIn(g, p, PLACE);
      weigh(g, PLACE.u, PLACE.v);
    }
    if (m1 < 0.5) {
      const g = ACROSS[f][v < 0 ? 2 : 3];
      placeIn(g, p, PLACE0);
      weigh(g, PLACE0.u, PLACE0.v);
    }
    a[o] = PAIR[0];
    a[o + 1] = PAIR[1];
    a[o + 2] = Math.round((field / sum) * 127.5 + 127.5);
  }

  /** Whether this reading changed the 3×3 cells round an interior c0, or the shares they hold. */
  #fresh(c0: number): boolean {
    const m = this.#mark, e = this.#epoch * 3;
    for (let j = -N; j <= N; j += N) for (let i = -1; i <= 1; i++) if (m[c0 + j + i] >= e) return true;
    return false;
  }

  /** The captain + 1 whose run reaches the 3×3 cells round c0, 0 for none. */
  #runNear(c0: number): number {
    const run = this.#run;
    if (run[c0]) return run[c0];
    const i = c0 & (N - 1), j = (c0 >> 8) & (N - 1);
    if (i === 0 || j === 0 || i === N - 1 || j === N - 1) {
      for (let s = 0; s < 8; s++) {
        const r = run[offset(c0, NBI[s], NBJ[s])];
        if (r) return r;
      }
      return 0;
    }
    for (let s = 0; s < 8; s++) {
      const r = run[c0 + NBJ[s] * N + NBI[s]];
      if (r) return r;
    }
    return 0;
  }

  /** How far through its run the front reaches this point, over the same stencil as the field. */
  #frontAt(f: number, u: number, v: number): number {
    const px = (u + 1) * (N / 2) - 0.5, py = (v + 1) * (N / 2) - 0.5;
    const cx = Math.max(0, Math.min(N - 1, Math.floor(px + 0.5))), cy = Math.max(0, Math.min(N - 1, Math.floor(py + 0.5)));
    const fx = px - cx, fy = py - cy;
    const wu = [0.5 * (0.5 - fx) * (0.5 - fx), 0.75 - fx * fx, 0.5 * (0.5 + fx) * (0.5 + fx)];
    const wv = [0.5 * (0.5 - fy) * (0.5 - fy), 0.75 - fy * fy, 0.5 * (0.5 + fy) * (0.5 + fy)];
    let s = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) s += wu[i] * wv[j] * this.#front[this.#cell(f, cx + i - 1, cy + j - 1)];
    return Math.max(0, Math.min(1, s));
  }

  // ---------------------------------------------------------------- trails

  /** Stamps what is new of each trail; a trail that has gone without its going being played is taken up. */
  trails(laid: readonly (readonly number[])[]): void {
    for (let s = 0; s < laid.length; s++) {
      const mark = s + 1, cells = laid[s];
      if (cells.length < this.#laid[mark] || (cells.length > 0 && cells[0] !== this.#first[mark] && this.#laid[mark] > 0)) this.#wipe(this.#live, mark);
      if (cells.length === 0) continue;
      this.#first[mark] = cells[0];
      for (let k = Math.max(1, this.#laid[mark]); k < cells.length; k++) this.#segment(mark, cells, k);
      this.#send(this.#live[mark].rect, true);
      this.#laid[mark] = cells.length;
    }
  }

  #wipe(list: Stamped[], mark: number): void {
    const l = list[mark], t = this.t;
    if (list === this.#live) {
      this.#laid[mark] = 0;
      this.#first[mark] = -1;
    }
    const live = list === this.#live;
    for (const o of l.at) {
      // only what is still this captain's and still in this state: another trail may have been laid over it since
      if ((t[o] & 31) !== mark || (t[o] >> 5 === 0) !== live) continue;
      t[o] = t[o + 2] = t[o + 3] = 0;
      t[o + 1] = 255;
    }
    this.#send(l.all, false);
    list[mark] = stamped();
  }

  /** A trail's whole line goes as `going`: `from` is the sample it goes from (−1: all at once). */
  go(ship: number, going: number, from: number): void {
    const mark = ship + 1, l = this.#live[mark];
    if (l.at.length === 0) return;
    this.#wipe(this.#ghost, mark);
    this.#live[mark] = stamped();
    this.#ghost[mark] = l;
    this.#laid[mark] = 0;
    this.#first[mark] = -1;
    const t = this.t;
    let last = 0;
    for (const k of l.k) last = Math.max(last, k);
    const at = from < 0 ? 0 : Math.min(from, last), far = Math.max(1, at, last - at);
    for (let n = 0; n < l.at.length; n++) {
      const o = l.at[n];
      if (t[o] !== mark) continue;
      t[o] = mark | (going << 5);
      t[o + 3] = from < 0 ? 0 : 1 + Math.round((254 * Math.abs(l.k[n] - at)) / far);
    }
    this.#send(l.all, false);
  }

  /** Takes up what was left of a trail after its going has played. */
  gone(ship: number): void {
    this.#wipe(this.#ghost, ship + 1);
  }

  /** Where sample k of a trail lies: its cell, eased back over the cells before it, so the staircase becomes a curve. */
  #sample(cells: readonly number[], k: number, out: V3): void {
    let x = 0, y = 0, z = 0;
    const from = Math.max(0, k - 3);
    for (let i = from; i <= k; i++) {
      cellDir(TERRITORY, cells[i], E);
      x += E.x; y += E.y; z += E.z;
    }
    const l = Math.hypot(x, y, z);
    out.x = x / l; out.y = y / l; out.z = z / l;
  }

  #segment(mark: number, cells: readonly number[], k: number): void {
    const A = SA, B = SB;
    this.#sample(cells, k - 1, A);
    this.#sample(cells, k, B);
    // the ink runs dry along the trail: full at the water it left, a hair by the time it gives out
    const width = Math.max(1, Math.round(7 * (1 - k / INK.trail)));
    const reach = (RANGE + 1) * (2 / BN);
    for (let f = 0; f < 6; f++) {
      placeIn(f, A, PLACE);
      placeIn(f, B, PLACE0);
      if (Math.abs(PLACE.u) > 1 + reach || Math.abs(PLACE.v) > 1 + reach || Math.abs(PLACE0.u) > 1 + reach || Math.abs(PLACE0.v) > 1 + reach) continue;
      const ax = (PLACE.u + 1) * (BN / 2) + 0.5, ay = (PLACE.v + 1) * (BN / 2) + 0.5, bx = (PLACE0.u + 1) * (BN / 2) + 0.5, by = (PLACE0.v + 1) * (BN / 2) + 0.5;
      this.#stamp(mark, f, ax, ay, bx, by, width, k);
    }
  }

  #stamp(mark: number, f: number, ax: number, ay: number, bx: number, by: number, width: number, k: number): void {
    const t = this.t, l = this.#live[mark], dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - RANGE)), x1 = Math.min(TILE - 1, Math.ceil(Math.max(ax, bx) + RANGE));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - RANGE)), y1 = Math.min(TILE - 1, Math.ceil(Math.max(ay, by) + RANGE));
    if (x1 < x0 || y1 < y0) return;
    const e = f * 4;
    for (const r of [l.rect, l.all]) {
      if (x0 < r[e]) r[e] = x0;
      if (y0 < r[e + 1]) r[e + 1] = y0;
      if (x1 > r[e + 2]) r[e + 2] = x1;
      if (y1 > r[e + 3]) r[e + 3] = y1;
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const s = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
        const ex = x - (ax + dx * s), ey = y - (ay + dy * s), d = Math.hypot(ex, ey);
        if (d >= RANGE) continue;
        const o = ((f * TILE + y) * TILE + x) * 4, byte = Math.round((d / RANGE) * 255);
        // nearest line wins, so two trails crossing each keep their line up to the crossing
        if ((t[o] === mark || (t[o] !== 0 && t[o] >> 5 === 0)) && byte >= t[o + 1]) continue;
        if (t[o] !== mark) {
          l.at.push(o);
          l.k.push(k);
        }
        t[o] = mark;
        t[o + 1] = byte;
        t[o + 2] = width * WIDTH_SCALE;
        t[o + 3] = 0;
      }
    }
  }

  /** Queues a rectangle of the trails' texture for sending, and spends it if it is the running one. */
  #send(r: Int32Array, spend: boolean): void {
    for (let f = 0; f < 6; f++) {
      const e = f * 4;
      if (r[e + 2] < r[e]) continue;
      this.rects.push({ tex: 't', face: f, x: r[e], y: r[e + 1], w: r[e + 2] - r[e] + 1, h: r[e + 3] - r[e + 1] + 1 });
      if (spend) {
        r[e] = r[e + 1] = TILE;
        r[e + 2] = r[e + 3] = -1;
      }
    }
  }
}
