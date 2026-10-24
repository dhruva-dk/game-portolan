// Setting the hand: words laid out in the cancelleresca with its joins, spacing and writing order, and written onto a
// raster by the nib. Pure and deterministic (no DOM, no wall clock), so Node tests and every browser agree.
//
//   layoutText(text, options)      lines, alignment, kerning and joins; every stroke placed in CSS px with the time the
//                                  pen takes to write it
//   rasterizeText(layout, ratio)   the strokes written at device resolution: coverage, its bleed into the paper, the
//                                  time each pixel was written and the ink the nib carried (src/lettering/ink.ts draws it)
import { GLYPHS, METRICS, isLower, type Glyph, type Stroke } from './glyphs.ts';
import { Raster, blur, flatten, sweep, type Nib, type PathOp, type Polyline } from './nib.ts';

/** The x-height as a fraction of the em: chancery's small body under tall ascenders. */
export const X_HEIGHT_EM = 0.4;
/** The finest hairline drawn, device px: below this a hairline breaks up on screen. */
export const MIN_HAIRLINE_PX = 0.75;
/** The pen's pace, design units a second, its lift between strokes, and the pauses after a word and a line, seconds. */
export const PEN = { speed: 60, lift: 0.09, word: 0.22, line: 0.4 } as const;

const SLANT = Math.tan((METRICS.slant * Math.PI) / 180);
const PEN_ANGLE = (METRICS.penAngle * Math.PI) / 180;
/** Least white between neighbouring letters at their closest, design units. */
export const MIN_GAP = 1;
/** Writing between dips of the pen: the ink thins as the nib empties, design units of stroke. */
const DIP = 170;

export interface TextOptions {
  /** Em, CSS px: the x-height is 0.4 em, capitals 0.6 em, ascenders 0.76 em. */
  size: number;
  align?: 'left' | 'center' | 'right';
  /** Which point of the block sits at the anchor: the first baseline, the ascender line, the optical middle (between
   * the capitals' top and the last baseline) or the descender line. */
  valign?: 'baseline' | 'top' | 'middle' | 'bottom';
  /** Wrap at spaces to fit this width, CSS px. */
  maxWidth?: number;
  /** Line spacing, em. */
  lineHeight?: number;
  /** Display lettering (the title, the chart's names): swash capitals open the words, and the last letter ends in a
   * flourish. */
  swash?: boolean;
}

export interface PlacedStroke {
  /** The path, CSS px from the anchor. */
  readonly ops: readonly PathOp[];
  readonly taper?: readonly [number, number];
  /** When the pen starts and finishes it, seconds at the pen's pace. */
  readonly t0: number;
  readonly t1: number;
  /** Ink in the nib at the start of the stroke, 0–1. */
  readonly ink: number;
}

export interface TextLine {
  readonly text: string;
  /** Left end of the line and its baseline, CSS px from the anchor, and its advance width. */
  readonly x: number;
  readonly baseline: number;
  readonly width: number;
}

export interface TextLayout {
  readonly text: string;
  readonly size: number;
  /** CSS px per design unit. */
  readonly unit: number;
  readonly lines: readonly TextLine[];
  /** The block's advance box (left, top at the ascender line, right, bottom at the descender line), CSS px. */
  readonly box: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly strokes: readonly PlacedStroke[];
  /** Seconds to write it all at the pen's pace. */
  readonly duration: number;
}

export interface TextRaster {
  /** Device px. */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  /** The raster's top-left corner, CSS px from the anchor. */
  readonly left: number;
  readonly top: number;
  /** RGBA: coverage, coverage bled into the paper, writing time (0–255 over the duration), ink load. */
  readonly data: Uint8Array;
  /** Nib width, device px. */
  readonly nib: number;
}

// ---- glyph geometry -----------------------------------------------------------------------------------------------

const opsCache = new Map<string, PathOp[]>();

/** Parses a stroke's path (glyphs.ts syntax). */
export function parsePath(d: string): PathOp[] {
  let ops = opsCache.get(d);
  if (ops) return ops;
  ops = [];
  const tokens = d.match(/[MLQC]|-?\d*\.?\d+/g) ?? [];
  const arity = { M: 2, L: 2, Q: 4, C: 6 } as const;
  for (let i = 0; i < tokens.length;) {
    const op = tokens[i++] as keyof typeof arity;
    if (!(op in arity)) throw new Error(`bad path: ${d}`);
    const p = tokens.slice(i, i + arity[op]).map(Number);
    if (p.length !== arity[op] || p.some(Number.isNaN)) throw new Error(`bad path: ${d}`);
    ops.push({ op, p });
    i += arity[op];
  }
  opsCache.set(d, ops);
  return ops;
}

/** Applies the hand's slant and places design units: x right, y down, in CSS px. */
function place(ops: readonly PathOp[], ox: number, baseline: number, k: number): PathOp[] {
  return ops.map(({ op, p }) => ({
    op, p: p.map((v, i) => (i % 2 === 0 ? ox + (v + p[i + 1] * SLANT) * k : baseline - v * k)),
  }));
}

/** Length of a stroke's path, design units (slanted). */
function pathLength(ops: readonly PathOp[]): number {
  const line = flatten(place(ops, 0, 0, 1), 0.02, 1);
  return line.len[line.len.length - 1];
}

const glyphOf = (ch: string): Glyph => {
  const g = GLYPHS[ch];
  if (!g) throw new Error(`no glyph in the hand for ${JSON.stringify(ch)} (U+${ch.codePointAt(0)?.toString(16)})`);
  return g;
};

// ---- spacing: optical kerning from the letters' ink profiles ----------------------------------------------------
// Each glyph's ink is measured in bands one unit tall: its leftmost and rightmost ink per band, slanted. A pair whose
// closest approach is under MIN_GAP is pushed apart (a swash or the f's hood over the next letter); a pair that
// leaves an open gap through the x-height band (T o, V a, P e) is drawn in towards the hand's usual rhythm.

const BAND0 = -12, BANDS = 36;
interface Profile { readonly left: Float64Array; readonly right: Float64Array }
const profiles = new Map<string, Profile>();

function profile(ch: string): Profile {
  let pr = profiles.get(ch);
  if (pr) return pr;
  const left = new Float64Array(BANDS).fill(Infinity), right = new Float64Array(BANDS).fill(-Infinity);
  const nib: Nib = { width: METRICS.nib, thickness: METRICS.hairline, angle: PEN_ANGLE };
  const mark = (x: number, y: number) => {
    const b = Math.floor(-y) - BAND0; // polygons are y-down
    if (b < 0 || b >= BANDS) return;
    left[b] = Math.min(left[b], x);
    right[b] = Math.max(right[b], x);
  };
  for (const st of glyphOf(ch).strokes) {
    sweep(flatten(place(parsePath(st.d), 0, 0, 1), 0.05, 0.5), nib, taperAt(st, null), (poly) => {
      for (let i = 0; i < poly.length; i += 2) {
        const j = (i + 2) % poly.length, n = Math.ceil(Math.hypot(poly[j] - poly[i], poly[j + 1] - poly[i + 1]) / 0.25);
        for (let s = 0; s < n; s++) mark(poly[i] + ((poly[j] - poly[i]) * s) / n, poly[i + 1] + ((poly[j + 1] - poly[i + 1]) * s) / n);
      }
    });
  }
  pr = { left, right };
  profiles.set(ch, pr);
  return pr;
}

/** Gap statistics when b's origin sits `adv` units after a's: the closest approach, and the mean gap across the x-height. */
function gaps(a: string, b: string, adv: number): { min: number; body: number } {
  const pa = profile(a), pb = profile(b);
  let min = Infinity, sum = 0, n = 0;
  for (let i = 0; i < BANDS; i++) {
    if (pa.right[i] === -Infinity) continue;
    const near = Math.min(pb.left[i], i > 0 ? pb.left[i - 1] : Infinity, i + 1 < BANDS ? pb.left[i + 1] : Infinity);
    if (near !== Infinity) min = Math.min(min, adv + near - pa.right[i]);
    const y = i + BAND0;
    if (y >= 0 && y < METRICS.xHeight && pb.left[i] !== Infinity) {
      sum += adv + pb.left[i] - pa.right[i];
      n++;
    }
  }
  return { min, body: n ? sum / n : NaN };
}

/** Least white between letters a and b set side by side in a word, design units (MIN_GAP or more). */
export function letterGap(a: string, b: string): number {
  return gaps(a, b, spacing(a, b)).min;
}

let bodyRef = NaN;
const kerns = new Map<string, number>();

/** Design units from a's origin to b's. */
function spacing(a: string, b: string): number {
  const adv = glyphOf(a).adv;
  if (a === ' ' || b === ' ' || joins(a, b)) return adv;
  const key = a + b;
  let k = kerns.get(key);
  if (k === undefined) {
    if (Number.isNaN(bodyRef)) bodyRef = gaps('o', 'o', glyphOf('o').adv).body;
    const { min, body } = gaps(a, b, adv);
    k = 0;
    if (min < MIN_GAP) k = MIN_GAP - min;
    else if (body > bodyRef * 1.4) k = -Math.max(0, Math.min(min - MIN_GAP * 1.5, (body - bodyRef) * 0.5));
    kerns.set(key, k);
  }
  return adv + k;
}

// ---- joins --------------------------------------------------------------------------------------------------------
// Where a minuscule ends in the baseline flick and the next begins with a stem lead-in, the scribe does not lift: the
// flick runs on as a hairline at the pen's angle into the next stem and up it, and the stem's lead-in is not made.

const roleOf = (g: Glyph, role: Stroke['role']) => g.strokes.find((st) => st.role === role);

function joins(a: string, b: string): boolean {
  return isLower(a) && isLower(b) && !!roleOf(glyphOf(a), 'exit') && !!roleOf(glyphOf(b), 'entry');
}

/** The join from a's exit into b's stem, b's origin `adv` units after a's, in a's design units. */
function joinOps(a: Glyph, b: Glyph, adv: number): PathOp[] {
  const ops = parsePath(roleOf(a, 'exit')!.d), foot = ops[ops.length - 2]; // the flick, the last op, is replaced
  const fx = foot.p[foot.p.length - 2], fy = foot.p[foot.p.length - 1];
  const top = parsePath(roleOf(b, 'entry')!.d).at(-1)!.p, tx = adv + top[0], ty = top[1];
  const rise = tx - fx; // a hairline at 45° upright, about the pen's angle once slanted
  const meet: PathOp[] = fy + rise < ty * 0.75 ? [{ op: 'L', p: [tx, fy + rise] }] : [];
  return [...ops.slice(0, -1), ...meet, { op: 'L', p: [tx, ty] }];
}

/** The closing flourish: the last letter's flick drawn out into a long rising hairline that turns back at the top. */
function flourishOps(g: Glyph): PathOp[] {
  const ops = parsePath(roleOf(g, 'exit')!.d), foot = ops[ops.length - 2].p, x = foot[foot.length - 2], y = foot[foot.length - 1];
  return [...ops.slice(0, -1),
    { op: 'C', p: [x + 2.9, y + 0.35, x + 6.3, y + 2.65, x + 8.3, y + 6.45] },
    { op: 'C', p: [x + 8.9, y + 7.65, x + 8.7, y + 8.65, x + 7.9, y + 9.05] }];
}

// ---- layout -------------------------------------------------------------------------------------------------------

interface Line { readonly text: string; readonly width: number }

function wordWidth(w: string): number {
  let x = 0;
  for (let i = 0; i + 1 < w.length; i++) x += spacing(w[i], w[i + 1]);
  return w.length ? x + glyphOf(w[w.length - 1]).adv : 0;
}

function wrap(text: string, maxUnits: number): Line[] {
  const lines: Line[] = [];
  for (const para of text.split('\n')) {
    let line = '', width = 0;
    for (const word of para.split(' ').filter(Boolean)) {
      const ww = wordWidth(word);
      if (line && width + METRICS.space + ww > maxUnits) {
        lines.push({ text: line, width });
        line = word; width = ww;
      } else {
        width += (line ? METRICS.space : 0) + ww;
        line = line ? `${line} ${word}` : word;
      }
    }
    lines.push({ text: line, width });
  }
  return lines;
}

/** Lays out text in the hand. */
export function layoutText(text: string, o: TextOptions): TextLayout {
  const k = (o.size * X_HEIGHT_EM) / METRICS.xHeight;
  const lead = (o.lineHeight ?? 1.3) * o.size;
  const lines = wrap(text, o.maxWidth ? o.maxWidth / k : Infinity);
  const last = (lines.length - 1) * lead;
  const first = { baseline: 0, top: METRICS.ascender * k, bottom: -last + METRICS.descender * k,
    middle: (METRICS.capHeight * k - last) / 2 }[o.valign ?? 'baseline'];

  const strokes: PlacedStroke[] = [];
  let t = 0, written = 0;
  const write = (ops: readonly PathOp[], st: Stroke | undefined, ox: number, baseline: number, units: number) => {
    const dur = units / PEN.speed;
    strokes.push({ ops: place(ops, ox, baseline, k), taper: st?.taper, t0: t, t1: t + dur, ink: 1 - 0.4 * ((written % DIP) / DIP) });
    t += dur + PEN.lift;
    written += units;
  };

  const lastWord = lines[lines.length - 1].text.split(' ').at(-1);
  const placed: TextLine[] = lines.map((line, li) => {
    const baseline = first + li * lead;
    const x = { left: 0, center: -line.width * k / 2, right: -line.width * k }[o.align ?? 'left'];
    let ux = 0;
    for (const word of line.text.split(' ')) {
      const late: [Stroke, number][] = [];
      for (let i = 0; i < word.length; i++) {
        const ch = word[i], g = glyphOf(ch), ox = x + ux * k;
        const prev = i > 0 && joins(word[i - 1], ch), next = i + 1 < word.length && joins(ch, word[i + 1]);
        const final = o.swash && li === lines.length - 1 && word === lastWord && i === word.length - 1;
        for (const plain of g.strokes) {
          const st = o.swash && i === 0 && plain.swash ? plain.swash : plain;
          if (st.role === 'entry' && prev) continue;
          if (st.role === 'late') { late.push([st, ox]); continue; }
          const ops = st.role === 'exit' && next ? joinOps(g, glyphOf(word[i + 1]), spacing(ch, word[i + 1]))
            : st.role === 'exit' && final ? flourishOps(g) : parsePath(st.d);
          write(ops, st, ox, baseline, pathLength(ops));
        }
        if (i + 1 < word.length) ux += spacing(ch, word[i + 1]);
        else ux += g.adv;
      }
      for (const [st, ox] of late) write(parsePath(st.d), st, ox, baseline, pathLength(parsePath(st.d)));
      ux += METRICS.space;
      t += PEN.word;
    }
    t += PEN.line;
    return { text: line.text, x, baseline, width: line.width * k };
  });

  const left = Math.min(...placed.map((l) => l.x)), right = Math.max(...placed.map((l) => l.x + l.width));
  const duration = strokes.length ? strokes[strokes.length - 1].t1 : 0;
  return {
    text, size: o.size, unit: k, lines: placed, strokes, duration,
    box: { left, right, top: first - METRICS.ascender * k, bottom: first + last - METRICS.descender * k },
  };
}

// ---- writing it down ----------------------------------------------------------------------------------------------

/** Nib width scale at each point of a stroke with a taper (a swash lifted onto the nib's corner). */
function taperAt(st: { taper?: readonly [number, number] } | undefined, line: Polyline | null): (i: number) => number {
  const tp = st?.taper;
  if (!tp) return () => 1;
  if (!line) return () => Math.max(tp[0], tp[1]);
  const total = line.len[line.len.length - 1] || 1;
  return (i) => tp[0] + (tp[1] - tp[0]) * (line.len[i] / total);
}

/** Writes a layout with the nib at `pixelRatio` device px per CSS px. */
export function rasterizeText(layout: TextLayout, pixelRatio: number): TextRaster {
  const s = layout.unit * pixelRatio;
  const nib: Nib = { width: METRICS.nib * s, thickness: Math.max(METRICS.hairline * s, MIN_HAIRLINE_PX), angle: PEN_ANGLE };
  // the ink's bleed into the fibres: about a fifteenth of the nib, never under a pixel
  const bleed = Math.max(1, Math.round(nib.width * 0.07));
  const grow = bleed * 2 + 1, pad = grow + 2;

  const lines = layout.strokes.map((st) => flatten(st.ops.map(({ op, p }) => ({ op, p: p.map((v) => v * pixelRatio) })), 0.08, 3));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const half = nib.width / 2 + nib.thickness;
  for (const { pts } of lines) {
    for (let i = 0; i < pts.length; i += 2) {
      minX = Math.min(minX, pts[i] - half); maxX = Math.max(maxX, pts[i] + half);
      minY = Math.min(minY, pts[i + 1] - half); maxY = Math.max(maxY, pts[i + 1] + half);
    }
  }
  if (!lines.length) minX = minY = maxX = maxY = 0;
  const ox = Math.floor(minX) - pad, oy = Math.floor(minY) - pad;
  const width = Math.ceil(maxX) + pad - ox, height = Math.ceil(maxY) + pad - oy;
  const raster = new Raster(width, height);
  const duration = layout.duration || 1;

  layout.strokes.forEach((st, si) => {
    const line = lines[si], { pts, len } = line, total = len[len.length - 1] || 1;
    for (let i = 0; i < pts.length; i += 2) { pts[i] -= ox; pts[i + 1] -= oy; }
    // the nib is fullest as it touches down, thins along the stroke, and pools where it lifts
    const load = (i: number) => Math.min(1, st.ink * (0.8 + 0.2 * Math.exp(-len[i] / (4 * nib.width)))
      + 0.3 * Math.max(0, 1 - (total - len[i]) / (1.2 * nib.width)));
    const time = (i: number) => (st.t0 + (st.t1 - st.t0) * (len[i] / total)) / duration;
    sweep(line, nib, taperAt(st, line), (poly, i) => {
      raster.fill(poly);
      const j = Math.min(i + 1, pts.length / 2 - 1);
      raster.paint(poly, grow, pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1], time(i), time(j), load(i), load(j));
    });
  });

  const cover = raster.coverage(), bled = blur(cover.slice(), width, height, bleed);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < cover.length; i++) {
    data[i * 4] = Math.round(cover[i] * 255);
    data[i * 4 + 1] = Math.round(Math.min(1, bled[i]) * 255);
    data[i * 4 + 2] = raster.when[i] === Infinity ? 255 : Math.round(Math.min(1, raster.when[i]) * 255);
    data[i * 4 + 3] = Math.round(raster.load[i] * 255);
  }
  return { width, height, pixelRatio, left: ox / pixelRatio, top: oy / pixelRatio, data, nib: nib.width };
}
