// The islands' coasts as the charts draw them: each a ring of points on the unit sphere, traced once from the
// island's own coast (world/planet-islands.ts) round its centre, with the island itself (for the minimap's land).

import type { IslandSite } from '../world/planet';
import { fromChart, type Vec3 } from '../world/sphere';

export interface Coast { centre: Vec3; radius: number; ring: Vec3[]; site: IslandSite }

/** Each island's coast as `n` points round it. */
export function traceCoasts(islands: readonly IslandSite[], n = 72): Coast[] {
  return islands.map((s) => ({
    centre: s.chart.at,
    radius: s.radius,
    site: s,
    ring: Array.from({ length: n }, (_, i) => {
      const theta = (i / n) * Math.PI * 2, r = s.coast(theta);
      return fromChart(s.chart, r * Math.cos(theta), r * Math.sin(theta));
    }),
  }));
}
