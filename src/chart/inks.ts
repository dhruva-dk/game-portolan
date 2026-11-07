// The chartmaker's pots. Iron-gall ink is a stain: it soaks into the sheet and darkens what is there, so it is laid by
// multiplying. Vermilion, azurite, shell gold and lead white are bodied pigments that sit on the fibres, so they are
// laid over. Each ink's grain is the paper's own (paper.ts): a pot is only a colour, how it lies, and how full it is.

export type InkName = 'iron' | 'rubric' | 'green' | 'blue' | 'gold' | 'sepia' | 'white' | 'silver';

export interface Ink {
  rgb: readonly [number, number, number];
  /** How it lies on the sheet: a stain multiplies, a body covers. */
  blend: 'multiply' | 'source-over';
  /** How opaque a full stroke is. */
  body: number;
  /** How far it wicks into the fibres round a stroke, as a share of the stroke's own darkness. */
  wick: number;
}

export const INKS: Record<InkName, Ink> = {
  /** Iron-gall, aged to a warm brown-black. */
  iron: { rgb: [38, 25, 16], blend: 'multiply', body: 0.94, wick: 0.5 },
  /** Vermilion: the rubric. */
  rubric: { rgb: [184, 48, 26], blend: 'source-over', body: 0.9, wick: 0.25 },
  /** Verdigris, for the half winds. */
  green: { rgb: [58, 104, 62], blend: 'multiply', body: 0.9, wick: 0.4 },
  /** Azurite, for the blue of red-and-blue. */
  blue: { rgb: [38, 76, 140], blend: 'multiply', body: 0.92, wick: 0.4 },
  /** Shell gold: powdered gold in gum, for gilt line work. */
  gold: { rgb: [190, 138, 44], blend: 'source-over', body: 0.96, wick: 0.1 },
  /** Iron-gall gone pale, what dry ink fades through. */
  sepia: { rgb: [128, 94, 62], blend: 'multiply', body: 0.75, wick: 0.4 },
  /** Lead white, for the glints on glass and the highlights on gilt. */
  white: { rgb: [252, 246, 230], blend: 'source-over', body: 0.85, wick: 0 },
  /** Silver point and silver leaf's line. */
  silver: { rgb: [150, 154, 160], blend: 'source-over', body: 0.95, wick: 0 },
};

/** The sea's washes and the land's, as the chart's colourist mixed them. */
export const WASH = {
  ultramarine: '#3d5f9e',
  viridian: '#4f9488',
  turquoise: '#6fb0b0',
  ochre: '#c99a4a',
  sienna: '#a8582c',
  sap: '#6f8a3c',
  vermilion: '#c4452a',
  azure: '#4a78b8',
  gold: '#d4a84a',
  storm: '#6a4a7a',
} as const;

/** A hex colour as 0..255 channels. */
export function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export const css = (rgb: readonly number[], a = 1): string =>
  a >= 1 ? `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})` : `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a.toFixed(3)})`;

/** A colour mixed toward another by t. */
export const mixRgb = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
