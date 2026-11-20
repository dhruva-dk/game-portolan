// How the guns take the light, on a ship's plinth (arms.ts) and floating as
// loot (loot/loot.ts); their shapes are gun-shape.ts's (plain arithmetic that
// runs in node).

import { mix, select, vec3 } from 'three/tsl';
import {
  CREAM,
  GILDING,
  IRON,
  TIMBER,
  type Rgb,
  type Tones,
} from '../palette.ts';
import type { Light } from '../sky/light.ts';
import type { FloatNode, Vec3Node } from '../tsl.ts';
import { METAL } from './gun-shape.ts';

/**
 * A gun's colour at world place `p`, normal `n` (unit), its part made of `made`
 * (METAL), lit as everything is (sky/light.ts), in two tones: the bronze gilded
 * and the iron gunmetal, each with its hard highlight; the oak timber, with
 * none. Its bronze is cast `tint`'s `share` of the way toward its colour, if
 * given (a ship's gun in her rarity's light: arms.ts). For a material's
 * colorNode, inside its Fn.
 */
export function gunSurface(
  light: Light,
  p: Vec3Node,
  n: Vec3Node,
  made: FloatNode,
  tint?: { colour: Vec3Node; share: FloatNode }
): Vec3Node {
  const iron = made.greaterThan(METAL.iron - 0.5),
    oak = made.greaterThan(METAL.oak - 0.5).and(iron.not());
  const bronze = (of: (t: Tones) => Rgb, dim: number): Vec3Node =>
    tint
      ? mix(vec3(...of(GILDING)), tint.colour.mul(dim), tint.share)
      : vec3(...of(GILDING));
  const tone = (of: (t: Tones) => Rgb, dim: number): Vec3Node =>
    select(
      iron,
      vec3(...of(IRON)),
      select(oak, vec3(...of(TIMBER)), bronze(of, dim))
    );
  const lit = tone((t) => t.lit, 1);
  return light.polished(
    p,
    n,
    lit,
    tone((t) => t.shadow, SHADE),
    select(oak, lit, vec3(...CREAM))
  );
}

/** A tinted bronze's shadow, of its lit tone (as GILDING's is, near enough). */
const SHADE = 0.5;
