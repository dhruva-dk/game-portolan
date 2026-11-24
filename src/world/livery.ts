import { hexToLinear as ink, luma, type Rgb } from './color.ts';
import type { Vec3 } from './sphere.ts';

export const PATTERNS = ['plain', 'band', 'stripes'] as const;

export interface Livery {
  dye: number;
  pattern: number;
}
export const LIVERY: Livery = { dye: 0, pattern: 0 };

export const EMBLEMS = 12;

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
