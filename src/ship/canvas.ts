// The canvas as the cloth simulation takes it (cloth.ts): a particle for every
// vertex of the finest level's sails and pennants, in the same order, so that
// level's cloth is the simulation's own grid and every coarser level finds its
// vertices' places on it by their (u, v).
//
// The canvas is cut full: its rest shape is the drawn one, the sails bellied as
// deep as the wind can fill them (and no deeper: canvas doesn't stretch), the
// pennants straight. A square sail is lashed along its yard and held at its
// clews by the sheets; the lateen along its yard and at its clew (where its
// grid closes to a point); a pennant at its truck. Every other particle is kept
// within its nearest lashing's reach: the shortest way to it across the canvas
// as cut (Kim, Chentanez and Müller, "Long Range Attachments", SCA 2012), so a
// sail blown hard can't stretch however few iterations the solver takes, yet
// hangs, folds and shakes freely inside it.
//
// Positions are in metres in the ship's frame, a square sail's before its yard
// is braced (cloth.ts braces the wind).
//
// Pure: no renderer, runs in node for the tests.

import { PIVOT_Z, buildShip } from './build.ts';
import { CLOTH } from './kit.ts';
import { SCALE } from './lines.ts';
import type { SailGrid } from './sails.ts';

/** Four vec4s a particle, as the simulation reads them. */
interface Canvas {
  /** Particles a ship. */
  count: number;
  /**
   * Each sail's and pennant's grid (build.ts's for the finest level: the cloth
   * vertices' `grid`s index it).
   */
  grids: readonly SailGrid[];
  /** Where it was cut (metres), and 1 if it is free, 0 if lashed. */
  rest: Float32Array;
  /**
   * Its grid's first particle, last column and last row (columns − 1, rows −
   * 1), and the grid's kind (CLOTH).
   */
  grid: Float32Array;
  /**
   * Its column and row in the grid, its nearest lashing (−1 for none: it is
   * one) and how far that is across the cloth.
   */
  cell: Float32Array;
  /**
   * The mast it hangs before (its z, its radius; 0 for none), the mast its yard
   * is braced about (z), and −1 where the grid was wound against its order
   * (else 1).
   */
  mast: Float32Array;
}

/**
 * Whether particle (i, j) of a grid `nu` × `nv` cells of this kind is lashed.
 */
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

/** The canvas, cut once. */
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
    // its mast's place and radius, the square sails' pivot, and which way the
    // grid was wound: the same for each particle
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
    // each free particle's nearest lashing across the cloth: Dijkstra from all
    // of them at once, over the grid's sides and diagonals as cut
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
