import type { Rarity } from '../../sim/kinds.ts';
import { clamp } from '../../world/scalar.ts';
import {
  GILT,
  INK,
  WASH,
  alpha,
  glyph,
  paperDisc,
  ring,
  slip,
} from '../base/ink.ts';

export const SLOT = 50,
  SLOT_GAP = 10,
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
  slot: number
): number | null => (heals[slot] ? slot : null);

export function healSlot(heal: Rarity | null, done: number | null): string {
  const inner = SLOT - 2 * BORDER;
  if (!heal)
    return (
      `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="${alpha(INK.iron, 0.12)}" stroke="${INK.iron}" stroke-width="3" opacity=".45"/>` +
      `<rect x="2" y="2" width="${SLOT - 4}" height="${SLOT - 4}" fill="none" stroke="${INK.white}" stroke-width="1.2" opacity=".85"/>`
    );
  const c = SLOT / 2;
  return (
    slip(0, 0, SLOT, SLOT, {
      fill: done === null ? 'url(#pg)' : GILT,
      rule: false,
    }) +
    `<rect x="${BORDER}" y="${BORDER}" width="${inner}" height="${inner}" fill="none" stroke="${RARITY_INK[heal]}" stroke-width="${BORDER}"/>` +
    glyph('heal', c, c, HEAL_SIZE) +
    (done === null ? '' : around(useFill(done)))
  );
}

export function around(fill: number): string {
  if (fill <= 0) return '';
  const lo = -USE_OUT,
    hi = SLOT + USE_OUT,
    c = SLOT / 2;
  const d = `M${c} ${lo}H${hi}V${hi}H${lo}V${lo}H${c}`;
  return `<path d="${d}" pathLength="1" fill="none" stroke="${INK.green}" stroke-width="${USE_WIDTH}" stroke-linejoin="round" stroke-dasharray="${fill.toFixed(4)} 1"/>`;
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

export function gustButton(meter: number, notch: number, on: boolean): string {
  const c = GUST.r,
    fill = meterFill(meter),
    ready = on || meter >= notch,
    ink = on ? WASH.gold : INK.iron;
  const inside = notchAt(c, c, GUST.notch[0], notch),
    outside = notchAt(c, c, GUST.notch[1], notch);
  return (
    paperDisc(c, c, c - 2, on ? WASH.gold : INK.iron) +
    `<circle cx="${c}" cy="${c}" r="${GUST.ring}" fill="none" stroke="${alpha(INK.iron, 0.2)}" stroke-width="${GUST.width}"/>` +
    ring(c, c, GUST.ring, fill, ink, GUST.width) +
    `<path d="M${inside.x.toFixed(2)} ${inside.y.toFixed(2)}L${outside.x.toFixed(2)} ${outside.y.toFixed(2)}" stroke="${INK.rubric}" stroke-width="2.6" stroke-linecap="round"/>` +
    glyph('gust', c, c, GUST.glyph, { opacity: ready ? 1 : 0.4 })
  );
}
