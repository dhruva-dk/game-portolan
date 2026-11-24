import { charted, sound, type Chart } from './route.ts';
import { berthing, type Berthing } from './spawn.ts';
import type { Vec3 } from '../world/sphere.ts';

export interface Waters {
  chart: Chart;
  water: Berthing;
}

export function sounded(depth: (p: Vec3) => number) {
  const { open, clear } = sound(depth);
  return { open, clear, water: berthing(depth) };
}

export function watersAt(depth: (p: Vec3) => number): Waters {
  const s = sounded(depth);
  return { chart: charted(s), water: s.water };
}
