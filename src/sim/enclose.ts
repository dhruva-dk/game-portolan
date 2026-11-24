import { CELLS, areaQuanta, neighbor } from '../world/cells.ts';

const LABEL = new Int32Array(CELLS);
const MARK = new Uint8Array(CELLS);
const TURN = 16;

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
