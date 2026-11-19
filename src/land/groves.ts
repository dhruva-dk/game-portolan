// What stands on the terrain's land (world/terrain-scatter.ts says where): the palms, shrubs and rocks (palms.ts,
// shrubs.ts, rocks.ts), each kind instanced across the tiles in view (site.ts).
//
// A tile is drawn if what stands on it rises over the eye's horizon and it stands in the camera's view; they are
// ordered nearest first each frame, and the instances rewritten when that changes. The shadow map (shadow.ts) covers
// the land round the tile nearest the eye, SHADE metres out from its middle: the tiles whose things reach into it come
// first, in view or not, so all of them cast. Past DETAIL metres off a tile's palms and shrubs are drawn coarser
// (site.ts), past FAR its rocks (rocks.ts), and past BUSHES its shrubs not at all.

import { Sphere, Vector3 } from 'three/webgpu';
import type { Eye, View } from '../view/view.ts';
import type { Planet } from '../world/planet.ts';
import { R, distance, horizonDistance, place } from '../world/sphere.ts';
import type { Terrain } from '../world/terrain.ts';
import { scatterTerrain } from '../world/terrain-scatter.ts';
import type { Light } from '../sky/light.ts';
import { createPalms } from './palms.ts';
import { KINDS, createRocks } from './rocks.ts';
import type { Shade } from './shadow.ts';
import { SHAPES, createShrubs } from './shrubs.ts';
import { DETAIL } from './site.ts';

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
  const fine = [...palms.near, ...shrubs.near];
  // a sphere round all that stands on each tile, from under the sea to its palms' tops, the planet's curve under it too
  const bounds = tiles.map((t) => {
    const low = -FOOT - (t.reach + LEANS) ** 2 / (2 * R), high = t.top + TOPS;
    return new Sphere(new Vector3(...place(t.chart.at, (low + high) / 2)), Math.hypot(t.reach + LEANS, (high - low) / 2));
  });
  const shades: Shade[] = tiles.map((t) => ({ chart: t.chart, reach: SHADE }));
  const n = tiles.length, off = new Float64Array(n);
  // every tile nearest first, kept from frame to frame (so sorting it again moves few); the tiles drawn, those the
  // shadow map covers and then those seen, each nearest first, and those seen while they are sorted out
  const order = Int32Array.from({ length: n }, (_, i) => i), drawn = new Int32Array(n), seen = new Int32Array(n);
  // the tiles drawn: how many, how many of them covered, and how many of those seen lie within DETAIL, FAR and BUSHES
  let count = 0, covered = 0, close = 0, near = 0, bushy = 0;
  // and as last shown
  const shown = new Int32Array(n), was = { count: -1, covered: 0, close: 0, near: 0, bushy: 0 };

  /** Whether the tiles drawn, and how they are cut, are as last shown; if not, they are from now on. */
  const unchanged = (): boolean => {
    let same = count === was.count && covered === was.covered && close === was.close && near === was.near && bushy === was.bushy;
    for (let k = 0; same && k < count; k++) same = drawn[k] === shown[k];
    if (same) return true;
    for (let k = 0; k < count; k++) shown[k] = drawn[k];
    was.count = count; was.covered = covered; was.close = close; was.near = near; was.bushy = bushy;
    return false;
  };

  return {
    meshes: [...casters, ...rocky.far, ...palms.coarse, ...shrubs.coarse].map((c) => c.mesh),
    /** What casts shadows: each kind's instances. */
    casters,
    /** Draws the tiles the eye can see; returns what the shadow map covers (null if there is no land). */
    update(eye: Readonly<Eye>): Shade | null {
      if (n === 0) return null;
      const horizon = horizonDistance(eye.height);
      for (let i = 0; i < n; i++) off[i] = distance(eye.position, tiles[i].chart.at) - tiles[i].reach;
      // (by insertion: what was in order last frame nearly is still)
      for (let k = 1; k < n; k++) {
        const i = order[k];
        let j = k - 1;
        for (; j >= 0 && off[order[j]] > off[i]; j--) order[j + 1] = order[j];
        order[j + 1] = i;
      }
      const nearest = order[0], centre = tiles[nearest].chart.at;
      let saw = 0;
      covered = close = near = bushy = 0;
      for (let k = 0; k < n; k++) {
        const i = order[k], t = tiles[i];
        if (distance(t.chart.at, centre) < SHADE + t.reach + LEANS) drawn[covered++] = i;
        else if (off[i] - LEANS < horizon + horizonDistance(t.top + TOPS) && eye.frustum.intersectsSphere(bounds[i])) {
          seen[saw++] = i;
          const d = Math.hypot(off[i], eye.height);
          close += +(d < DETAIL);
          near += +(d < FAR);
          bushy += +(d < BUSHES);
        }
      }
      // (seen is nearest first, so each of close, near and bushy is a run of it)
      for (let k = 0; k < saw; k++) drawn[covered + k] = seen[k];
      count = covered + saw;
      if (unchanged()) return shades[nearest];
      for (const c of fine) c.show(drawn, 0, covered + close, covered);
      for (const c of palms.coarse) c.show(drawn, covered + close, count);
      for (const c of shrubs.coarse) c.show(drawn, covered + close, covered + Math.max(close, bushy));
      for (const c of rocky.near) c.show(drawn, 0, covered + near, covered);
      for (const c of rocky.far) c.show(drawn, covered + near, count);
      return shades[nearest];
    },
  };
}
