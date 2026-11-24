import { smoothstep } from './scalar.ts';
import {
  R,
  add,
  along,
  cross,
  distance,
  dot,
  normalize,
  scale,
  toChart,
  type Vec3,
} from './sphere.ts';

export const FREQUENCY = 3;
const BAND_SHARE = 0.2;

export interface Anchor {
  at: Vec3;
  axis: Vec3;
  offset: [number, number];
}

function icosahedron(): { corners: Vec3[]; faces: [number, number, number][] } {
  const g = (1 + Math.sqrt(5)) / 2;
  const corners = (
    [
      [-1, g, 0],
      [1, g, 0],
      [-1, -g, 0],
      [1, -g, 0],
      [0, -1, g],
      [0, 1, g],
      [0, -1, -g],
      [0, 1, -g],
      [g, 0, -1],
      [g, 0, 1],
      [-g, 0, -1],
      [-g, 0, 1],
    ] satisfies Vec3[]
  ).map((v) => normalize(v));
  const faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  return { corners, faces };
}

export function geodesic(frequency: number): {
  points: Vec3[];
  triangles: [number, number, number][];
} {
  const { corners, faces } = icosahedron();
  const points: Vec3[] = [];
  const index = new Map<string, number>();
  const key = (p: Vec3) => p.map((x) => Math.round(x * 1e6)).join(',');
  const vertex = (p: Vec3) => {
    const k = key(p);
    let i = index.get(k);
    if (i === undefined) {
      i = points.length;
      points.push(p);
      index.set(k, i);
    }
    return i;
  };
  const triangles: [number, number, number][] = [];
  const F = frequency;
  for (const [a, b, c] of faces) {
    const at = (i: number, j: number) =>
      vertex(
        normalize(
          add(add(scale(corners[a], F - i - j), corners[b], i), corners[c], j)
        )
      );
    for (let i = 0; i < F; i++)
      for (let j = 0; j < F - i; j++) {
        triangles.push([at(i, j), at(i + 1, j), at(i, j + 1)]);
        if (i + j < F - 1)
          triangles.push([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
  }
  return { points, triangles };
}

export const icosphere = (frequency: number): Vec3[] =>
  geodesic(frequency).points;

export const spacing = (frequency: number) => (R * Math.atan(2)) / frequency;

export const band = (frequency: number) => BAND_SHARE * spacing(frequency);

export function cover(frequency: number): number {
  const { points, triangles } = geodesic(frequency);
  let most = 0;
  for (const [a, b, c] of triangles) {
    const A = points[a],
      B = points[b],
      C = points[c];
    const centre = normalize(cross(add(B, A, -1), add(C, A, -1)));
    most = Math.max(most, distance(centre, A));
  }
  return most;
}

export type Likeness = (x: number, z: number) => number;

function r2(n: number, span: number): [number, number] {
  const g = 1.324717957244746;
  return [((0.5 + n / g) % 1) * span, ((0.5 + n / (g * g)) % 1) * span];
}

export function neighbours(points: Vec3[]): number[][] {
  return points.map((p, i) => {
    const d = points.map((q) => distance(p, q));
    const least = Math.min(...d.filter((_, j) => j !== i));
    return d.flatMap((x, j) => (j !== i && x < 1.4 * least ? [j] : []));
  });
}

function border(a: Vec3, b: Vec3): Vec3[] {
  const mid = normalize(add(a, b));
  const across = normalize(cross(a, b));
  const reach = distance(a, b) / 3;
  return [mid, along(mid, across, reach).p, along(mid, across, -reach).p];
}

export function overlap(a: Anchor, b: Anchor, alike: Likeness): number {
  let worst = 0;
  for (const p of border(a.at, b.at)) {
    const [ax, az] = toChart(a, p),
      [bx, bz] = toChart(b, p);
    worst = Math.max(
      worst,
      Math.abs(
        alike(
          ax + a.offset[0] - bx - b.offset[0],
          az + a.offset[1] - bz - b.offset[1]
        )
      )
    );
  }
  return worst;
}

export function anchors(
  points: Vec3[],
  wind: (p: Vec3) => Vec3,
  span: number,
  alike?: Likeness,
  tries = 16
): Anchor[] {
  const all: Anchor[] = points.map((p, n) => {
    const at = normalize(p);
    const w = wind(at);
    return {
      at,
      axis: normalize(add(w, at, -dot(w, at))),
      offset: r2(n, span),
    };
  });
  if (!alike) return all;
  const next = neighbours(points);
  all.forEach((a, n) => {
    let best = Infinity,
      chosen = a.offset;
    const placed = next[n].filter((m) => m < n);
    for (let t = 0; t < tries; t++) {
      const offset = r2(n * tries + t, span);
      let worst = 0;
      for (const m of placed)
        if (
          (worst = Math.max(worst, overlap({ ...a, offset }, all[m], alike))) >=
          best
        )
          break;
      if (worst < best) [best, chosen] = [worst, offset];
    }
    a.offset = chosen;
  });
  return all;
}

const measured: number[] = [];

export function near(
  all: readonly Anchor[],
  p: Vec3,
  reach: number,
  out: number[] = []
): number[] {
  out.length = 0;
  for (let i = 0; i < all.length; i++) {
    const d = (measured[i] = distance(all[i].at, p));
    if (d > reach) continue;
    let k = out.length;
    out.push(i);
    for (; k > 0 && measured[out[k - 1]] > d; k--) out[k] = out[k - 1];
    out[k] = i;
  }
  return out;
}

export function blend(distances: number[], width: number): number[] {
  const least = Math.min(...distances);
  const w = distances.map((d) => smoothstep(width, 0, d - least));
  const size = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
  return w.map((x) => x / size);
}

export function weigh(
  all: readonly Anchor[],
  p: Vec3,
  width: number
): { index: number[]; weight: number[] } {
  const index = new Int32Array(3),
    weight = new Float64Array(3);
  const n = weighInto(all, p[0], p[1], p[2], width, index, weight);
  return {
    index: Array.from(index.subarray(0, n)),
    weight: Array.from(weight.subarray(0, n)),
  };
}

export function weighInto(
  all: readonly Anchor[],
  x: number,
  y: number,
  z: number,
  width: number,
  index: Int32Array,
  weight: Float64Array
): number {
  const k = 1 / Math.sqrt(x * x + y * y + z * z),
    ux = x * k,
    uy = y * k,
    uz = z * k;
  let b0 = -1,
    b1 = -1,
    b2 = -1,
    c0 = -2,
    c1 = -2,
    c2 = -2;
  for (let i = 0; i < all.length; i++) {
    const a = all[i].at,
      d = ux * a[0] + uy * a[1] + uz * a[2];
    if (d > c0) {
      c2 = c1;
      b2 = b1;
      c1 = c0;
      b1 = b0;
      c0 = d;
      b0 = i;
    } else if (d > c1) {
      c2 = c1;
      b2 = b1;
      c1 = d;
      b1 = i;
    } else if (d > c2) {
      c2 = d;
      b2 = i;
    }
  }
  const a0 = arc(c0),
    w1 = smoothstep(width, 0, arc(c1) - a0),
    w2 = smoothstep(width, 0, arc(c2) - a0);
  const size = Math.sqrt(1 + w1 * w1 + w2 * w2);
  index[0] = b0;
  weight[0] = 1 / size;
  let n = 1;
  if (w1 > 0) {
    index[n] = b1;
    weight[n++] = w1 / size;
  }
  if (w2 > 0) {
    index[n] = b2;
    weight[n++] = w2 / size;
  }
  return n;
}

const arc = (c: number) => R * Math.acos(Math.min(Math.max(c, -1), 1));

export const stretch = (metres: number) =>
  metres === 0 ? 1 : metres / R / Math.sin(metres / R);
