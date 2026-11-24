import { PIVOT_Z, buildShip } from './build.ts';
import { CLOTH } from './kit.ts';
import { SCALE } from './lines.ts';
import type { SailGrid } from './sails.ts';

interface Canvas {
  count: number;
  grids: readonly SailGrid[];
  rest: Float32Array;
  grid: Float32Array;
  cell: Float32Array;
  mast: Float32Array;
}

export function lashed(
  kind: number,
  i: number,
  j: number,
  nu: number,
  nv: number
): boolean {
  if (kind === CLOTH.pennant) return i === 0;
  if (kind === CLOTH.lateen) return j === 0 || j === nv;
  return j === 0 || (j === nv && (i === 0 || i === nu));
}

let cut: Canvas | null = null;

export function cutCanvas(): Canvas {
  if (cut) return cut;
  const ship = buildShip(0),
    cloth = ship.cloth,
    n = cloth.vertices;
  const rest = new Float32Array(n * 4),
    grid = new Float32Array(n * 4),
    cell = new Float32Array(n * 4),
    mast = new Float32Array(n * 4);
  const at = (k: number) => [
    cloth.position[k * 3],
    cloth.position[k * 3 + 1],
    cloth.position[k * 3 + 2],
  ];
  const apart = (a: number, b: number) => {
    const p = at(a),
      q = at(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };
  for (const g of ship.sails) {
    const nu = g.columns,
      nv = g.rows,
      row = nu + 1,
      count = row * (nv + 1);
    const pivot = cloth.part[g.first * 4 + 1];
    const standing = [
      g.mast ? g.mast.z * SCALE : 0,
      g.mast ? g.mast.r * SCALE : 0,
      g.kind === CLOTH.square ? PIVOT_Z[pivot] : 0,
      g.flip ? -1 : 1,
    ];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const k = g.first + j * row + i;
        rest.set([...at(k), lashed(g.kind, i, j, nu, nv) ? 0 : 1], k * 4);
        grid.set([g.first, nu, nv, g.kind], k * 4);
        cell.set([i, j, -1, 0], k * 4);
        mast.set(standing, k * 4);
      }
    const reach = new Float64Array(count).fill(Infinity),
      from = new Int32Array(count).fill(-1),
      done = new Uint8Array(count);
    for (let k = 0; k < count; k++)
      if (rest[(g.first + k) * 4 + 3] === 0) {
        reach[k] = 0;
        from[k] = k;
      }
    for (;;) {
      let k = -1;
      for (let q = 0; q < count; q++)
        if (!done[q] && reach[q] < Infinity && (k < 0 || reach[q] < reach[k]))
          k = q;
      if (k < 0) break;
      done[k] = 1;
      const i = k % row,
        j = (k - i) / row;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = i + di,
            jj = j + dj;
          if ((di === 0 && dj === 0) || ii < 0 || ii > nu || jj < 0 || jj > nv)
            continue;
          const q = jj * row + ii,
            d = reach[k] + apart(g.first + k, g.first + q);
          if (d < reach[q]) {
            reach[q] = d;
            from[q] = from[k];
          }
        }
    }
    for (let k = 0; k < count; k++)
      if (rest[(g.first + k) * 4 + 3] === 1)
        cell.set([from[k] + g.first, reach[k]], (g.first + k) * 4 + 2);
  }
  cut = { count: n, grids: ship.sails, rest, grid, cell, mast };
  return cut;
}
