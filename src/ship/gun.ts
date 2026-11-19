// The guns as they are drawn, on a ship's plinth (arms.ts) and floating as loot (loot/loot.ts): their shapes
// (gun-shape.ts, plain arithmetic that runs in node), and how they take the light.

import { select, vec3 } from 'three/tsl';
import { CREAM, GILDING, IRON, TIMBER, type Rgb, type Tones } from '../palette.ts';
import type { Light } from '../sky/light.ts';
import type { FloatNode, Vec3Node } from '../tsl.ts';
import { METAL } from './gun-shape.ts';

// (the shape as loot/loot.ts and tests/battle.test.ts take it from here)
export { FOOT, gunShape } from './gun-shape.ts';

/** A gun's colour at world place `p`, normal `n` (unit), its part made of `made` (METAL), lit as everything is
 *  (sky/light.ts), in two tones: the bronze gilded and the iron gunmetal, each with its hard highlight; the oak
 *  timber, with none. For a material's colorNode, inside its Fn. */
export function gunSurface(light: Light, p: Vec3Node, n: Vec3Node, made: FloatNode): Vec3Node {
  const iron = made.greaterThan(METAL.iron - 0.5), oak = made.greaterThan(METAL.oak - 0.5).and(iron.not());
  const tone = (of: (t: Tones) => Rgb): Vec3Node =>
    select(iron, vec3(...of(IRON)), select(oak, vec3(...of(TIMBER)), vec3(...of(GILDING))));
  const lit = tone((t) => t.lit);
  return light.polished(p, n, lit, tone((t) => t.shadow), select(oak, lit, vec3(...CREAM)));
}
