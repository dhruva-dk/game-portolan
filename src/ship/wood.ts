// What the galleon's body is made of, and how it takes the light: timber on the hull and spars, a pale deck, tarred
// wales and black iron, the captain's paint, gilded mouldings. Each is two flat tones (palette.ts), lit as everything
// is (sky/light.ts): no grain, no gloss. What detail there is is drawn: the planks' seams as thin dark lines a strake
// apart, the wet timber as a darker band along her waterline, and one hard highlight on the gilding.

import { float, mix, positionWorld, select, vec3 } from 'three/tsl';
import { CREAM, DECK, DYE_SHADE, GILDING, TAR, TIMBER, type Rgb, type Tones } from '../palette.ts';
import type { Light } from '../sky/light.ts';
import { cut, line, type FloatNode, type Vec2Node, type Vec3Node } from '../tsl.ts';
import { KIND } from './kit.ts';

/** The planks' seams: this many strakes to a unit of the hull's uv, and how dark a seam is drawn. */
const STRAKES = 4, SEAM = 0.4;
/** The hull is wet up to this many metres over her waterline, and darker there by this much. */
const WET_TO = 0.3, WET = 0.72;
/** Each kind's tones (null: the captain's paint); and the kinds by their number (kit.ts KIND). */
const TONES: Record<keyof typeof KIND, Tones | null> = {
  planks: TIMBER, paint: null, dark: TAR, deck: DECK, spar: TIMBER, gilt: GILDING, iron: TAR,
};
const ORDER = (Object.keys(KIND) as (keyof typeof KIND)[]).sort((a, b) => KIND[a] - KIND[b]);

/** A dye's shadow tone: darker and redder than it is in the sun (palette.ts DYE_SHADE). */
export const shaded = (dye: Vec3Node): Vec3Node => dye.mul(vec3(...DYE_SHADE));

/** Body colour (radiance) for a vertex of kind `kind` at texture coordinates uv, `height` metres over her waterline,
 * facing world normal n (unit), open to the sky by ao, in the captain's paint. */
export function createWood(light: Light) {
  return (kind: FloatNode, uv: Vec2Node, height: FloatNode, n: Vec3Node, ao: FloatNode, paint: Vec3Node): Vec3Node => {
    const p = positionWorld;
    // the tone of the kind it is: the kinds tried in turn, the last for whatever is left
    const tone = (of: (t: Tones) => Rgb, painted: Vec3Node): Vec3Node => {
      const toned = (k: number): Vec3Node => { const t = TONES[ORDER[k]]; return t ? vec3(...of(t)) : painted; };
      let picked = toned(ORDER.length - 1);
      for (let k = ORDER.length - 2; k >= 0; k--) picked = select(kind.lessThan(KIND[ORDER[k]] + 0.5), toned(k), picked);
      return picked;
    };
    // the seams between the strakes, on the planking, the paint over it and the deck
    const planked = kind.lessThan(KIND.paint + 0.5).or(kind.greaterThan(KIND.deck - 0.5).and(kind.lessThan(KIND.deck + 0.5)));
    const seam = select(planked, line(uv.y, STRAKES).mul(SEAM), float(0));
    // wet along the waterline: a band with a hard edge
    const wet = float(1).sub(cut(height, WET_TO));
    const drawn = float(1).sub(seam).mul(float(1).sub(wet.mul(1 - WET)));
    // where less of the sky reaches (ao), the lit tone gives way to the shadow tone, which stays as chosen
    const shadow = tone((t) => t.shadow, shaded(paint)).mul(drawn), lit = mix(shadow, tone((t) => t.lit, paint).mul(drawn), ao);
    // the gilding alone mirrors the sun: on the rest the highlight is the lit tone itself
    const gilt = kind.greaterThan(KIND.gilt - 0.5).and(kind.lessThan(KIND.gilt + 0.5));
    return light.polished(p, n, lit, shadow, select(gilt, vec3(...CREAM), lit));
  };
}
