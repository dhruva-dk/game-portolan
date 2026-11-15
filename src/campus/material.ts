// How the rookery's buildings are lit: each face in its tone's two colours (palette.ts) by the shared toon light
// (sky/light.ts), the panes, the iron and the gilt polished (a hard glint where they mirror the sun), the crew's two
// colours set per crew. One material for every finished building; another for what is under way, cut off at how
// much of it is built (its triangles carry their height as a share of the form's, and the share built), lit on both
// sides since the cut leaves it open.

import { DoubleSide, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu';
import { Fn, attribute, faceDirection, mix, normalWorld, normalize, positionWorld, uniformArray, vec3 } from 'three/tsl';
import {
  BRICK, CANVAS, COPPER, CREAM, DECK, DOORWAY, DYE_SHADE, GILDING, GLASS, IRON, PLASTER, ROOF_TILE, SLATE, STONE, TANK, TIMBER,
  type Rgb, type Tones,
} from '../palette';
import type { Light } from '../sky/light';
import { TONE } from './kit';

/** Each tone's colours, in TONE's order; the crew's two are set per crew (setCrew), these only until then. */
const TONES: readonly (Tones & { gloss?: boolean })[] = [
  STONE, PLASTER, TIMBER, DECK, ROOF_TILE, SLATE, BRICK, COPPER, { ...IRON, gloss: true }, { ...GLASS, gloss: true }, TANK,
  CANVAS, { lit: CREAM, shadow: CANVAS.shadow }, DOORWAY, PLASTER, PLASTER, { ...GILDING, gloss: true },
];

export function createMaterials(light: Light) {
  const v = (c: Rgb) => new Vector3(...c);
  const lit = uniformArray<'vec3'>(TONES.map((t) => v(t.lit)), 'vec3'), shadow = uniformArray<'vec3'>(TONES.map((t) => v(t.shadow)), 'vec3');
  const gloss = uniformArray<'float'>(TONES.map((t) => (t.gloss ? 1 : 0)), 'float');
  const shade = (rising: boolean) => Fn(() => {
    const k = attribute('tone', 'float').add(0.5).toInt();
    const n = rising ? normalize(normalWorld).mul(faceDirection) : normalize(normalWorld);
    const l = lit.element(k), s = shadow.element(k);
    return light.polished(positionWorld, n, l, s, mix(l, vec3(...CREAM), gloss.element(k)));
  })();
  const whole = new MeshBasicNodeMaterial();
  whole.colorNode = shade(false);
  const rising = new MeshBasicNodeMaterial({ side: DoubleSide });
  rising.colorNode = shade(true);
  // (what is not built yet is not drawn)
  rising.maskNode = attribute('rise', 'float').lessThanEqual(attribute('built', 'float'));
  return {
    whole, rising,
    /** The crew's colours (linear rgb): its first, on the doors and the dinghies' hulls, its second on the awnings
     *  and sails; each shadowed as a dye is (palette.ts DYE_SHADE). */
    setCrew(first: Rgb, second: Rgb) {
      for (const [i, c] of [[TONE.first, first], [TONE.second, second]] as const) {
        (lit.array[i] as Vector3).set(...c);
        (shadow.array[i] as Vector3).set(c[0] * DYE_SHADE[0], c[1] * DYE_SHADE[1], c[2] * DYE_SHADE[2]);
      }
    },
  };
}
