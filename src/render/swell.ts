// The sea's swell for anything that floats: hulls ride seaAt and tilt with its slope. Once the stage draws its ocean
// it hands its own sea over (rideOn), and everything rides the waves on screen; until then, and where no stage is
// drawn, they ride these long waves. This is render code (the simulation's ships stay level).
//
// The rewrite's swell was plane waves over a flat sea. On the sphere each wave runs along a fixed direction in the
// planet's frame; wherever that direction lies along the ground the wave travels across the sea like before, and
// where it would point straight up the wave fades out, so no wave ever stands still in rings. The directions are
// spread so at least two long waves run everywhere.
import type { V3 } from '../sim/math.ts';

// direction (any length), wavelength (m), amplitude (m)
const SWELL: [number, number, number, number, number][] = [
  [0.94, 0.12, 0.33, 26, 0.2],
  [-0.2, 0.36, 0.91, 22, 0.16],
  [0.12, 0.97, -0.21, 17, 0.12],
  [0.45, -0.3, -0.84, 9.5, 0.065],
  [-0.71, -0.62, 0.33, 5.8, 0.035],
  [0.3, 0.85, 0.43, 3.7, 0.02],
];

export const WAVES = SWELL.map(([x, y, z, L, A]) => {
  const l = Math.hypot(x, y, z), k = (Math.PI * 2) / L;
  return { x: x / l, y: y / l, z: z / l, k, w: Math.sqrt(9.81 * k), A, L };
});

/** How rough the sea is at the camera: the sky's mood and the weather set it every frame. */
export const swell = { chop: 1 };

// how much of a wave runs along the ground at up: 0 where its direction stands vertical
function along(v: (typeof WAVES)[number], ux: number, uy: number, uz: number): number {
  const c = v.x * ux + v.y * uy + v.z * uz, s = Math.sqrt(Math.max(0, 1 - c * c));
  const t = Math.min(1, Math.max(0, (s - 0.35) / 0.4));
  return t * t * (3 - 2 * t);
}

/** Height of the swell (m) above the sea's level at p, a point in the planet's frame in metres; t in seconds. */
export function waveHeight(p: V3, t: number): number {
  const l = Math.hypot(p.x, p.y, p.z) || 1, ux = p.x / l, uy = p.y / l, uz = p.z / l;
  let h = 0;
  for (const v of WAVES) h += Math.sin((v.x * p.x + v.y * p.y + v.z * p.z) * v.k - v.w * t) * v.A * along(v, ux, uy, uz);
  return h * swell.chop;
}

/**
 * The swell's slope at p: a vector along the ground pointing uphill, whose length is the rise per metre. A hull's
 * up is normalize(up - slope).
 */
export function waveSlope(p: V3, t: number, out: V3): V3 {
  const l = Math.hypot(p.x, p.y, p.z) || 1, ux = p.x / l, uy = p.y / l, uz = p.z / l;
  let gx = 0, gy = 0, gz = 0;
  for (const v of WAVES) {
    const c = Math.cos((v.x * p.x + v.y * p.y + v.z * p.z) * v.k - v.w * t) * v.A * v.k * along(v, ux, uy, uz);
    gx += c * v.x; gy += c * v.y; gz += c * v.z;
  }
  const d = gx * ux + gy * uy + gz * uz, k = swell.chop;
  out.x = (gx - d * ux) * k; out.y = (gy - d * uy) * k; out.z = (gz - d * uz) * k;
  return out;
}

/** The sea anything floating rides when the stage draws another than this swell: the planet's ocean, which gives
 *  its height and slope at a point the same way. */
let ridden: ((p: V3, slope?: V3) => number) | null = null;
export function rideOn(sea: ((p: V3, slope?: V3) => number) | null): void {
  ridden = sea;
}

/** The height (m) of the sea being drawn over its level at p, at t, and if asked its slope as waveSlope gives it. */
export function seaAt(p: V3, t: number, slope?: V3): number {
  if (ridden) return ridden(p, slope);
  if (slope) waveSlope(p, t, slope);
  return waveHeight(p, t);
}
