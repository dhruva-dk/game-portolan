// The lettering hand: roman capitals as a chartmaker lettered a title across the top of a chart, with the same cut
// quill as the numeral hand (numerals.ts), held at the same angle, so the stems and the right-hand diagonals swell
// and the hairlines are hairlines. The letters are the inscriptional capitals every sixteenth-century engraver copied
// from Roman stone: wide round O, C, D, G and Q, a square H, N and T, narrow B, E, F, L, P, R and S, the serifs cut as
// short cross-strokes where a stem starts and stops. Each letter is written fresh, a hair taller or wider than its
// neighbour, seeded by where it stands, so a word never looks set in type.
//
// Only PLAY and DIVE are lettered anywhere in the game (issue #54), but the whole alphabet is here so a later word
// needs no new drawing.
//
// Units: the cap height is 1, the baseline at 0, y down.
import { clamp, hash } from './noise.ts';
import { trace, type Pen, type Pts } from './pen.ts';
import type { InkName } from './inks.ts';

interface Glyph {
  /** Strokes, in the order the hand writes them: stems, then bowls and bars, then the serifs. */
  d: string[];
  /** Advance, in cap heights. */
  adv: number;
}

/** A serif: a short cross-stroke centred on (x, y), `hw` each way. */
const serif = (x: number, y: number, hw = 0.1) => `M ${x - hw} ${y} L ${x + hw} ${y}`;
/** A serif hanging from the end of a bar, from (x, y) down (or up, dy negative) a little. */
const drop = (x: number, y: number, dy = 0.1) => `M ${x} ${y} L ${x} ${y + dy}`;

const GLYPHS: Record<string, Glyph> = {
  A: { d: ['M 0.06 0 L 0.4 -1.0', 'M 0.4 -1.0 L 0.76 0', 'M 0.2 -0.34 L 0.6 -0.34', serif(0.06, 0), serif(0.76, 0)], adv: 0.86 },
  B: { d: ['M 0.1 -1 L 0.1 0', 'M 0.1 -1 C 0.52 -1.03 0.54 -0.56 0.1 -0.54', 'M 0.1 -0.54 C 0.6 -0.57 0.62 0.03 0.1 0', 'M 0 -1 L 0.12 -1', 'M 0 0 L 0.12 0'], adv: 0.66 },
  C: { d: ['M 0.72 -0.8 C 0.64 -1.04 0.1 -1.08 0.06 -0.5 C 0.02 0.06 0.58 0.08 0.72 -0.22', drop(0.72, -0.8, 0.08)], adv: 0.78 },
  D: { d: ['M 0.1 -1 L 0.1 0', 'M 0.1 -1 C 0.78 -1.02 0.8 0.02 0.1 0', 'M 0 -1 L 0.12 -1', 'M 0 0 L 0.12 0'], adv: 0.8 },
  E: { d: ['M 0.1 -1 L 0.1 0', 'M 0 -1 L 0.58 -1', 'M 0.1 -0.52 L 0.46 -0.52', 'M 0 0 L 0.6 0', drop(0.58, -1), drop(0.6, 0, -0.1), drop(0.46, -0.52, -0.06)], adv: 0.64 },
  F: { d: ['M 0.1 -1 L 0.1 0', 'M 0 -1 L 0.56 -1', 'M 0.1 -0.52 L 0.44 -0.52', serif(0.1, 0), drop(0.56, -1), drop(0.44, -0.52, -0.06)], adv: 0.6 },
  G: { d: ['M 0.74 -0.8 C 0.66 -1.04 0.1 -1.08 0.06 -0.5 C 0.02 0.06 0.62 0.08 0.74 -0.3', 'M 0.74 -0.3 L 0.74 -0.48 L 0.46 -0.48', drop(0.74, -0.8, 0.08)], adv: 0.82 },
  H: { d: ['M 0.1 -1 L 0.1 0', 'M 0.68 -1 L 0.68 0', 'M 0.1 -0.52 L 0.68 -0.52', serif(0.1, -1), serif(0.1, 0), serif(0.68, -1), serif(0.68, 0)], adv: 0.8 },
  I: { d: ['M 0.15 -1 L 0.15 0', serif(0.15, -1, 0.11), serif(0.15, 0, 0.11)], adv: 0.32 },
  J: { d: ['M 0.4 -1 L 0.4 -0.24 C 0.4 0.04 0.1 0.06 0.02 -0.18', serif(0.4, -1, 0.11)], adv: 0.54 },
  K: { d: ['M 0.1 -1 L 0.1 0', 'M 0.12 -0.42 L 0.64 -1', 'M 0.3 -0.6 L 0.7 0', serif(0.1, -1), serif(0.1, 0), serif(0.64, -1, 0.08), serif(0.7, 0, 0.08)], adv: 0.78 },
  L: { d: ['M 0.1 -1 L 0.1 0', 'M 0 0 L 0.58 0', serif(0.1, -1), drop(0.58, 0, -0.1)], adv: 0.6 },
  M: { d: ['M 0.08 0 L 0.1 -1', 'M 0.1 -1 L 0.5 -0.06', 'M 0.5 -0.06 L 0.9 -1', 'M 0.9 -1 L 0.92 0', serif(0.08, 0), serif(0.92, 0), 'M 0.82 -1 L 0.98 -1'], adv: 1.02 },
  N: { d: ['M 0.1 -1 L 0.1 0', 'M 0.1 -1 L 0.7 0', 'M 0.7 0 L 0.7 -1', serif(0.1, -1, 0.08), serif(0.1, 0), serif(0.7, -1)], adv: 0.82 },
  O: { d: ['M 0.44 -1.01 C 0.18 -1.01 0.04 -0.78 0.04 -0.5 C 0.04 -0.22 0.2 0.01 0.42 0.01', 'M 0.4 -1.01 C 0.66 -1.01 0.8 -0.78 0.8 -0.5 C 0.8 -0.22 0.64 0.01 0.42 0.01'], adv: 0.86 },
  P: { d: ['M 0.1 -1 L 0.1 0', 'M 0.1 -1 C 0.62 -1.03 0.62 -0.46 0.1 -0.46', 'M 0 -1 L 0.12 -1', serif(0.1, 0)], adv: 0.64 },
  Q: { d: ['M 0.44 -1.01 C 0.18 -1.01 0.04 -0.78 0.04 -0.5 C 0.04 -0.22 0.2 0.01 0.42 0.01', 'M 0.4 -1.01 C 0.66 -1.01 0.8 -0.78 0.8 -0.5 C 0.8 -0.22 0.64 0.01 0.42 0.01', 'M 0.46 -0.12 C 0.58 -0.02 0.72 0.1 0.88 0.22'], adv: 0.86 },
  R: { d: ['M 0.1 -1 L 0.1 0', 'M 0.1 -1 C 0.62 -1.03 0.62 -0.46 0.1 -0.46', 'M 0.32 -0.46 L 0.7 0', 'M 0 -1 L 0.12 -1', serif(0.1, 0), serif(0.7, 0, 0.08)], adv: 0.76 },
  S: { d: ['M 0.56 -0.82 C 0.44 -1.08 0.06 -1.02 0.08 -0.74 C 0.1 -0.44 0.58 -0.5 0.58 -0.22 C 0.58 0.08 0.14 0.1 0.02 -0.16', drop(0.56, -0.82, 0.07), drop(0.02, -0.16, -0.07)], adv: 0.62 },
  T: { d: ['M 0.36 -1 L 0.36 0', 'M 0.02 -1 L 0.7 -1', drop(0.02, -1), drop(0.7, -1), serif(0.36, 0)], adv: 0.72 },
  U: { d: ['M 0.1 -1 L 0.1 -0.32 C 0.1 0.04 0.7 0.04 0.7 -0.32 L 0.7 -1', serif(0.1, -1), serif(0.7, -1)], adv: 0.8 },
  V: { d: ['M 0.04 -1 L 0.4 0', 'M 0.76 -1 L 0.4 0', serif(0.04, -1, 0.08), serif(0.76, -1, 0.08)], adv: 0.8 },
  W: { d: ['M 0.04 -1 L 0.3 0', 'M 0.3 0 L 0.56 -0.92', 'M 0.56 -0.92 L 0.82 0', 'M 0.82 0 L 1.08 -1', serif(0.04, -1, 0.08), serif(1.08, -1, 0.08), serif(0.56, -0.92, 0.07)], adv: 1.12 },
  X: { d: ['M 0.04 -1 L 0.72 0', 'M 0.72 -1 L 0.04 0', serif(0.04, -1, 0.08), serif(0.72, -1, 0.08), serif(0.04, 0, 0.08), serif(0.72, 0, 0.08)], adv: 0.76 },
  Y: { d: ['M 0.04 -1 L 0.38 -0.5', 'M 0.72 -1 L 0.38 -0.5', 'M 0.38 -0.5 L 0.38 0', serif(0.04, -1, 0.08), serif(0.72, -1, 0.08), serif(0.38, 0)], adv: 0.76 },
  Z: { d: ['M 0.06 -1 L 0.66 -1', 'M 0.66 -1 L 0.04 0', 'M 0.04 0 L 0.68 0', drop(0.06, -1), drop(0.68, 0, -0.1)], adv: 0.72 },
  ' ': { d: [], adv: 0.42 },
};

export interface WordOptions {
  ink?: InkName;
  /** 'left' (x is where it starts), 'center' or 'right'. */
  align?: 'left' | 'center' | 'right';
  /** The quill's width as a share of the cap height. */
  weight?: number;
  /** Lean, as a shear (0.1 is about six degrees); capitals stand upright unless told. */
  slant?: number;
  /** Space between letters, in cap heights, over each letter's own advance. */
  spacing?: number;
  /** Gilt lettering: shell gold over an iron shadow, as a chart's title was illuminated. */
  gilt?: boolean;
  seed?: number;
  alpha?: number;
}

const SPACING = 0.1;

/** How wide a word is lettered at a cap height, in pixels. */
export function wordWidth(text: string, size: number, spacing = SPACING): number {
  let w = 0;
  const chars = [...text.toUpperCase()];
  for (const ch of chars) w += ((GLYPHS[ch]?.adv ?? 0.6) + spacing) * size;
  return w - spacing * size;
}

/**
 * Letters `text` in roman capitals with its baseline at y and a cap height of `size` pixels; its first t inked, a
 * letter at a time. Returns the width lettered.
 */
export function word(pen: Pen, text: string, x: number, y: number, size: number, o: WordOptions = {}, t = 1): number {
  const spacing = o.spacing ?? SPACING, width = wordWidth(text, size, spacing);
  if (t <= 0) return width;
  let cx = o.align === 'center' ? x - width / 2 : o.align === 'right' ? x - width : x;
  const seed = o.seed ?? 11, slant = o.slant ?? 0, ink = o.ink ?? 'iron';
  const w = size * (o.weight ?? 0.13);
  const chars = [...text.toUpperCase()], n = chars.length;
  for (let i = 0; i < n; i++) {
    const ch = chars[i], gl = GLYPHS[ch];
    if (!gl) { cx += (0.6 + spacing) * size; continue; }
    const lt = t >= 1 ? 1 : clamp(t * n * 1.15 - i * 1.0);
    if (lt > 0 && gl.d.length) {
      // each letter written fresh: its height, its stand and its lean a little different
      const h1 = hash(i, ch.charCodeAt(0), seed), h2 = hash(i + 7, ch.charCodeAt(0), seed), h3 = hash(i + 3, 5, seed);
      const k = size * (1 + (h1 - 0.5) * 0.04), dy = (h2 - 0.5) * size * 0.03, sl = slant + (h3 - 0.5) * 0.03;
      const strokes: Pts[] = [];
      for (const d of gl.d) for (const s of trace(d, 1, 0, 0, 12)) {
        const pts: Pts = [];
        for (let q = 0; q < s.length; q += 2) pts.push(cx + (s[q] - s[q + 1] * sl) * k, y + s[q + 1] * k + dy);
        strokes.push(pts);
      }
      const style = { w, ink, nib: 0.78, angle: -0.72, wobble: size * 0.006, drift: 0, taper: w * 1.2, pool: 0.6, seed: seed + i * 17, alpha: o.alpha };
      if (o.gilt) {
        // the shadow the illuminator inked under the leaf, then the gold over it
        const off = Math.max(0.6, size * 0.025);
        const shadow = strokes.map((s) => s.map((v, q) => v + (q & 1 ? off : off * 0.8)));
        pen.strokes(shadow, { ...style, ink: 'iron', w: w * 0.8, alpha: (o.alpha ?? 0.9) * 0.7, pool: 0.3 }, lt, 0.15);
        pen.strokes(strokes, { ...style, ink: 'gold', w: w * 1.12, alpha: o.alpha ?? 0.98 }, lt, 0.15);
      } else {
        pen.strokes(strokes, style, lt, 0.15);
      }
    }
    cx += (gl.adv + spacing) * size;
  }
  return width;
}

/** The strokes of a word as points, upright and even, for cutting it in a matrix or laying leaf over it. */
export function letterStrokes(text: string, x: number, y: number, size: number, spacing = SPACING): Pts[] {
  const out: Pts[] = [];
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const gl = GLYPHS[ch];
    if (!gl) { cx += (0.6 + spacing) * size; continue; }
    for (const d of gl.d) for (const s of trace(d, size, cx, y, 12)) out.push(s);
    cx += (gl.adv + spacing) * size;
  }
  return out;
}
