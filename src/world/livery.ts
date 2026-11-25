import { hexToLinear as ink, luma, type Rgb } from './color.ts';
import type { Vec3 } from './sphere.ts';

export const PATTERNS = ['plain', 'band', 'stripes'] as const;

export interface Livery {
  dye: number;
  pattern: number;
  emblem?: number;
}
export const LIVERY: Livery = { dye: 0, pattern: 0 };

export const DEVICES = [
  'M7 11.5a5 5 0 1 0 10 0a5 5 0 1 0-10 0z',
  'M12 4.5 18.5 11.5 12 18.5 5.5 11.5z',
  'M10 4.5h4v5h5v4h-5v5.5h-4v-5.5H5v-4h5z',
  'M6 5 12 9.5 18 5l1.5 2.5L14.5 11.5l5 4-1.5 2.5-6-4.5-6 4.5L4.5 15.5l5-4-5-4z',
  'm12 4 2.2 5 5.3.5-4 3.6 1.2 5.4L12 15.7 7.3 18.5l1.2-5.4-4-3.6 5.3-.5z',
  'M15 4.5A7.5 7.5 0 1 0 15 18.5 6 6 0 1 1 15 4.5z',
  'M12 4.5 19 17.5H5z',
  'M4.5 14 12 6.5l7.5 7.5-2.5 2.5-5-5-5 5z',
  'M5 6.5h14v3.5H5zM5 13h14v3.5H5z',
  'M4.5 9c2.5-2.5 4.5-2.5 6 0s3.5 2.5 5 0 2.5-2.5 4 0v4.5c-1.5-2.5-2.5-2.5-4 0s-3.5 2.5-5 0-3.5-2.5-6 0z',
  'M11 4h2v2.5h2.5v2H13v6.8c1.8-.3 3-1.4 3.5-3h-1.5l2.5-2.5 2.5 2.5h-1.4c-.7 3-3.3 5.2-6.6 5.2s-5.9-2.2-6.6-5.2H4l2.5-2.5L9 12.3H7.5c.5 1.6 1.7 2.7 3.5 3V8.5H8.5v-2H11z',
  'M5.5 5h13v2.5l-3.5 4 3.5 4V18h-13v-2.5l3.5-4-3.5-4z',
] as const;

export const EMBLEMS = DEVICES.length;

export const DEVICE_BOX = { size: 24, x: 12, y: 11.5, half: 8 } as const;

export const deviceOf = (emblem: number) =>
  ((Math.round(emblem) % EMBLEMS) + EMBLEMS) % EMBLEMS;

const LIGHT = ink('#F3E6C8'),
  DARK = ink('#3A2A2E');
export const MARKS = {
  light: LIGHT,
  dark: DARK,
  turn: Math.sqrt((luma(LIGHT) + 0.05) * (luma(DARK) + 0.05)) - 0.05,
} as const;
export const markOn = (c: Rgb): Rgb =>
  luma(c) > MARKS.turn ? MARKS.dark : MARKS.light;

const VERMILION = ink('#D2332A');
const OCHRE = ink('#E8A21C');
const MOSS = ink('#7F9A2A');
const ROSE = ink('#F2A0B4');
const LEMON = ink('#F4E06A');
const MURREY = ink('#8A2A6A');
const CHARCOAL = ink('#2E2A33');
const CORAL = ink('#EE6E5C');
const TANGERINE = ink('#F2801E');
const CHARTREUSE = ink('#BCC82C');
const OLIVE = ink('#5C5A1E');
const OXBLOOD = ink('#741A22');
const UMBER = ink('#6E4222');
const CERISE = ink('#D63C88');
const PEACH = ink('#F6BC8C');
const PEWTER = ink('#8E8882');

export const DYES: readonly { name: string; color: Vec3; mark: Vec3 }[] =
  Object.entries({
    vermilion: VERMILION,
    coral: CORAL,
    tangerine: TANGERINE,
    ochre: OCHRE,
    lemon: LEMON,
    chartreuse: CHARTREUSE,
    peach: PEACH,
    rose: ROSE,
    oxblood: OXBLOOD,
    umber: UMBER,
    olive: OLIVE,
    moss: MOSS,
    cerise: CERISE,
    murrey: MURREY,
    pewter: PEWTER,
    charcoal: CHARCOAL,
  }).map(([name, c]) => ({
    name,
    color: [c[0], c[1], c[2]],
    mark: [...markOn(c)],
  }));
export const COLORS: readonly Vec3[] = DYES.map((d) => d.color);

export const liveryAt = (index: number): Livery => ({
  dye: index % COLORS.length,
  pattern: Math.floor(index / COLORS.length) % PATTERNS.length,
});
