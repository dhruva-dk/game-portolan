import { CELLS, N, centerOf, wrapped } from './cells.ts';
import { normalize, type Vec3 } from './sphere.ts';

export const BLOCK = 16;

export function coastLines(shore: ArrayLike<number>, block = BLOCK): Vec3[][] {
  const land = (c: number) => shore[c] < 0;
  const points = new Map<number, Vec3>();
  const crossing = (a: number, b: number) => {
    const key = a < b ? a * CELLS + b : b * CELLS + a;
    if (!points.has(key)) {
      const t = shore[a] / (shore[a] - shore[b]),
        p = centerOf(a),
        q = centerOf(b);
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
