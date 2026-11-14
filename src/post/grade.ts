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
// height, which is fixed for a match (world/sun.ts), so the day's look is baked once into a 33³ table; the storm's is
// baked into another, and the two are mixed by how deep in the storm the eye is. The table is read with the display's
// encoded value after the curve and gives display-linear colour.
//
// Exposure and the vignette act on the scene's light before the curve.

import { ClampToEdgeWrapping, Data3DTexture, DataUtils, HalfFloatType, LinearFilter, RGBAFormat } from 'three/webgpu';
import { clamp, dot, exp, float, length, max, mix, pow, screenUV, select, smoothstep, step, texture3D, uniform, vec2, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../tsl';

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
  exposure: 1.6, temp: -0.15, tint: -0.1, contrast: 1, saturation: 0.92, warm: 1, sea: 0.9, sky: 0.95, fade: 0.03, fadeTo: [0.13, 0.1, 0.19], vignette: 0.32,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Look a and b mixed, t of b. */
function between(a: Look, b: Look, t: number): Look {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof Look)[]) {
    const u = a[k], v = b[k];
    if (typeof u === 'number' && typeof v === 'number') (out[k] as number) = lerp(u, v, t);
  }
  return { ...out, fadeTo: lerp3(a.fadeTo, b.fadeTo, t) };
}

/** The day's look for a sun whose height has this sine, rising (the morning's) or not: between the looks on either
 *  side of it. */
export function dayLook(rise: number, rising = false): Look {
  let i = 0;
  while (i < DAY.length - 2 && rise > DAY[i + 1][0]) i++;
  const [e0, a] = DAY[i], [e1, b] = DAY[i + 1];
  const x = Math.min(1, Math.max(0, (rise - e0) / (e1 - e0))), t = x * x * (3 - 2 * x);
  const day = between(a, b, t);
  return rising ? between(day, DAWN, 1 - smooth(DAY[0][0], DAY[1][0], rise)) : day;
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

/** Texels along each side of the table. */
const N = 33;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** One texel of the table: from the display's encoded value (its steps along the table) to display-linear colour. */
function graded(l: Look, r: number, g: number, b: number): RGB {
  const lin = (i: number) => (i / (N - 1)) ** 2.2;
  let R = lin(r) * (1 + l.temp * 0.09 - l.tint * 0.02), G = lin(g) * (1 + l.tint * 0.05), B = lin(b) * (1 - l.temp * 0.09 - l.tint * 0.02);
  const k = l.contrast, c = (x: number) => 0.18 * (Math.max(x, 1e-6) / 0.18) ** k;
  [R, G, B] = [c(R), c(G), c(B)];
  // saturation, overall and by hue
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), chroma = mx - mn;
  let hue = 0;
  if (chroma > 1e-6) hue = 60 * (mx === R ? ((G - B) / chroma + 6) % 6 : mx === G ? (B - R) / chroma + 2 : (R - G) / chroma + 4);
  const band = (centre: number, width: number) => Math.max(0, 1 - Math.abs(((hue - centre + 540) % 360) - 180) / width);
  const s = l.saturation * (1 + (l.warm - 1) * band(35, 50) + (l.sea - 1) * band(175, 45) + (l.sky - 1) * band(220, 40));
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  [R, G, B] = [y + (R - y) * s, y + (G - y) * s, y + (B - y) * s];
  const lift = (x: number, i: number) => Math.max(0, x * (1 - l.fade) + l.fadeTo[i] * l.fade);
  return [lift(R, 0), lift(G, 1), lift(B, 2)];
}

/** A look baked into a table. */
function table(l: Look): Data3DTexture {
  const data = new Uint16Array(N * N * N * 4);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = graded(l, x, y, z), o = ((z * N + y) * N + x) * 4;
    for (let i = 0; i < 3; i++) data[o + i] = DataUtils.toHalfFloat(c[i]);
    data[o + 3] = DataUtils.toHalfFloat(1);
  }
  const t = new Data3DTexture(data, N, N, N);
  t.format = RGBAFormat;
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/**
 * The grade for a match whose sun stands at a height of this sine, rising or not, under a sky that gives a white
 * surface in the open `open` (sky.ts Sky.open): grade(c, storm) takes the scene's light at a pixel (per unit sun) and
 * how deep in the storm the eye is (0…1), and gives display-linear colour; gain is the day's exposure, as a factor on
 * that light.
 */
export function createGrade(rise: number, rising: boolean, open: Vec3Node) {
  const day = dayLook(rise, rising);
  const days = texture3D(table(day)), storms = texture3D(table(STORM));
  const vignette = uniform(day.vignette);
  // what brings a white surface in the open to the display's white, whatever the hour
  const gain = float(2 ** day.exposure).div(max(dot(open, vec3(0.2126, 0.7152, 0.0722)), 1e-4));
  const grade = (color: Vec3Node, storm: FloatNode): Vec3Node => {
    const v = length(screenUV.sub(0.5).mul(vec2(1.4, 1.1)));
    const corner = float(1).sub(smoothstep(0.15, 0.8, v).mul(mix(vignette, STORM.vignette, storm)));
    const toned = curve(color.mul(corner).mul(gain).mul(mix(float(1), float(2 ** (STORM.exposure - day.exposure)), storm)));
    const at = pow(max(toned, vec3(0)), vec3(1 / 2.2)).mul((N - 1) / N).add(0.5 / N);
    return mix(days.sample(at).level(float(0)).rgb, storms.sample(at).level(float(0)).rgb, storm);
  };
  return { grade, gain };
}
