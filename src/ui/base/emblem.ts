import { linearToHex } from '../../world/color.ts';
import { DEVICES, DYES, deviceOf, type Livery } from '../../world/livery.ts';
import { INK, svgNode } from './ink.ts';
import type { Jacket } from './gull.ts';

const SHIELD = 'M3.5 2.5h17v9.5c0 5-3.5 8.3-8.5 10-5-1.7-8.5-5-8.5-10z';

export const charge = (device: number) =>
  `<path d="${DEVICES[deviceOf(device)]}"/>`;

const shield = (device: number, colors: Jacket) =>
  `<path d="${SHIELD}" style="fill:${colors[0]}" stroke="${INK.iron}" stroke-width="1.3" stroke-linejoin="round"/>` +
  `<g style="fill:${colors[1]}" transform="translate(12 11.5) scale(.72) translate(-12 -11.5)">${charge(device)}</g>`;

export function liveryColors(livery: Livery): Jacket {
  const dye = DYES[livery.dye] ?? DYES[0];
  return [linearToHex(dye.color), linearToHex(dye.mark)];
}

export const emblemAt = (
  device: number,
  colors: Jacket,
  x: number,
  y: number,
  size: number
) =>
  `<g transform="translate(${Math.round((x - size / 2) * 100) / 100} ${Math.round((y - size / 2) * 100) / 100}) scale(${Math.round((size / 24) * 1000) / 1000})">${shield(device, colors)}</g>`;

export const shieldOutline = (x: number, y: number, size: number) =>
  `<g transform="translate(${Math.round((x - size / 2) * 100) / 100} ${Math.round((y - size / 2) * 100) / 100}) scale(${Math.round((size / 24) * 1000) / 1000})">` +
  `<path d="${SHIELD}" fill="none" stroke="${INK.iron}" stroke-width="1.3" stroke-dasharray="2.6 2" stroke-linejoin="round"/></g>`;

export function emblem(device: number, colors: Jacket, size: number) {
  const svg = svgNode(24, 24, shield(device, colors));
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'k-emblem');
  return svg;
}
