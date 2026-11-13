// The planet's islands (world/planet.ts) and all that stands on them: each island's ground (land.ts), its rocks,
// palms and shrubs (where: world/scatter.ts), each kind instanced across all the islands (site.ts).
//
// Only the islands that can be seen are drawn: those whose apron or palms rise over the eye's horizon. They are
// ordered nearest first each frame (the shadow map covers the nearest: shadow.ts), and the instances rewritten when
// that changes.

import type { Eye, View } from '../view/view';
import type { IslandSite, Planet } from '../world/planet';
import { isle, litter, scatterPalms, scatterRocks, scatterShrubs } from '../world/scatter';
import { distance, horizonDistance } from '../world/sphere';
import { createLand } from './land';
import type { Light } from '../sky/light';
import { createPalms } from './palms';
import { KINDS, createRocks } from './rocks';
import type { Sand } from './sand';
import { SHAPES, createShrubs } from './shrubs';

/** The tallest a palm stands over an island's summit, metres: how far over the horizon an island can show. */
const TOPS = 14;

export function createIslands(planet: Planet, seed: number, view: View, light: Light, sand: Sand) {
  const sites = planet.islands, isles = sites.map((s) => isle(s, planet.height)), charts = sites.map((s) => s.chart);
  // each island's own seed, from the planet's
  const own = (k: number) => seed * 1009 + k + 1;
  const rocks = isles.map((i, k) => scatterRocks(i, KINDS.big.shapes, KINDS.boulder.shapes, own(k)));
  const palms = isles.map((i, k) => scatterPalms(i, rocks[k], own(k)));
  const shrubs = isles.map((i, k) => scatterShrubs(i, rocks[k], SHAPES, own(k)));
  const lands = createLand(isles, isles.map((_, k) => litter(palms[k], shrubs[k])), sand);
  const kinds = { rocks: createRocks(rocks, charts, view, light), palms: createPalms(palms, charts, light), shrubs: createShrubs(shrubs, charts, light) };
  const casters = Object.values(kinds).flat();
  // (named for the meter's split: meter.ts)
  lands.forEach((m) => (m.name = 'land'));
  for (const [name, list] of Object.entries(kinds)) list.forEach((c, k) => (c.mesh.name = `${name} ${k}`));
  let shown: string | null = null;

  return {
    meshes: [...lands, ...casters.map((c) => c.mesh)],
    /** What casts shadows: each kind's instances. */
    casters,
    /** Draws the islands the eye can see; returns the nearest of them above the sea (null if none). */
    update(eye: Eye): IslandSite | null {
      const horizon = horizonDistance(eye.height);
      const order = sites
        .map((s, i) => ({ i, d: distance(eye.position, s.chart.at) - s.radius }))
        .filter(({ i, d }) => d + sites[i].radius - sites[i].shelf < horizon + horizonDistance(sites[i].summit + TOPS))
        .sort((a, b) => a.d - b.d)
        .map(({ i }) => i);
      const key = order.join();
      if (key !== shown) {
        shown = key;
        lands.forEach((m, i) => (m.visible = order.includes(i)));
        for (const c of casters) c.show(order);
      }
      // (the nearest that stands out of the sea: nothing on a shoal casts a shadow)
      const nearest = order.find((i) => sites[i].summit > 0);
      return nearest === undefined ? null : sites[nearest];
    },
  };
}
