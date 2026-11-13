// Who holds the sea: the first game's territory (agent-initial src/sim.ts), as a battle royale has it.
//
// Every ship starts with a small home patch of sea round her berth. Leaving her own water she lays an open trail (the
// cells her centre passes through, and a line of points for drawing it); coming back into her own water closes the
// loop, and the smaller side of the planet it cuts off, whatever lies there (others' water, islands), becomes hers
// (enclose.ts). A trail is cut, not deadly: another ship crossing it, or she herself, breaks it, and she loses it, no
// water gained; she must start again from her own water. A sunk ship's water drains back to open sea, and the storm
// takes every cell outside its cap. A ship left with no water is not sunk: she lays a new home patch round her
// wherever she is on open sea (her open trail, if any, given up), and claims again from there.
//
// What changed is logged (Change) for the frame to draw: a claim flooding in from its loop, a home patch, water
// draining, a trail cut. The grid itself, one byte a cell, is kept in place and read by reference.
//
// Pure arithmetic: no three, so it runs in node for the tests; the same moves give the same grid, to the bit.

import { CELLS, PLANET_QUANTA, areaQuanta, cellOf, cosTo, neighbor, trace, type ReadCells } from '../world/cells.ts';
import { R, distance, normalize, type Vec3 } from '../world/sphere.ts';
import { enclose } from './enclose.ts';
import type { Cap } from './storm.ts';

export const TERRITORY = {
  /** The home patch round her berth, metres: a little more than her length either way. */
  home: 30,
  /** Metres between the points of her open trail, as drawn. */
  spacing: 2,
  /** Her newest trail cells, under her own hull, that she does not cut by crossing again: about her length. */
  grace: 8,
  /** Steps between the storm's sweeps over the cells (half a second at 30 a second). */
  sweep: 15,
  /** A new home patch is laid only where at least this share of it is open sea. */
  room: 0.5,
  /** Seconds a change is kept for the frame to draw. */
  kept: 8,
} as const;

/** A ship's open trail: which one it is (a new one each time she leaves her water), its points (unit vectors, the
 *  first where she left her water, then one every `spacing` metres) and its cells in the order laid. Empty when she
 *  is in her own water. */
export interface Trail { serial: number; points: Vec3[]; cells: number[] }

/**
 * What changed, numbered in order (seq), at a moment on the clock the game steps it by (s: play/state.ts gives the
 * world's, the frame's own):
 *   claim  a loop closed: `cells` became `ship`'s, the first `loop` of them the trail's own (the flood comes from there)
 *   home   a home patch laid: `cells` became `ship`'s, from `at` outward
 *   drain  `cells` went back to open sea: `ship`'s as she sank, or (ship null) the storm's
 *   cut    `ship`'s open trail was broken by `by` (herself, or null: given up), no water gained
 */
export type Change =
  | { seq: number; time: number; kind: 'claim'; ship: number; cells: Int32Array; loop: number }
  | { seq: number; time: number; kind: 'home'; ship: number; cells: Int32Array; at: Vec3 }
  | { seq: number; time: number; kind: 'drain'; ship: number | null; cells: Int32Array }
  | { seq: number; time: number; kind: 'cut'; ship: number; by: number | null };

/** A ship's move over one step: from where to where (unit vectors). */
export interface Move { id: number; from: Vec3; to: Vec3 }

/** What a step did: trails cut (whose, by whom) and loops closed (whose, how many square metres they took). */
export interface Outcome { cut: { id: number; by: number | null }[]; claimed: { id: number; metres: number }[] }

type Logged = Change extends infer C ? (C extends Change ? Omit<C, 'seq'> : never) : never;

/** The sea of `count` ships (ids 0 … count − 1), none holding any yet. */
export function createTerritory(count: number) {
  /** Who holds each cell: 0 open sea, else her id + 1. */
  const owner = new Uint8Array(CELLS);
  /** Whose open trail runs through each cell: 0 none, else her id + 1. */
  const laid = new Uint8Array(CELLS);
  const area = new Float64Array(count);
  const trails: Trail[] = Array.from({ length: count }, () => ({ serial: 0, points: [], cells: [] }));
  /** The cell under each ship at her last step (−1: not seen yet). */
  const under = new Int32Array(count).fill(-1);
  /** Whether her trail was cut (or given up) and she has not yet been back in her own water: she lays none till then. */
  const adrift = new Uint8Array(count);
  let changes: Change[] = [], seq = 0, steps = 0, serials = 0;
  const cosHome = Math.cos(TERRITORY.home / R);

  const log = (c: Logged) => {
    changes = changes.filter((k) => k.time > c.time - TERRITORY.kept);
    changes.push({ ...c, seq: ++seq });
  };
  const set = (c: number, to: number) => {
    const from = owner[c], a = areaQuanta(c);
    if (from) area[from - 1] -= a;
    if (to) area[to - 1] += a;
    owner[c] = to;
  };
  const drop = (id: number) => {
    const me = id + 1, t = trails[id];
    for (const c of t.cells) if (laid[c] === me) laid[c] = 0;
    t.cells = [];
    t.points = [];
  };

  /** The open cells of a home patch round `at`, or none if too few of its cells are open sea. */
  const patch = (id: number, at: Vec3): number[] => {
    const u = normalize(at), first = cellOf(u), seen = new Set([first]), list = [first];
    for (let k = 0; k < list.length; k++) {
      for (let d = 0; d < 4; d++) {
        const n = neighbor(list[k], d);
        if (seen.has(n) || cosTo(n, u) < cosHome) continue;
        seen.add(n);
        list.push(n);
      }
    }
    const open = list.filter((c) => owner[c] === 0 || owner[c] === id + 1);
    return open.length >= list.length * TERRITORY.room ? open : [];
  };

  /** Lays her a home patch round `at`; whether one was laid. */
  const home = (id: number, at: Vec3, time: number): boolean => {
    const cells = patch(id, at);
    if (!cells.length) return false;
    for (const c of cells) set(c, id + 1);
    log({ kind: 'home', time, ship: id, cells: Int32Array.from(cells), at: normalize(at) });
    return true;
  };

  /** Starts her trail where she crossed out of her water between `from` and `to` (found by halving), or at `from`
   *  if her water went from under her. */
  const open = (id: number, lost: boolean, from: Vec3, to: Vec3) => {
    const me = id + 1;
    let lo = from, hi = to;
    for (let i = 0; i < 8 && !lost; i++) {
      const m = normalize([lo[0] + hi[0], lo[1] + hi[1], lo[2] + hi[2]]);
      if (owner[cellOf(m)] === me) lo = m;
      else hi = m;
    }
    const t = trails[id];
    t.serial = ++serials;
    t.points = [lost ? lo : hi];
    t.cells = [];
  };

  /** Closes her loop: the trail and what it encloses become hers. Returns the square metres it took. */
  const claim = (id: number, time: number): number => {
    const me = id + 1, before = area[id];
    const { cells, loop } = enclose(owner, me, trails[id].cells);
    for (const c of cells) set(c, me);
    drop(id);
    log({ kind: 'claim', time, ship: id, cells, loop });
    return (area[id] - before) / PLANET_QUANTA * 4 * Math.PI * R * R;
  };

  /** Every cell outside the storm's cap goes back to open sea. */
  const sweep = (cap: Cap, time: number) => {
    if (cap.radius >= Math.PI) return;
    const cos = Math.cos(cap.radius), lost: number[] = [];
    for (let c = 0; c < CELLS; c++) {
      if (owner[c] && cosTo(c, cap.centre) < cos) {
        lost.push(c);
        set(c, 0);
      }
    }
    if (lost.length) log({ kind: 'drain', time, ship: null, cells: Int32Array.from(lost) });
  };

  const held: ReadCells = owner, trailed: ReadCells = laid;
  return {
    /** Who holds each cell (0 open sea, else her id + 1): every change logged so far, applied in order. */
    owner: held,
    /** Whose open trail runs through each cell (0 none, else her id + 1). */
    laid: trailed,

    /** Lays every ship her home patch round her berth, at the match's start. */
    begin(berths: readonly Vec3[], time: number) {
      berths.forEach((at, id) => {
        home(id, at, time);
        under[id] = cellOf(at);
      });
    },

    /**
     * One step: each ship's move (those afloat), at `time` (that clock), under the storm's cap. Trails are
     * judged as they stood before the step, so two ships crossing each other's in one step both lose theirs, whatever
     * the order.
     */
    step(moves: readonly Move[], time: number, cap: Cap): Outcome {
      const ordered = [...moves].sort((a, b) => a.id - b.id);
      const walks = ordered.map(({ id, from, to }) => {
        const c0 = under[id] < 0 ? cellOf(from) : under[id], c1 = cellOf(to), walk = [c0];
        trace(normalize(from), c0, normalize(to), c1, walk);
        under[id] = c1;
        return walk;
      });
      // crossings
      const cut = new Map<number, number | null>();
      ordered.forEach(({ id }, m) => {
        const walk = walks[m], mine = trails[id].cells;
        for (let k = 1; k < walk.length; k++) {
          const o = laid[walk[k]] - 1;
          if (o < 0 || cut.has(o)) continue;
          if (o !== id) cut.set(o, id);
          else if (mine.lastIndexOf(walk[k]) < mine.length - TERRITORY.grace) cut.set(id, id);
        }
      });
      const outcome: Outcome = { cut: [], claimed: [] };
      for (const [id, by] of [...cut].sort((a, b) => a[0] - b[0])) {
        drop(id);
        adrift[id] = 1;
        log({ kind: 'cut', time, ship: id, by });
        outcome.cut.push({ id, by });
      }
      // trails laid, opened and closed
      ordered.forEach(({ id, from, to }, m) => {
        const me = id + 1, walk = walks[m], t = trails[id];
        for (let k = 0; k < walk.length; k++) {
          const c = walk[k], going = t.points.length > 0;
          if (k === 0 && going) continue;
          if (owner[c] === me) {
            adrift[id] = 0;
            if (going) outcome.claimed.push({ id, metres: claim(id, time) });
          } else if (going || !adrift[id]) {
            if (!going) open(id, k === 0, from, to);
            t.cells.push(c);
            laid[c] = me;
          }
        }
        if (t.points.length && distance(t.points[t.points.length - 1], to) >= TERRITORY.spacing) t.points.push(normalize(to));
      });
      if (++steps % TERRITORY.sweep === 0) sweep(cap, time);
      // a ship with no water left gives up her trail and starts again from a new home patch, where there is room
      for (const { id, to } of ordered) {
        if (area[id] > 0) continue;
        if (!home(id, to, time)) continue;
        adrift[id] = 0;
        if (trails[id].points.length) {
          drop(id);
          log({ kind: 'cut', time, ship: id, by: null });
          outcome.cut.push({ id, by: null });
        }
      }
      return outcome;
    },

    /** She sank: her trail is gone and her water drains back to open sea. */
    sink(id: number, time: number) {
      const me = id + 1, cells: number[] = [];
      drop(id);
      for (let c = owner.indexOf(me); c >= 0; c = owner.indexOf(me, c + 1)) {
        cells.push(c);
        set(c, 0);
      }
      under[id] = -1;
      log({ kind: 'drain', time, ship: id, cells: Int32Array.from(cells) });
    },

    /** Who holds the water at p (any vector from the centre): her id, or −1 for open sea. */
    ownerAt: (p: Vec3) => owner[cellOf(p)] - 1,
    /** Her share of the planet, 0…1. */
    share: (id: number) => area[id] / PLANET_QUANTA,
    /** Whether she holds any water. */
    holds: (id: number) => area[id] > 0,
    /** Her open trail (empty in her own water). */
    trail: (id: number): Readonly<Trail> => trails[id],
    /** Every open trail, by ship id. */
    trails: (): readonly Readonly<Trail>[] => trails,
    /** What changed in the last `kept` seconds, oldest first, numbered from 1 with none left out. */
    changes: (): readonly Change[] => changes,
    /** The number of the last change made (0: none yet), kept or not. */
    last: () => seq,

    /** The grid's fingerprint (FNV-1a over who holds each cell and whose trail runs through it). */
    hash(): string {
      let h = 0x811c9dc5;
      for (let c = 0; c < CELLS; c++) h = Math.imul(Math.imul(h ^ owner[c], 0x01000193) ^ laid[c], 0x01000193);
      return (h >>> 0).toString(16).padStart(8, '0');
    },
  };
}

export type Territory = ReturnType<typeof createTerritory>;
