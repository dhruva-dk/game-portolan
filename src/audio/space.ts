import { bearingFrom, type Eye } from '../snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';

export { bearingFrom } from '../snapshot.ts';

export const SPEED = 340;
export const NEAR = 14,
  FALL = 0.8;
const QUIET = 0.005;
const OPEN = 16000,
  DULL = 90,
  FLOOR = 550;

export interface Heard {
  audible: boolean;
  delay: number;
  gain: number;
  cutoff: number;
  pan: number;
}

export const heard = (): Heard => ({
  audible: false,
  delay: 0,
  gain: 0,
  cutoff: OPEN,
  pan: 0,
});

export function rolloff(meters: number, reach: number): number {
  if (meters >= reach) return 0;
  const edge = Math.min(1, (reach - meters) / (reach * 0.2));
  return (
    Math.min(1, NEAR / Math.max(NEAR, meters)) ** FALL *
    edge *
    edge *
    (3 - 2 * edge)
  );
}

export const cutoffAt = (meters: number) =>
  Math.max(FLOOR, OPEN / (1 + meters / DULL));

export const panOf = (bearing: number) => 0.85 * Math.sin(bearing);

export function hear(eye: Eye, p: Vec3, reach: number, out: Heard): Heard {
  const dx = p[0] - eye.position[0],
    dy = p[1] - eye.position[1],
    dz = p[2] - eye.position[2];
  const meters = Math.sqrt(dx * dx + dy * dy + dz * dz),
    gain = rolloff(meters, reach);
  out.audible = gain >= QUIET;
  out.delay = meters / SPEED;
  out.gain = gain;
  const bearing = bearingFrom(eye, p),
    behind = Math.max(0, -Math.cos(bearing));
  out.cutoff = cutoffAt(meters) * (1 - 0.35 * behind);
  out.pan = panOf(bearing);
  return out;
}

export function close(out: Heard, gain = 1): Heard {
  out.audible = true;
  out.delay = 0;
  out.gain = gain;
  out.cutoff = OPEN;
  out.pan = 0;
  return out;
}
