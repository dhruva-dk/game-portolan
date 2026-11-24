import { float, mix, positionWorld, select, vec3 } from 'three/tsl';
import {
  CREAM,
  DECK,
  DYE_SHADE,
  GILDING,
  TAR,
  TIMBER,
  type Rgb,
  type Tones,
} from '../palette.ts';
import type { Light } from '../sky/light.ts';
import {
  cut,
  line,
  type FloatNode,
  type Vec2Node,
  type Vec3Node,
} from '../tsl.ts';
import { KIND } from './kit.ts';

const STRAKES = 4,
  SEAM = 0.4;
const WET_TO = 0.3,
  WET = 0.72;
const TONES: Record<keyof typeof KIND, Tones | null> = {
  planks: TIMBER,
  paint: null,
  dark: TAR,
  deck: DECK,
  spar: TIMBER,
  gilt: GILDING,
  iron: TAR,
};
const ORDER = (
  [
    'planks',
    'paint',
    'dark',
    'deck',
    'spar',
    'gilt',
    'iron',
  ] satisfies (keyof typeof KIND)[]
).sort((a, b) => KIND[a] - KIND[b]);

export const shaded = (dye: Vec3Node): Vec3Node => dye.mul(vec3(...DYE_SHADE));

export function createWood(light: Light) {
  return (
    kind: FloatNode,
    uv: Vec2Node,
    height: FloatNode,
    n: Vec3Node,
    ao: FloatNode,
    paint: Vec3Node
  ): Vec3Node => {
    const p = positionWorld;
    const tone = (of: (t: Tones) => Rgb, painted: Vec3Node): Vec3Node => {
      const toned = (k: number): Vec3Node => {
        const t = TONES[ORDER[k]];
        return t ? vec3(...of(t)) : painted;
      };
      let picked = toned(ORDER.length - 1);
      for (let k = ORDER.length - 2; k >= 0; k--)
        picked = select(kind.lessThan(KIND[ORDER[k]] + 0.5), toned(k), picked);
      return picked;
    };
    const planked = kind
      .lessThan(KIND.paint + 0.5)
      .or(
        kind.greaterThan(KIND.deck - 0.5).and(kind.lessThan(KIND.deck + 0.5))
      );
    const seam = select(planked, line(uv.y, STRAKES).mul(SEAM), float(0));
    const wet = float(1).sub(cut(height, WET_TO));
    const drawn = float(1)
      .sub(seam)
      .mul(float(1).sub(wet.mul(1 - WET)));
    const shadow = tone((t) => t.shadow, shaded(paint)).mul(drawn),
      lit = mix(shadow, tone((t) => t.lit, paint).mul(drawn), ao);
    const gilt = kind
      .greaterThan(KIND.gilt - 0.5)
      .and(kind.lessThan(KIND.gilt + 0.5));
    return light.polished(p, n, lit, shadow, select(gilt, vec3(...CREAM), lit));
  };
}
