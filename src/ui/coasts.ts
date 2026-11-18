// The coasts as the charts draw them (the minimap, the globe), traced once: each a run of points on the unit sphere. On
// the islands, each island's coast, a ring round its centre traced from its own (world/planet-islands.ts), with the
// island itself for the minimap's land (isles.ts); on the terrain, its coast cut into runs a block of cells long
// (world/coastline.ts), its land drawn from the ground round her (ground.ts).

import type { Land } from '../world/land';
import type { IslandSite, Planet } from '../world/planet';
import { coastLines } from '../world/coastline';
import { add, distance, fromChart, normalize, type Vec3 } from '../world/sphere';

/** A run of coast: its middle, how far from it it reaches (metres; an island's apron too), its points, whether its
 *  last point joins its first, and its island if it is one's. */
export interface Coast { centre: Vec3; reach: number; ring: Vec3[]; closed: boolean; site: IslandSite | null }

/** What the charts draw of the land: its coasts, and on the terrain the ground's height over the sea and its highest
 *  (the minimap paints the land round her from them). */
export interface Shores { coasts: Coast[]; ground: { height: (p: Vec3) => number; top: number } | null }

/** The planet's coasts and ground; each island's coast as `n` points round it. */
export function shoresOf(planet: Planet, land: Land, n = 72): Shores {
  if (land.kind === 'terrain') {
    const coasts = coastLines(land.terrain.shore).map((ring) => {
      let sum: Vec3 = [0, 0, 0];
      for (const p of ring) sum = add(sum, p);
      const centre = normalize(sum);
      return { centre, reach: Math.max(...ring.map((p) => distance(centre, p))), ring, closed: false, site: null };
    });
    return { coasts, ground: { height: planet.height, top: land.terrain.stats.summit } };
  }
  return { coasts: islandCoasts(planet.islands, n), ground: null };
}

const islandCoasts = (islands: readonly IslandSite[], n: number): Coast[] => islands.map((s) => ({
  centre: s.chart.at,
  reach: s.shelf,
  site: s,
  closed: true,
  ring: Array.from({ length: n }, (_, i) => {
    const theta = (i / n) * Math.PI * 2, r = s.coast(theta);
    return fromChart(s.chart, r * Math.cos(theta), r * Math.sin(theta));
  }),
}));
