// The chartmaker's hand, shared by every piece of the UI: his inks and washes, his paper, and the marks he lays on the
// world (paper slips with rough-cut edges, paper discs, woodcut glyphs, ruled bars, italic numerals). Each is SVG
// markup in the piece's own units; a piece sets it into an <svg>, and the page carries DEFS once (ui.ts).
//
// After the approved UI sheet (docs/ui-sheet), which drew the old game's instruments (game-portolan-0117
// src/chart/inks.ts, screens/instruments.ts) this way.

import { GLYPHS, type Glyph, type Prim } from './glyphs';

/** Inks: iron for outlines and figures, rubric for harm, the Storm's violet for the Storm alone, gold for the chosen and
 * the won. Lead white only ever over an iron halo, so it holds on bright water. */
export const INK = {
  iron: 'rgb(38,25,16)', rubric: 'rgb(184,48,26)', storm: 'rgb(98,46,140)', green: 'rgb(58,104,62)', blue: 'rgb(38,76,140)',
  gold: 'rgb(190,138,44)', sepia: 'rgb(128,94,62)', white: 'rgb(252,246,230)',
} as const;
export type Ink = keyof typeof INK;
/** Washes laid over the paper. */
export const WASH = {
  ultramarine: '#3d5f9e', viridian: '#4f9488', ochre: '#c99a4a', vermilion: '#c4452a', azure: '#4a78b8', gold: '#d4a84a',
  storm: '#6a4a7a', sea: '#d6e4cf', sand: '#e7d39e', shore: '#8a6a3a', hull: '#6e6152',
} as const;
export const PAPER = '#f1e4c8';
/** The paper a woodcut's cut lines show. */
export const CUT = '#f4e8cf';
/** The numerals' face: an italic old style, the iPhone's own. */
export const FIGURES = '"Iowan Old Style", "Palatino", Georgia, serif';

/** The shared defs: the paper's gradient, the slips' shadow, a hatch per ink (and a denser one for large glyphs). */
export const DEFS = (() => {
  let d = '<radialGradient id="pg" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f7eedb"/><stop offset=".7" stop-color="#f0e2c4"/><stop offset="1" stop-color="#dcc396"/></radialGradient>';
  d += '<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#1a1008" flood-opacity=".45"/></filter>';
  for (const [k, c] of Object.entries(INK)) {
    for (const [tag, size, line] of [['', 1.3, 0.42], ['-d', 0.8, 0.26]] as const) {
      d += `<pattern id="h-${k}${tag}" patternUnits="userSpaceOnUse" width="${size}" height="${size}" patternTransform="rotate(-45)">`
        + `<rect width="${size}" height="${size}" fill="${c}" opacity=".12"/><rect width="${size}" height="${line}" fill="${c}"/></pattern>`;
    }
  }
  return `<defs>${d}</defs>`;
})();

const r2 = (n: number) => Math.round(n * 100) / 100;
/** A steady pseudo-random number in [0, 1) for a pair: the same edge every time it is drawn. */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A rectangle with a hand-cut edge. */
export function roughRect(x: number, y: number, w: number, h: number, seed: number) {
  const pts: [number, number][] = [], jig = (i: number) => (hash(i, seed) - 0.5) * 1.2;
  const nw = Math.max(2, Math.round(w / 11)), nh = Math.max(2, Math.round(h / 11));
  for (let i = 0; i <= nw; i++) pts.push([x + (w * i) / nw, y + jig(i)]);
  for (let i = 1; i <= nh; i++) pts.push([x + w + jig(i + 40), y + (h * i) / nh]);
  for (let i = nw - 1; i >= 0; i--) pts.push([x + (w * i) / nw, y + h + jig(i + 80)]);
  for (let i = nh - 1; i >= 1; i--) pts.push([x + jig(i + 120), y + (h * i) / nh]);
  return `M${pts.map(([a, b]) => `${r2(a)} ${r2(b)}`).join('L')}Z`;
}

/** A circle with a hand-cut edge, wandering `amp` across. */
export function roughCircle(cx: number, cy: number, r: number, seed: number, amp = 1) {
  const n = Math.max(18, Math.round(r * 1.2));
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = r + (hash(i, seed) - 0.5) * amp;
    s += `${i ? 'L' : 'M'}${r2(cx + Math.cos(a) * rr)} ${r2(cy + Math.sin(a) * rr)}`;
  }
  return `${s}Z`;
}

/** An arc of radius r about (cx, cy) from angle a0 to a1 (radians, clockwise on the screen). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
  return `M${r2(x0)} ${r2(y0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${r2(x1)} ${r2(y1)}`;
}

export interface FigureStyle { fill?: string; anchor?: 'start' | 'middle' | 'end'; halo?: string; haloWidth?: number; weight?: number }
/** A numeral (or a few), centred on y, in the chartmaker's italic. */
export function figure(x: number, y: number, text: string | number, size: number, o: FigureStyle = {}) {
  const halo = o.halo ? ` stroke="${o.halo}" stroke-width="${o.haloWidth ?? 3}" paint-order="stroke" stroke-linejoin="round"` : '';
  return `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" font-family='${FIGURES}' font-style="italic" font-weight="${o.weight ?? 400}" fill="${o.fill ?? INK.iron}"`
    + ` text-anchor="${o.anchor ?? 'middle'}" dominant-baseline="central"${halo}>${esc(String(text))}</text>`;
}

export interface GlyphStyle { ink?: Ink; paper?: string; opacity?: number }
/** A woodcut glyph `size` across, centred on (x, y): its shapes hatched in the ink and outlined, its cuts in paper. */
export function glyph(name: Glyph, x: number, y: number, size: number, o: GlyphStyle = {}) {
  const ink = INK[o.ink ?? 'iron'], paper = o.paper ?? CUT, s = size / 24, big = size >= 40;
  const outline = (Math.max(0.9, size / 34) / s) * 0.85;
  const hatch = `url(#h-${o.ink ?? 'iron'}${size >= 56 ? '-d' : ''})`;
  const one = (p: Prim, cut: boolean) => {
    const tr = p.tr ? ` transform="${p.tr}"` : '', op = p.op != null ? ` opacity="${p.op}"` : '';
    if (p.k === 'f') {
      return cut ? `<path d="${p.d}" fill="${paper}"${tr}${op}/>`
        : `<path d="${p.d}" fill="${hatch}" stroke="${ink}" stroke-width="${r2(outline)}" stroke-linejoin="round"${tr}${op}/>`;
    }
    return `<path d="${p.d}" fill="none" stroke="${cut ? paper : ink}" stroke-width="${p.w ?? 1.5}" stroke-linecap="round" stroke-linejoin="round"${tr}${op}/>`;
  };
  let under = '', cuts = '', over = '';
  for (const p of GLYPHS[name] as readonly Prim[]) {
    if ((p.fine && !big) || (p.bold && big)) continue;
    if (p.cut) cuts += one(p, true);
    else if (p.top) over += one(p, false);
    else under += one(p, false);
  }
  const op = o.opacity != null ? ` opacity="${o.opacity}"` : '';
  return `<g transform="translate(${r2(x - size / 2)} ${r2(y - size / 2)}) scale(${r2(s)})"${op}>${under}${cuts}${over}</g>`;
}

export interface SlipStyle { fill?: string; bold?: boolean; flat?: boolean; rule?: boolean }
/** A paper slip laid on the world: rough-cut, shadowed, ruled inside its edge. */
export function slip(x: number, y: number, w: number, h: number, o: SlipStyle = {}) {
  const seed = x * 3 + y * 7 + w;
  return `<path d="${roughRect(x, y, w, h, seed)}" fill="${o.fill ?? 'url(#pg)'}" stroke="${INK.iron}" stroke-width="${o.bold ? 1.6 : 0.9}"${o.flat ? '' : ' filter="url(#sh)"'}/>`
    + (o.rule === false ? '' : `<rect x="${r2(x + 3)}" y="${r2(y + 3)}" width="${r2(w - 6)}" height="${r2(h - 6)}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".55"/>`);
}

/** A paper disc with a hand-cut edge and a ruled ring inside it. */
export function paperDisc(x: number, y: number, r: number, ring: string = INK.iron) {
  return `<path d="${roughCircle(x, y, r, x + y, 0.9)}" fill="url(#pg)" stroke="${ring}" stroke-width="1.6" filter="url(#sh)"/>`
    + `<circle cx="${x}" cy="${y}" r="${r2(r - 3.2)}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".6"/>`;
}

/** A ruled bar `frac` full of a wash, centred on y. */
export function bar(x: number, y: number, w: number, h: number, frac: number, wash: string) {
  const f = Math.min(Math.max(frac, 0), 1);
  return `<rect x="${x}" y="${r2(y - h / 2)}" width="${w}" height="${h}" fill="${PAPER}" stroke="${INK.iron}" stroke-width=".9"/>`
    + `<rect x="${r2(x + 1.5)}" y="${r2(y - h / 2 + 1.5)}" width="${r2((w - 3) * f)}" height="${r2(h - 3)}" fill="${wash}" opacity=".85"/>`;
}

/** A ring `frac` of the way round from the top, clockwise. */
export function ring(x: number, y: number, r: number, frac: number, colour: string, width = 3) {
  if (frac <= 0) return '';
  const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * Math.min(frac, 0.999);
  return `<path d="${arcPath(x, y, r, a0, a1)}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`;
}

/** A galleon's mark (chart/galleon.ts, simplified), `size` across, centred on (x, y). */
export function galleon(x: number, y: number, size: number, o: { sail?: string; hull?: string; waves?: boolean } = {}) {
  const sail = o.sail ?? CUT, hull = o.hull ?? 'url(#h-iron)', k = size / 100;
  return `<g transform="translate(${r2(x - size / 2)} ${r2(y - size / 2)}) scale(${r2(k)})" stroke="${INK.iron}" stroke-linejoin="round">`
    + '<path d="M35 64V16M53 62V8M71 62V20M71 26L92 36" stroke-width="1.6" fill="none"/>'
    + `<path d="M35 18L19 54L41 52Z" fill="${sail}" stroke-width="1.3"/>`
    + `<path d="M40 14Q53 11 66 14Q68 22 66 30Q53 33 40 30Q38 22 40 14Z" fill="${sail}" stroke-width="1.3"/>`
    + `<path d="M41 34Q53 31 65 34Q67 43 65 52Q53 55 41 52Q39 43 41 34Z" fill="${sail}" stroke-width="1.3"/>`
    + `<path d="M61 24Q71 22 80 24Q82 31 80 38Q71 40 61 38Q59 31 61 24Z" fill="${sail}" stroke-width="1.3"/>`
    + `<path d="M62 42Q71 40 80 42Q81 48 80 54Q71 56 62 54Q61 48 62 42Z" fill="${sail}" stroke-width="1.3"/>`
    + `<path d="M53 8L64 10L53 12Z" fill="${WASH.vermilion}" stroke-width=".8"/>`
    + `<path d="M8 58L8 50L24 50L26 60L84 58L92 56L84 74Q52 82 22 76Z" fill="${hull}" stroke-width="1.8"/>`
    + '<path d="M18 66L84 64" stroke-width=".8" fill="none"/>'
    + (o.waves ? `<path d="M6 84q6-4 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0M12 91q6-4 12 0t12 0t12 0t12 0t12 0t12 0t12 0" fill="none" stroke="${WASH.ultramarine}" stroke-width="1.4"/>` : '')
    + '</g>';
}

/** An <svg> of the given size in its own units (the shared defs are set in the page once: ui.ts). */
export function svg(w: number, h: number, body = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" overflow="visible">${body}</svg>`;
}
