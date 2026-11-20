// The terrain's coast as lines, for the charts (ui/coasts.ts): the contour
// where the distance to the coast is nought (terrain.ts shore), traced by
// marching squares over the cells' centres, cut into one run of lines a block
// of cells.
//
// The squares are the cells' centres four at a time, across the faces' edges
// too (cells.ts wrapped); at a corner of the cube, where three cells meet, a
// triangle. A square that straddles a face's edge is met from both faces and
// traced once. The coast crosses a side of a square where its two cells lie
// either side of it, at the point between their centres where the distance,
// read straight between them, is nought; a square crossed on all four sides (a
// saddle) is split by its middle's reading. Each crossing is one point, shared
// by the two squares either side, so the segments join into lines; a line ends
// where it leaves its block.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { CELLS, N, centreOf, wrapped } from './cells.ts';
import { normalize, type Vec3 } from './sphere.ts';

/** Cells a block's side. */
export const BLOCK = 16;

/**
 * The coast as lines of points on the unit sphere, each within one block of
 * cells (a closed run's last point is its first). `shore` is a signed distance
 * to the coast per cell, negative on land.
 */
export function coastLines(shore: ArrayLike<number>, block = BLOCK): Vec3[][] {
  const land = (c: number) => shore[c] < 0;
  const points = new Map<number, Vec3>();
  /**
   * The crossing between two cells, as a key (the pair, in order) whose point
   * is worked out once.
   */
  const crossing = (a: number, b: number) => {
    const key = a < b ? a * CELLS + b : b * CELLS + a;
    if (!points.has(key)) {
      const t = shore[a] / (shore[a] - shore[b]),
        p = centreOf(a),
        q = centreOf(b);
      points.set(
        key,
        normalize([
          p[0] + (q[0] - p[0]) * t,
          p[1] + (q[1] - p[1]) * t,
          p[2] + (q[2] - p[2]) * t,
        ])
      );
    }
    return key;
  };
  const per = N / block,
    blocks = new Map<number, number[]>();
  const met = new Set<string>();
  const ring: number[] = [];
  for (let f = 0; f < 6; f++) {
    for (let j = -1; j < N; j++) {
      for (let i = -1; i < N; i++) {
        // the square's cells in turn round it, each once (at a corner of the
        // cube two of the four are one)
        ring.length = 0;
        for (const c of [
          wrapped(f, i, j),
          wrapped(f, i + 1, j),
          wrapped(f, i + 1, j + 1),
          wrapped(f, i, j + 1),
        ]) {
          if (!ring.includes(c)) ring.push(c);
        }
        if (ring.length < 3) continue;
        const crossed: number[] = [];
        for (let k = 0; k < ring.length; k++)
          if (land(ring[k]) !== land(ring[(k + 1) % ring.length]))
            crossed.push(k);
        if (crossed.length === 0) continue;
        // (a square on a face's edge is met from both faces)
        if (i < 0 || j < 0 || i === N - 1 || j === N - 1) {
          const key = [...ring].sort((a, b) => a - b).join();
          if (met.has(key)) continue;
          met.add(key);
        }
        const side = (k: number) =>
          crossing(ring[k], ring[(k + 1) % ring.length]);
        const own =
          f * per * per +
          Math.floor(Math.max(0, j) / block) * per +
          Math.floor(Math.max(0, i) / block);
        let segs = blocks.get(own);
        if (!segs) blocks.set(own, (segs = []));
        if (crossed.length === 2) segs.push(side(crossed[0]), side(crossed[1]));
        else {
          // a saddle: its middle alike with the first cell joins it to the
          // third, so the second and fourth are cut off
          let middle = 0;
          for (const c of ring) middle += shore[c];
          if (land(ring[0]) === middle < 0)
            segs.push(side(0), side(1), side(2), side(3));
          else segs.push(side(3), side(0), side(1), side(2));
        }
      }
    }
  }
  const lines: Vec3[][] = [];
  for (const segs of blocks.values())
    for (const line of chain(segs)) lines.push(line.map((k) => points.get(k)!));
  return lines;
}

/**
 * Segments (pairs of keys, flat) joined end to end into runs of keys: the open
 * runs first, then the closed.
 */
function chain(segs: readonly number[]): number[][] {
  const n = segs.length / 2,
    ends = new Map<number, number[]>(),
    used = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    for (const k of [segs[2 * s], segs[2 * s + 1]]) {
      const list = ends.get(k);
      if (list) list.push(s);
      else ends.set(k, [s]);
    }
  }
  const walk = (s: number, from: number) => {
    const line = [from];
    for (let k = from; s >= 0; ) {
      used[s] = 1;
      k = segs[2 * s] === k ? segs[2 * s + 1] : segs[2 * s];
      line.push(k);
      s = ends.get(k)!.find((t) => !used[t]) ?? -1;
    }
    return line;
  };
  const lines: number[][] = [];
  for (const [k, list] of ends)
    if (list.length === 1 && !used[list[0]]) lines.push(walk(list[0], k));
  for (let s = 0; s < n; s++) if (!used[s]) lines.push(walk(s, segs[2 * s]));
  return lines;
}
