// The planet's islands (world/planet.ts) and all that stands on them: each island's ground (land.ts), its rocks,
// palms and shrubs (where: world/scatter.ts), each kind instanced across all the islands (site.ts).
//
// Only the islands that can be seen are drawn: those whose apron or palms rise over the eye's horizon, and stand in
// the camera's view. They are ordered nearest first each frame, the nearest that stands out of the sea always first
// (the shadow map covers it: shadow.ts, in view or not), and the instances rewritten when that changes. The rocks of
// islands more than FAR metres off are drawn at their coarser level (rocks.ts), and the palms and shrubs of those more
// than DETAIL off at theirs (site.ts).

import { Sphere, Vector3 } from 'three/webgpu';
import type { Eye, View } from '../view/view';
import type { Planet } from '../world/planet';
import { isle, litter, scatterPalms, scatterRocks, scatterShrubs } from '../world/scatter';
import { R, distance, horizonDistance, place } from '../world/sphere';
import { createLand } from './land';
import type { Light } from '../sky/light';
import { createPalms } from './palms';
import { KINDS, createRocks } from './rocks';
import type { Sand } from './sand';
import type { Shade } from './shadow';
import { SHAPES, createShrubs } from './shrubs';
import { DETAIL } from './site';

/** The tallest a palm stands over an island's summit, metres: how far over the horizon an island can show. */
const TOPS = 14;
/** How far past its apron what stands on an island reaches (palms lean over the water), and how deep under the sea's
 *  level anything on it goes, metres. */
const LEANS = 15, FOOT = 5;
/** Past this many metres from the eye, an island's rocks are drawn coarser: a rock mass is a few pixels across. */
const FAR = 250;

export function createIslands(planet: Planet, seed: number, view: View, light: Light, sand: Sand) {
  const sites = planet.islands, isles = sites.map((s) => isle(s, planet.height)), charts = sites.map((s) => s.chart);
  // each island's own seed, from the planet's
  const own = (k: number) => seed * 1009 + k + 1;
  const rocks = isles.map((i, k) => scatterRocks(i, KINDS.big.shapes, KINDS.boulder.shapes, own(k)));
  const palms = isles.map((i, k) => scatterPalms(i, rocks[k], own(k)));
  const shrubs = isles.map((i, k) => scatterShrubs(i, rocks[k], SHAPES, own(k)));
  const lands = createLand(isles, isles.map((_, k) => litter(palms[k], shrubs[k])), sand);
  const rocky = createRocks(rocks, charts, view, light), trees = createPalms(palms, charts, light), bushes = createShrubs(shrubs, charts, light);
  const kinds = {
    rocks: rocky.near, palms: trees.near, shrubs: bushes.near,
    'rocks far': rocky.far, 'palms coarse': trees.coarse, 'shrubs coarse': bushes.coarse,
  };
  const fine = [...trees.near, ...bushes.near], coarse = [...trees.coarse, ...bushes.coarse];
  // (only the near cast: the shadow map covers the nearest island, whose things are always drawn near)
  const casters = [...rocky.near, ...fine];
  // (named for the meter's split: meter.ts)
  lands.forEach((m) => (m.name = 'land'));
  for (const [name, list] of Object.entries(kinds)) list.forEach((c, k) => (c.mesh.name = `${name} ${k}`));
  let shown: string | null = null;
  // what the shadow map covers on each: out past its coast, where palms lean over the water
  const shades: Shade[] = sites.map((s) => ({
    chart: s.chart,
    reach: Math.max(...Array.from({ length: 360 }, (_, i) => s.coast((i / 180) * Math.PI))) + LEANS,
  }));
  // a sphere round all that stands on each island: its apron and past, from under the sea to its palms' tops, the
  // planet's curve under it too
  const bounds = sites.map((s) => {
    const low = -FOOT - (s.shelf + LEANS) ** 2 / (2 * R), high = Math.max(s.summit, 0) + TOPS;
    return new Sphere(new Vector3(...place(s.chart.at, (low + high) / 2)), Math.hypot(s.shelf + LEANS, (high - low) / 2));
  });
  return {
    meshes: [...lands, ...casters.map((c) => c.mesh), ...[...rocky.far, ...coarse].map((c) => c.mesh)],
    /** What casts shadows: each kind's instances. */
    casters,
    /** Draws the islands the eye can see; returns what the shadow map covers: the nearest of them above the sea, in
     *  view or not (null if none). */
    update(eye: Readonly<Eye>): Shade | null {
      const horizon = horizonDistance(eye.height);
      const off = sites.map((s) => distance(eye.position, s.chart.at) - s.radius);
      const order = sites
        .map((_, i) => i)
        .filter((i) => off[i] + sites[i].radius - sites[i].shelf < horizon + horizonDistance(sites[i].summit + TOPS))
        .sort((a, b) => off[a] - off[b]);
      // (the nearest that stands out of the sea: nothing on a shoal casts a shadow)
      const nearest = order.find((i) => sites[i].summit > 0);
      const drawn = order.filter((i) => i !== nearest && eye.frustum.intersectsSphere(bounds[i]));
      if (nearest !== undefined) drawn.unshift(nearest);
      const within = (d: number) => (i: number) => i === nearest || Math.hypot(off[i], eye.height) < d;
      const near = drawn.filter(within(FAR)), far = drawn.filter((i) => !near.includes(i));
      const close = drawn.filter(within(DETAIL)), away = drawn.filter((i) => !close.includes(i));
      const key = `${near.join()}|${far.join()}|${close.length}`;
      if (key !== shown) {
        shown = key;
        lands.forEach((m, i) => (m.visible = drawn.includes(i)));
        for (const c of fine) c.show(close);
        for (const c of coarse) c.show(away);
        for (const c of rocky.near) c.show(near);
        for (const c of rocky.far) c.show(far);
      }
      return nearest === undefined ? null : shades[nearest];
    },
  };
}
