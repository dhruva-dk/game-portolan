import type { Eye } from '../snapshot.ts';
import { R, type Vec3 } from '../world/sphere.ts';

export interface Point {
  x: number;
  y: number;
}
export interface View {
  width: number;
  height: number;
}

export function placed(
  out: Point,
  eye: Eye,
  p: Vec3,
  up: number,
  view: View
): Point | null {
  const e = eye.position,
    k = R + up;
  const dx = p[0] * k - e[0],
    dy = p[1] * k - e[1],
    dz = p[2] * k - e[2];
  const t =
    -(e[0] * dx + e[1] * dy + e[2] * dz) / (dx * dx + dy * dy + dz * dz);
  const nx = e[0] + dx * t,
    ny = e[1] + dy * t,
    nz = e[2] + dz * t;
  if (t > 0 && t < 1 && nx * nx + ny * ny + nz * nz < R * R) return null;
  const [qx, qy, qz, qw] = eye.orientation;
  const tx = 2 * -(qy * dz - qz * dy),
    ty = 2 * -(qz * dx - qx * dz),
    tz = 2 * -(qx * dy - qy * dx);
  const vx = dx + qw * tx - (qy * tz - qz * ty),
    vy = dy + qw * ty - (qz * tx - qx * tz);
  const vz = dz + qw * tz - (qx * ty - qy * tx);
  if (vz >= 0) return null;
  const { width, height } = view,
    f = Math.tan((eye.fov * Math.PI) / 360);
  const x = vx / -vz / (f * (width / height)),
    y = vy / -vz / f;
  out.x = ((x + 1) / 2) * width;
  out.y = ((1 - y) / 2) * height;
  return out;
}
