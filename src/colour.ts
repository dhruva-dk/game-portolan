// Colour between the display's sRGB, as a painter picks it ('#RRGGBB', 0xRRGGBB), and the linear light the world is lit
// and drawn in: the sRGB curve (IEC 61966-2-1), written once for the palette, the render and the UI.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { clamp } from './world/scalar.ts';

/** A colour's red, green and blue: linear light, or the display's sRGB 0…1, as the name it is held under says. */
export type Rgb = readonly [number, number, number];

/** An sRGB channel, 0…1, as linear light. */
export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** A channel of linear light, 0…1, as the display's sRGB. */
export const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** A display colour, '#RRGGBB' or 0xRRGGBB (sRGB), as linear RGB. */
export function hexToLinear(hex: string | number): Rgb {
  const n = typeof hex === 'number' ? hex : parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

/** Linear RGB as the display's sRGB, each channel held within 0…1. */
export function linearToSrgbRgb(c: Rgb): Rgb {
  return [linearToSrgb(clamp(c[0])), linearToSrgb(clamp(c[1])), linearToSrgb(clamp(c[2]))];
}

/** Linear RGB as a CSS colour, '#rrggbb' (each channel held within 0…1 and rounded to its nearest byte). */
export function linearToCss(c: Rgb): string {
  const byte = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  const s = linearToSrgbRgb(c);
  return `#${byte(s[0])}${byte(s[1])}${byte(s[2])}`;
}
