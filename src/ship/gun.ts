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

export function gunSurface(
  light: Light,
  p: Vec3Node,
  n: Vec3Node,
  made: FloatNode,
  tint?: { color: Vec3Node; share: FloatNode }
): Vec3Node {
  const iron = made.greaterThan(METAL.iron - 0.5),
    oak = made.greaterThan(METAL.oak - 0.5).and(iron.not());
  const bronze = (of: (t: Tones) => Rgb, dim: number): Vec3Node =>
    tint
      ? mix(vec3(...of(GILDING)), tint.color.mul(dim), tint.share)
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

const SHADE = 0.5;
