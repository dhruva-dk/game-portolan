// PROTOTYPE (throwaway): small drawing helpers for the office prototype.
import { portrait, type Role } from './portrait.ts';

export const ICON: Record<string, string> = {
  home: '<path d="M3 11.5 12 4l9 7.5M5.5 10v10h5v-6h3v6h5V10"/>',
  crew: '<circle cx="8" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M2.5 20c.5-4 3-6 5.5-6s5 2 5.5 6M13 19c.4-3 2-4.6 3.8-4.6S20.6 16 21 19"/>',
  ship: '<path d="M3 16h18l-2.5 4h-13zM12 3v13M12 4l6 8h-6M12 6 7 13h5"/>',
  rookery: '<path d="M8 21V9h8v12M6 9h12l-6-5zM10.5 21v-4h3v4M3 21h18"/>',
  market: '<path d="M12 3v17M5 7h14M5 7l-3 7h6zM19 7l-3 7h6zM8 20h8"/>',
  league: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6"/>',
  finance: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9c-.6-.9-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2.1 2.7.9 2.7 2.2-1.1 2.1-2.7 2.1c-1.2 0-2.1-.5-2.7-1.4M12 6.5v11"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13"/><path d="m3.5 6.5 8.5 7 8.5-7"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
};
export const icon = (k: string, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

const SHAPE: Record<string, string> = {
  circle: '<circle cx="12" cy="12" r="7"/>',
  diamond: '<path d="M12 3 21 12 12 21 3 12z"/>',
  cross: '<path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z"/>',
  saltire: '<path d="M5 3 12 10 19 3l2 2-7 7 7 7-2 2-7-7-7 7-2-2 7-7-7-7z"/>',
  star: '<path d="m12 2.5 2.7 6.2 6.8.6-5.1 4.5 1.5 6.7L12 17l-5.9 3.5 1.5-6.7-5.1-4.5 6.8-.6z"/>',
  crescent: '<path d="M15 3.5A9 9 0 1 0 15 20.5 7 7 0 1 1 15 3.5z"/>',
  triangle: '<path d="M12 3 21.5 20h-19z"/>',
  chevron: '<path d="M2.5 16 12 6.5l9.5 9.5-3 3-6.5-6.5-6.5 6.5z"/>',
  anchor: '<path d="M11 3h2v3h3v2h-3v9.8c2.6-.4 4.5-2 5.2-4.3H16l3.5-3.5L23 13.5h-2.6C19.5 17.4 16 20 12 20s-7.5-2.6-8.4-6.5H1L4.5 10 8 13.5H5.8c.7 2.3 2.6 3.9 5.2 4.3V8H8V6h3z"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M4.6 4.6l2.8 2.8M16.6 16.6l2.8 2.8M4.6 19.4l2.8-2.8M16.6 7.4l2.8-2.8" stroke="currentColor" stroke-width="2"/>',
  bars: '<path d="M3 5h18v4H3zM3 15h18v4H3z"/>',
  wave: '<path d="M2 9c3-3 5-3 7 0s4 3 6 0 4-3 7 0v5c-3-3-5-3-7 0s-4 3-6 0-4-3-7 0z"/>',
};
export const emblem = (shape: string, colour: string, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${colour}" style="color:${colour}">${SHAPE[shape]}</svg>`;
export const crest = (c: { shape: string; c1: string; c2: string }, size = 32) =>
  `<span style="width:${size}px;height:${size}px;display:inline-grid;place-items:center;background:${c.c1};flex:none">${emblem(c.shape, c.c2, size * 0.66)}</span>`;

export interface Gull { name: string; seed: number; age: number; role: Role; crew: { c1: string; c2: string } }
export const face = (g: Gull, size: number, round = true, px = 256, extra = '') =>
  `<img class="portrait${round ? ' round' : ''}" style="--wash:${g.crew.c1};width:${size}px;height:${size}px;flex:none;${extra}" src="${portrait({ seed: g.seed, age: g.age, role: g.role, c1: g.crew.c1, c2: g.crew.c2 }, px)}" alt="">`;

export const coin = (n: number) => {
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : ''}${s}`;
};
export const stars = (v: number, cls = '') => {
  let s = '';
  for (let i = 1; i <= 5; i++)
    s += v >= i ? '★' : v >= i - 0.5 ? '<span style="position:relative">☆<span style="position:absolute;left:0;top:0;width:50%;overflow:hidden">★</span></span>' : '☆';
  return `<span class="stars ${cls}">${s}</span>`;
};
/** Colour of a 0–20 rating. */
export const tone = (v: number, max = 20) => (v / max < 0.4 ? 'var(--bad)' : v / max < 0.68 ? 'var(--warn)' : 'var(--good)');

/** A 0–20 stat as filled blocks coloured by value. */
export const stat = (label: string, v: number, change = 0) => {
  let cells = '';
  for (let i = 0; i < 20; i++) cells += `<i style="background:${i < v ? tone(v) : 'transparent'}"></i>`;
  const arrow = change > 0 ? '<span class="arrow good-t">▲</span>' : change < 0 ? '<span class="arrow bad-t">▼</span>' : '<span></span>';
  return `<div class="stat"><span>${label}</span><div class="track">${cells}</div><b class="num">${v}</b>${arrow}</div>`;
};
export const meter = (v: number, colour = tone(v, 100)) => `<div class="meter"><i style="width:${v}%;background:${colour}"></i></div>`;

/** A semicircular gauge, 0–100, with a needle. */
export function gauge(v: number, w = 150) {
  const r = 60, cx = 75, cy = 72;
  const at = (p: number) => {
    const a = Math.PI * (1 - p / 100);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const [x, y] = at(v);
  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (1 - i / 10);
    ticks += `<line x1="${cx + (r - 14) * Math.cos(a)}" y1="${cy - (r - 14) * Math.sin(a)}" x2="${cx + (r - 20) * Math.cos(a)}" y2="${cy - (r - 20) * Math.sin(a)}" stroke="var(--ink-2)" stroke-width="1.5"/>`;
  }
  const [sx, sy] = at(0);
  return `<svg viewBox="0 0 150 82" width="${w}" height="${w * 0.55}">
    <path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="var(--track)" stroke-width="12"/>
    <path d="M${sx} ${sy} A${r} ${r} 0 0 1 ${x} ${y}" fill="none" stroke="${tone(v, 100)}" stroke-width="12"/>
    ${ticks}
    <line x1="${cx}" y1="${cy}" x2="${cx + (r - 22) * Math.cos(Math.PI * (1 - v / 100))}" y2="${cy - (r - 22) * Math.sin(Math.PI * (1 - v / 100))}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink)"/>
  </svg>`;
}

/** A place in a race as a coloured chip. */
export const place = (p: number) => {
  const c = p <= 3 ? 'var(--gold)' : p <= 20 ? 'var(--good)' : p <= 50 ? 'var(--warn)' : 'var(--bad)';
  return `<i style="background:${c}">${p}</i>`;
};
