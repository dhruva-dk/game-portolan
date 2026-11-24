import { charted, sound, type Chart } from './route.ts';
import { berthing, type Berthing, type Spawn } from './spawn.ts';
import type { Depth } from './shoal.ts';
import type { Planet, Rise } from '../world/planet.ts';
import type { Vec3 } from '../world/sphere.ts';
import { flat, type Hull } from '../world/swell.ts';

export interface Soundings {
  chart: Chart;
  water: Berthing;
}

export interface Berthed {
  match: number;
  spawns: readonly Spawn[];
}

export interface Waters extends Soundings {
  depth: Depth;
  rises: readonly Rise[];
  sea: Hull;
  berthed?: Berthed;
}

export type Ground = Pick<Planet, 'height' | 'rises'>;

export function sounded(depth: Depth) {
  const { open, clear } = sound(depth);
  return { open, clear, water: berthing(depth) };
}

export const watered = (
  ground: Ground,
  soundings: Soundings,
  sea: Hull = flat
): Waters => ({
  ...soundings,
  depth: (p: Vec3) => -ground.height(p),
  rises: ground.rises,
  sea,
});

export function watersAt(ground: Ground, sea: Hull = flat): Waters {
  const s = sounded((p: Vec3) => -ground.height(p));
  return watered(ground, { chart: charted(s), water: s.water }, sea);
}
