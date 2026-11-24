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
  home: 30,
  brush: 5.5,
  ahead: 3,
  grace: 8,
  sweep: 15,
  kept: 8,
} as const;

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

export interface Move {
  id: number;
  from: Vec3;
  to: Vec3;
}

export interface Outcome {
  claimed: { id: number; meters: number }[];
}

type Logged = Change extends infer C
  ? C extends Change
    ? Omit<C, 'seq'>
    : never
  : never;

export function createTerritory(count: number, teams?: readonly number[]) {
  const owner = new Uint8Array(CELLS);
  const when = new Int32Array(CELLS);
  const area = new Float64Array(count);
  const walked = new Int32Array(count).fill(TERRITORY.grace + 1);
  const runs: number[][] = Array.from({ length: count }, () => []);
  const under = new Int32Array(count).fill(-1);
  const way: Vec3[] = Array.from({ length: count }, () => [0, 0, 0]);
  const stamp = new Int32Array(CELLS),
    reached: number[] = [];
  const changes: Change[] = [];
  let handed: readonly Change[] | null = null,
    seq = 0,
    steps = 0,
    stamps = 0;
  const cosHome = Math.cos(TERRITORY.home / R),
    cosBrush = Math.cos(TERRITORY.brush / R),
    lead = (SHIP.length / 2 + TERRITORY.ahead - TERRITORY.brush) / R;

  const brushAt = (id: number, from: Vec3, to: Vec3): Vec3 => {
    const d = add(to, from, -1),
      along = add(d, to, -dot(d, to)),
      l = length(along);
    if (l > 1e-12) way[id] = [along[0] / l, along[1] / l, along[2] / l];
    return normalize(add(to, way[id], lead));
  };

  const log = (c: Logged) => {
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

  const mate = (id: number, o: number) =>
    !!teams && o !== 0 && o !== id + 1 && teams[o - 1] === teams[id];

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
      if (mate(id, owner[c])) {
        met = true;
        continue;
      }
      set(c, me);
      when[c] = now;
      runs[id].push(c);
      painted.push(c);
      for (let d = 0; d < 4 && !met; d++) {
        const n = neighbor(c, d);
        met = (owner[n] === me && when[n] < old) || mate(id, owner[n]);
      }
    }
    return met;
  };

  const claim = (id: number, time: number): number => {
    const me = id + 1,
      before = area[id];
    const run = runs[id].filter((c) => owner[c] === me);
    runs[id] = [];
    if (!run.length) return 0;
    const { cells, loop } = enclose(
      owner,
      me,
      run,
      teams && ((o) => mate(id, o))
    );
    if (cells.length === loop) return 0;
    for (let k = loop; k < cells.length; k++) {
      set(cells[k], me);
      when[cells[k]] = 0;
    }
    log({ kind: 'claim', time, ship: id, cells, loop });
    return ((area[id] - before) / PLANET_QUANTA) * 4 * Math.PI * R * R;
  };

  const sweep = (cap: Cap, time: number) => {
    if (cap.radius >= Math.PI) return;
    const cos = Math.cos(cap.radius),
      lost: number[] = [];
    for (let c = 0; c < CELLS; c++) {
      if (owner[c] && cosTo(c, cap.center) < cos) {
        lost.push(c);
        set(c, 0);
      }
    }
    if (lost.length)
      log({ kind: 'drain', time, ship: null, cells: Int32Array.from(lost) });
  };

  const held: ReadCells = owner;
  return {
    owner: held,
    ships: count,

    begin(berths: readonly (Vec3 | null)[], time: number) {
      berths.forEach((at, id) => {
        if (!at) return;
        home(id, at, time);
        under[id] = cellOf(at);
      });
    },

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
        const meters = claim(id, time);
        if (meters > 0) outcome.claimed.push({ id, meters });
      }
      if (++steps % TERRITORY.sweep === 0) sweep(cap, time);
      return outcome;
    },

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

    ownerAt: (p: Vec3) => owner[cellOf(p)] - 1,
    teamAt: (p: Vec3) => {
      const o = owner[cellOf(p)] - 1;
      return o < 0 ? -1 : (teams?.[o] ?? o);
    },
    share: (id: number) => area[id] / PLANET_QUANTA,
    teamShare: (id: number) => {
      if (!teams) return area[id] / PLANET_QUANTA;
      let all = 0;
      for (let k = 0; k < count; k++)
        if (teams[k] === teams[id]) all += area[k];
      return all / PLANET_QUANTA;
    },
    holds: (id: number) => area[id] > 0,
    changes: (): readonly Change[] => (handed ??= changes.slice()),
    last: () => seq,

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
