import { linearToHex } from '../../world/color.ts';
import { DYES, EMBLEMS, type Livery } from '../../world/livery.ts';
import { INK, svgNode } from './ink.ts';
import type { Jacket } from './gull.ts';

const DEVICES = [
  '<circle cx="12" cy="11.5" r="5"/>',
  '<path d="M12 4.5 18.5 11.5 12 18.5 5.5 11.5z"/>',
  '<path d="M10 4.5h4v5h5v4h-5v5.5h-4v-5.5H5v-4h5z"/>',
  '<path d="M6 5 12 9.5 18 5l1.5 2.5L14.5 11.5l5 4-1.5 2.5-6-4.5-6 4.5L4.5 15.5l5-4-5-4z"/>',
  '<path d="m12 4 2.2 5 5.3.5-4 3.6 1.2 5.4L12 15.7 7.3 18.5l1.2-5.4-4-3.6 5.3-.5z"/>',
  '<path d="M15 4.5A7.5 7.5 0 1 0 15 18.5 6 6 0 1 1 15 4.5z"/>',
  '<path d="M12 4.5 19 17.5H5z"/>',
  '<path d="M4.5 14 12 6.5l7.5 7.5-2.5 2.5-5-5-5 5z"/>',
  '<path d="M5 6.5h14v3.5H5zM5 13h14v3.5H5z"/>',
  '<path d="M4.5 9c2.5-2.5 4.5-2.5 6 0s3.5 2.5 5 0 2.5-2.5 4 0v4.5c-1.5-2.5-2.5-2.5-4 0s-3.5 2.5-5 0-3.5-2.5-6 0z"/>',
  '<path d="M11 4h2v2.5h2.5v2H13v6.8c1.8-.3 3-1.4 3.5-3h-1.5l2.5-2.5 2.5 2.5h-1.4c-.7 3-3.3 5.2-6.6 5.2s-5.9-2.2-6.6-5.2H4l2.5-2.5L9 12.3H7.5c.5 1.6 1.7 2.7 3.5 3V8.5H8.5v-2H11z"/>',
  '<path d="M5.5 5h13v2.5l-3.5 4 3.5 4V18h-13v-2.5l3.5-4-3.5-4z"/>',
] as const;

const SHIELD = 'M3.5 2.5h17v9.5c0 5-3.5 8.3-8.5 10-5-1.7-8.5-5-8.5-10z';

const charge = (device: number) =>
  DEVICES[((device % EMBLEMS) + EMBLEMS) % EMBLEMS] ?? '';

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
