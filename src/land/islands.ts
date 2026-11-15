// The planet's islands (world/planet.ts) and all that stands on them: each island's ground (land.ts), its rocks,
// palms and shrubs (where: world/scatter.ts), each kind instanced across all the islands (site.ts).
//
// Only the islands that can be seen are drawn: those whose apron or palms rise over the eye's horizon, and stand in
// the camera's view. They are ordered nearest first each frame, the nearest that stands out of the sea always first
// (the shadow map covers it: shadow.ts, in view or not), and the instances rewritten when that changes. The rocks of
// islands more than FAR metres off are drawn at their coarser level (rocks.ts); past GROUND_FAR (from orbit, on the
// full map), their ground at its coarse grain (land.ts) and their rocks coarser still.
//
// What grows on an island, and its colours, are its planet's biome's (world/biome.ts, palette.ts GROUNDS): palms,
// shrubs and rocks as many as the biome says, its trees (trees.ts), and over a volcano's craters, steam (steam.ts).

import { Sphere, Vector3 } from 'three/webgpu';
import { release } from '../gpu';
import type { Eye, View } from '../view/view';
import type { IslandSite, Planet } from '../world/planet';
import { isle, litter, scatterPalms, scatterRocks, scatterShrubs, scatterTrees } from '../world/scatter';
import { GROUNDS } from '../palette';
import { SHAPES as TREE_SHAPES, createTrees } from './trees';
import { createSteam } from './steam';
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
/** Past this many metres from the eye, an island's rocks are drawn coarser: a rock mass is a few pixels across. */
const FAR = 250;
/** Past this many, its ground too (land.ts COARSE): from orbit, on the full map, or far over the horizon. */
const GROUND_FAR = 500;

export function createIslands(planet: Planet, seed: number, view: View, light: Light, sand: Sand) {
  const sites = planet.islands, isles = sites.map((s) => isle(s, planet.height)), charts = sites.map((s) => s.chart);
  // each island's own seed, from the planet's; what grows on it, and its colours, the biome's (world/biome.ts)
  const own = (k: number) => seed * 1009 + k + 1, { growth } = planet.biome, inks = GROUNDS[planet.biome.name];
  // (none on an island's clearings: a campus's plots, world/rookery.ts)
  const open = (k: number) => <T extends { x: number; z: number }>(list: T[]) =>
    list.filter((t) => !sites[k].clearings?.some((c) => Math.hypot(t.x - c.x, t.z - c.z) < c.radius));
  const rocks = isles.map((i, k) => open(k)(scatterRocks(i, KINDS.big.shapes, KINDS.boulder.shapes, own(k), growth.rocks)));
  const palms = isles.map((i, k) => open(k)(scatterPalms(i, rocks[k], own(k), growth.palms, growth.high)));
  const shrubs = isles.map((i, k) => open(k)(scatterShrubs(i, rocks[k], SHAPES, own(k), growth.shrubs)));
  const trees = isles.map((i, k) => (growth.trees ? open(k)(scatterTrees(i, rocks[k], growth.trees, TREE_SHAPES, own(k))) : []));
  const ground = createLand(isles, isles.map((_, k) => litter(palms[k], shrubs[k], trees[k])), sand), lands = [...ground.near, ...ground.far];
  const rocky = createRocks(rocks, charts, view, light, inks.rock);
  const kinds = {
    rocks: rocky.near, palms: growth.palms ? createPalms(palms, charts, light) : [], shrubs: createShrubs(shrubs, charts, light, inks.shrub),
    trees: growth.trees ? createTrees(trees, charts, light, growth.trees.form) : [], 'rocks far': rocky.far, 'rocks distant': rocky.distant,
  };
  // (the far rocks cast nothing: the shadow map covers the nearest island, whose rocks are always the near ones)
  const casters = [...rocky.near, ...kinds.palms, ...kinds.shrubs, ...kinds.trees];
  // (named for the meter's split: meter.ts)
  lands.forEach((m) => (m.name = 'land'));
  ground.far.forEach((m) => (m.visible = false));
  for (const [name, list] of Object.entries(kinds)) list.forEach((c, k) => (c.mesh.name = `${name} ${k}`));
  let shown: string | null = null;
  // a sphere round all that stands on each island: its apron and past, from under the sea to its palms' tops, the
  // planet's curve under it too
  const bounds = sites.map((s) => {
    const low = -FOOT - (s.shelf + LEANS) ** 2 / (2 * R), high = Math.max(s.summit, 0) + TOPS;
    return new Sphere(new Vector3(...place(s.chart.at, (low + high) / 2)), Math.hypot(s.shelf + LEANS, (high - low) / 2));
  });
  // (a cone's crater floor is its middle's ground)
  const steam = planet.biome.steam ? createSteam(sites, (s) => planet.height(s.chart.at), light) : null;
  const meshes = [...lands, ...casters.map((c) => c.mesh), ...[...rocky.far, ...rocky.distant].map((c) => c.mesh), ...(steam ? [steam] : [])];
  return {
    meshes,
    /** Frees every island's meshes (they sample no texture of their own). */
    dispose: () => release(...meshes),
    /** What casts shadows: each kind's instances. */
    casters,
    /** Draws the islands the eye can see; returns the nearest of them above the sea, in view or not (null if none). */
    update(eye: Readonly<Eye>): IslandSite | null {
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
      const within = (i: number, metres: number) => i === nearest || Math.hypot(off[i], eye.height) < metres;
      const near = drawn.filter((i) => within(i, FAR)), fine = drawn.filter((i) => within(i, GROUND_FAR));
      const far = fine.filter((i) => !near.includes(i)), distant = drawn.filter((i) => !fine.includes(i));
      const key = `${near.join()}|${far.join()}|${distant.join()}`;
      if (key !== shown) {
        shown = key;
        ground.near.forEach((m, i) => (m.visible = fine.includes(i)));
        ground.far.forEach((m, i) => (m.visible = distant.includes(i)));
        for (const c of [...kinds.palms, ...kinds.shrubs, ...kinds.trees]) c.show(drawn);
        for (const c of rocky.near) c.show(near);
        for (const c of rocky.far) c.show(far);
        for (const c of rocky.distant) c.show(distant);
      }
      return nearest === undefined ? null : sites[nearest];
    },
  };
}
