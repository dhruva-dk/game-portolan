import { clamp } from './scalar.ts';

export type Rgb = readonly [number, number, number];

export const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

export const linearToSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

export function hexToLinear(hex: string | number): Rgb {
  const n = typeof hex === 'number' ? hex : parseInt(hex.slice(1), 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

export function linearToSrgbRgb(c: Rgb): Rgb {
  return [
    linearToSrgb(clamp(c[0])),
    linearToSrgb(clamp(c[1])),
    linearToSrgb(clamp(c[2])),
  ];
}

export const linearToHex = (c: Rgb) =>
  `#${linearToSrgbRgb(c)
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
