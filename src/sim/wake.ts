import { distance, put, type Out3, type Vec3 } from '../world/sphere.ts';

export interface WakePoint {
  at: Out3;
  time: number;
  speed: number;
}

export const WAKE = {
  spacing: 1.5,
  every: 0.25,
  life: 24,
  most: 64,
  jump: 40,
} as const;

const spare: WakePoint[] = [];

export function lay(
  points: WakePoint[],
  at: Vec3,
  time: number,
  speed: number
): boolean {
  const last = points[0];
  const gone = last ? distance(last.at, at) : Infinity;
  let kept = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (gone <= WAKE.jump && time - p.time < WAKE.life) points[kept++] = p;
    else spare.push(p);
  }
  points.length = kept;
  const on = kept > 0 && points[0] === last;
  if (
    !last ||
    gone > WAKE.jump ||
    gone >= Math.max(WAKE.spacing, speed * WAKE.every)
  ) {
    const p = spare.pop() ?? { at: [0, 0, 0], time, speed };
    put(p.at, at[0], at[1], at[2]);
    p.time = time;
    p.speed = speed;
    points.push(p);
    for (let i = points.length - 1; i > 0; i--) points[i] = points[i - 1];
    points[0] = p;
  }
  while (points.length > WAKE.most) spare.push(points.pop()!);
  return on;
}
