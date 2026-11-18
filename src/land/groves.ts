// What stands on the terrain's land (world/terrain-scatter.ts says where), drawn as the islands' things are: the
// palms, shrubs and rocks (palms.ts, shrubs.ts, rocks.ts), each kind instanced across the tiles in view (site.ts), a
// tile standing where an island would.
//
// A tile is drawn if what stands on it rises over the eye's horizon and it stands in the camera's view; they are
// ordered nearest first each frame, and the instances rewritten when that changes. The shadow map (shadow.ts) covers
// the land round the tile nearest the eye, SHADE metres out from its middle: the tiles whose things reach into it come
// first, in view or not, so all of them cast. Past DETAIL metres off a tile's palms and shrubs are drawn coarser
// (site.ts), past FAR its rocks (rocks.ts), and past BUSHES its shrubs not at all.

import { Sphere, Vector3 } from 'three/webgpu';
import type { Eye, View } from '../view/view';
import type { Planet } from '../world/planet';
import { R, distance, horizonDistance, place } from '../world/sphere';
import type { Terrain } from '../world/terrain';
import { scatterTerrain } from '../world/terrain-scatter';
import type { Light } from '../sky/light';
import { createPalms } from './palms';
import { KINDS, createRocks } from './rocks';
import type { Shade } from './shadow';
import { SHAPES, createShrubs } from './shrubs';
import { DETAIL } from './site';

/** The tallest a palm stands over the ground, metres; how far past a tile its palms lean; how deep under the sea a
 *  rock's foot goes; past how far off a tile's rocks are drawn coarser. */
const TOPS = 14, LEANS = 15, FOOT = 5, FAR = 160;
/** How far out the shadow map reaches from the middle of the tile nearest the eye, metres; past how far off a tile's
 *  shrubs aren't drawn (a shrub is a few pixels there, and the land runs to the horizon). */
const SHADE = 90, BUSHES = 400;

export function createGroves(terrain: Terrain, planet: Planet, seed: number, view: View, light: Light) {
  const tiles = scatterTerrain(terrain, planet, seed, { shrubs: SHAPES, big: KINDS.big.shapes, boulders: KINDS.boulder.shapes });
  const charts = tiles.map((t) => t.chart);
  const rocky = createRocks(tiles.map((t) => t.rocks), charts, view, light);
  const palms = createPalms(tiles.map((t) => t.palms), charts, light);
  const shrubs = createShrubs(tiles.map((t) => t.shrubs), charts, light);
  // (only the near cast: the shadow map covers only tiles near the eye, whose things are drawn near)
  const casters = [...rocky.near, ...palms.near, ...shrubs.near];
  const kinds = {
    rocks: rocky.near, palms: palms.near, shrubs: shrubs.near,
    'rocks far': rocky.far, 'palms coarse': palms.coarse, 'shrubs coarse': shrubs.coarse,
  };
  // (named for the meter's split: meter.ts)
  for (const [name, list] of Object.entries(kinds)) list.forEach((c, k) => (c.mesh.name = `${name} ${k}`));
  // a sphere round all that stands on each tile, from under the sea to its palms' tops, the planet's curve under it too
  const bounds = tiles.map((t) => {
    const low = -FOOT - (t.reach + LEANS) ** 2 / (2 * R), high = t.top + TOPS;
    return new Sphere(new Vector3(...place(t.chart.at, (low + high) / 2)), Math.hypot(t.reach + LEANS, (high - low) / 2));
  });
  const shades: Shade[] = tiles.map((t) => ({ chart: t.chart, reach: SHADE }));
  const off = new Float64Array(tiles.length);
  let shown: string | null = null;

  return {
    meshes: Object.values(kinds).flat().map((c) => c.mesh),
    /** What casts shadows: each kind's instances. */
    casters,
    /** Draws the tiles the eye can see; returns what the shadow map covers (null if there is no land). */
    update(eye: Readonly<Eye>): Shade | null {
      if (tiles.length === 0) return null;
      const horizon = horizonDistance(eye.height);
      let nearest = 0;
      tiles.forEach((t, i) => {
        off[i] = distance(eye.position, t.chart.at) - t.reach;
        if (off[i] < off[nearest]) nearest = i;
      });
      const centre = tiles[nearest].chart.at, byOff = (a: number, b: number) => off[a] - off[b];
      const covered: number[] = [], seen: number[] = [];
      tiles.forEach((t, i) => {
        if (distance(t.chart.at, centre) < SHADE + t.reach + LEANS) covered.push(i);
        else if (off[i] - LEANS < horizon + horizonDistance(t.top + TOPS) && eye.frustum.intersectsSphere(bounds[i])) seen.push(i);
      });
      covered.sort(byOff);
      seen.sort(byOff);
      // (seen is nearest first, so each of these is a run of it)
      const within = (d: number) => seen.filter((i) => Math.hypot(off[i], eye.height) < d).length;
      const [close, near, bushy] = [within(DETAIL), within(FAR), within(BUSHES)];
      const key = `${covered.join()}|${seen.join()}|${close},${near},${bushy}`;
      if (key !== shown) {
        shown = key;
        const fine = [...covered, ...seen.slice(0, close)];
        for (const c of [...palms.near, ...shrubs.near]) c.show(fine, covered.length);
        for (const c of palms.coarse) c.show(seen.slice(close));
        for (const c of shrubs.coarse) c.show(seen.slice(close, Math.max(close, bushy)));
        for (const c of rocky.near) c.show([...covered, ...seen.slice(0, near)], covered.length);
        for (const c of rocky.far) c.show(seen.slice(near));
      }
      return shades[nearest];
    },
  };
}
