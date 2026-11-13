// The islands' coasts as the charts draw them: each a ring of points on the unit sphere, traced once from the
// island's own coast (world/planet-islands.ts) round its centre.

import type { IslandSite } from '../world/planet';
import { fromChart, type Vec3 } from '../world/sphere';

export interface Coast { centre: Vec3; radius: number; ring: Vec3[] }

/** Each island's coast as `n` points round it: those that stand out of the sea (a shoal has no coast). */
export function traceCoasts(islands: readonly IslandSite[], n = 72): Coast[] {
  return islands.filter((s) => s.summit > 0).map((s) => ({
    centre: s.chart.at,
    radius: s.radius,
    ring: Array.from({ length: n }, (_, i) => {
      const theta = (i / n) * Math.PI * 2, r = s.coast(theta);
      return fromChart(s.chart, r * Math.cos(theta), r * Math.sin(theta));
    }),
  }));
}
