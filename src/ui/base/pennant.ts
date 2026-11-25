import { linearToHex } from '../../world/color.ts';
import { DYES } from '../../world/livery.ts';
import { BRASS, INK, SHADOW, WASH, alpha, r2, uid } from './ink.ts';

export const PENNANT = {
  w: 176,
  h: 156,
  tail: 12,
  band: 28,
  foot: 30,
  rig: 22,
  reach: 8,
  knot: 8.6,
} as const;

export const RIGGED = {
  w: PENNANT.w + 2 * PENNANT.reach,
  h: PENNANT.rig + PENNANT.h,
} as const;

export type Cloth = readonly [dye: string, mark: string];

const SPREAD = 7;

export function sponsorCloth(sponsor: number): Cloth {
  const dye = DYES[(sponsor * SPREAD) % DYES.length];
  return [linearToHex(dye.color), linearToHex(dye.mark)];
}

const left = PENNANT.reach,
  right = PENNANT.reach + PENNANT.w,
  top = PENNANT.rig,
  bottom = PENNANT.rig + PENNANT.h,
  notch = bottom - PENNANT.tail,
  middle = RIGGED.w / 2;

const outline = `M${left} ${top}H${right}V${bottom}L${middle} ${notch}L${left} ${bottom}Z`;

export const clothTop = top;
export const footTop = bottom - PENNANT.foot;

export function rig(faint = false) {
  const o = faint ? ' opacity=".45"' : '',
    staffY = top - 2.5;
  return (
    `<g${o}>` +
    `<path d="M${middle} 3L${left + 10} ${staffY}M${middle} 3L${right - 10} ${staffY}" fill="none" stroke="${INK.sepia}" stroke-width="1.1"/>` +
    `<circle cx="${middle}" cy="3" r="2.6" fill="none" stroke="${BRASS}" stroke-width="1.6"/>` +
    `<rect x="${left - 6}" y="${staffY - 2.6}" width="${PENNANT.w + 12}" height="5.2" rx="2.6" fill="${WASH.shore}" stroke="${INK.iron}" stroke-width=".9"/>` +
    `<circle cx="${left - 6}" cy="${staffY}" r="3.6" fill="${BRASS}" stroke="${INK.iron}" stroke-width=".8"/>` +
    `<circle cx="${right + 6}" cy="${staffY}" r="3.6" fill="${BRASS}" stroke="${INK.iron}" stroke-width=".8"/>` +
    '</g>'
  );
}

export function cloth(colors: Cloth, body: string) {
  const [dye, mark] = colors,
    clip = uid('pennant');
  const seam = (y: number) =>
    `<path d="M${left} ${y}H${right}" stroke="${mark}" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="2.4 2"/>`;
  return (
    `<defs><clipPath id="${clip}"><path d="${outline}"/></clipPath></defs>` +
    `<path d="${outline}" fill="url(#pg)" filter="url(#sh)"/>` +
    `<g clip-path="url(#${clip})">` +
    `<rect x="${left}" y="${top}" width="${PENNANT.w}" height="${PENNANT.band}" fill="${dye}"/>` +
    seam(top + PENNANT.band - 3.5) +
    `<rect x="${left}" y="${footTop}" width="${PENNANT.w}" height="${PENNANT.foot}" fill="${dye}"/>` +
    seam(footTop + 3.5) +
    `<path d="${outline}" fill="url(#fold)"/>` +
    '</g>' +
    `<path d="${outline}" fill="none" stroke="${INK.iron}" stroke-width="1.2" stroke-linejoin="round"/>` +
    body
  );
}

export const emptyCloth = (on = false) =>
  `<path class="hollow" d="${outline}" fill="${alpha(SHADOW, on ? 0.06 : 0.03)}" stroke="${INK.iron}" stroke-width="1.3" stroke-dasharray="5 4" stroke-linejoin="round"/>`;

export function knots(cx: number, cy: number, count: number, ink: string) {
  const step = PENNANT.knot,
    span = (count - 1) * step,
    x0 = cx - span / 2,
    reach = span / 2 + step;
  let s = `<path d="M${r2(cx - reach)} ${r2(cy)}C${r2(cx - reach / 2)} ${r2(cy + 1.6)} ${r2(cx + reach / 2)} ${r2(cy + 1.6)} ${r2(cx + reach)} ${r2(cy)}" fill="none" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>`;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * step,
      y = cy + 1.2 * Math.sin((Math.PI * (x - cx + reach)) / (2 * reach));
    s +=
      `<g class="knot" style="--i:${i}"><ellipse cx="${r2(x)}" cy="${r2(y)}" rx="3" ry="3.5" fill="${ink}"/>` +
      `<path d="M${r2(x - 1.8)} ${r2(y - 1.4)}Q${r2(x)} ${r2(y + 0.6)} ${r2(x + 1.8)} ${r2(y - 1.4)}" fill="none" stroke="${alpha(SHADOW, 0.55)}" stroke-width=".8"/></g>`;
  }
  return s;
}
