export const METRICS = {
  xHeight: 10,
  ascender: 19,
  capHeight: 15,
  figureHeight: 12,
  descender: -9,
  nib: 2.2,
  hairline: 0.22,
  penAngle: 38,
  slant: 8,
  space: 5.5,
} as const;

export type StrokeRole = 'entry' | 'exit' | 'late';

export interface Stroke {
  readonly d: string;
  readonly role?: StrokeRole;
  readonly taper?: readonly [number, number];
  readonly swash?: Stroke;
}

export interface Glyph {
  readonly adv: number;
  readonly strokes: readonly Stroke[];
}

const s = (d: string, role?: StrokeRole, taper?: readonly [number, number], swash?: Stroke): Stroke => ({ d, role, taper, swash });

const entry = (x: number) => s(`M ${x - 1.5} 8.6 L ${x} 10`, 'entry');
const exit = (x: number, y = 1.8) => s(`M ${x} ${y} C ${x} 0.6 ${x + 0.5} 0 ${x + 1.3} 0.15 L ${x + 2.5} 1.4`, 'exit');
const roundExit = (x: number) => s(`M ${x} 0 C ${x + 0.8} 0 ${x + 1.5} 0.35 ${x + 2.1} 0.95 L ${x + 2.8} 1.7`, 'exit');
const stem = (x: number, y: number) => `M ${x} 10 L ${x} ${y}`;
const ascender = (x: number, y: number, t: number = METRICS.ascender) =>
  `M ${x - 1.7} ${t - 1.9} C ${x - 1.1} ${t - 0.9} ${x - 0.4} ${t} ${x + 0.5} ${t} C ${x + 0.2} ${t - 0.5} ${x} ${t - 1.2} ${x} ${t - 2.4} L ${x} ${y}`;
const arch = (x0: number, x1: number, y: number) =>
  `M ${x0} 5.6 C ${x0 + 0.7} 8.4 ${x0 + 1.8} 10.1 ${x0 + 3.1} 10.1 C ${x1 - 0.8} 10.1 ${x1} 9 ${x1} 7.4 L ${x1} ${y}`;
const bowlRight = (x0: number, x1: number) =>
  `M ${x0} 5.6 C ${x0 + 0.7} 8.4 ${x0 + 1.8} 10.1 ${x0 + 3.1} 10.1 C ${x1 - 0.8} 10.1 ${x1} 8.8 ${x1} 6.4 ` +
  `C ${x1} 2.8 ${x1 - 2.2} 0 ${x0 + 1.8} 0 C ${x0 + 1} 0 ${x0 + 0.4} 0.3 ${x0} 0.9`;
const bowlLeft = (x0: number, x1: number) =>
  `M ${x1} 9 C ${x1 - 0.7} 9.9 ${x1 - 1.8} 10.2 ${x1 - 2.8} 10.1 C ${x0 + 0.8} 9.8 ${x0} 6.4 ${x0} 3.6 ` +
  `C ${x0} 1.2 ${x0 + 0.9} 0 ${x0 + 1.9} 0 C ${x0 + 3.2} 0 ${x1 - 1} 3 ${x1} 8.4`;
const roundLeft = `C 2.1 10.1 1 7 1 4.3 C 1 1.6 2.2 0 3.8 0`;
const tail = (x: number) => `L ${x} -4.6 C ${x} -7.6 ${x - 1.4} -9 ${x - 3.4} -9 C ${x - 4.6} -9 ${x - 5.6} -8.5 ${x - 6.2} -7.6`;
const dot = (x: number, y: number, role?: StrokeRole) => s(`M ${x - 0.25} ${y + 0.35} L ${x + 0.25} ${y - 0.35}`, role);
const capStem = (x: number, y = 0): Stroke => s(`M ${x - 2.4} 12.8 C ${x - 1.6} 14.6 ${x - 0.6} 15.3 ${x} 15 L ${x} ${y}`, undefined, undefined,
  s(`M ${x - 4.6} 9.6 C ${x - 5.6} 12.6 ${x - 3.8} 15.8 ${x - 0.6} 15.6 C ${x + 0.2} 15.5 ${x} 15.2 ${x} 14.4 L ${x} ${y}`, undefined, [0.35, 1]));
const comma = (x: number, y: number) => s(`M ${x - 0.3} ${y + 0.35} L ${x + 0.3} ${y - 0.35} C ${x + 0.3} ${y - 1.5} ${x - 0.3} ${y - 2.6} ${x - 1.5} ${y - 3.4}`);
const turned = (x: number, y: number) => s(`M ${x + 0.3} ${y - 0.35} L ${x - 0.3} ${y + 0.35} C ${x - 0.3} ${y + 1.5} ${x + 0.3} ${y + 2.6} ${x + 1.5} ${y + 3.4}`);
const oval = (x0: number, x1: number, h: number) => {
  const m = (x0 + x1) / 2;
  return [
    s(`M ${m + 0.4} ${h + 0.2} C ${x0 + 1.4} ${h + 0.2} ${x0} ${h * 0.74} ${x0} ${h * 0.46} C ${x0} ${h * 0.18} ${x0 + 1.4} 0 ${m - 0.4} 0`),
    s(`M ${m} ${h + 0.2} C ${x1 - 1.4} ${h + 0.2} ${x1} ${h * 0.76} ${x1} ${h * 0.5} C ${x1} ${h * 0.2} ${x1 - 1.6} 0 ${m - 0.6} 0`),
  ];
};

const LOWER: Record<string, Glyph> = {
  a: { adv: 9.8, strokes: [s(bowlLeft(1, 6.6)), s(stem(6.6, 1.8)), exit(6.6)] },
  b: { adv: 9.2, strokes: [s(ascender(1.6, 0.6)), s(bowlRight(1.6, 7))] },
  c: { adv: 8.4, strokes: [s(`M 6.5 8.4 C 6.3 9.5 5.2 10.1 4 10.1 ${roundLeft}`), roundExit(3.8)] },
  d: { adv: 9.8, strokes: [s(bowlLeft(1, 6.6)), s(ascender(6.6, 1.8)), exit(6.6)] },
  e: { adv: 8.4, strokes: [s(`M 1.4 4 C 3.6 5 6.2 6.4 6.2 8.4 C 6.2 9.5 5.4 10.1 4.4 10.1 ${roundLeft}`), roundExit(3.8)] },
  f: {
    adv: 6.6,
    strokes: [
      s(`M 7.2 17 C 6.6 18.5 5.6 19 4.8 19 C 3.4 19 2.8 17.6 2.8 15.6 L 2.8 -5.4 C 2.8 -7.8 1.8 -9 0.2 -9`),
      s(`M 0.6 10 L 5.4 10`),
    ],
  },
  g: { adv: 9.6, strokes: [s(bowlLeft(1, 6.6)), s(`M 6.6 10 ${tail(6.6)}`)] },
  h: { adv: 10, strokes: [s(ascender(1.6, 0)), s(arch(1.6, 7, 1.8)), exit(7)] },
  i: { adv: 5, strokes: [entry(1.6), s(stem(1.6, 1.8)), exit(1.6), dot(1.9, 13.6, 'late')] },
  j: { adv: 5, strokes: [entry(1.6), s(`M 1.6 10 ${tail(1.6)}`), dot(1.9, 13.6, 'late')] },
  k: {
    adv: 9.4,
    strokes: [
      s(ascender(1.6, 0)),
      s(`M 1.6 4.4 C 2.8 7.4 4.4 9.6 5.6 9.6 C 6.5 9.6 6.9 8.9 6.9 8.1 C 6.9 6.4 4.6 5.3 2.6 5`),
      s(`M 3.8 5.2 C 5.4 4.5 6.2 3.2 6.2 1.8`),
      exit(6.2),
    ],
  },
  l: { adv: 5, strokes: [s(ascender(1.6, 1.8)), exit(1.6)] },
  m: { adv: 14.6, strokes: [entry(1.6), s(stem(1.6, 0)), s(arch(1.6, 6.4, 0)), s(arch(6.4, 11.2, 1.8)), exit(11.2)] },
  n: { adv: 10, strokes: [entry(1.6), s(stem(1.6, 0)), s(arch(1.6, 7, 1.8)), exit(7)] },
  o: { adv: 8.8, strokes: [s(`M 6.6 8.4 C 6.1 9.5 5.2 10.1 4.2 10.1 ${roundLeft} C 5.8 0 7.2 3 7.2 5.8 C 7.2 7.4 6.9 8.4 6.2 9.2`)] },
  p: { adv: 9.4, strokes: [entry(1.6), s(stem(1.6, -9)), s(bowlRight(1.6, 7))] },
  q: { adv: 9.6, strokes: [s(bowlLeft(1, 6.6)), s(`M 6.6 10 L 6.6 -7.8 C 6.6 -8.7 7.2 -9.1 8.2 -8.9`)] },
  r: { adv: 7.4, strokes: [entry(1.6), s(stem(1.6, 0)), s(`M 1.6 5.6 C 2.3 8.4 3.5 10.1 4.9 10.1 C 5.7 10.1 6.3 9.8 6.7 9.1`)] },
  s: {
    adv: 7.8,
    strokes: [s(`M 6 9 C 5.4 9.8 4.6 10.1 3.8 10.1 C 2.5 10.1 1.7 9.2 1.7 8 C 1.7 5.6 6.1 5.2 6.1 2.4 C 6.1 0.9 4.9 0 3.4 0 C 2.3 0 1.2 0.6 0.6 1.6`)],
  },
  t: { adv: 6.2, strokes: [s(`M 1.6 13.6 L 1.6 1.8`), exit(1.6), s(`M 0 10 L 4.6 10`, 'late')] },
  u: {
    adv: 10,
    strokes: [entry(1.6), s(`M 1.6 10 L 1.6 3 C 1.6 1 2.6 0 3.8 0 C 5.2 0 6.3 1.6 7 4.2`), s(stem(7, 1.8)), exit(7)],
  },
  v: { adv: 9, strokes: [entry(1.6), s(`M 1.6 10 C 1.9 6.6 2.7 2.8 3.8 0 C 5.2 2.4 6.6 6 7.2 9 C 7.4 9.8 7 10.3 6.4 10.1`)] },
  w: {
    adv: 12.6,
    strokes: [
      entry(1.6),
      s(`M 1.6 10 C 1.9 6.6 2.5 2.8 3.4 0 C 4.4 2.6 5.2 5.8 5.6 9`),
      s(`M 5.6 9 C 6 5.8 6.6 2.6 7.4 0 C 8.8 2.4 10.2 6 10.8 9 C 11 9.8 10.6 10.3 10 10.1`),
    ],
  },
  x: {
    adv: 8.8,
    strokes: [s(`M 0.6 8.8 C 1.2 9.9 2 10.2 2.6 9.4 C 3.6 7.2 4.6 3 5.6 1.2 C 6.1 0.2 7 0 7.8 0.8`), s(`M 7 10 L 1 0`)],
  },
  y: { adv: 10, strokes: [entry(1.6), s(`M 1.6 10 L 1.6 3 C 1.6 1 2.6 0 3.8 0 C 5.2 0 6.3 1.6 7 4.2`), s(`M 7 10 ${tail(7)}`)] },
  z: { adv: 8.4, strokes: [s(`M 1 9.2 C 2.4 10.4 4 9.4 6.6 10 L 0.8 0 C 2.6 0.8 4.4 -0.6 7.2 0.6`)] },
};

const UPPER: Record<string, Glyph> = {
  A: {
    adv: 12.6,
    strokes: [s(`M -0.6 1.4 C 0.2 0 1.4 0 2.2 1.4 L 6.6 15.2`), s(`M 6.6 15.2 L 9.4 1.8`), exit(9.4), s(`M 3.4 5.8 L 8.6 6.2`)],
  },
  B: {
    adv: 11,
    strokes: [
      capStem(3, 0.4),
      s(`M 3 15 C 5.2 15.3 8.4 15 8.4 11.8 C 8.4 9.4 6 8.2 3.2 8.2`),
      s(`M 3.2 8.2 C 7 8.4 9.6 6.8 9.6 4.2 C 9.6 1.4 7.2 0 4.6 0 C 3 0 1.6 0.2 0.2 0.8`),
    ],
  },
  C: { adv: 10.6, strokes: [s(`M 9.6 12.6 C 9.2 14.4 7.8 15.2 6.4 15.2 C 3.2 15.2 1.2 11.4 1.2 7.2 C 1.2 3 3.4 0 6.4 0 C 7.8 0 9 0.6 9.8 1.8`)] },
  D: {
    adv: 12,
    strokes: [capStem(3, 0.4), s(`M 3 15 C 4 15.2 5 15.2 6 15.2 C 9.4 15.2 11.2 11.8 11.2 7.8 C 11.2 3.2 8.6 0 4.8 0 C 3 0 1.6 0.3 0.2 1`)],
  },
  E: {
    adv: 9.8,
    strokes: [capStem(3, 0.2), s(`M 3 15 L 8.4 15 C 8.8 15 9 14.4 9 13.8`), s(`M 3 8 L 7 8`), s(`M 3 0.2 L 8.8 0.2 C 9.2 0.2 9.4 0.8 9.6 1.6`)],
  },
  F: { adv: 9.4, strokes: [capStem(3), s(`M 3 15 L 8.6 15 C 9 15 9.2 14.4 9.2 13.8`), s(`M 3 8 L 7.2 8`)] },
  G: {
    adv: 11.2,
    strokes: [
      s(`M 9.6 12.6 C 9.2 14.4 7.8 15.2 6.4 15.2 C 3.2 15.2 1.2 11.4 1.2 7.2 C 1.2 3 3.4 0 6.4 0 C 8.4 0 9.8 1.4 10 3.6 L 10 7`),
      s(`M 7.2 7 L 10.8 7`),
    ],
  },
  H: { adv: 13, strokes: [capStem(3), s(`M 10.4 15 L 10.4 1.8`), exit(10.4), s(`M 3 7.8 L 10.4 7.8`)] },
  I: { adv: 6.4, strokes: [s(`M 1.4 15 L 4.8 15`), s(`M 3.1 15 L 3.1 0`), s(`M 1.2 0 L 4.8 0`)] },
  J: { adv: 6.4, strokes: [s(`M 2.6 15 L 6 15`), s(`M 4.4 15 L 4.4 -2.6 C 4.4 -6 2.8 -8.4 0.4 -8.4 C -0.8 -8.4 -1.8 -7.6 -2.4 -6.6`)] },
  K: {
    adv: 11.6,
    strokes: [capStem(3), s(`M 10 15 C 7.6 12 5.6 9.8 3.2 7.8`), s(`M 5.2 9.4 C 6.6 7 8.4 4 9 1.8`), exit(9)],
  },
  L: { adv: 9.8, strokes: [capStem(3, 0.2), s(`M 3 0.2 L 9 0.2 C 9.4 0.2 9.6 0.8 9.8 1.6`)] },
  M: {
    adv: 14.6,
    strokes: [s(`M -0.8 1.2 C 0 0 1 -0.2 1.4 1 L 2.6 15`), s(`M 2.6 15 L 7 0.4`), s(`M 7 0.4 L 11.4 15`), s(`M 11.4 15 L 12 1.8`), exit(12)],
  },
  N: {
    adv: 12.2,
    strokes: [s(`M -0.6 1.2 C 0.2 0 1.2 -0.2 1.6 1 L 2.6 15`), s(`M 2.6 15 L 9.6 0`), s(`M 9.6 0 L 10.6 15 C 10.7 15.6 11.2 15.8 11.8 15.6`)],
  },
  O: { adv: 12, strokes: oval(1, 11, 15) },
  P: { adv: 10.4, strokes: [capStem(3), s(`M 3 15 C 5.4 15.3 9.2 15 9.2 11.4 C 9.2 8.4 6.6 7 3.2 7.2`)] },
  Q: { adv: 12, strokes: [...oval(1, 11, 15), s(`M 5.4 0.2 C 7.4 -0.8 9.6 -1.8 12.6 -1`)] },
  R: {
    adv: 11.4,
    strokes: [capStem(3), s(`M 3 15 C 5.4 15.3 9.2 15 9.2 11.6 C 9.2 9 6.8 7.8 3.2 7.8`), s(`M 5.4 7.8 C 7 6.6 8 3.4 8.8 1.8`), exit(8.8)],
  },
  S: {
    adv: 10,
    strokes: [s(`M 8.8 13 C 8.2 14.5 7 15.2 5.6 15.2 C 3.4 15.2 2 13.8 2 11.6 C 2 7.4 9 7.6 9 3.6 C 9 1.4 7.4 0 5 0 C 3 0 1.6 0.8 0.6 2.2`)],
  },
  T: { adv: 11, strokes: [s(`M 0.4 13.8 C 1.4 15 2.6 15.2 4 15 L 10.6 15 C 11 15 11.2 14.4 11.2 13.8`), s(`M 6.2 15 L 6.2 0.4`)] },
  U: {
    adv: 12,
    strokes: [s(`M 0.6 12.8 C 1.4 14.6 2.4 15.3 3 15 L 3 4.4 C 3 1.6 4.4 0 6.4 0 C 8.4 0 9.8 1.8 10.2 4.6`), s(`M 10.4 15 L 10.4 1.8`), exit(10.4)],
  },
  V: { adv: 11.4, strokes: [s(`M 0.6 12.8 C 1.4 14.6 2.4 15.3 3 15 C 3.6 10 4.6 4.6 6 0 C 7.6 4.8 9.2 10 10.6 14.2 C 10.8 14.8 11.4 15.2 12 15`)] },
  W: {
    adv: 15.6,
    strokes: [
      s(`M 0.6 12.8 C 1.4 14.6 2.4 15.3 3 15 C 3.4 10 4.2 4.6 5.2 0 C 6.2 4.2 7.2 8.8 8 13`),
      s(`M 8 13 C 8.6 8.8 9.4 4.2 10.4 0 C 11.8 4.8 13.2 10 14.6 14.2 C 14.8 14.8 15.4 15.2 16 15`),
    ],
  },
  X: { adv: 11.4, strokes: [s(`M 0.6 13.6 C 1.4 15 2.6 15.4 3.4 14.2 L 8.6 1.4 C 9 0.2 10.2 -0.1 11 0.8`), s(`M 10.2 15 L 1.2 0`)] },
  Y: { adv: 11, strokes: [s(`M 0.6 13.6 C 1.4 15 2.6 15.4 3.2 14.2 L 6.2 7.4`), s(`M 10.6 15 L 6.2 7.4 L 6.2 0.4`)] },
  Z: { adv: 10.4, strokes: [s(`M 1.2 14.2 C 2.6 15.4 4.4 14.6 9.2 15 L 1 0 C 3.4 0.8 5.6 -0.6 9.6 0.6`)] },
};

const FIGURES: Record<string, Glyph> = {
  0: { adv: 9, strokes: oval(1, 8, 12) },
  1: { adv: 6.4, strokes: [s(`M 1.2 9.8 C 2.6 10.6 3.6 11.4 4.2 12.2 L 4.2 0`)] },
  2: { adv: 8.6, strokes: [s(`M 1.2 9.6 C 1.6 11.4 2.8 12.2 4.4 12.2 C 6.2 12.2 7.4 11 7.4 9.2 C 7.4 6.4 3.6 3.6 1 0.2 C 3.2 0.8 5.4 -0.4 8.2 0.6`)] },
  3: {
    adv: 8.4,
    strokes: [
      s(`M 1.4 10.4 C 2 11.6 3 12.2 4.4 12.2 C 6 12.2 7 11.2 7 9.6 C 7 7.8 5.4 6.8 3.4 6.8`),
      s(`M 3.4 6.8 C 6 6.8 7.6 5.4 7.6 3.4 C 7.6 1.2 6 0 4 0 C 2.6 0 1.4 0.6 0.6 1.8`),
    ],
  },
  4: { adv: 9, strokes: [s(`M 6 12.2 L 0.6 3.4 L 8.6 3.4`), s(`M 6 12.2 L 6 0`)] },
  5: {
    adv: 8.4,
    strokes: [
      s(`M 7.6 12.2 L 2.8 12.2 L 2 6.8`),
      s(`M 2 6.8 C 3 7.6 4 7.8 4.8 7.8 C 6.6 7.8 7.6 6.2 7.6 4 C 7.6 1.4 6 0 4 0 C 2.6 0 1.4 0.6 0.6 1.8`),
    ],
  },
  6: { adv: 8.4, strokes: [s(`M 7 11.4 C 6.2 12 5.4 12.2 4.8 12.2 C 2.4 12.2 1 8.8 1 5 C 1 1.8 2.4 0 4.2 0 C 6.2 0 7.6 1.6 7.6 3.8 C 7.6 6 6.2 7.4 4.4 7.4 C 3 7.4 1.8 6.6 1.2 5.4`)] },
  7: { adv: 8.4, strokes: [s(`M 1 10.6 C 2 12.4 3.4 12 5 12.2 L 8 12.2 C 6 8.6 4.4 4.4 3.4 0`)] },
  8: {
    adv: 8.4,
    strokes: [s(`M 6.8 10 C 6.8 11.4 5.8 12.2 4.4 12.2 C 2.8 12.2 1.8 11.2 1.8 9.8 C 1.8 7.6 7.4 5.8 7.4 3.2 C 7.4 1.2 6 0 4.2 0 C 2.4 0 1 1.2 1 3 C 1 5.8 6.8 7.6 6.8 10`)],
  },
  9: { adv: 8.4, strokes: [s(`M 7 7 C 6.4 5.6 5.2 4.8 3.8 4.8 C 2 4.8 1 6.2 1 8.2 C 1 10.6 2.4 12.2 4.2 12.2 C 6.2 12.2 7.4 10.4 7.4 7.4 C 7.4 3.4 5.4 0.4 1.6 0`)] },
};

const MARKS: Record<string, Glyph> = {
  ' ': { adv: METRICS.space, strokes: [] },
  '.': { adv: 3.6, strokes: [dot(1.3, 0.65)] },
  ',': { adv: 3.6, strokes: [comma(1.5, 0.7)] },
  ':': { adv: 3.8, strokes: [dot(1.5, 7.6), dot(1.3, 0.65)] },
  ';': { adv: 3.8, strokes: [dot(1.7, 7.6), comma(1.5, 0.7)] },
  '!': { adv: 4.6, strokes: [s(`M 2.4 15 C 2.4 11 2 7 1.8 4.4`, undefined, [1, 0.35]), dot(1.6, 0.65)] },
  '?': { adv: 7.6, strokes: [s(`M 1.2 12.6 C 1.8 14.2 3 15 4.4 15 C 6.2 15 7.2 13.8 7.2 12 C 7.2 9.4 3.8 8.4 3.6 4.4`), dot(3.4, 0.65)] },
  '’': { adv: 3.4, strokes: [comma(1.8, 14.6)] },
  '‘': { adv: 3.4, strokes: [turned(1.4, 11.6)] },
  '”': { adv: 5.6, strokes: [comma(1.8, 14.6), comma(4, 14.6)] },
  '“': { adv: 5.6, strokes: [turned(1.4, 11.6), turned(3.6, 11.6)] },
  '-': { adv: 5.6, strokes: [s(`M 0.8 4.6 L 4.6 5.2`)] },
  '–': { adv: 8, strokes: [s(`M 0.6 4.8 L 7.4 5`)] },
  '—': { adv: 12.4, strokes: [s(`M 0.6 4.8 L 11.8 5`)] },
  '−': { adv: 8.4, strokes: [s(`M 1 6 L 7.4 6`)] },
  '+': { adv: 8.4, strokes: [s(`M 1 6 L 7.4 6`), s(`M 4.2 9.2 L 4.2 2.8`)] },
  '×': { adv: 8, strokes: [s(`M 1.4 8.8 L 6.4 3.2`), s(`M 6.4 8.8 L 1.4 3.2`)] },
  '·': { adv: 3.6, strokes: [dot(1.4, 5.2)] },
  '/': { adv: 7, strokes: [s(`M 6.8 16 L 0.4 -4`)] },
  '(': { adv: 5, strokes: [s(`M 4.6 16 C 1.8 13 1 9 1 5 C 1 1 1.8 -2.4 4.2 -5`)] },
  ')': { adv: 5, strokes: [s(`M 0.6 16 C 3.2 13 4 9 4 5 C 4 1 3.2 -2.4 0.4 -5`)] },
  '%': { adv: 11, strokes: [...oval(0.8, 4.4, 5.6).map((o) => ({ ...o, d: shift(o.d, 0, 6.4) })), s(`M 9.4 12.4 L 1.6 0`), ...oval(6, 9.6, 5.6)] },
  '&': {
    adv: 11,
    strokes: [s(`M 8.6 6.6 C 7 2.6 4.6 0 2.8 0 C 1.4 0 0.6 1 0.6 2.6 C 0.6 5 3 6.4 5 7.8 C 6.4 8.8 7 10 7 11.2 C 7 12.6 6 13.4 4.8 13.4 C 3.6 13.4 2.8 12.4 2.8 11.2 C 2.8 8.6 6 4 9.6 0.6 L 10.4 0`)],
  },
};

function shift(d: string, dx: number, dy: number): string {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => String(+(Number(n) + (i++ % 2 === 0 ? dx : dy)).toFixed(3)));
}

export const GLYPHS: Readonly<Record<string, Glyph>> = {
  ...LOWER, ...UPPER, ...FIGURES, ...MARKS, "'": MARKS['’'], '"': MARKS['”'],
};

export const isLower = (ch: string): boolean => ch in LOWER;
