// Who holds the sea: territory, painted as she sails.
//
// Every ship starts with a small home patch of sea round her berth. Wherever
// she sails she paints a strip of the sea her own, `brush` metres either side
// of her course and running `ahead` metres before her bow, at once: open sea and others' water alike (theirs is left the
// smaller). Her strip coming back against her older water (her patch, an
// earlier strip, a loop she closed before, or her own strip from further back
// than her length) closes a loop: the smaller side of the planet it cuts off,
// whatever lies there (others' water, land), becomes hers (enclose.ts). Nothing
// is open to be cut. A sunk ship's water drains back to open sea, and the storm
// takes every cell outside its cap; a ship left with none paints on from where
// she is.
//
// Her run is the cells she has painted since her strip last came against her
// older water: what a loop's fence is made of, its flood starting there.
//
// What changed is logged (Change) for the frame to draw: a strip painted, a
// claim flooding in from its loop, a home patch, water draining. The grid
// itself, one byte a cell, is kept in place and read by reference.
//
// Pure arithmetic: no three, so it runs in node for the tests; the same moves
// give the same grid, to the bit.

import {
  CELLS,
  PLANET_QUANTA,
  areaQuanta,
  cellOf,
  cosTo,
  neighbor,
  trace,
  type ReadCells,
} from '../world/cells.ts';
import { R, add, dot, length, normalize, type Vec3 } from '../world/sphere.ts';
import { enclose } from './enclose.ts';
import { SHIP } from './handling.ts';
import type { Cap } from './storm.ts';

export const TERRITORY = {
  /**
   * The home patch round her berth, metres: a little more than her length
   * either way.
   */
  home: 30,
  /**
   * Metres either side of her course she paints: a strip some 1.5 times her
   * beam as drawn (the border's smoothing takes about a metre off its 11).
   */
  brush: 5.5,
  /**
   * Metres her strip runs ahead of her bow as she sails: the brush is centred
   * her half length and this, less its own reach, ahead of her middle.
   */
  ahead: 3,
  /**
   * Her newest cells, in cells her course has crossed (about her length), that
   * her strip does not close a loop against: what she has only just painted.
   */
  grace: 8,
  /**
   * Steps between the storm's sweeps over the cells (half a second at 30 a
   * second).
   */
  sweep: 15,
  /** Seconds a change is kept for the frame to draw. */
  kept: 8,
} as const;

/**
 * What changed, numbered in order (seq), at a moment on the clock the game
 * steps it by (s: play/state.ts gives the world's, the frame's own):
 *   paint  her strip: `cells` became `ship`'s as she sailed over them
 *   claim  a loop closed: `cells` became `ship`'s, the first `loop` of them her run's (the flood comes from there)
 *   home   a home patch laid: `cells` became `ship`'s, from `at` outward
 *   drain  `cells` went back to open sea: `ship`'s as she sank, or (ship null) the storm's
 */
type Change =
  | {
      seq: number;
      time: number;
      kind: 'paint';
      ship: number;
      cells: Int32Array;
    }
  | {
      seq: number;
      time: number;
      kind: 'claim';
      ship: number;
      cells: Int32Array;
      loop: number;
    }
  | {
      seq: number;
      time: number;
      kind: 'home';
      ship: number;
      cells: Int32Array;
      at: Vec3;
    }
  | {
      seq: number;
      time: number;
      kind: 'drain';
      ship: number | null;
      cells: Int32Array;
    };

/** A ship's move over one step: from where to where (unit vectors). */
export interface Move {
  id: number;
  from: Vec3;
  to: Vec3;
}

/** What a step did: loops closed (whose, how many square metres they took). */
export interface Outcome {
  claimed: { id: number; metres: number }[];
}

type Logged = Change extends infer C
  ? C extends Change
    ? Omit<C, 'seq'>
    : never
  : never;

/** The sea of `count` ships (ids 0 … count − 1), none holding any yet. */
export function createTerritory(count: number) {
  /** Who holds each cell: 0 open sea, else her id + 1. */
  const owner = new Uint8Array(CELLS);
  /**
   * When its holder painted each cell, in cells her course had crossed then
   * (walked); 0 for a patch's or a loop's.
   */
  const when = new Int32Array(CELLS);
  const area = new Float64Array(count);
  /** Cells each ship's course has crossed, from past her grace on. */
  const walked = new Int32Array(count).fill(TERRITORY.grace + 1);
  /** Each ship's run: the cells painted since her strip last met her older water. */
  const runs: number[][] = Array.from({ length: count }, () => []);
  /** The cell under each ship at her last step (−1: not seen yet). */
  const under = new Int32Array(count).fill(-1);
  /** The way each ship last moved (unit tangents; 0: not yet). */
  const way: Vec3[] = Array.from({ length: count }, () => [0, 0, 0]);
  /** The brush's scratch: each cell's last stamp, and the cells reached. */
  const stamp = new Int32Array(CELLS),
    reached: number[] = [];
  /** The log, and the copy of it last handed out (null: changed since). */
  const changes: Change[] = [];
  let handed: readonly Change[] | null = null,
    seq = 0,
    steps = 0,
    stamps = 0;
  const cosHome = Math.cos(TERRITORY.home / R),
    cosBrush = Math.cos(TERRITORY.brush / R),
    lead = (SHIP.length / 2 + TERRITORY.ahead - TERRITORY.brush) / R;

  /**
   * Where her brush is centred, she at `to` from `from`: `lead` ahead of her
   * the way she moves (the way she last moved, still).
   */
  const brushAt = (id: number, from: Vec3, to: Vec3): Vec3 => {
    const d = add(to, from, -1),
      along = add(d, to, -dot(d, to)),
      l = length(along);
    if (l > 1e-12) way[id] = [along[0] / l, along[1] / l, along[2] / l];
    return normalize(add(to, way[id], lead));
  };

  const log = (c: Logged) => {
    // (oldest first: those too old are the first few)
    let gone = 0;
    while (
      gone < changes.length &&
      changes[gone].time <= c.time - TERRITORY.kept
    )
      gone++;
    if (gone) changes.splice(0, gone);
    changes.push({ ...c, seq: ++seq });
    handed = null;
  };
  const set = (c: number, to: number) => {
    const from = owner[c],
      a = areaQuanta(c);
    if (from) area[from - 1] -= a;
    if (to) area[to - 1] += a;
    owner[c] = to;
  };

  /**
   * The cells whose centres lie within `cos` (of the angle) of `at`, reached
   * from the cell under it: written into `reached`.
   */
  const round = (at: Vec3, cos: number) => {
    const first = cellOf(at),
      s = ++stamps;
    reached.length = 0;
    reached.push(first);
    stamp[first] = s;
    for (let k = 0; k < reached.length; k++)
      for (let d = 0; d < 4; d++) {
        const n = neighbor(reached[k], d);
        if (stamp[n] === s || cosTo(n, at) < cos) continue;
        stamp[n] = s;
        reached.push(n);
      }
  };

  /** Lays her a home patch round `at`, wherever it is not another's. */
  const home = (id: number, at: Vec3, time: number) => {
    const u = normalize(at);
    round(u, cosHome);
    const cells = reached.filter((c) => owner[c] === 0 || owner[c] === id + 1);
    for (const c of cells) {
      set(c, id + 1);
      when[c] = 0;
    }
    log({ kind: 'home', time, ship: id, cells: Int32Array.from(cells), at: u });
  };

  /**
   * Paints her brush round `at` into `painted`; whether it met her older water.
   */
  const paint = (id: number, at: Vec3, painted: number[]): boolean => {
    const me = id + 1,
      now = walked[id],
      old = now - TERRITORY.grace;
    let met = false;
    round(at, cosBrush);
    for (const c of reached) {
      if (owner[c] === me) {
        met ||= when[c] < old;
        continue;
      }
      set(c, me);
      when[c] = now;
      runs[id].push(c);
      painted.push(c);
      for (let d = 0; d < 4 && !met; d++) {
        const n = neighbor(c, d);
        met = owner[n] === me && when[n] < old;
      }
    }
    return met;
  };

  /**
   * Closes her loop: what her run and her water fence off becomes hers.
   * Returns the square metres it took (0: it fenced nothing off).
   */
  const claim = (id: number, time: number): number => {
    const me = id + 1,
      before = area[id];
    // (only the run's cells still hers: another's strip may have taken some)
    const run = runs[id].filter((c) => owner[c] === me);
    runs[id] = [];
    if (!run.length) return 0;
    const { cells, loop } = enclose(owner, me, run);
    if (cells.length === loop) return 0;
    for (let k = loop; k < cells.length; k++) {
      set(cells[k], me);
      when[cells[k]] = 0;
    }
    log({ kind: 'claim', time, ship: id, cells, loop });
    return ((area[id] - before) / PLANET_QUANTA) * 4 * Math.PI * R * R;
  };

  /** Every cell outside the storm's cap goes back to open sea. */
  const sweep = (cap: Cap, time: number) => {
    if (cap.radius >= Math.PI) return;
    const cos = Math.cos(cap.radius),
      lost: number[] = [];
    for (let c = 0; c < CELLS; c++) {
      if (owner[c] && cosTo(c, cap.centre) < cos) {
        lost.push(c);
        set(c, 0);
      }
    }
    if (lost.length)
      log({ kind: 'drain', time, ship: null, cells: Int32Array.from(lost) });
  };

  const held: ReadCells = owner;
  return {
    /**
     * Who holds each cell (0 open sea, else her id + 1): every change logged so
     * far, applied in order.
     */
    owner: held,
    /** How many ships it holds the sea for. */
    ships: count,

    /** Lays every ship her home patch round her berth, at the match's start. */
    begin(berths: readonly Vec3[], time: number) {
      berths.forEach((at, id) => {
        home(id, at, time);
        under[id] = cellOf(at);
      });
    },

    /**
     * One step: each ship's move (those afloat), at `time` (that clock), under
     * the storm's cap, in the order of their ids: each paints her strip where
     * she now is, and closes her loop if it met her older water.
     */
    step(moves: readonly Move[], time: number, cap: Cap): Outcome {
      const outcome: Outcome = { claimed: [] },
        walk: number[] = [];
      for (const { id, from, to } of [...moves].sort((a, b) => a.id - b.id)) {
        const c0 = under[id] < 0 ? cellOf(from) : under[id],
          c1 = cellOf(to);
        walk.length = 0;
        walk.push(c0);
        trace(normalize(from), c0, normalize(to), c1, walk);
        under[id] = c1;
        walked[id] += walk.length - 1;
        const painted: number[] = [];
        const met = paint(
          id,
          brushAt(id, normalize(from), normalize(to)),
          painted
        );
        if (painted.length)
          log({
            kind: 'paint',
            time,
            ship: id,
            cells: Int32Array.from(painted),
          });
        if (!met) continue;
        const metres = claim(id, time);
        if (metres > 0) outcome.claimed.push({ id, metres });
      }
      if (++steps % TERRITORY.sweep === 0) sweep(cap, time);
      return outcome;
    },

    /** She sank: her water drains back to open sea. */
    sink(id: number, time: number) {
      const me = id + 1,
        cells: number[] = [];
      runs[id] = [];
      for (let c = owner.indexOf(me); c >= 0; c = owner.indexOf(me, c + 1)) {
        cells.push(c);
        set(c, 0);
      }
      under[id] = -1;
      way[id] = [0, 0, 0];
      log({ kind: 'drain', time, ship: id, cells: Int32Array.from(cells) });
    },

    /**
     * Who holds the water at p (any vector from the centre): her id, or −1 for
     * open sea.
     */
    ownerAt: (p: Vec3) => owner[cellOf(p)] - 1,
    /** Her share of the planet, 0…1. */
    share: (id: number) => area[id] / PLANET_QUANTA,
    /** Whether she holds any water. */
    holds: (id: number) => area[id] > 0,
    /**
     * What changed in the last `kept` seconds, oldest first, numbered from 1
     * with none left out: a copy, kept as it was when handed out.
     */
    changes: (): readonly Change[] => (handed ??= changes.slice()),
    /** The number of the last change made (0: none yet), kept or not. */
    last: () => seq,

    /**
     * The grid's fingerprint (FNV-1a over who holds each cell and when it was
     * painted).
     */
    hash(): string {
      let h = 0x811c9dc5;
      for (let c = 0; c < CELLS; c++)
        h = Math.imul(
          Math.imul(h ^ owner[c], 0x01000193) ^ when[c],
          0x01000193
        );
      return (h >>> 0).toString(16).padStart(8, '0');
    },
  };
}

export type Territory = ReturnType<typeof createTerritory>;
