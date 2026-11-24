import type { Planet } from '../../world/planet.ts';
import { add, distance, normalize, type Vec3 } from '../../world/sphere.ts';

export interface Coast {
  center: Vec3;
  reach: number;
  ring: Vec3[];
}

export interface Shores {
  coasts: Coast[];
  ground: { height: (p: Vec3) => number; top: number };
}

export function shoresOf(planet: Planet, rings: Vec3[][], top: number): Shores {
  const coasts = rings.map((ring) => {
    let sum: Vec3 = [0, 0, 0];
    for (const p of ring) sum = add(sum, p);
    const center = normalize(sum);
    let reach = 0;
    for (const p of ring) reach = Math.max(reach, distance(center, p));
    return { center, reach, ring };
  });
  return { coasts, ground: { height: planet.height, top } };
}
