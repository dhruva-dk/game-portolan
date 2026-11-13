// The grade: the frame's exposure, its tone curve (AgX) and a colourist's look, as one step of the post chain.
//
// A look is what a colourist would set on a shot (after 0117's colour script, src/render/gpu/grade.ts): white balance
// (warm to cool, green to magenta), contrast about middle grey, split toning (one colour pushed into the shadows,
// another into the highlights, each holding its luminance), saturation overall and by hue for what the game shows
// most (the warm of sails, hulls and sand; the sea's teal; the sky's blue), and a lift of the blacks toward a colour,
// so no shadow is ever crushed. Looks are keyed on the sun's height, which is fixed for a match (world/sun.ts), so the
// day's look is baked once into a 33³ table; the storm's is baked into another, and the two are mixed by how deep in
// the storm the eye is. The table is read with the display's encoded value after AgX and gives display-linear colour.
//
// Exposure and the vignette act on the scene's light before the curve.

import { ClampToEdgeWrapping, Data3DTexture, DataUtils, HalfFloatType, LinearFilter, RGBAFormat } from 'three/webgpu';
import { clamp, float, length, log2, max, mix, pow, screenUV, smoothstep, step, texture3D, uniform, vec2, vec3 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../tsl';

type RGB = readonly [number, number, number];

/** A look. Split tones and the lift are small offsets in linear light. */
export interface Look {
  /** Stops of exposure, on the scene's light per unit sun (frame.ts). */
  exposure: number;
  /** White balance: + warm, − cool; + green, − magenta. */
  temp: number; tint: number;
  /** Contrast about middle grey, a power in log space. */
  contrast: number;
  saturation: number;
  /** Saturation of the warm hues (reds to yellows), the sea's (greens to cyans) and the sky's (blues), on top. */
  warm: number; sea: number; sky: number;
  /** Split toning: each channel's gain in the shadows and in the highlights, a tenth of it. */
  shadows: RGB; highlights: RGB;
  /** Lifts the blacks toward fadeTo by this much. */
  fade: number; fadeTo: RGB;
  /** How much the corners darken. */
  vignette: number;
}

/** The day's looks, by the sine of the sun's height they are set for. */
const DAY: readonly (readonly [number, Look])[] = [
  // the golden hour: amber lights against teal shadows, the sea deep
  [0.17, { exposure: 2.3, temp: 0.62, tint: 0.03, contrast: 1.1, saturation: 1.16, warm: 1.25, sea: 1.12, sky: 0.95,
    shadows: [-0.01, 0.004, 0.014], highlights: [0.04, 0.012, -0.014], fade: 0.02, fadeTo: [0.05, 0.035, 0.06], vignette: 0.32 }],
  // the trade-wind afternoon: warm, rich, the shadows a clear blue-green, never black
  [0.47, { exposure: 2.3, temp: 0.36, tint: 0.01, contrast: 1.08, saturation: 1.18, warm: 1.2, sea: 1.12, sky: 1.02,
    shadows: [-0.006, 0.003, 0.012], highlights: [0.022, 0.008, -0.01], fade: 0.018, fadeTo: [0.04, 0.05, 0.07], vignette: 0.26 }],
  // noon in the tropics: bright and punchy, the sea at its most turquoise
  [0.97, { exposure: 1.95, temp: 0.12, tint: 0, contrast: 1.1, saturation: 1.22, warm: 1.08, sea: 1.25, sky: 1.08,
    shadows: [-0.004, 0.002, 0.01], highlights: [0.006, 0.004, 0], fade: 0.012, fadeTo: [0.03, 0.05, 0.07], vignette: 0.2 }],
];
/** In the storm: cold and flat, its colour mostly gone, its blacks lifted to a slate grey; opened a little. */
const STORM: Look = {
  exposure: 2.6, temp: -0.25, tint: 0.02, contrast: 1.04, saturation: 0.7, warm: 0.85, sea: 0.9, sky: 0.85,
  shadows: [-0.004, 0, 0.01], highlights: [-0.004, 0.002, 0.008], fade: 0.03, fadeTo: [0.12, 0.14, 0.17], vignette: 0.35,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** The day's look for a sun whose height has this sine: between the looks on either side of it. */
export function dayLook(rise: number): Look {
  let i = 0;
  while (i < DAY.length - 2 && rise > DAY[i + 1][0]) i++;
  const [e0, a] = DAY[i], [e1, b] = DAY[i + 1];
  const x = Math.min(1, Math.max(0, (rise - e0) / (e1 - e0))), t = x * x * (3 - 2 * x);
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof Look)[]) {
    const u = a[k], v = b[k];
    if (typeof u === 'number' && typeof v === 'number') (out[k] as number) = lerp(u, v, t);
  }
  return { ...out, shadows: lerp3(a.shadows, b.shadows, t), highlights: lerp3(a.highlights, b.highlights, t), fadeTo: lerp3(a.fadeTo, b.fadeTo, t) };
}

/** A 3×3 matrix by its columns, applied to c. */
const apply = (m: readonly RGB[], c: Vec3Node): Vec3Node => vec3(...m[0]).mul(c.x).add(vec3(...m[1]).mul(c.y)).add(vec3(...m[2]).mul(c.z));
/** sRGB's primaries to Rec. 2020's and back, and AgX's inset and outset (Sobotka; Blender's, as three has them). */
const TO_2020: RGB[] = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.088], [0.0433, 0.0113, 0.8956]];
const FROM_2020: RGB[] = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
const INSET: RGB[] = [[0.856627153315983, 0.137318972929847, 0.11189821299995], [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859]];
const OUTSET: RGB[] = [[1.1271005818144368, -0.1413297634984383, -0.14132976349843826], [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]];
/** AgX: scene-linear light to display-linear, the highlights desaturating toward white rather than clipping. */
const agx = (light: Vec3Node): Vec3Node => {
  const c = apply(INSET, apply(TO_2020, light));
  const x = clamp(log2(max(c, vec3(1e-10))).add(12.47393).div(16.5), 0, 1);
  const x2 = x.mul(x), x4 = x2.mul(x2);
  const curve = x4.mul(x2).mul(15.5).sub(x4.mul(x).mul(40.14)).add(x4.mul(31.96)).sub(x2.mul(x).mul(6.868)).add(x2.mul(0.4298)).add(x.mul(0.1191)).sub(0.00232);
  return clamp(apply(FROM_2020, pow(max(apply(OUTSET, curve), vec3(0)), vec3(2.2))), 0, 1);
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
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const ws = 1 - smooth(0, 0.25, Y), wh = smooth(0.2, 0.8, Y);
  const gain = (i: number) => 1 + (l.shadows[i] * ws + l.highlights[i] * wh) * 10;
  [R, G, B] = [R * gain(0), G * gain(1), B * gain(2)];
  const Yt = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  if (Yt > 1e-6) [R, G, B] = [R * (Y / Yt), G * (Y / Yt), B * (Y / Yt)];
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
 * The grade for a match whose sun stands at a height of this sine: grade(c, storm) takes the scene's light at a pixel
 * (per unit sun) and how deep in the storm the eye is (0…1), and gives display-linear colour; gain is the day's
 * exposure, as a factor on that light.
 */
export function createGrade(rise: number) {
  const day = dayLook(rise);
  const days = texture3D(table(day)), storms = texture3D(table(STORM));
  const exposure = uniform(2 ** day.exposure), stormExposure = 2 ** STORM.exposure;
  const vignette = uniform(day.vignette);
  const grade = (color: Vec3Node, storm: FloatNode): Vec3Node => {
    const v = length(screenUV.sub(0.5).mul(vec2(1.4, 1.1)));
    const corner = float(1).sub(smoothstep(0.15, 0.8, v).mul(mix(vignette, STORM.vignette, storm)));
    const toned = agx(color.mul(corner).mul(mix(exposure, stormExposure, storm)));
    const at = pow(max(toned, vec3(0)), vec3(1 / 2.2)).mul((N - 1) / N).add(0.5 / N);
    return mix(days.sample(at).level(float(0)).rgb, storms.sample(at).level(float(0)).rgb, storm);
  };
  return { grade, gain: 2 ** day.exposure };
}
