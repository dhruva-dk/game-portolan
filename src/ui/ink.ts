import { linearToHex } from '../world/color.ts';
import type { Sea } from '../render/snapshot.ts';
import { hash01 } from '../world/random.ts';
import { GLYPHS, type Glyph, type Prim } from './glyphs.ts';

export const INK = {
  iron: '#261910',
  rubric: '#b8301a',
  storm: '#622e8c',
  green: '#3a683e',
  blue: '#264c8c',
  gold: '#be8a2c',
  sepia: '#805e3e',
  silver: '#7f848b',
  scarlet: '#b01c24',
  white: '#fcf6e6',
} as const;
type Ink = keyof typeof INK;
export const WASH = {
  ultramarine: '#3d5f9e',
  viridian: '#4f9488',
  ochre: '#c99a4a',
  vermilion: '#c4452a',
  azure: '#4a78b8',
  gold: '#d4a84a',
  silver: '#b4b8c2',
  storm: '#6a4a7a',
  sea: '#c3d8cf',
  shore: '#8a6a3a',
  umber: '#6e6152',
} as const;
export const PAPER = '#f1e4c8',
  CUT = '#f4e8cf',
  GILT = '#f3dfa8',
  BRASS = '#5b3a1e';
export const SHADOW = '#1a1008',
  DUSK = '#3e1860';
export const PARCHMENT = ['#f7eedb', '#f0e2c4', '#dcc396'] as const;
export const LIGHT = {
  warm: '#ffd9a0',
  white: '#fff1d8',
  ice: '#cfeeff',
  azure: '#4fc3ff',
  gold: '#ffcf5a',
  red: '#ff2a1a',
  green: '#7be36b',
  mint: '#c8ffb0',
} as const;
export const RARITY = [
  '#969aa0',
  INK.green,
  INK.blue,
  '#6a3a8e',
  INK.gold,
] as const;
export const LAND = {
  apron: '#f4f0d6',
  low: '#ecdcac',
  high: '#b08c58',
  contour: INK.sepia,
} as const;
const METER = {
  ground: SHADOW,
  text: PAPER,
  label: '#b9a98c',
  good: '#8fd18a',
  fair: '#e8c35a',
  poor: '#f07a5e',
} as const;

export const OFFICE = {
  band: '#ead9b4',
  plate: INK.iron,
  plateInk: CUT,
  plateFaint: '#cbb994',
  panel: '#f2e7cf',
  dark: '#e4d2ac',
  light: '#faf3e3',
  gilt: GILT,
  sea: WASH.sea,
  ink: '#241b13',
  faint: '#5d4b37',
  onFill: '#fff8ea',
  go: '#2b4fa0',
  bad: '#a92c26',
  good: '#2a7347',
  fair: '#256f78',
  warn: '#c7860f',
  gold: '#c6951a',
  on: '#c85a12',
} as const;
export const CHARTROOM = {
  label: '#5e4631',
  plateFaint: METER.label,
  azurite: '#7fa0cf',
  purpure: '#a88dc2',
} as const;
export const PLUMAGE = {
  white: '#fbf8ef',
  shade: '#c5ccd6',
  beak: '#f3b62c',
  under: '#dd9020',
  spot: '#c8342a',
  lens: '#15171c',
  glint: '#e9f0f6',
} as const;
export type Tone = 'go' | 'bad' | 'good' | 'fair' | 'warn' | 'gold';
export const toneOf = (share: number): Tone =>
  share >= 0.75
    ? 'good'
    : share >= 0.5
      ? 'fair'
      : share >= 0.3
        ? 'warn'
        : 'bad';
export const TYPE = { title: 26, head: 18, body: 15, small: 13 } as const;

export const alpha = (hex: string, a: number) =>
  `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`;

export const blend = (a: string, b: string, t: number) => {
  let out = '#';
  for (const i of [1, 3, 5]) {
    const x = parseInt(a.slice(i, i + 2), 16),
      y = parseInt(b.slice(i, i + 2), 16);
    out += Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
};

export const parchment = `radial-gradient(ellipse at 50% 45%, ${PARCHMENT[0]} 0%, ${PARCHMENT[1]} 60%, ${PARCHMENT[2]} 100%)`;

export const cssInks: readonly (readonly [string, string])[] = [
  ['--paper', PAPER],
  ['--meter-ground', alpha(METER.ground, 0.62)],
  ['--meter-text', METER.text],
  ['--meter-label', METER.label],
  ['--meter-good', METER.good],
  ['--meter-fair', METER.fair],
  ['--meter-poor', METER.poor],
];

export const FIGURES = '"Iowan Old Style", "Palatino", Georgia, serif';

export const DEFS = (() => {
  let d =
    `<radialGradient id="pg" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${PARCHMENT[0]}"/>` +
    `<stop offset=".7" stop-color="${PARCHMENT[1]}"/><stop offset="1" stop-color="${PARCHMENT[2]}"/></radialGradient>`;
  d += `<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="${SHADOW}" flood-opacity=".45"/></filter>`;
  for (const [k, c] of Object.entries(INK)) {
    for (const [tag, size, line] of [
      ['', 1.3, 0.42],
      ['-d', 0.8, 0.26],
    ] as const) {
      d +=
        `<pattern id="h-${k}${tag}" patternUnits="userSpaceOnUse" width="${size}" height="${size}" patternTransform="rotate(-45)">` +
        `<rect width="${size}" height="${size}" fill="${c}" opacity=".12"/><rect width="${size}" height="${line}" fill="${c}"/></pattern>`;
    }
  }
  return `<defs>${d}</defs>`;
})();

const r2 = (n: number) => Math.round(n * 100) / 100;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function roughRect(
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number
) {
  const pts: [number, number][] = [],
    jig = (i: number) => (hash01(i, seed) - 0.5) * 1.2;
  const nw = Math.max(2, Math.round(w / 11)),
    nh = Math.max(2, Math.round(h / 11));
  for (let i = 0; i <= nw; i++) pts.push([x + (w * i) / nw, y + jig(i)]);
  for (let i = 1; i <= nh; i++)
    pts.push([x + w + jig(i + 40), y + (h * i) / nh]);
  for (let i = nw - 1; i >= 0; i--)
    pts.push([x + (w * i) / nw, y + h + jig(i + 80)]);
  for (let i = nh - 1; i >= 1; i--)
    pts.push([x + jig(i + 120), y + (h * i) / nh]);
  return `M${pts.map(([a, b]) => `${r2(a)} ${r2(b)}`).join('L')}Z`;
}

export function roughCircle(
  cx: number,
  cy: number,
  r: number,
  seed: number,
  amp = 1
) {
  const n = Math.max(18, Math.round(r * 1.2));
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      rr = r + (hash01(i, seed) - 0.5) * amp;
    s += `${i ? 'L' : 'M'}${r2(cx + Math.cos(a) * rr)} ${r2(cy + Math.sin(a) * rr)}`;
  }
  return `${s}Z`;
}

export function arcPath(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number
) {
  const x0 = cx + Math.cos(a0) * r,
    y0 = cy + Math.sin(a0) * r,
    x1 = cx + Math.cos(a1) * r,
    y1 = cy + Math.sin(a1) * r;
  return `M${r2(x0)} ${r2(y0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${r2(x1)} ${r2(y1)}`;
}

interface FigureStyle {
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  halo?: string;
  haloWidth?: number;
  weight?: number;
}
export function figure(
  x: number,
  y: number,
  text: string | number,
  size: number,
  o: FigureStyle = {}
) {
  const halo = o.halo
    ? ` stroke="${o.halo}" stroke-width="${o.haloWidth ?? 3}" paint-order="stroke" stroke-linejoin="round"`
    : '';
  return (
    `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" font-family='${FIGURES}' font-style="italic" font-weight="${o.weight ?? 400}" fill="${o.fill ?? INK.iron}"` +
    ` text-anchor="${o.anchor ?? 'middle'}" dominant-baseline="central"${halo}>${esc(String(text))}</text>`
  );
}

export const percent = (share: number) =>
  `${(Math.max(0, share) * 100).toFixed(1)}%`;

export function dyeOn(
  sea: Pick<Sea, 'colors'> | undefined,
  own: number | null | undefined
) {
  const c = sea && own != null ? sea.colors[own] : undefined;
  return c ? linearToHex(c) : INK.white;
}

interface GlyphStyle {
  ink?: Ink;
  paper?: string;
  opacity?: number;
}
export function glyph(
  name: Glyph,
  x: number,
  y: number,
  size: number,
  o: GlyphStyle = {}
) {
  const ink = INK[o.ink ?? 'iron'],
    paper = o.paper ?? CUT,
    s = size / 24,
    big = size >= 40;
  const outline = (Math.max(0.9, size / 34) / s) * 0.85;
  const hatch = `url(#h-${o.ink ?? 'iron'}${size >= 56 ? '-d' : ''})`;
  const one = (p: Prim, cut: boolean) => {
    const tr = p.tr ? ` transform="${p.tr}"` : '',
      op = p.op != null ? ` opacity="${p.op}"` : '';
    if (p.k === 'f') {
      return cut
        ? `<path d="${p.d}" fill="${paper}"${tr}${op}/>`
        : `<path d="${p.d}" fill="${hatch}" stroke="${ink}" stroke-width="${r2(outline)}" stroke-linejoin="round"${tr}${op}/>`;
    }
    return `<path d="${p.d}" fill="none" stroke="${cut ? paper : ink}" stroke-width="${p.w ?? 1.5}" stroke-linecap="round" stroke-linejoin="round"${tr}${op}/>`;
  };
  let under = '',
    cuts = '',
    over = '';
  for (const p of GLYPHS[name]) {
    if ((p.fine && !big) || (p.bold && big)) continue;
    if (p.cut) cuts += one(p, true);
    else if (p.top) over += one(p, false);
    else under += one(p, false);
  }
  const op = o.opacity != null ? ` opacity="${o.opacity}"` : '';
  return `<g transform="translate(${r2(x - size / 2)} ${r2(y - size / 2)}) scale(${r2(s)})"${op}>${under}${cuts}${over}</g>`;
}

interface SlipStyle {
  fill?: string;
  bold?: boolean;
  flat?: boolean;
  rule?: boolean;
}
export function slip(
  x: number,
  y: number,
  w: number,
  h: number,
  o: SlipStyle = {}
) {
  const seed = x * 3 + y * 7 + w;
  return (
    `<path d="${roughRect(x, y, w, h, seed)}" fill="${o.fill ?? 'url(#pg)'}" stroke="${INK.iron}" stroke-width="${o.bold ? 1.6 : 0.9}"${o.flat ? '' : ' filter="url(#sh)"'}/>` +
    (o.rule === false
      ? ''
      : `<rect x="${r2(x + 3)}" y="${r2(y + 3)}" width="${r2(w - 6)}" height="${r2(h - 6)}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".55"/>`)
  );
}

export function paperDisc(
  x: number,
  y: number,
  r: number,
  ring: string = INK.iron
) {
  return (
    `<path d="${roughCircle(x, y, r, x + y, 0.9)}" fill="url(#pg)" stroke="${ring}" stroke-width="1.6" filter="url(#sh)"/>` +
    `<circle cx="${x}" cy="${y}" r="${r2(r - 3.2)}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".6"/>`
  );
}

export function bar(
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  wash: string
) {
  const f = Math.min(Math.max(frac, 0), 1);
  return (
    `<rect x="${x}" y="${r2(y - h / 2)}" width="${w}" height="${h}" fill="${PAPER}" stroke="${INK.iron}" stroke-width=".9"/>` +
    `<rect x="${r2(x + 1.5)}" y="${r2(y - h / 2 + 1.5)}" width="${r2((w - 3) * f)}" height="${r2(h - 3)}" fill="${wash}" opacity=".85"/>`
  );
}

export function ring(
  x: number,
  y: number,
  r: number,
  frac: number,
  color: string,
  width = 3
) {
  if (frac <= 0) return '';
  const a0 = -Math.PI / 2,
    a1 = a0 + Math.PI * 2 * Math.min(frac, 0.999);
  return `<path d="${arcPath(x, y, r, a0, a1)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

export function galleon(
  x: number,
  y: number,
  size: number,
  o: { sail?: string; hull?: string; waves?: boolean } = {}
) {
  const sail = o.sail ?? CUT,
    hull = o.hull ?? 'url(#h-iron)',
    k = size / 100;
  return (
    `<g transform="translate(${r2(x - size / 2)} ${r2(y - size / 2)}) scale(${r2(k)})" stroke="${INK.iron}" stroke-linejoin="round">` +
    '<path d="M35 64V16M53 62V8M71 62V20M71 26L92 36" stroke-width="1.6" fill="none"/>' +
    `<path d="M35 18L19 54L41 52Z" fill="${sail}" stroke-width="1.3"/>` +
    `<path d="M40 14Q53 11 66 14Q68 22 66 30Q53 33 40 30Q38 22 40 14Z" fill="${sail}" stroke-width="1.3"/>` +
    `<path d="M41 34Q53 31 65 34Q67 43 65 52Q53 55 41 52Q39 43 41 34Z" fill="${sail}" stroke-width="1.3"/>` +
    `<path d="M61 24Q71 22 80 24Q82 31 80 38Q71 40 61 38Q59 31 61 24Z" fill="${sail}" stroke-width="1.3"/>` +
    `<path d="M62 42Q71 40 80 42Q81 48 80 54Q71 56 62 54Q61 48 62 42Z" fill="${sail}" stroke-width="1.3"/>` +
    `<path d="M53 8L64 10L53 12Z" fill="${WASH.vermilion}" stroke-width=".8"/>` +
    `<path d="M8 58L8 50L24 50L26 60L84 58L92 56L84 74Q52 82 22 76Z" fill="${hull}" stroke-width="1.8"/>` +
    '<path d="M18 66L84 64" stroke-width=".8" fill="none"/>' +
    (o.waves
      ? `<path d="M6 84q6-4 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0M12 91q6-4 12 0t12 0t12 0t12 0t12 0t12 0t12 0" fill="none" stroke="${WASH.ultramarine}" stroke-width="1.4"/>`
      : '') +
    '</g>'
  );
}

export function svg(w: number, h: number, body = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" overflow="visible">${body}</svg>`;
}

export function svgNode(w: number, h: number, body = ''): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', `0 0 ${w} ${h}`);
  el.setAttribute('width', `${w}`);
  el.setAttribute('height', `${h}`);
  el.setAttribute('overflow', 'visible');
  el.innerHTML = body;
  return el;
}

let ids = 0;
export const uid = (name: string) => `${name}-${++ids}`;
