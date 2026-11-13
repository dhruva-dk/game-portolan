// The planet's islands (world/planet.ts) and all that stands on them: each island's ground (land.ts), its rocks,
// palms and shrubs (where: world/scatter.ts), each kind instanced across all the islands (site.ts).
//
// Only the islands that can be seen are drawn: those whose apron or palms rise over the eye's horizon, and stand in
// the camera's view. They are ordered nearest first each frame, the nearest that stands out of the sea always first
// (the shadow map covers it: shadow.ts, in view or not), and the instances rewritten when that changes.

import { Frustum, Matrix4, Sphere, Vector3, type Camera } from 'three/webgpu';
import type { Eye, View } from '../view/view';
import type { IslandSite, Planet } from '../world/planet';
import { isle, litter, scatterPalms, scatterRocks, scatterShrubs } from '../world/scatter';
import { R, distance, horizonDistance, place } from '../world/sphere';
import { createLand } from './land';
import type { Light } from '../sky/light';
import { createPalms } from './palms';
import { KINDS, createRocks } from './rocks';
import type { Sand } from './sand';
import { SHAPES, createShrubs } from './shrubs';

/** The tallest a palm stands over an island's summit, metres: how far over the horizon an island can show. */
const TOPS = 14;
/** How far past its apron what stands on an island reaches (palms lean over the water), and how deep under the sea's
 *  level anything on it goes, metres. */
const LEANS = 15, FOOT = 5;

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
  // a sphere round all that stands on each island: its apron and past, from under the sea to its palms' tops, the
  // planet's curve under it too
  const bounds = sites.map((s) => {
    const low = -FOOT - (s.shelf + LEANS) ** 2 / (2 * R), high = Math.max(s.summit, 0) + TOPS;
    return new Sphere(new Vector3(...place(s.chart.at, (low + high) / 2)), Math.hypot(s.shelf + LEANS, (high - low) / 2));
  });
  const frustum = new Frustum(), m = new Matrix4();

  return {
    meshes: [...lands, ...casters.map((c) => c.mesh)],
    /** What casts shadows: each kind's instances. */
    casters,
    /** Draws the islands the eye (seeing through `camera`) can see; returns the nearest of them above the sea, in
     *  view or not (null if none). */
    update(eye: Eye, camera: Camera): IslandSite | null {
      const horizon = horizonDistance(eye.height);
      const order = sites
        .map((s, i) => ({ i, d: distance(eye.position, s.chart.at) - s.radius }))
        .filter(({ i, d }) => d + sites[i].radius - sites[i].shelf < horizon + horizonDistance(sites[i].summit + TOPS))
        .sort((a, b) => a.d - b.d)
        .map(({ i }) => i);
      // (the nearest that stands out of the sea: nothing on a shoal casts a shadow)
      const nearest = order.find((i) => sites[i].summit > 0);
      frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const drawn = order.filter((i) => i !== nearest && frustum.intersectsSphere(bounds[i]));
      if (nearest !== undefined) drawn.unshift(nearest);
      const key = drawn.join();
      if (key !== shown) {
        shown = key;
        lands.forEach((m, i) => (m.visible = drawn.includes(i)));
        for (const c of casters) c.show(drawn);
      }
      return nearest === undefined ? null : sites[nearest];
    },
  };
}
