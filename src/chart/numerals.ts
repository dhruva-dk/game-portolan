// The numeral hand: figures as a sixteenth-century chartmaker wrote them on a scale of leagues, with a cut quill held
// at forty degrees, so the downstrokes swell and the upstrokes are hairlines.
//
// They are old-style figures: 0, 1 and 2 stand within the body of the line, 6 and 8 rise above it, and 3, 4, 5, 7 and
// 9 hang below, as they did before printers lined them up. The forms are the period's own where they still read at a
// glance (the flat-topped 3 that hangs like a ʒ, the flagged 5, the 7 that swoops below the line) and the familiar ones
// where the period's did not (the 4 that looked like half an 8). Each figure is written fresh: a hair taller or
// leaning a little more each time, seeded by where it stands, so a number never looks set in type.
//
// Units: the body of the line (x-height) is 1, the baseline at 0, y down.
import { clamp, hash } from './noise.ts';
import { trace, type Pen, type Pts } from './pen.ts';
import type { InkName } from './inks.ts';

interface Glyph {
  /** Strokes, in the order the hand writes them. */
  d: string[];
  /** Advance, in body heights. */
  adv: number;
}

const GLYPHS: Record<string, Glyph> = {
  '0': { d: ['M 0.33 -0.99 C 0.12 -1.0 0.02 -0.72 0.03 -0.46 C 0.04 -0.16 0.15 0.02 0.28 0.01 C 0.46 0.0 0.54 -0.3 0.53 -0.56 C 0.52 -0.86 0.43 -1.01 0.27 -0.98'], adv: 0.62 },
  '1': { d: ['M 0.07 -0.8 C 0.15 -0.85 0.22 -0.93 0.29 -1.04 C 0.28 -0.7 0.27 -0.32 0.26 -0.02', 'M 0.1 0.0 C 0.2 -0.02 0.32 -0.02 0.42 0.0'], adv: 0.5 },
  '2': { d: ['M 0.07 -0.76 C 0.1 -0.98 0.43 -1.07 0.5 -0.82 C 0.55 -0.6 0.3 -0.32 0.05 -0.01 C 0.2 -0.07 0.36 0.05 0.56 -0.05'], adv: 0.62 },
  '3': { d: ['M 0.08 -0.96 C 0.22 -0.98 0.38 -0.95 0.52 -1.0 C 0.42 -0.84 0.3 -0.72 0.2 -0.58 C 0.44 -0.6 0.58 -0.4 0.55 -0.12 C 0.52 0.22 0.26 0.46 0.04 0.32'], adv: 0.62 },
  '4': { d: ['M 0.42 -1.02 C 0.3 -0.8 0.13 -0.52 0.02 -0.3 C 0.2 -0.32 0.42 -0.3 0.62 -0.33', 'M 0.43 -0.72 C 0.42 -0.32 0.41 0.1 0.38 0.46'], adv: 0.66 },
  '5': { d: ['M 0.15 -1.0 C 0.13 -0.84 0.12 -0.7 0.1 -0.56 C 0.32 -0.68 0.57 -0.5 0.54 -0.16 C 0.51 0.2 0.24 0.46 0.02 0.3', 'M 0.15 -1.0 C 0.29 -0.99 0.42 -1.02 0.56 -1.07'], adv: 0.62 },
  '6': { d: ['M 0.5 -1.5 C 0.22 -1.32 0.03 -0.92 0.04 -0.44 C 0.05 -0.13 0.17 0.02 0.3 0.01 C 0.47 0.0 0.55 -0.2 0.54 -0.42 C 0.53 -0.66 0.4 -0.78 0.27 -0.76 C 0.16 -0.74 0.08 -0.63 0.05 -0.5'], adv: 0.62 },
  '7': { d: ['M 0.05 -0.9 C 0.18 -1.02 0.36 -0.92 0.58 -1.02 C 0.4 -0.62 0.26 -0.2 0.22 0.46'], adv: 0.62 },
  '8': { d: ['M 0.47 -1.3 C 0.42 -1.5 0.1 -1.5 0.1 -1.24 C 0.1 -0.98 0.52 -0.86 0.54 -0.44 C 0.56 -0.12 0.4 0.02 0.28 0.01 C 0.12 0.0 0.02 -0.14 0.03 -0.36 C 0.05 -0.7 0.45 -0.9 0.47 -1.2 C 0.48 -1.32 0.45 -1.4 0.41 -1.42'], adv: 0.62 },
  '9': { d: ['M 0.5 -0.66 C 0.42 -0.44 0.1 -0.42 0.06 -0.66 C 0.03 -0.9 0.22 -1.05 0.39 -0.99 C 0.53 -0.93 0.54 -0.76 0.52 -0.5 C 0.5 -0.1 0.44 0.26 0.22 0.46'], adv: 0.62 },
  ':': { d: [], adv: 0.3 },
  '·': { d: [], adv: 0.3 },
  '+': { d: ['M 0.08 -0.5 C 0.2 -0.51 0.34 -0.5 0.46 -0.52', 'M 0.27 -0.72 C 0.27 -0.58 0.27 -0.44 0.26 -0.28'], adv: 0.56 },
  ' ': { d: [], adv: 0.36 },
};

export interface FigureOptions {
  ink?: InkName;
  /** 'left' (x is where it starts), 'center' or 'right'. */
  align?: 'left' | 'center' | 'right';
  /** The quill's width as a share of the body height. */
  weight?: number;
  /** Lean, as a shear (0.1 is about six degrees). */
  slant?: number;
  seed?: number;
  alpha?: number;
}

/** How wide a figure is written at a body height, in pixels. */
export function figureWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += (GLYPHS[ch]?.adv ?? 0.5) * size;
  return w - 0.06 * size;
}

/**
 * Writes `text` (digits, ':' and '·' and '+') with its baseline at y and a body height of `size` pixels; its first t
 * inked, a figure at a time. Returns the width written.
 */
export function figure(pen: Pen, text: string, x: number, y: number, size: number, o: FigureOptions = {}, t = 1): number {
  const width = figureWidth(text, size);
  if (t <= 0) return width;
  let cx = o.align === 'center' ? x - width / 2 : o.align === 'right' ? x - width : x;
  const seed = o.seed ?? 7, slant = o.slant ?? 0.12, ink = o.ink ?? 'iron';
  const w = size * (o.weight ?? 0.15);
  const chars = [...text], n = chars.length;
  for (let i = 0; i < n; i++) {
    const ch = chars[i], gl = GLYPHS[ch];
    if (!gl) { cx += size * 0.5; continue; }
    const lt = t >= 1 ? 1 : clamp(t * n * 1.15 - i * 1.0);
    // each figure written fresh: its size, height and lean a little different
    const h1 = hash(i, ch.charCodeAt(0), seed), h2 = hash(i + 7, ch.charCodeAt(0), seed), h3 = hash(i + 3, 5, seed);
    const k = size * (1 + (h1 - 0.5) * 0.06), dy = (h2 - 0.5) * size * 0.05, sl = slant + (h3 - 0.5) * 0.05;
    if (ch === ':' || ch === '·') {
      if (lt > 0) {
        const dots = ch === ':' ? [-0.62, -0.1] : [-0.45];
        dots.forEach((d, j) => pen.dot(cx + size * 0.12 - d * sl * size, y + d * k + dy, w * 0.55, ink, (o.alpha ?? 0.92) * clamp(lt * 2 - j * 0.6)));
      }
      cx += gl.adv * size;
      continue;
    }
    if (lt > 0) {
      const strokes: Pts[] = [];
      for (const d of gl.d) for (const s of trace(d, 1, 0, 0, 12)) {
        const pts: Pts = [];
        for (let q = 0; q < s.length; q += 2) pts.push(cx + (s[q] - s[q + 1] * sl) * k, y + s[q + 1] * k + dy);
        strokes.push(pts);
      }
      pen.strokes(strokes, { w, ink, nib: 0.78, angle: -0.72, wobble: size * 0.006, drift: 0, taper: w * 1.4, pool: 0.75, seed: seed + i * 17, alpha: o.alpha }, lt, 0.15);
    }
    cx += gl.adv * size;
  }
  return width;
}

/** The strokes of a figure as points, unslanted and even, for cutting it in a matrix (a seal's device). */
export function figureStrokes(text: string, x: number, y: number, size: number): Pts[] {
  const out: Pts[] = [];
  let cx = x;
  for (const ch of text) {
    const gl = GLYPHS[ch];
    if (!gl) { cx += size * 0.5; continue; }
    for (const d of gl.d) for (const s of trace(d, size, cx, y, 12)) out.push(s);
    cx += gl.adv * size;
  }
  return out;
}
