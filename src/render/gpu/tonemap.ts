// From the scene's light to the screen: AgX (Sobotka's), with a look applied in its log space the way Blender applies
// its looks, and a grade around it. AgX keeps hue through overexposure, so the sun's disc goes to white through
// yellow rather than to a flat cyan or magenta, and a lit sail holds its colour where a filmic curve would bleach it.
//
// The look and grade are uniforms: the colour script sets them by the hour, the weather and the Storm.
import { Vector3 } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { Fn, clamp, dot, float, log2, mat3, max, mix, pow, uniform, vec3 } from 'three/tsl';

type V3 = Node<'vec3'>;

const SRGB_TO_REC2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.088), vec3(0.0433, 0.0113, 0.8956));
const REC2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const INSET = mat3(
  vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
  vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
  vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859),
);
const OUTSET = mat3(
  vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
  vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
  vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405),
);
const MIN_EV = -12.47393;
const MAX_EV = 4.026069;

/** The look and grade the colour script steers. */
export const GRADE = {
  /** Multiplies the light before the curve, per channel: white balance. */
  balance: uniform(new Vector3(1, 1, 1)),
  /** ASC CDL in AgX's log space: slope, offset and power per channel, then saturation. Blender's "Punchy" is power
   *  1.35 and saturation 1.4; the default sits a little short of it, for colour that is rich but not loud. */
  slope: uniform(new Vector3(1, 1, 1)),
  offset: uniform(new Vector3(0, 0, 0)),
  power: uniform(new Vector3(1.2, 1.2, 1.2)),
  saturation: uniform(1.25),
  /** After the curve: lift in the shadows and a tint toward a colour in them, for the cold blue of night or the warm
   *  brown of a dusk. */
  lift: uniform(new Vector3(0, 0, 0)),
  /** How dark the corners fall, 0 none. */
  vignette: uniform(0.22),
};

const LUMA = vec3(0.2126, 0.7152, 0.0722);

/** AgX's sigmoid (a sixth-order fit to its default contrast curve). */
const contrast = (x: V3): V3 => {
  const x2 = x.mul(x);
  const x4 = x2.mul(x2);
  return x4.mul(x2).mul(15.5).sub(x4.mul(x).mul(40.14)).add(x4.mul(31.96)).sub(x2.mul(x).mul(6.868)).add(x2.mul(0.4298)).add(x.mul(0.1191)).sub(0.00232);
};

/** AgX with the look, from scene-linear sRGB to display-linear sRGB. */
export const agx = Fn(([colour]: [V3]) => {
  const c = SRGB_TO_REC2020.mul(colour.mul(GRADE.balance)).toVar();
  c.assign(INSET.mul(c));
  c.assign(log2(max(c, vec3(1e-10))));
  c.assign(clamp(c.sub(MIN_EV).div(MAX_EV - MIN_EV), 0, 1));
  c.assign(contrast(c));
  // the look
  const luma = dot(c, LUMA);
  c.assign(pow(max(c.mul(GRADE.slope).add(GRADE.offset), vec3(0)), GRADE.power));
  c.assign(mix(vec3(luma), c, GRADE.saturation));
  c.assign(OUTSET.mul(c));
  c.assign(pow(max(c, vec3(0)), vec3(2.2)));
  c.assign(REC2020_TO_SRGB.mul(c));
  // the shadows' lift
  const dark = float(1).sub(clamp(dot(c, LUMA).mul(4), 0, 1));
  return clamp(c.add(GRADE.lift.mul(dark)), 0, 1);
});
