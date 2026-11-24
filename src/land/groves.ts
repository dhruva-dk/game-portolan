import { Sphere, Vector3 } from 'three/webgpu';
import type { Eye, View } from '../view/view.ts';
import type { World } from '../environment.ts';
import { R, distance, horizonDistance, place } from '../world/sphere.ts';
import { scatterTerrain } from '../world/terrain-scatter.ts';
import type { Light } from '../sky/light.ts';
import { createPalms } from './palms.ts';
import { KINDS, createRocks } from './rocks.ts';
import type { Shade } from './shadow.ts';
import { SHAPES, createShrubs } from './shrubs.ts';
import type { Instances } from './site.ts';

const TOPS = 14,
  LEANS = 15,
  FOOT = 5;
const SHADE = 90;
const REACH = {
  palms: [90, 220, 600, Infinity],
  shrubs: [90, 220, 400],
  rocks: [160, 600, Infinity],
};

export function createGroves(
  world: Pick<World, 'land' | 'planet' | 'seed'>,
  view: View,
  light: Light
) {
  const { planet } = world;
  const tiles = scatterTerrain(world.land, planet, world.seed, {
    shrubs: SHAPES,
    big: KINDS.big.shapes,
    boulders: KINDS.boulder.shapes,
  });
  const charts = tiles.map((t) => t.chart);
  const rocks = createRocks(
    tiles.map((t) => t.rocks),
    charts,
    view,
    light
  );
  const palms = createPalms(
    tiles.map((t) => t.palms),
    charts,
    light
  );
  const shrubs = createShrubs(
    tiles.map((t) => t.shrubs),
    charts,
    light
  );
  const casters = [...rocks[0], ...palms[0], ...shrubs[0]];
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
  const order = Int32Array.from({ length: n }, (_, i) => i),
    seen = new Int32Array(n),
    shown = new Int32Array(n),
    covered = new Int32Array(n);
  let saw = 0,
    showed = -1,
    cast = -1;
  const cuts = new Int32Array(CUTS.length),
    was = new Int32Array(CUTS.length);

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
    casters,
    update(eye: Readonly<Eye>): Shade | null {
      if (n === 0) return null;
      const horizon = horizonDistance(eye.height);
      for (let i = 0; i < n; i++)
        off[i] = distance(eye.position, tiles[i].chart.at) - tiles[i].reach;
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
