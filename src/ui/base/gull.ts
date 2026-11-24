import { hash } from '../../world/random.ts';
import { INK, PLUMAGE, blend, svgNode } from './ink.ts';

export type Jacket = readonly [string, string];

export const JACKETS = [
  '#34466e',
  '#74302f',
  '#2f5a42',
  '#b08a5c',
  '#5f6b75',
  '#2f6e6e',
  '#603a5c',
  '#a3522c',
  '#737236',
  '#3b3936',
  '#b98482',
  '#86a0b8',
  '#93a383',
] as const;

export const SHADES = [
  'wayfarer',
  'aviator',
  'round',
  'visor',
  'catEye',
  'star',
] as const;
export type Shades = (typeof SHADES)[number];

const MIRROR = '#3d4b5e';
const UNCLE = {
  oilskin: '#d6ad3c',
  aged: '#efece3',
  whisker: '#d9d6cc',
  cap: '#363d50',
  patch: '#4a5266',
  band: '#1f2229',
  badge: '#b39a5a',
} as const;

export const lookOf = (seed: number) => ({
  jacket: JACKETS[hash(seed, 0x4a4b) % JACKETS.length],
  shades: SHADES[hash(seed, 0x5348) % SHADES.length],
});

const BOX = 120;
const FINE = 48;

const trimOf = (jacket: string) => blend(jacket, INK.iron, 0.4);

interface Pen {
  line: string;
  fine: boolean;
}

const penFor = (size: number): Pen => {
  const width = Math.max(2.3, (0.8 * BOX) / size);
  return {
    line: `stroke="${INK.iron}" stroke-width="${width.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"`,
    fine: size >= FINE,
  };
};

function body(first: string, second: string, pen: Pen) {
  const { line } = pen;
  return (
    `<path d="M-6 132V110C6 98 22 92 40 90L74 88C94 90 110 98 126 112V132Z" fill="${first}" ${line}/>` +
    `<path d="M90 92.5C101 96 110 102 118 110L113 132H95C96 114 95 102 90 92.5Z" fill="${second}" ${line}/>` +
    `<path d="M9 105C16 99 23 96 31 93.5L27 132H7Z" fill="${second}" ${line}/>` +
    `<path d="M57 99 60 132" fill="none" ${line}/>`
  );
}

function head(pen: Pen, collar: string, white: string = PLUMAGE.white) {
  const { line } = pen;
  return (
    `<path d="M41 94C41 82 39 74 36 64C30 56 30 40 38 31C45 22 60 19 70 24C77 27 82 33 83 41V47L81 59C80 66 73 71 72 79V94Z" fill="${white}" ${line}/>` +
    `<path d="M41 94C41 82 39 74 36 64C30 56 30 40 38 31C36 44 40 57 50 65C57 70 65 72 73 71C72 74 72 76 72 79V94Z" fill="${PLUMAGE.shade}" opacity=".8"/>` +
    `<path d="M37 84C48 89 62 88 75 82L78 94C64 101 48 101 35 95Z" fill="${collar}" ${line}/>` +
    `<path d="M82 56 105 58.5C104 63 99 66 93 65.5L82 62.5Z" fill="${PLUMAGE.under}" ${line}/>` +
    `<circle cx="97" cy="61.8" r="2.3" fill="${PLUMAGE.spot}"/>` +
    `<path d="M82 44C93 42 105 46 111 54C112.5 58.5 110 62 107 61C105 58 98 56.5 82 56.5Z" fill="${PLUMAGE.beak}" ${line}/>` +
    (pen.fine
      ? `<path d="M89 49.5h4" fill="none" stroke="${INK.iron}" stroke-width="1.6" stroke-linecap="round"/>`
      : '')
  );
}

const LENS = `fill="${PLUMAGE.lens}" stroke="${PLUMAGE.lens}" stroke-width="1.5" stroke-linejoin="round"`;
const arm = (d: string, width = 3.4, ink: string = PLUMAGE.lens) =>
  `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const lens = (d: string) => `<path d="${d}" ${LENS}/>`;
const glint = (d: string, pen: Pen) =>
  pen.fine
    ? `<path d="${d}" fill="none" stroke="${PLUMAGE.glint}" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>`
    : '';

const AVIATOR =
  'M56 34.5C66 33 78 33 87.5 34.5C88.5 39 87.5 44 85 48C81 54 75 60 66.5 63.5C59.5 64.5 55.7 59 54.9 50C54.5 43 54.6 37.5 56 34.5Z';

const EYEWEAR: Record<Shades, (pen: Pen) => string> = {
  wayfarer: (pen) =>
    arm('M57 37 33 39.5') +
    lens('M85 33.5 93 35.5C93.5 40 92 43.5 89 44.5L84.5 43Z') +
    lens(
      'M53 32.5 88.5 33.5 87.5 38.5 85.5 44.5C84.5 47.5 81.5 49 77.5 49H65C60.5 49 58 47 57 44Z'
    ) +
    glint('M61 37.5 65 37.7M60.5 41.5 70 37.9', pen),
  aviator: (pen) =>
    arm('M57 37.5 33 40', 2.4) +
    lens('M86 34.5 92.5 35.5C93 41 91.5 46 88 49.5L84.5 47Z') +
    lens(AVIATOR) +
    (pen.fine
      ? `<path d="M57.5 49C64 46.5 76 44.5 85.2 46C81.5 52.5 75.5 58.5 67 61.8C61.5 62.8 58.3 57.5 57.5 49Z" fill="${MIRROR}"/>` +
        `<path d="${AVIATOR}" fill="none" stroke="${INK.silver}" stroke-width="1.6" stroke-linejoin="round"/>` +
        arm('M58 32.2C68 30.4 79 30.4 90 32.4', 1.4, INK.silver)
      : '') +
    glint('M61 41C62.5 39.5 65 39 67 39', pen),
  round: (pen) =>
    arm('M60 39 33 41', 2.2) +
    arm('M80.5 40.5C82 39 84 39 85.5 40.5', 2.2) +
    lens('M86 37.5C89.5 37.5 91.5 40.5 91 44.5C90.5 48 88.5 50 86 50Z') +
    `<circle cx="70.5" cy="42.5" r="10.5" ${LENS}/>` +
    glint('M64.5 39.5C65.5 37.8 67 37 68.5 36.8', pen),
  visor: (pen) =>
    lens(
      'M31 38C46 33 70 31.5 92 34.5C94 38 93 42.5 90.5 45C70 46.5 48 47 32 46C30 43 30 40.5 31 38Z'
    ) + glint('M48 38.5 76 36.5', pen),
  catEye: (pen) =>
    arm('M57 38 33 40.5') +
    lens('M85 35 93.5 32.5C93.5 37 92 41 88.5 43L84.5 42Z') +
    lens(
      'M40 18C47 26 54 31.5 62 33.5L82 34C85.5 34.2 87 36.5 86 39.5L84.5 43.5C83 47.5 79.5 49 75 49H67C61.5 49 57.5 46.5 55.5 42.5C50 38.5 43 30 40 18Z'
    ) +
    glint('M62 38 66 38.2', pen),
  star: (pen) =>
    arm('M57 40 33 42', 2.6) +
    lens(star(70.5, 43, 18, 7)) +
    lens('M86.5 37 93 41.5 88.5 45 87 50.5 84.5 47Z') +
    glint('M66 40.5 69 37.5', pen),
};

function star(cx: number, cy: number, outer: number, inner: number) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer,
      a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }
  return `${d}Z`;
}

const frame = (size: number, inside: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${size < FINE ? '12 3 106 106' : `0 0 ${BOX} ${BOX}`}" width="${size}" height="${size}" overflow="hidden"><g transform="translate(1 -5)">${inside}</g></svg>`;

export function portrait(seed: number, size: number) {
  const { jacket, shades } = lookOf(seed),
    pen = penFor(size),
    trim = trimOf(jacket);
  return frame(
    size,
    body(jacket, trim, pen) + head(pen, trim) + EYEWEAR[shades](pen)
  );
}

function cap(pen: Pen) {
  const { line } = pen;
  return (
    `<path d="M28 31C24 25 28 17 40 13C47 10.5 53 12.5 58 11C65 8 79 8 87 12.5C92 15 91.5 20 86.5 22.5L82 30C66 29 48 30 33 34.5Z" fill="${UNCLE.cap}" ${line}/>` +
    `<path d="M33 34.5C48 30 66 29 82 30L83 36.5C66 35 48 36 34 40.5Z" fill="${UNCLE.band}" ${line}/>` +
    `<path d="M80 30.5C88 31 96 34 101 39C95 41.5 87.5 40.5 82.5 37Z" fill="${PLUMAGE.lens}" ${line}/>` +
    `<path d="M74 20.5C74 17.5 77 16 79.5 17C81.5 18 82 21 80.5 23C78.5 25 75 24 74 20.5Z" fill="${UNCLE.badge}" stroke="${INK.iron}" stroke-width="1.4"/>` +
    (pen.fine
      ? `<path d="M36 36.5C50 33 66 32 81 33" fill="none" stroke="${UNCLE.badge}" stroke-width="1.2" stroke-dasharray="2 1.6"/>` +
        `<path d="M44 17 54 15.5 55 23 45 24.5Z" fill="${UNCLE.patch}" stroke="${INK.iron}" stroke-width="1"/>` +
        `<path d="M45.5 18.5 47 18M46 21.5 47.5 21.2M52 16.5 53.5 16.3M52.5 21 54 20.8" stroke="${INK.iron}" stroke-width=".8"/>`
      : '')
  );
}

function face(pen: Pen) {
  const { line } = pen;
  return (
    `<path d="M70.5 48C71.5 44.5 75.5 43 78.5 44.8C80.5 46.5 80 50.5 77.5 51.8C74.5 53 71 51.5 70.5 48Z" fill="${PLUMAGE.white}" ${line}/>` +
    `<circle cx="76" cy="48.5" r="2.5" fill="${PLUMAGE.lens}"/>` +
    `<path d="M70 46.8C73 44.8 77 44.3 80 46.2" fill="none" ${line}/>` +
    `<path d="M60 43C63 37 72 35.5 79 38C82 39 85 40.5 85.5 43C83 44.5 80 42.5 76 42.5C71 42.5 66 43.5 62.5 45.5C60.5 46 59 45 60 43Z" fill="${UNCLE.whisker}" ${line}/>` +
    `<path d="M80.5 55C75 56.5 71 61 70.5 68C74 67.5 77.5 65 80.5 62.5C83.5 66 88 68.5 92.5 68C92.5 61.5 88 56 80.5 55Z" fill="${UNCLE.whisker}" ${line}/>` +
    (pen.fine
      ? `<path d="M76 60 74 65M80.5 60V65M85 60.5 88 65.5M66 40.5 64 38.5M72 39 71 36.5" fill="none" stroke="${INK.iron}" stroke-width="1" stroke-linecap="round" opacity=".7"/>`
      : '')
  );
}

export function uncle(size: number) {
  const pen = penFor(size),
    trim = trimOf(UNCLE.oilskin);
  return frame(
    size,
    body(UNCLE.oilskin, trim, pen) +
      head(pen, trim, UNCLE.aged) +
      face(pen) +
      cap(pen)
  );
}

export function bust(jacket: Jacket, size: number): Element {
  const pen = penFor(size),
    svg = svgNode(
      BOX,
      BOX,
      `<g transform="translate(1 -5)">${body(jacket[0], jacket[1], pen)}${head(pen, jacket[1])}${EYEWEAR.wayfarer(pen)}</g>`
    );
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('overflow', 'hidden');
  return svg;
}
