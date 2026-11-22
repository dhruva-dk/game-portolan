// What a closed loop takes: her own water and her run (the cells she painted
// since her strip last met her older water) are the fence; every
// connected stretch of the rest of the planet but the largest becomes hers. On
// a sphere every loop cuts the world in two, so this is the smaller side, with
// every pocket the fence shuts off besides: whatever lies there, others' water
// and land too.
//
// The stretches are flooded from the run's neighbours in lockstep, a few
// cells each a round, merging where they meet; the flood stops as soon as one
// stretch is still growing and already outweighs every one that has finished,
// so its cost goes with the smaller side, not the planet.
//
// Pure arithmetic: no three, so it runs in node for the tests; the same cells
// in the same order for the same grid.

import { CELLS, areaQuanta, neighbor } from '../world/cells.ts';

// The flood's scratch, shared by every call and always left zeroed.
const LABEL = new Int32Array(CELLS);
const MARK = new Uint8Array(CELLS);
/**
 * Cells a stretch floods before the next takes its turn: it only bounds how far
 * past the stop the flood runs.
 */
const TURN = 16;

/**
 * The cells a loop gives ship `me` (owner value: her id + 1), given who holds
 * each cell and her run's cells in the order painted: the run's own first
 * (`loop` of them), then those it encloses. Water whose owner value `ours`
 * takes (her team's: territory.ts) fences with her own, and is not given her.
 */
export function enclose(
  owner: Uint8Array,
  me: number,
  run: readonly number[],
  ours?: (owner: number) => boolean
): { cells: Int32Array; loop: number } {
  for (const c of run) MARK[c] = 1;
  const fenced = ours
    ? (c: number) => owner[c] === me || MARK[c] === 1 || ours(owner[c])
    : (c: number) => owner[c] === me || MARK[c] === 1;
  const parent: number[] = [],
    queue: number[][] = [],
    head: number[] = [],
    area: number[] = [];
  const visited: number[] = [];
  const find = (r: number) => {
    while (parent[r] !== r) r = parent[r] = parent[parent[r]];
    return r;
  };
  for (const c of run) {
    for (let k = 0; k < 4; k++) {
      const n = neighbor(c, k);
      if (fenced(n) || LABEL[n]) continue;
      LABEL[n] = parent.length + 1;
      parent.push(parent.length);
      queue.push([n]);
      head.push(0);
      area.push(areaQuanta(n));
      visited.push(n);
    }
  }
  const active = parent.slice();
  let finished = 0;
  while (
    active.length > 1 ||
    (active.length === 1 && area[active[0]] < finished)
  ) {
    for (const r0 of active) {
      let r = r0,
        q = queue[r];
      for (
        let turn = 0;
        turn < TURN && parent[r] === r && head[r] < q.length;
        turn++
      ) {
        const c = q[head[r]++];
        for (let k = 0; k < 4; k++) {
          const n = neighbor(c, k);
          if (fenced(n)) continue;
          const l = LABEL[n];
          if (!l) {
            LABEL[n] = r + 1;
            area[r] += areaQuanta(n);
            q.push(n);
            visited.push(n);
            continue;
          }
          if (l - 1 === r) continue;
          const o = find(l - 1);
          if (o === r) continue;
          // two fronts met: the one with less still to do folds into the other
          const keep = queue[o].length - head[o] > q.length - head[r] ? o : r,
            drop = keep === o ? r : o;
          const from = queue[drop],
            into = queue[keep];
          for (let m = head[drop]; m < from.length; m++) into.push(from[m]);
          parent[drop] = keep;
          area[keep] += area[drop];
          queue[drop] = [];
          r = keep;
          q = into;
        }
      }
    }
    let live = 0;
    for (const r of active) {
      if (parent[r] !== r) continue;
      if (head[r] < queue[r].length) active[live++] = r;
      else finished = Math.max(finished, area[r]);
    }
    active.length = live;
  }
  // the outer side: the stretch still growing, or, if every one finished, the
  // largest
  let outer = active.length ? active[0] : -1;
  if (outer < 0)
    for (let r = 0; r < parent.length; r++)
      if (parent[r] === r && (outer < 0 || area[r] > area[outer])) outer = r;
  const gained: number[] = [];
  for (const c of run) {
    if (!MARK[c]) continue;
    MARK[c] = 0;
    gained.push(c);
  }
  const loop = gained.length;
  for (const c of visited) {
    if (find(LABEL[c] - 1) !== outer) gained.push(c);
    LABEL[c] = 0;
  }
  return { cells: Int32Array.from(gained), loop };
}
