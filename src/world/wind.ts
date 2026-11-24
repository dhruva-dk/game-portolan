import { FREQUENCY, geodesic } from './lattice.ts';
import { random } from './random.ts';
import {
  add,
  cross,
  dot,
  frameAt,
  length,
  normalize,
  put,
  scale,
  type Out3,
  type Vec3,
} from './sphere.ts';

export type Wind = (p: Vec3, out?: Out3) => Vec3;

const BEND = 0.15;
const TILT = (40 * Math.PI) / 180;

type Matrix = [Vec3, Vec3, Vec3];

function potential(seed: number): { a: Vec3; m: Matrix } {
  const next = random(seed ^ 0x77696e64);
  const { points, triangles } = geodesic(FREQUENCY);
  const centers = triangles
    .map(([i, j, k]) => normalize(add(add(points[i], points[j]), points[k])))
    .filter((c) => c[1] > Math.cos(TILT));
  const a = centers[Math.floor(next() * centers.length)];
  const east = frameAt(a).east,
    north = cross(a, east),
    turn = 2 * Math.PI * next();
  const b = add(scale(east, Math.cos(turn)), north, Math.sin(turn)),
    c = cross(a, b);
  const la = 2 * next() - 1,
    lb = 2 * next() - 1,
    l = [la, lb, -la - lb];
  const k = BEND / Math.max(...l.map(Math.abs));
  const row = (r: number): Vec3 =>
    add(add(scale(a, k * l[0] * a[r]), b, k * l[1] * b[r]), c, k * l[2] * c[r]);
  return { a, m: [row(0), row(1), row(2)] };
}

export function createWind(seed: number): Wind {
  const { a, m } = potential(seed);
  const u: Out3 = [0, 0, 0],
    v: Out3 = [0, 0, 0];
  return (p, out) => {
    normalize(p, u);
    put(v, dot(m[0], u), dot(m[1], u), dot(m[2], u));
    cross(add(a, v, 1, v), u, v);
    const size = length(v);
    if (size > 1e-9) return scale(v, 1 / size, out);
    const east = frameAt(u).east;
    return put(out, east[0], east[1], east[2]);
  };
}

export function calms(seed: number): [Vec3, Vec3] {
  const { a } = potential(seed);
  return [a, scale(a, -1)];
}
