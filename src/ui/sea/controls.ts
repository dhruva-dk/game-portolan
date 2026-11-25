import { RARITIES, type Rarity } from '../../sim/kinds.ts';
import { clamp } from '../../world/scalar.ts';
import { GILT, INK, WASH, alpha, glyph, paperDisc, slip } from '../base/ink.ts';

export const SLOT = 50;
const SLOT_GAP = 10,
  HEAL_SIZE = 31,
  BORDER = 3.2,
  USE_WIDTH = 4,
  USE_OUT = 3.5;

export type Box = { left: number; top: number; width: number; height: number };

export const slotBox = (i: number): Box => ({
  left: i * (SLOT + SLOT_GAP),
  top: 0,
  width: SLOT,
  height: SLOT,
});

export const slotsWidth = (n: number) => n * SLOT + (n - 1) * SLOT_GAP;

export const RARITY_INK: Readonly<Record<Rarity, string>> = {
  common: INK.silver,
  rare: INK.blue,
  epic: INK.storm,
  legendary: INK.gold,
};

export const healTapped = (
  heals: readonly (Rarity | null)[],
  slot: number,
  busy = false
): number | null => (heals[slot] && !busy ? slot : null);

export const dash = (fill: number) => `${clamp(fill).toFixed(4)} 1`;

export function healSlot(heal: Rarity | null, using: boolean): string {
  const inner = SLOT - 2 * BORDER;
  if (!heal)
    return (
      `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="${alpha(INK.iron, 0.12)}" stroke="${INK.iron}" stroke-width="3" opacity=".45"/>` +
      `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="none" stroke="${INK.white}" stroke-width="1.2" opacity=".85"/>`
    );
  const c = SLOT / 2;
  return (
    slip(0, 0, SLOT, SLOT, { fill: using ? GILT : 'url(#pg)', rule: false }) +
    `<rect x="${BORDER}" y="${BORDER}" width="${inner}" height="${inner}" fill="none" stroke="${RARITY_INK[heal]}" stroke-width="${BORDER}"/>` +
    `<rect class="glint" x="${BORDER}" y="${BORDER}" width="${inner}" height="${inner}" fill="url(#glint-${heal})"/>` +
    glyph('heal', c, c, HEAL_SIZE) +
    around(0)
  );
}

export function around(fill: number): string {
  const lo = -USE_OUT,
    hi = SLOT + USE_OUT,
    c = SLOT / 2;
  const d = `M${c} ${lo}H${hi}V${hi}H${lo}V${lo}H${c}`;
  return `<path class="use" d="${d}" pathLength="1" fill="none" stroke="${INK.green}" stroke-width="${USE_WIDTH}" stroke-linejoin="round" stroke-dasharray="${dash(fill)}" opacity="${fill > 0 ? 1 : 0}"/>`;
}

export const glints = () =>
  '<defs>' +
  RARITIES.map(
    (r) =>
      `<linearGradient id="glint-${r}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset=".3" stop-color="${RARITY_INK[r]}" stop-opacity="0"/>` +
      `<stop offset=".5" stop-color="${INK.white}" stop-opacity=".9"/>` +
      `<stop offset=".7" stop-color="${RARITY_INK[r]}" stop-opacity="0"/></linearGradient>`
  ).join('') +
  '</defs>';

export function circlePath(x: number, y: number, r: number) {
  return `M${x} ${y - r}A${r} ${r} 0 1 1 ${x} ${y + r}A${r} ${r} 0 1 1 ${x} ${y - r}`;
}

export function meterRing(
  cls: string,
  x: number,
  y: number,
  r: number,
  ink: string,
  width: number
) {
  return `<path class="${cls}" d="${circlePath(x, y, r)}" pathLength="1" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${dash(0)}" opacity="0"/>`;
}

export function setRing(el: Element | null, fill: number) {
  if (!el) return;
  el.setAttribute('stroke-dasharray', dash(fill));
  el.setAttribute('opacity', fill > 0 ? '1' : '0');
}

export const STEPS = 48;

export const useFill = (done: number) =>
  Math.floor(clamp(done) * STEPS) / STEPS;

export const meterFill = (meter: number) =>
  Math.floor(clamp(meter) * STEPS) / STEPS;

export const GUST = {
  r: 30,
  ring: 21,
  glyph: 27,
  width: 4,
  notch: [16, 25],
} as const;

export function notchAt(
  x: number,
  y: number,
  r: number,
  share: number
): { x: number; y: number } {
  const a = -Math.PI / 2 + 2 * Math.PI * share;
  return { x: x + r * Math.cos(a), y: y + r * Math.sin(a) };
}

export const FIRE = 40;
const GUST_RIGHT = 6,
  GUST_UP = 86,
  FIRE_DISC = 2 * FIRE + 4;

export type Corner = {
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export const THUMB: {
  width: number;
  height: number;
  fire: Corner;
  gust: Corner;
} = {
  width: FIRE_DISC,
  height: FIRE_DISC / 2 + GUST_UP + GUST.r,
  fire: { right: 0, bottom: 0, width: FIRE_DISC, height: FIRE_DISC },
  gust: {
    right: FIRE_DISC / 2 + GUST_RIGHT - GUST.r,
    bottom: FIRE_DISC / 2 + GUST_UP - GUST.r,
    width: 2 * GUST.r,
    height: 2 * GUST.r,
  },
};

export function gustButton(notch: number): string {
  const c = GUST.r;
  const inside = notchAt(c, c, GUST.notch[0], notch),
    outside = notchAt(c, c, GUST.notch[1], notch);
  return (
    `<circle class="halo" cx="${c}" cy="${c}" r="${c + 3}" fill="none" stroke="${WASH.gold}" stroke-width="5"/>` +
    `<g class="off">${paperDisc(c, c, c - 2, INK.iron)}</g>` +
    `<g class="on">${paperDisc(c, c, c - 2, WASH.gold)}</g>` +
    `<circle cx="${c}" cy="${c}" r="${GUST.ring}" fill="none" stroke="${alpha(INK.iron, 0.2)}" stroke-width="${GUST.width}"/>` +
    meterRing('meter', c, c, GUST.ring, INK.iron, GUST.width) +
    `<path d="M${inside.x.toFixed(2)} ${inside.y.toFixed(2)}L${outside.x.toFixed(2)} ${outside.y.toFixed(2)}" stroke="${INK.rubric}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<g class="sign">${glyph('gust', c, c, GUST.glyph)}</g>`
  );
}

export const gustReady = (meter: number, notch: number, on: boolean) =>
  on || meter >= notch;
