// What stands on the terrain's land (world/terrain-scatter.ts says where): the
// palms, shrubs and rocks (palms.ts, shrubs.ts, rocks.ts), each kind instanced
// across the tiles in view (site.ts).
//
// A tile is drawn if what stands on it rises over the eye's horizon and it
// stands in the camera's view; they are ordered nearest first each frame, and
// the instances rewritten when that changes. Each kind comes in levels of
// detail, coarser farther off (REACH): a tile's things are drawn at the level
// its distance from the eye falls in. The shadow map (shadow.ts) covers the
// land round the tile nearest the eye, SHADE metres out from its middle: the
// tiles whose things reach into it cast, at their finest, in view or not (the
// map's own instances: site.ts casting).

import { Sphere, Vector3 } from 'three/webgpu';
import type { Eye, View } from '../view/view.ts';
import type { World } from '../environment.ts';
import { builtOn } from '../world/harbour.ts';
import {
  R,
  distance,
  fromChart,
  horizonDistance,
  place,
} from '../world/sphere.ts';
import { scatterTerrain } from '../world/terrain-scatter.ts';
import type { Light } from '../sky/light.ts';
import { createPalms } from './palms.ts';
import { KINDS, createRocks } from './rocks.ts';
import type { Shade } from './shadow.ts';
import { SHAPES, createShrubs } from './shrubs.ts';
import type { Instances } from './site.ts';

/**
 * The tallest a palm stands over the ground, metres; how far past a tile its
 * palms lean; how deep under the sea a rock's foot goes.
 */
const TOPS = 14,
  LEANS = 15,
  FOOT = 5;
/** How far out the shadow map reaches from the middle of the tile nearest the eye, metres. */
const SHADE = 90;
/**
 * Out to how far from the eye each of a kind's levels of detail is drawn,
 * metres, nearest first; past the last, none of the kind. A palm 10 m tall
 * stands some 80 pixels tall at 90 m, 35 at 220 and 13 at 600 (60° across the
 * iPad's 820 pixels); from space (the full map, 1200 m and more) a few. Shrubs
 * aren't drawn past 400 m, where one is a few pixels and the land runs to the
 * horizon.
 */
const REACH = {
  palms: [90, 220, 600, Infinity],
  shrubs: [90, 220, 400],
  rocks: [160, 600, Infinity],
};

export function createGroves(
  world: Pick<World, 'land' | 'planet' | 'seed' | 'harbour'>,
  view: View,
  light: Light
) {
  const { planet, harbour } = world;
  const tiles = scatterTerrain(world.land, planet, world.seed, {
    shrubs: SHAPES,
    big: KINDS.big.shapes,
    boulders: KINDS.boulder.shapes,
  });
  const charts = tiles.map((t) => t.chart);
  /** What of a tile's things stands clear of the harbour's buildings. */
  const clear = <T extends { x: number; z: number }>(
    kind: (t: (typeof tiles)[number]) => T[]
  ) =>
    tiles.map((t) =>
      kind(t).filter((o) => !builtOn(harbour, fromChart(t.chart, o.x, o.z)))
    );
  const rocks = createRocks(
    clear((t) => t.rocks),
    charts,
    view,
    light
  );
  const palms = createPalms(
    clear((t) => t.palms),
    charts,
    light
  );
  const shrubs = createShrubs(
    clear((t) => t.shrubs),
    charts,
    light
  );
  // the finest cast (the shadow map covers only tiles near the eye)
  const casters = [...rocks[0], ...palms[0], ...shrubs[0]];
  // each level's instances, and the run of the tiles seen it draws: from the
  // first past the level before's reach (CUTS[from], or the first seen) to the
  // last within its own (CUTS[to])
  const CUTS = [...new Set(Object.values(REACH).flat())].sort((a, b) => a - b);
  const levels = (
    [
      [palms, REACH.palms],
      [shrubs, REACH.shrubs],
      [rocks, REACH.rocks],
    ] as const
  ).flatMap(([kind, reach]) =>
    kind.map((drawn: Instances[], j) => ({
      drawn,
      from: j === 0 ? -1 : CUTS.indexOf(reach[j - 1]),
      to: CUTS.indexOf(reach[j]),
    }))
  );
  // a sphere round all that stands on each tile, from under the sea to its
  // palms' tops, the planet's curve under it too
  const bounds = tiles.map((t) => {
    const low = -FOOT - (t.reach + LEANS) ** 2 / (2 * R),
      high = t.top + TOPS;
    return new Sphere(
      new Vector3(...place(t.chart.at, (low + high) / 2)),
      Math.hypot(t.reach + LEANS, (high - low) / 2)
    );
  });
  const shades: Shade[] = tiles.map((t) => ({ chart: t.chart, reach: SHADE }));
  const n = tiles.length,
    off = new Float64Array(n);
  // every tile nearest first, kept from frame to frame (so sorting it again
  // moves few); the tiles seen, nearest first, and as last shown; the tiles
  // the shadow map covers
  const order = Int32Array.from({ length: n }, (_, i) => i),
    seen = new Int32Array(n),
    shown = new Int32Array(n),
    covered = new Int32Array(n);
  // how many tiles are seen, and how many of them lie within each of CUTS; and
  // as last shown; the tile nearest the eye as last cast
  let saw = 0,
    showed = -1,
    cast = -1;
  const cuts = new Int32Array(CUTS.length),
    was = new Int32Array(CUTS.length);

  /**
   * Whether the tiles seen, and how they are cut, are as last shown; if not,
   * they are from now on.
   */
  const unchanged = (): boolean => {
    let same = saw === showed;
    for (let k = 0; same && k < CUTS.length; k++) same = cuts[k] === was[k];
    for (let k = 0; same && k < saw; k++) same = seen[k] === shown[k];
    if (same) return true;
    shown.set(seen.subarray(0, saw));
    was.set(cuts);
    showed = saw;
    return false;
  };

  return {
    meshes: levels.flatMap((l) => l.drawn.map((c) => c.mesh)),
    /** What casts shadows: each kind's instances. */
    casters,
    /**
     * Draws the tiles the eye can see; returns what the shadow map covers (null
     * if there is no land).
     */
    update(eye: Readonly<Eye>): Shade | null {
      if (n === 0) return null;
      const horizon = horizonDistance(eye.height);
      for (let i = 0; i < n; i++)
        off[i] = distance(eye.position, tiles[i].chart.at) - tiles[i].reach;
      // (by insertion: what was in order last frame nearly is still)
      for (let k = 1; k < n; k++) {
        const i = order[k];
        let j = k - 1;
        for (; j >= 0 && off[order[j]] > off[i]; j--) order[j + 1] = order[j];
        order[j + 1] = i;
      }
      const nearest = order[0];
      if (nearest !== cast) {
        cast = nearest;
        const centre = tiles[nearest].chart.at;
        let m = 0;
        for (let i = 0; i < n; i++)
          if (
            distance(tiles[i].chart.at, centre) <
            SHADE + tiles[i].reach + LEANS
          )
            covered[m++] = i;
        for (const c of casters) c.cast(covered, 0, m);
      }
      saw = 0;
      let c = 0;
      for (let k = 0; k < n; k++) {
        const i = order[k],
          t = tiles[i];
        if (
          off[i] - LEANS < horizon + horizonDistance(t.top + TOPS) &&
          eye.frustum.intersectsSphere(bounds[i])
        ) {
          // (seen is nearest first, so the tiles within each cut are a run of it)
          const d = Math.hypot(Math.max(off[i], 0), eye.height);
          for (; c < CUTS.length && d >= CUTS[c]; c++) cuts[c] = saw;
          seen[saw++] = i;
        }
      }
      for (; c < CUTS.length; c++) cuts[c] = saw;
      if (!unchanged())
        for (const { drawn, from, to } of levels)
          for (const d of drawn)
            d.show(seen, from < 0 ? 0 : cuts[from], cuts[to]);
      return shades[nearest];
    },
  };
}
