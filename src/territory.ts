// Ink on the chart. Every captain lands into home waters; sailing out of them lays a trail, and sailing back in closes
// the loop and claims every cell it fenced, islands and all. Cross a rival's trail and it snaps, and the hull behind it
// takes the blow. The storm washes out what it swallows, and a sunk ship's sea goes blank.
import { ARCH, PLACES } from './world.ts';

/** The grid the ink lives on: square cells over the sailable sea. */
export const INK = { half: 600, cell: 4, n: 300 } as const;
const N = INK.n, CELLS = N * N;
/** Home waters inked on landing, in metres. */
export const HOME_R = 26;
/** What a snapped trail costs the hull that laid it, and what the cut pays. */
export const CUT = { dmg: 28, glimmer: 10 } as const;
/** A trail longer than this many cells runs dry: claims are short, deliberate loops, not tethers. */
export const TRAIL_MAX = 220;
/** Glimmer per claimed square metre, and per held square metre every ten seconds. */
const CLAIM_PAY = 1 / 220, RENT = 1 / 2600;

export type Perk = 'arch' | 'falls' | 'lagoon' | 'peak';
/** Landmarks: hold the water (or the island) they stand on and the perk is yours. */
export const LANDMARKS: { perk: Perk; x: number; z: number }[] = [
  { perk: 'arch', x: (ARCH.ax + ARCH.bx) / 2, z: (ARCH.az + ARCH.bz) / 2 },
  { perk: 'falls', x: PLACES[7].x, z: PLACES[7].z },
  { perk: 'lagoon', x: PLACES[0].x, z: PLACES[0].z },
  { perk: 'peak', x: PLACES[5].x, z: PLACES[5].z },
];
/** arch: reload time; falls: repair at home; lagoon: the gull's prices; peak: shot damage. */
export const PERK = { arch: 0.72, falls: 2, lagoon: 0.7, peak: 1.15 } as const;

/** Each captain's ink: yours gold, the rest spread round the colour wheel clear of it. */
export function inkColor(id: number, player: number): number {
  if (id === player) return 0xffc93c;
  const h = (0.13 + 0.12 + ((id * 0.618034) % 1) * 0.76) % 1, s = 0.72, l = 0.52;
  const f = (n: number) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

export type InkEvent =
  | { t: 'claim'; ship: number; cells: number; x: number; z: number; perk: Perk | null }
  | { t: 'cut'; victim: number; by: number; x: number; z: number }
  | { t: 'lost'; ship: number; perk: Perk };

interface Captain { laid: number[]; held: number; last: number; x0: number; x1: number; z0: number; z1: number; hx: number; hz: number; perks: number }

export class Territory {
  /** Who holds each cell: ship id + 1, or 0. */
  readonly owner = new Uint8Array(CELLS);
  /** Whose trail runs through each cell: ship id + 1, or 0. */
  readonly trail = new Uint8Array(CELLS);
  /** Bumped on every change, for whoever draws the ink. */
  version = 0;
  private readonly caps: Captain[] = [];
  private readonly marks = LANDMARKS.map((l) => this.cellAt(l.x, l.z));
  private readonly queue = new Int32Array(CELLS);
  private readonly seen = new Uint8Array(CELLS);
  private rentT = 0;

  constructor(ships: number) {
    for (let i = 0; i < ships; i++) this.caps.push({ laid: [], held: 0, last: -1, x0: N, x1: -1, z0: N, z1: -1, hx: 0, hz: 0, perks: 0 });
  }

  cellAt(x: number, z: number): number {
    const i = Math.floor((x + INK.half) / INK.cell), j = Math.floor((z + INK.half) / INK.cell);
    return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
  }

  /** The cell's centre, in metres. */
  centre(c: number): [number, number] {
    return [((c % N) + 0.5) * INK.cell - INK.half, (Math.floor(c / N) + 0.5) * INK.cell - INK.half];
  }

  held(id: number): number { return this.caps[id].held; }
  laid(id: number): number { return this.caps[id].laid.length; }
  home(id: number): [number, number] { return [this.caps[id].hx, this.caps[id].hz]; }
  /** Square metres held. */
  area(id: number): number { return this.caps[id].held * INK.cell * INK.cell; }
  has(id: number, perk: Perk): boolean { return (this.caps[id].perks & (1 << LANDMARKS.findIndex((l) => l.perk === perk))) !== 0; }
  perks(id: number): number { return this.caps[id].perks; }
  atHome(id: number, x: number, z: number): boolean { const c = this.cellAt(x, z); return c >= 0 && this.owner[c] === id + 1; }

  /** A circle of home water where a ship comes down. */
  inkHome(id: number, x: number, z: number): void {
    const cap = this.caps[id], r = HOME_R / INK.cell, ci = (x + INK.half) / INK.cell, cj = (z + INK.half) / INK.cell;
    for (let j = Math.floor(cj - r); j <= Math.ceil(cj + r); j++) for (let i = Math.floor(ci - r); i <= Math.ceil(ci + r); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N || (i + 0.5 - ci) ** 2 + (j + 0.5 - cj) ** 2 > r * r) continue;
      this.own(j * N + i, id);
    }
    cap.hx = x; cap.hz = z;
    cap.last = this.cellAt(x, z);
    this.version++;
  }

  /**
   * Lays this frame's ink for a ship that sailed from (ax, az) to (bx, bz). Returns what happened, for the match to
   * turn into damage, glimmer and events.
   */
  sail(id: number, ax: number, az: number, bx: number, bz: number, out: InkEvent[]): void {
    const cap = this.caps[id], d = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(d / (INK.cell * 0.5)));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps, c = this.cellAt(ax + (bx - ax) * f, az + (bz - az) * f);
      if (c < 0 || c === cap.last) continue;
      const from = cap.last;
      cap.last = c;
      this.enter(id, from, c, out);
    }
  }

  private enter(id: number, from: number, c: number, out: InkEvent[]): void {
    const cap = this.caps[id], mark = id + 1, t = this.trail[c];
    if (t !== 0 && t !== mark) {
      const [x, z] = this.centre(c);
      this.snap(t - 1);
      out.push({ t: 'cut', victim: t - 1, by: id, x, z });
    }
    if (this.owner[c] === mark) {
      if (cap.laid.length > 0) this.close(id, out);
      return;
    }
    // a trail starts only where a ship leaves her own water
    if (cap.laid.length === 0 && (from < 0 || this.owner[from] !== mark)) return;
    if (this.trail[c] !== mark) {
      cap.laid.push(c);
      this.trail[c] = mark;
      this.version++;
      if (cap.laid.length > TRAIL_MAX) this.snap(id);
    }
  }

  /** A trail cut: the ink runs off the water. */
  snap(id: number): void {
    const cap = this.caps[id];
    for (const c of cap.laid) if (this.trail[c] === id + 1) this.trail[c] = 0;
    cap.laid.length = 0;
    this.version++;
  }

  /** Home again with a trail out behind: the trail becomes held water, and so does everything it fenced. */
  private close(id: number, out: InkEvent[]): void {
    const cap = this.caps[id], mark = id + 1;
    let gained = 0, sx = 0, sz = 0;
    for (const c of cap.laid) {
      if (this.trail[c] === mark) this.trail[c] = 0;
      if (this.owner[c] !== mark) { this.own(c, id); gained++; }
    }
    cap.laid.length = 0;
    // flood the sea from outside this captain's box: whatever the water cannot reach is fenced in
    const x0 = Math.max(0, cap.x0 - 1), x1 = Math.min(N - 1, cap.x1 + 1), z0 = Math.max(0, cap.z0 - 1), z1 = Math.min(N - 1, cap.z1 + 1);
    const q = this.queue, seen = this.seen;
    let n = 0;
    const push = (c: number) => { if (!seen[c] && this.owner[c] !== mark) { seen[c] = 1; q[n++] = c; } };
    for (let i = x0; i <= x1; i++) { push(z0 * N + i); push(z1 * N + i); }
    for (let j = z0; j <= z1; j++) { push(j * N + x0); push(j * N + x1); }
    for (let k = 0; k < n; k++) {
      const c = q[k], i = c % N, j = (c - i) / N;
      if (i > x0) push(c - 1);
      if (i < x1) push(c + 1);
      if (j > z0) push(c - N);
      if (j < z1) push(c + N);
    }
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const c = j * N + i;
      if (seen[c]) { seen[c] = 0; continue; }
      if (this.owner[c] !== mark) { this.own(c, id); gained++; sx += i; sz += j; }
    }
    this.version++;
    const before = cap.perks;
    this.refreshPerks(out);
    const won = cap.perks & ~before, k = won ? Math.log2(won & -won) : -1;
    const [cx, cz] = gained > 0 && sx > 0 ? [(sx / Math.max(1, gained) + 0.5) * INK.cell - INK.half, (sz / Math.max(1, gained) + 0.5) * INK.cell - INK.half] : [cap.hx, cap.hz];
    out.push({ t: 'claim', ship: id, cells: gained, x: cx, z: cz, perk: k >= 0 ? LANDMARKS[k].perk : null });
  }

  private own(c: number, id: number): void {
    const prev = this.owner[c];
    if (prev === id + 1) return;
    if (prev > 0) this.caps[prev - 1].held--;
    this.owner[c] = id + 1;
    const cap = this.caps[id], i = c % N, j = (c - i) / N;
    cap.held++;
    if (i < cap.x0) cap.x0 = i;
    if (i > cap.x1) cap.x1 = i;
    if (j < cap.z0) cap.z0 = j;
    if (j > cap.z1) cap.z1 = j;
  }

  private refreshPerks(out: InkEvent[]): void {
    for (let id = 0; id < this.caps.length; id++) {
      const cap = this.caps[id];
      let p = 0;
      this.marks.forEach((c, k) => { if (c >= 0 && this.owner[c] === id + 1) p |= 1 << k; });
      const lost = cap.perks & ~p;
      for (let k = 0; k < LANDMARKS.length; k++) if (lost & (1 << k)) out.push({ t: 'lost', ship: id, perk: LANDMARKS[k].perk });
      cap.perks = p;
    }
  }

  /** The storm washes the ink out of everything beyond its wall. */
  swallow(x: number, z: number, r: number, out: InkEvent[]): void {
    let changed = false;
    const r2 = r * r;
    for (let j = 0; j < N; j++) {
      const dz = (j + 0.5) * INK.cell - INK.half - z;
      for (let i = 0; i < N; i++) {
        const c = j * N + i;
        if (this.owner[c] === 0) continue;
        const dx = (i + 0.5) * INK.cell - INK.half - x;
        if (dx * dx + dz * dz <= r2) continue;
        this.caps[this.owner[c] - 1].held--;
        this.owner[c] = 0;
        changed = true;
      }
    }
    if (changed) { this.version++; this.refreshPerks(out); }
  }

  /** A sunk ship's water goes blank. */
  founder(id: number, out: InkEvent[]): void {
    this.snap(id);
    const mark = id + 1;
    for (let c = 0; c < CELLS; c++) if (this.owner[c] === mark) this.owner[c] = 0;
    this.caps[id].held = 0;
    this.version++;
    this.refreshPerks(out);
  }

  /** Glimmer earned this step by what each captain holds. */
  rent(dt: number, pay: (id: number, g: number) => void): void {
    this.rentT += dt;
    if (this.rentT < 10) return;
    this.rentT -= 10;
    for (let id = 0; id < this.caps.length; id++) {
      const g = Math.floor(this.area(id) * RENT);
      if (g > 0) pay(id, g);
    }
  }

  /** Glimmer for a fresh claim of this many cells. */
  static pay(cells: number): number {
    return Math.round(cells * INK.cell * INK.cell * CLAIM_PAY);
  }
}
