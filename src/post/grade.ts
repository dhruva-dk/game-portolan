// The grade: the frame's exposure, its tone curve and a colourist's look, as one step of the post chain.
//
// The world's colours are chosen (palette.ts), so the grade's first duty is to leave them as chosen. The exposure sets
// a surface in the open at its tone exactly (the scene's light is the tone times the place's level: sky/light.ts);
// the curve is the light itself up to a knee near the display's white, and only what is brighter (a glint, a flash,
// lightning, the bloom) is rolled off toward it, by its brightest channel so its hue holds.
//
// A look is then a light hand on the whole: white balance (warm to cool, green to magenta), contrast about middle
// grey, saturation overall and by hue (the warm of sails, hulls and sand; the sea's teal; the sky's blue), and a lift
// of the blacks toward a colour. No split toning: it would tint the chosen shadows. Looks are keyed on the sun's
// height, which is fixed for a match (world/sun.ts); the storm has its own, and the two looks' numbers are mixed by
// how deep in the storm the eye is. The look is a few lines of arithmetic on display-linear colour after the curve.
//
// Exposure and the vignette act on the scene's light before the curve.

import { abs, clamp, exp, float, length, luminance, max, min, mix, mod, pow, screenUV, select, smoothstep, step, uniform, vec2, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../tsl';
// the CPU's numbers, apart from TSL's nodes of the same names
import * as scalar from '../world/scalar';

type RGB = readonly [number, number, number];

/** A look. The lift is a small offset in linear light. */
export interface Look {
  /** Stops of exposure over what shows a tone in the open exactly as chosen (0: a white surface there is the
   *  display's white). */
  exposure: number;
  /** White balance: + warm, − cool; + green, − magenta. */
  temp: number; tint: number;
  /** Contrast about middle grey, a power in log space. */
  contrast: number;
  saturation: number;
  /** Saturation of the warm hues (reds to yellows), the sea's (greens to cyans) and the sky's (blues), on top. */
  warm: number; sea: number; sky: number;
  /** Lifts the blacks toward fadeTo by this much. */
  fade: number; fadeTo: RGB;
  /** How much the corners darken. */
  vignette: number;
}

/** The day's looks, by the sine of the sun's height they are set for. */
const DAY: readonly (readonly [number, Look])[] = [
  // the golden hour: the light a little amber (the level's own warmth besides), the corners a touch darker
  [0.17, { exposure: 0, temp: 0.2, tint: 0.02, contrast: 1, saturation: 1, warm: 1.05, sea: 1, sky: 1, fade: 0, fadeTo: [0, 0, 0], vignette: 0.2 }],
  // the trade-wind afternoon: the palette as it is
  [0.47, { exposure: 0, temp: 0.04, tint: 0, contrast: 1, saturation: 1, warm: 1, sea: 1, sky: 1, fade: 0, fadeTo: [0, 0, 0], vignette: 0.14 }],
  // noon in the tropics: the same, the corners all but open
  [0.97, { exposure: 0, temp: 0, tint: 0, contrast: 1, saturation: 1, warm: 1, sea: 1, sky: 1, fade: 0, fadeTo: [0, 0, 0], vignette: 0.1 }],
];
/** A morning's low sun, against the evening's amber: a rose cast, the blacks lifted a little to a lavender mist.
 *  Mixed in under a rising sun, most at the golden hour's height, gone by the afternoon's. */
const DAWN: Look = {
  exposure: 0, temp: -0.02, tint: -0.06, contrast: 1, saturation: 1, warm: 1.05, sea: 1, sky: 1, fade: 0.02, fadeTo: [0.12, 0.1, 0.15], vignette: 0.16,
};
/** In the storm: cooler and dimmer, pushed toward violet (magenta in the tint), its blacks lifted to a slate violet,
 *  the corners darker. Its colour is kept: the ships' dyes still read. */
const STORM: Look = {
  exposure: 0.8, temp: -0.15, tint: -0.1, contrast: 1, saturation: 0.92, warm: 1, sea: 0.9, sky: 0.95, fade: 0.03, fadeTo: [0.13, 0.1, 0.19], vignette: 0.32,
};

const lerp3 = (a: RGB, b: RGB, t: number): RGB => [scalar.lerp(a[0], b[0], t), scalar.lerp(a[1], b[1], t), scalar.lerp(a[2], b[2], t)];

/** Look a and b mixed, t of b. */
function between(a: Look, b: Look, t: number): Look {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof Look)[]) {
    const u = a[k], v = b[k];
    if (typeof u === 'number' && typeof v === 'number') (out[k] as number) = scalar.lerp(u, v, t);
  }
  return { ...out, fadeTo: lerp3(a.fadeTo, b.fadeTo, t) };
}

/** The day's look for a sun whose height has this sine, rising (the morning's) or not: between the looks on either
 *  side of it. */
export function dayLook(rise: number, rising = false): Look {
  let i = 0;
  while (i < DAY.length - 2 && rise > DAY[i + 1][0]) i++;
  const [e0, a] = DAY[i], [e1, b] = DAY[i + 1];
  const day = between(a, b, scalar.smoothstep(e0, e1, rise));
  return rising ? between(day, DAWN, 1 - scalar.smoothstep(DAY[0][0], DAY[1][0], rise)) : day;
}

/** The curve's knee, of the display's white: light under it is shown as it is. */
const KNEE = 0.85;
/** How far over white (in the brightest channel) a light has lost WHITENED of its colour to white: a flash burns out. */
const BURNT = 6, WHITENED = 0.7;
/**
 * The tone curve: scene-linear light to display-linear. As it is up to KNEE; over it, its brightest channel rolled
 * off toward white (1 − e^(−x) of the room left) and the others scaled with it, so a bright colour keeps its hue and
 * its saturation rather than clipping to another; far over white it burns out toward white.
 */
const curve = (light: Vec3Node): Vec3Node => {
  const c = max(light, vec3(0)), top = max(max(c.x, c.y), max(c.z, 1e-6));
  const rolled = float(1).sub(exp(top.sub(KNEE).div(KNEE - 1))).mul(1 - KNEE).add(KNEE);
  const held = c.mul(select(top.greaterThan(KNEE), rolled.div(top), float(1)));
  return clamp(mix(held, vec3(1), smoothstep(1, BURNT, top).mul(WHITENED)), 0, 1);
};
/** Display-linear to the display's sRGB encoding. */
export const encode = (c: Vec3Node): Vec3Node =>
  mix(c.mul(12.92), pow(max(c, vec3(0)), vec3(1 / 2.4)).mul(1.055).sub(0.055), step(vec3(0.0031308), c));

/** Each number of a look, the day's mixed toward the storm's by how deep in it the eye is. */
type Mixed = { [K in keyof Look]: Look[K] extends number ? FloatNode : Vec3Node };
function mixed(a: Look, b: Look, t: FloatNode): Mixed {
  const out: Partial<Record<keyof Look, FloatNode | Vec3Node>> = {};
  for (const k of Object.keys(a) as (keyof Look)[]) {
    const u = a[k], v = b[k];
    out[k] = typeof u === 'number' && typeof v === 'number' ? mix(float(u), float(v), t) : mix(vec3(...a.fadeTo), vec3(...b.fadeTo), t);
  }
  return out as Mixed;
}

/** The look on display-linear colour: white balance, contrast about middle grey, saturation overall and by hue (in
 *  bands of hue, degrees, about the warm hues, the sea's and the sky's), and the blacks lifted. */
function looked(l: Mixed, colour: Vec3Node): Vec3Node {
  const balance = vec3(
    float(1).add(l.temp.mul(0.09)).sub(l.tint.mul(0.02)),
    float(1).add(l.tint.mul(0.05)),
    float(1).sub(l.temp.mul(0.09)).sub(l.tint.mul(0.02)),
  );
  const c = pow(max(colour.mul(balance), vec3(1e-6)).div(0.18), vec3(l.contrast)).mul(0.18);
  const mx = max(max(c.x, c.y), c.z), chroma = max(mx.sub(min(min(c.x, c.y), c.z)), 1e-6);
  const hue = select(mx.equal(c.x), mod(c.y.sub(c.z).div(chroma).add(6), 6),
    select(mx.equal(c.y), c.z.sub(c.x).div(chroma).add(2), c.x.sub(c.y).div(chroma).add(4))).mul(60);
  const band = (centre: number, width: number) => max(float(1).sub(abs(mod(hue.sub(centre - 540), 360).sub(180)).div(width)), 0);
  const s = l.saturation.mul(float(1)
    .add(l.warm.sub(1).mul(band(35, 50)))
    .add(l.sea.sub(1).mul(band(175, 45)))
    .add(l.sky.sub(1).mul(band(220, 40))));
  const saturated = mix(vec3(luminance(c)), c, s);
  return max(mix(saturated, l.fadeTo, l.fade), vec3(0));
}

/**
 * The grade for a match whose sun stands at a height of this sine, rising or not, under a sky that gives a white
 * surface in the open `open` (sky.ts Sky.open): grade(c, storm) takes the scene's light at a pixel (per unit sun) and
 * how deep in the storm the eye is (0…1), and gives display-linear colour; gain is the day's exposure, as a factor on
 * that light.
 */
export function createGrade(rise: number, rising: boolean, open: Vec3Node) {
  const day = dayLook(rise, rising);
  const vignette = uniform(day.vignette);
  // what brings a white surface in the open to the display's white, whatever the hour
  const gain = float(2 ** day.exposure).div(max(luminance(open), 1e-4));
  const grade = (color: Vec3Node, storm: FloatNode): Vec3Node => {
    const v = length(screenUV.sub(0.5).mul(vec2(1.4, 1.1)));
    const corner = float(1).sub(smoothstep(0.15, 0.8, v).mul(mix(vignette, STORM.vignette, storm)));
    const toned = curve(color.mul(corner).mul(gain).mul(mix(float(1), float(2 ** (STORM.exposure - day.exposure)), storm)));
    return looked(mixed(day, STORM, storm), toned);
  };
  return { grade, gain };
}
