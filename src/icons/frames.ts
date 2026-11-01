// Frames an icon can sit in: the rarity tile (weapons, consumables, deliveries, anything with a rarity), the round
// medallion of an active ability, the hexagon of a passive, the wax seal of a region perk and the chart roundel of a
// region. Each frame draws itself on the 24-unit grid and places the glyph inside it, cream with an ink outline.
import { circle, f, px, py, rect, regular, star, wedge } from './draw.ts';
import type { Defs } from './render.ts';

export type Rarity = 0 | 1 | 2 | 3 | 4;
export const RARITY_NAMES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type RarityName = (typeof RARITY_NAMES)[number];

/** The five rarity colours (the rewrite's), common to legendary. */
export const RARITY_COLOURS = ['#b7bec7', '#5ad65a', '#3ea6ff', '#c46bff', '#ffb22e'] as const;

export type FrameKind = 'rarity' | 'active' | 'passive' | 'seal' | 'region';

/** The interface's ink and cream. */
export const INK = '#1e1208';
export const CREAM = '#fff6e2';

const TILE = [
  { hi: '#f1f3f5', mid: '#b7bec7', lo: '#646e78', trim: '#eef1f4' },
  { hi: '#c2f7a8', mid: '#5ad65a', lo: '#1c7431', trim: '#dcffc9' },
  { hi: '#b4e2ff', mid: '#3ea6ff', lo: '#1650ad', trim: '#d8f0ff' },
  { hi: '#efc9ff', mid: '#c46bff', lo: '#561a9e', trim: '#f4dcff' },
  { hi: '#fff3b0', mid: '#ffb22e', lo: '#bf4a08', trim: '#ffe9a0' },
] as const;

/** Where the glyph goes inside each frame: centre and scale. */
export const INSET: Record<FrameKind, readonly [number, number, number]> = {
  rarity: [12, 11.2, 0.66],
  active: [12, 12, 0.62],
  passive: [12, 12, 0.6],
  seal: [12, 12, 0.56],
  region: [12, 12, 0.6],
};

export const place = (kind: FrameKind, inner: string): string => {
  const [cx, cy, s] = INSET[kind];
  return `<g transform="translate(${f(cx)} ${f(cy)}) scale(${f(s)}) translate(-12 -12)">${inner}</g>`;
};

const shadowed = (d: string, dy = 0.8): string => `<path d="${d}" transform="translate(0 ${f(dy)})" fill="${INK}" opacity="0.38"/>`;

const gloss = (d: string, defs: Defs, top: number, bottom: number): string =>
  `<path d="${d}" fill="${defs.grad({ stops: ['#ffffff', '#ffffff00'], y1: top, y2: bottom })}" opacity="0.32"/>`;

/** Faint sun rays behind the glyph, clipped to the frame, for the top rarities. */
const rays = (defs: Defs, shape: string, colour: string, n: number, cy: number): string => {
  const clip = defs.clip(shape);
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 360) / n - 90;
    d += wedge(12, cy, 20, a - 360 / n / 4, a + 360 / n / 4);
  }
  return `<path d="${d}" fill="${colour}" opacity="0.22" clip-path="url(#${clip})"/>`;
};

const glow = (defs: Defs, cy: number, r: number, a = 0.55): string =>
  `<circle cx="12" cy="${f(cy)}" r="${f(r)}" fill="${defs.radial(12, cy, r, [[0, '#ffffff', a], [1, '#ffffff', 0]])}"/>`;

/** The rarity tile: a rounded square in the rarity's colour, with ornaments and gems that grow with rarity. */
export function rarityFrame(defs: Defs, r: Rarity, inner: string, fine: boolean): string {
  const t = TILE[r], shape = rect(1.2, 1.2, 21.6, 21.6, 4.4);
  let s = shadowed(shape);
  s += `<path d="${shape}" fill="${defs.grad({ stops: [t.hi, t.mid, t.lo], y1: 1.2, y2: 22.8 })}"/>`;
  if (r >= 3) s += rays(defs, shape, t.trim, r === 4 ? 16 : 12, 11);
  s += glow(defs, 10.8, 9.6);
  s += gloss('M2.4 6C2.4 3.6 3.6 2.4 6 2.4H18C20.4 2.4 21.6 3.6 21.6 6V9.2C15.6 11.4 8.4 11.4 2.4 9.2Z', defs, 2.4, 11);
  s += `<path d="${rect(2.6, 2.6, 18.8, 18.8, 3.2)}" fill="none" stroke="${t.trim}" stroke-opacity="0.6" stroke-width="0.55"/>`;
  s += `<path d="${shape}" fill="none" stroke="${INK}" stroke-width="1.1"/>`;
  s += ornaments(r, fine);
  s += place('rarity', inner);
  // gems set in the bottom edge, one per rarity step, so rarity reads without colour
  const n = r + 1, gap = 2.7;
  for (let i = 0; i < n; i++) {
    const x = 12 + (i - (n - 1) / 2) * gap, y = 22.7;
    s += `<path d="M${f(x)} ${f(y - 1.25)}L${f(x + 1.05)} ${f(y)}L${f(x)} ${f(y + 1.25)}L${f(x - 1.05)} ${f(y)}Z" fill="${r === 4 ? '#ffe9a0' : CREAM}" stroke="${INK}" stroke-width="0.5" stroke-linejoin="round"/>`;
  }
  return s;
}

function ornaments(r: Rarity, fine: boolean): string {
  const ink = `stroke="${INK}" stroke-width="0.45" stroke-linejoin="round"`;
  let s = '';
  if (r === 1) s += `<path d="M10.2 1.2H13.8L12 3.4Z" fill="${CREAM}" ${ink}/>`;
  if (r === 2 || r === 3) {
    for (const [x, y] of [[4, 4], [20, 4], [4, 20], [20, 20]]) s += `<circle cx="${x}" cy="${y}" r="0.8" fill="${CREAM}" ${ink}/>`;
  }
  if (r === 3 && fine) {
    s += `<path d="M3.4 8V5.4C3.4 4.2 4.2 3.4 5.4 3.4H8M16 3.4H18.6C19.8 3.4 20.6 4.2 20.6 5.4V8M20.6 16V18.6C20.6 19.8 19.8 20.6 18.6 20.6H16M8 20.6H5.4C4.2 20.6 3.4 19.8 3.4 18.6V16" fill="none" stroke="${CREAM}" stroke-width="0.6" stroke-linecap="round" opacity="0.85"/>`;
  }
  if (r === 4) {
    // gold corner leaves and a star crest over the top edge
    for (const [x, y, a] of [[1.2, 1.2, 0], [22.8, 1.2, 90], [22.8, 22.8, 180], [1.2, 22.8, 270]]) {
      s += `<path d="M0 0L5.2 0C3.6 0.8 2.2 1.6 1.6 1.6C1.6 2.2 0.8 3.6 0 5.2Z" transform="translate(${x} ${y}) rotate(${a})" fill="#ffe08a" ${ink}/>`;
    }
    s += `<path d="${star(12, 1.6, 5, 2.4, 1.05)}" fill="#fff3b0" ${ink}/>`;
  }
  return s;
}

/** An active ability: a lapis medallion with a gold ring. */
export function activeFrame(defs: Defs, inner: string): string {
  const shape = circle(12, 12, 10.9);
  let s = shadowed(shape);
  s += `<path d="${shape}" fill="${defs.grad({ stops: ['#6aa6ec', '#2f64a8', '#173563'] })}"/>`;
  s += glow(defs, 11, 8.6, 0.4);
  s += gloss('M2.6 10.2A9.6 9.6 0 0 1 21.4 10.2C15.6 12.2 8.4 12.2 2.6 10.2Z', defs, 2.4, 12);
  s += `<circle cx="12" cy="12" r="9.5" fill="none" stroke="#f4cf6e" stroke-width="0.7" opacity="0.9"/>`;
  s += `<path d="${shape}" fill="none" stroke="${INK}" stroke-width="1.1"/>`;
  return s + place('active', inner);
}

/** A passive ability: a bronze hexagon. */
export function passiveFrame(defs: Defs, inner: string): string {
  const shape = regular(12, 12, 6, 11.4, -90);
  let s = shadowed(shape);
  s += `<path d="${shape}" fill="${defs.grad({ stops: ['#e2b06a', '#a8743a', '#5a3714'] })}" stroke-linejoin="round"/>`;
  s += glow(defs, 11, 8.4, 0.38);
  s += gloss('M3.2 7.6L12 2.4L20.8 7.6V9.6C15.2 11.6 8.8 11.6 3.2 9.6Z', defs, 2.4, 11.6);
  s += `<path d="${regular(12, 12, 6, 9.6, -90)}" fill="none" stroke="#fff0c8" stroke-width="0.6" opacity="0.7" stroke-linejoin="round"/>`;
  s += `<path d="${shape}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`;
  return s + place('passive', inner);
}

/** A region perk: a wax seal with a pressed ring. */
export function sealFrame(defs: Defs, inner: string): string {
  let d = '';
  const n = 15;
  for (let i = 0; i <= n * 4; i++) {
    const a = (i / (n * 4)) * 360 - 90, r = 10.7 + 0.75 * Math.cos(((i % 4) / 4) * 2 * Math.PI) + 0.25 * Math.sin(i * 1.7);
    d += (i ? 'L' : 'M') + f(px(12, r, a)) + ' ' + f(py(12, r, a));
  }
  d += 'Z';
  let s = shadowed(d);
  s += `<path d="${d}" fill="${defs.grad({ stops: ['#d4553a', '#a3301c', '#5e140a'] })}"/>`;
  s += `<circle cx="12" cy="12" r="8.6" fill="${defs.grad({ stops: ['#7a1c0e', '#b5402a'], y1: 3.4, y2: 20.6 })}" opacity="0.65"/>`;
  s += `<circle cx="12" cy="12.3" r="8.6" fill="none" stroke="#f08a6a" stroke-width="0.5" opacity="0.6"/>`;
  s += `<circle cx="12" cy="12" r="8.6" fill="none" stroke="#4a0c04" stroke-width="0.7" opacity="0.8"/>`;
  s += gloss('M3.6 8.6A9.4 9.4 0 0 1 20.4 8.6C15.4 10.4 8.6 10.4 3.6 8.6Z', defs, 2, 10);
  s += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`;
  return s + place('seal', inner);
}

/** A region: a chart roundel in the region's colour, with the four quarters marked. */
export function regionFrame(defs: Defs, colour: string, inner: string): string {
  const shape = circle(12, 12, 10.9);
  let s = shadowed(shape);
  s += `<path d="${shape}" fill="${colour}"/>`;
  s += `<path d="${shape}" fill="${defs.grad({ stops: ['#ffffff55', '#ffffff00', '#00000055'] })}"/>`;
  s += glow(defs, 11, 8, 0.32);
  s += `<circle cx="12" cy="12" r="9.3" fill="none" stroke="${CREAM}" stroke-width="0.55" opacity="0.85"/>`;
  for (const a of [-90, 0, 90, 180]) {
    s += `<path d="M${f(px(12, 10.9, a))} ${f(py(12, 10.9, a))}L${f(px(12, 9.3, a - 5))} ${f(py(12, 9.3, a - 5))}L${f(px(12, 9.3, a + 5))} ${f(py(12, 9.3, a + 5))}Z" fill="${CREAM}"/>`;
  }
  s += gloss('M2.6 10.2A9.6 9.6 0 0 1 21.4 10.2C15.6 12.2 8.4 12.2 2.6 10.2Z', defs, 2.4, 12);
  s += `<path d="${shape}" fill="none" stroke="${INK}" stroke-width="1.1"/>`;
  return s + place('region', inner);
}
