// The coasts as the charts draw them (the minimap, the globe): the world's, each a run of points on the unit sphere,
// the land's coast cut into runs a block of cells long (world/coastline.ts, traced once as the world is built:
// environment.ts); the land itself the minimap draws from the ground round her (ground.ts).

import type { Planet } from '../world/planet.ts';
import { add, distance, normalize, type Vec3 } from '../world/sphere.ts';

/** A run of coast: its middle, how far from it it reaches (metres), and its points (a closed run's last its first:
 *  world/coastline.ts, so each is traced open). */
export interface Coast { centre: Vec3; reach: number; ring: Vec3[] }

/** What the charts draw of the land: its coasts, and the ground's height over the sea and its highest (the minimap
 *  paints the land round her from them). */
export interface Shores { coasts: Coast[]; ground: { height: (p: Vec3) => number; top: number } }

/** The planet's coasts (`rings`, the world's) and ground, `top` its highest (metres). */
export function shoresOf(planet: Planet, rings: Vec3[][], top: number): Shores {
  const coasts = rings.map((ring) => {
    let sum: Vec3 = [0, 0, 0];
    for (const p of ring) sum = add(sum, p);
    const centre = normalize(sum);
    // (a loop, not a spread: a coast may run to more points than a call takes arguments)
    let reach = 0;
    for (const p of ring) reach = Math.max(reach, distance(centre, p));
    return { centre, reach, ring };
  });
  return { coasts, ground: { height: planet.height, top } };
}
