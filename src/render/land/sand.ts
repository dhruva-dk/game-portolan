import { dot, float, fract, max, mix, vec3 } from 'three/tsl';
import {
  ROCK,
  SAND,
  SAND_DRY,
  SAND_DUNE,
  SAND_LOAM,
  SAND_SHORE,
  SEABED_SAND,
  SEABED_STONE,
  SEABED_WEED,
  STRATUM,
  type Tones,
} from '../palette.ts';
import { BANDS } from '../../world/planet-terrain.ts';
import type { View } from '../view/view.ts';
import type { Ground } from './ground.ts';
import type { Light } from '../sky/light.ts';
import { createStrewn } from './strewn.ts';
import { cut, type FloatNode, type Vec3Node } from '../tsl.ts';

const {
  shore: SHORE,
  beach: BEACH,
  dry: DRY,
  loam: LOAM_AT,
  rubble: RUBBLE,
  ragged: RAGGED,
} = BANDS;
const GRASS = 0.65;
const CLIFF = 1.2,
  SHEER = 2.2,
  BARE = 1 / Math.hypot(1, CLIFF * SHEER),
  STRATA = 2.2,
  STRATUM_SHARE = 0.35;

export type Sand = (p: Vec3Node, n: Vec3Node) => Vec3Node;

export function createSand(
  view: View,
  ground: Ground,
  light: Light,
  dune: number
): Sand {
  const strewn = createStrewn();
  return (p, n) => {
    const height = view.altitude(p),
      cover = ground.cover(p);
    const mottle = cover.z.sub(0.5);
    const level = height.add(mottle.mul(RAGGED));
    let lit: Vec3Node = vec3(...SEABED_SAND.lit),
      shadow: Vec3Node = vec3(...SEABED_SAND.shadow);
    const lay = (t: Tones, share: FloatNode) => {
      lit = mix(lit, vec3(...t.lit), share);
      shadow = mix(shadow, vec3(...t.shadow), share);
    };
    lay(SEABED_STONE, cut(cover.y.add(mottle.mul(0.3)), RUBBLE));
    lay(SEABED_WEED, cut(cover.x.add(cover.w.sub(0.5).mul(0.3)), GRASS));
    const strewed = strewn(p, height, cover);
    lay(SEABED_STONE, strewed.x);
    lay(SEABED_WEED, strewed.y);
    lay(SAND_SHORE, cut(level, SHORE));
    lay(SAND, cut(level, BEACH));
    lay(SAND_DRY, cut(level, DRY));
    lay(
      SAND_LOAM,
      cut(cover.x.add(cover.w.sub(0.5).mul(0.25)), LOAM_AT).mul(cut(level, DRY))
    );
    lay(SAND_DUNE, cut(level.add(mottle.mul(RAGGED * 6)), dune));
    const cliff = cut(float(1).sub(dot(n, view.up(p))), 1 - BARE);
    const tops = cut(cover.y.add(mottle.mul(0.3)), RUBBLE).mul(cut(level, DRY));
    const bare = max(cliff, tops).mul(cut(height, SHORE));
    lay(ROCK, bare);
    lay(STRATUM, bare.mul(cut(fract(level.div(STRATA)), 1 - STRATUM_SHARE)));
    return light.toon(p, n, lit, shadow);
  };
}
