// Small marks: the level seal, rank medallions, captains' emblem discs, chips and stat tiles.
import { el, esc } from './dom.ts';
import { emblem } from './icons.ts';
import { chargeOf, maskInto } from './sigil.ts';

/** The ranks' names and metals, Iron to Legend. Tiers 0–5 have three steps each; Admiral and Legend have one. */
export const RANK_TIERS = [
  { name: 'Iron', steps: 3, metal: ['#d4d9de', '#80878f', '#363c43'] },
  { name: 'Bronze', steps: 3, metal: ['#f6caa4', '#b8743a', '#5a3010'] },
  { name: 'Silver', steps: 3, metal: ['#ffffff', '#c3cbd3', '#5f6a75'] },
  { name: 'Gold', steps: 3, metal: ['#fff3b8', '#f2c14e', '#8c5e08'] },
  { name: 'Platinum', steps: 3, metal: ['#eafffc', '#7fdcd2', '#24716c'] },
  { name: 'Diamond', steps: 3, metal: ['#eef6ff', '#8ab8ff', '#2d4cb0'] },
  { name: 'Admiral', steps: 1, metal: ['#a9cbff', '#2b4f9a', '#0d1a40'] },
  { name: 'Legend', steps: 1, metal: ['#ffd9ff', '#b45cff', '#43106f'] },
] as const;

const ROMAN = ['I', 'II', 'III'];
/** A rank's plain name, as "Gold II" or "Legend". */
export const rankName = (tier: number, step: number): string => (RANK_TIERS[tier].steps > 1 ? `${RANK_TIERS[tier].name} ${ROMAN[step - 1] ?? step}` : RANK_TIERS[tier].name);

let gid = 0;
/** A rank medallion as SVG: the tier's metal and shape, its steps as chevrons. */
export function rankSvg(tier: number, step: number): string {
  const id = `rk${gid++}`, [a, b, c] = RANK_TIERS[tier].metal;
  const grad = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`
    + `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset="0.5" stop-color="#f2c14e"/><stop offset="1" stop-color="#8c5e08"/></linearGradient></defs>`;
  const ink = 'stroke="#1a0f06" stroke-width="2.2" stroke-linejoin="round"';
  let body = '';
  if (tier <= 5) {
    // wings for the top three tiers
    if (tier >= 3) body += `<path d="M14 40 2 30l3 16 10 8zM86 40l12-10-3 16-10 8z" fill="url(#${id})" ${ink}/>`;
    body += `<path d="M50 4 84 18v34c0 20-15 34-34 44C31 86 16 72 16 52V18z" fill="url(#${id})" ${ink}/>`;
    body += `<path d="M50 12 76 23v28c0 15-11 26-26 34C35 77 24 66 24 51V23z" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2"/>`;
    // the steps, as chevrons up from the bottom
    for (let i = 0; i < step; i++) {
      const y = 70 - i * 13;
      body += `<path d="M31 ${y} 50 ${y - 10} 69 ${y}v7L50 ${y - 3} 31 ${y + 7}z" fill="#fff6e2" stroke="#1a0f06" stroke-width="1.6" stroke-linejoin="round"/>`;
    }
    // a mark for the tier at the top
    const marks = [
      '<circle cx="50" cy="30" r="6" fill="#fff6e2" stroke="#1a0f06" stroke-width="1.6"/>',
      '<path d="M50 20l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff6e2" stroke="#1a0f06" stroke-width="1.4"/>',
      '<path d="M50 19l3.2 6.6 7.2 1-5.2 5 1.3 7.2L50 35.4l-6.5 3.4 1.3-7.2-5.2-5 7.2-1z" fill="#fff6e2" stroke="#1a0f06" stroke-width="1.4"/>',
      '<path d="M37 37l-2-14 8 6 7-9 7 9 8-6-2 14z" fill="#fff6e2" stroke="#1a0f06" stroke-width="1.6" stroke-linejoin="round"/>',
      '<path d="M50 17l9 10-9 13-9-13z" fill="#fff6e2" stroke="#1a0f06" stroke-width="1.6" stroke-linejoin="round"/>',
      '<path d="M41 24h18l5 6-14 13-14-13z" fill="#fff6e2" stroke="#1a0f06" stroke-width="1.6" stroke-linejoin="round"/><path d="M36 30h28M45 24l5 19 5-19" fill="none" stroke="#1a0f06" stroke-width="1.2"/>',
    ];
    body += marks[tier];
  } else if (tier === 6) {
    // Admiral: a round medallion in a gold ring with an anchor and a star
    body += `<circle cx="50" cy="50" r="44" fill="url(#${id}g)" ${ink}/><circle cx="50" cy="50" r="35" fill="url(#${id})" ${ink}/>`;
    body += `<g fill="none" stroke="#fff6e2" stroke-width="5" stroke-linecap="round"><path d="M50 33v34M40 41h20M30 55c0 10 9 16 20 16s20-6 20-16"/></g><circle cx="50" cy="28" r="5" fill="none" stroke="#fff6e2" stroke-width="4"/>`;
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2, x = 50 + Math.cos(t) * 40, y = 50 + Math.sin(t) * 40;
      body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="#fff6e2"/>`;
    }
  } else {
    // Legend: a burst of gold with a crowned violet heart
    let p = '';
    for (let k = 0; k < 32; k++) {
      const t = -Math.PI / 2 + (k * Math.PI) / 16, r = k % 2 ? 36 : 48;
      p += `${k ? 'L' : 'M'}${(50 + Math.cos(t) * r).toFixed(1)} ${(50 + Math.sin(t) * r).toFixed(1)}`;
    }
    body += `<path d="${p}z" fill="url(#${id}g)" ${ink}/><circle cx="50" cy="52" r="27" fill="url(#${id})" ${ink}/>`;
    body += '<path d="M35 60l-3-20 10 8 8-12 8 12 10-8-3 20z" fill="url(#' + id + 'g)" stroke="#1a0f06" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="44" r="3" fill="#fff6e2"/>';
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${grad}${body}</svg>`;
}

/** A rank medallion element. */
export function rankBadge(tier: number, step: number, o: { size?: 'md' | 'lg' | 'xl'; locked?: boolean; parent?: Element } = {}): HTMLElement {
  const r = el(`p-rank${o.size && o.size !== 'md' ? ` p-rank--${o.size}` : ''}${o.locked ? ' is-locked' : ''}`, o.parent, rankSvg(tier, step));
  r.setAttribute('aria-label', rankName(tier, step));
  r.dataset.part = 'rank';
  return r;
}

/** The level, pressed in wax. */
export function seal(level: number, o: { cap?: string; parent?: Element } = {}): HTMLElement {
  const s = el('p-seal', o.parent, `<span class="p-seal__v">${level}</span>${o.cap ? `<span class="p-seal__cap">${esc(o.cap)}</span>` : ''}`);
  s.dataset.part = 'seal';
  return s;
}

/** A captain's emblem on a disc of their two colours. */
export function emblemBadge(name: string, colours: readonly [string, string], o: { size?: 'sm' | 'md' | 'lg'; parent?: Element } = {}): HTMLElement {
  const c = chargeOf(name);
  const e = el(`p-emblem${o.size === 'lg' ? ' p-emblem--lg' : o.size === 'sm' ? ' p-emblem--sm' : ''}`, o.parent, `<div class="p-emblem__glyph">${c ? '' : emblem(name)}</div>`);
  if (c) maskInto(e.firstElementChild as HTMLElement, c);
  e.style.setProperty('--e1', colours[0]);
  e.style.setProperty('--e2', colours[1]);
  e.dataset.part = 'emblem';
  return e;
}

/** A small rounded label with a glyph. */
export function chip(icon: string, label: string, o: { paper?: boolean; parent?: Element; className?: string } = {}): HTMLElement {
  const c = el(`p-chip${o.paper ? ' p-chip--paper' : ''}${o.className ? ' ' + o.className : ''}`, o.parent, `${icon ? `<span class="p-chip__icon">${icon}</span>` : ''}<span class="p-chip__t">${esc(label)}</span>`);
  c.dataset.part = 'chip';
  return c;
}

/** A stat tile: glyph, big number, label. The number is in .p-stat__v for counting up. */
export function stat(icon: string, value: string | number, label: string, o: { parent?: Element } = {}): HTMLElement {
  const s = el('p-stat', o.parent, `${icon ? `<div class="p-stat__icon">${icon}</div>` : ''}<div class="p-stat__v">${esc(String(value))}</div><div class="p-stat__l">${esc(label)}</div>`);
  s.dataset.part = 'stat';
  return s;
}

