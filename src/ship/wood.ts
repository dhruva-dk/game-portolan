// What the galleon's body is made of, and how it takes the light: timber on the hull and spars, a pale deck, tarred
// wales and black iron, the captain's paint, gilded mouldings. Each is two flat tones (palette.ts), lit as everything
// is (sky/light.ts): no grain, no gloss. What detail there is is drawn: the planks' seams as thin dark lines a strake
// apart, the wet timber as a darker band along her waterline, and one hard highlight on the gilding.

import { float, mix, positionWorld, select, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { CREAM, DECK, DYE_SHADE, GILDING, TAR, TIMBER, type Rgb, type Tones } from '../palette';
import type { Light } from '../sky/light';
import { cut, line, type FloatNode, type Vec2Node, type Vec3Node } from '../tsl';
import { KIND } from './kit';

/** The planks' seams: this many strakes to a unit of the hull's uv, and how dark a seam is drawn. */
const STRAKES = 4, SEAM = 0.4;
/** The hull is wet up to this many metres over her waterline, and darker there by this much. */
const WET_TO = 0.3, WET = 0.72;

/** A dye's shadow tone: darker and redder than it is in the sun (palette.ts DYE_SHADE). */
export const shaded = (dye: Vec3Node): Vec3Node => dye.mul(vec3(...DYE_SHADE));

/** Body colour (radiance) for a vertex of kind `kind` at texture coordinates uv, `height` metres over her waterline,
 * facing world normal n (unit), open to the sky by ao, in the captain's paint. */
export function createWood(light: Light) {
  return (kind: FloatNode, uv: Vec2Node, height: FloatNode, n: Vec3Node, ao: FloatNode, paint: Vec3Node): Vec3Node => {
    const p = positionWorld;
    const pick = <T>(i: number, a: Node<T>, b: Node<T>) => select(kind.lessThan(i + 0.5), a, b);
    const tone = (of: (t: Tones) => Rgb, painted: Vec3Node): Vec3Node =>
      pick(KIND.planks, vec3(...of(TIMBER)), pick(KIND.paint, painted, pick(KIND.dark, vec3(...of(TAR)),
        pick(KIND.deck, vec3(...of(DECK)), pick(KIND.spar, vec3(...of(TIMBER)), pick(KIND.gilt, vec3(...of(GILDING)), vec3(...of(TAR))))))));
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
