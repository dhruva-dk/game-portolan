// The headquarters' chart: her team's harbour as the chartmaker draws it. The
// ground (the coast inked and washed, the sea ruled with rhumbs from a rose, a
// ship at anchor in the roads, the lanes between the buildings) and the nine
// buildings, each a woodcut of what it is: hatched roofs, paper walls, the one
// thing that tells it from its neighbours. SVG markup in the chart's own
// units; the screen (yard.ts) sets the buildings on it where SITES says.

import type { Building } from '../../office/command.ts';
import { CUT, INK, LAND, WASH, galleon } from '../ink.ts';
import { rhumbs, rose } from '../marks.ts';

/** The chart's size, in its own units (px of the office's page). */
export const CHART = { w: 790, h: 664 } as const;

/** A woodcut's box: every building is drawn in one, and scaled from it. */
export const BOX = { w: 100, h: 80 } as const;

/** Where each building stands on the chart: the middle of its foot. */
export const SITES: Readonly<Record<Building, readonly [number, number]>> = {
  crowsNest: [372, 150],
  drawingLoft: [545, 138],
  sailingSchool: [706, 150],
  pitHouse: [376, 352],
  foundry: [545, 340],
  testTank: [706, 352],
  factory: [388, 548],
  fishMarket: [552, 540],
  landingPad: [708, 548],
};

const LINE = `stroke="${INK.iron}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
const wall = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CUT}" ${LINE}/>`;
const roof = (d: string) => `<path d="${d}" fill="url(#h-iron)" ${LINE}/>`;
const ink = (d: string, width = 1.3) =>
  `<path d="${d}" fill="none" stroke="${INK.iron}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dark = (d: string) => `<path d="${d}" fill="${INK.iron}"/>`;
const wash = (d: string, colour: string) =>
  `<path d="${d}" fill="${colour}" ${LINE}/>`;
const waves = (x: number, y: number, n: number) =>
  `<path d="M${x} ${y}${'q4-3 8 0t8 0'.repeat(n)}" fill="none" stroke="${WASH.ultramarine}" stroke-width="1.2" stroke-linecap="round"/>`;
const pennant = (x: number, y: number) =>
  ink(`M${x} ${y + 14}V${y}`) +
  wash(`M${x} ${y}l12 3.5-12 3.5z`, WASH.vermilion);

/** Each building's woodcut, in its box. */
const CUTS: Readonly<Record<Building, string>> = {
  // a shed, and a hull on the stocks beside it, her ribs showing
  factory:
    wall(52, 40, 40, 30) +
    roof('M48 40 72 22 96 40Z') +
    dark('M64 70V52h16v18Z') +
    ink('M4 70H50') +
    wash('M6 58q20 14 42 0l-3-5H10Z', CUT) +
    ink('M14 54v8M21 54v10M28 54v11M35 54v10M42 54v8', 1) +
    ink('M10 70l4-8M46 70l-4-8', 1),
  // a tall house, a great window in its gable for the light
  drawingLoft:
    wall(28, 32, 44, 38) +
    roof('M23 32 50 8 77 32Z') +
    `<circle cx="50" cy="22" r="5.5" fill="${CUT}" ${LINE}/>` +
    ink('M50 16.500v11M44.500 22h11', 0.9) +
    wall(34, 40, 8, 14) +
    wall(46, 40, 8, 14) +
    wall(58, 40, 8, 14) +
    dark('M45 70V60h10v10Z'),
  // a long low shed, and the still water before it
  testTank:
    wall(12, 34, 76, 18) +
    roof('M7 34 18 20H82L93 34Z') +
    ink('M24 40v8M38 40v8M52 40v8M66 40v8M78 40v8', 1) +
    wash('M8 58H92V72H8Z', WASH.sea) +
    waves(14, 63, 4) +
    waves(22, 68, 3),
  // a saw-toothed roof, a stack and its smoke, the fire in its door
  foundry:
    wall(14, 42, 52, 28) +
    roof('M14 42 27 30V42L40 30V42L53 30V42H66') +
    wall(70, 16, 12, 54) +
    ink('M68 16h16M76 12q-7-5 0-9t3-9', 1.4) +
    wash('M30 70V58a8 8 0 0 1 16 0V70Z', WASH.vermilion),
  // a small house under its pennant, a boat for the learning drawn up by it
  sailingSchool:
    wall(10, 44, 38, 26) +
    roof('M6 44 29 28 52 44Z') +
    pennant(29, 12) +
    dark('M24 70V58h10v12Z') +
    wash('M58 64q14 10 32 0Z', CUT) +
    ink('M74 64V34') +
    wash('M74 36 90 60H74Z', CUT) +
    waves(56, 74, 2),
  // a boathouse, its arch open on the water
  pitHouse:
    wall(20, 36, 60, 34) +
    roof('M15 36 50 14 85 36Z') +
    dark('M34 70V54a16 16 0 0 1 32 0V70Z') +
    waves(34, 66, 2) +
    ink('M26 44h8M66 44h8', 1),
  // a watch tower, its nest and its pennant
  crowsNest:
    wash('M40 70 45 26H55L60 70Z', CUT) +
    ink('M43.500 42h13M42.500 52h15M41.500 62h17', 1) +
    wash('M38 16H62L59 26H41Z', 'url(#h-iron)') +
    pennant(50, 1) +
    ink('M28 70q10-6 22-2t22 2', 1.2),
  // a stall under a striped awning, the catch laid out on it
  fishMarket:
    ink('M22 70V40M78 70V40') +
    wash('M14 42 22 26H78L86 42Z', CUT) +
    wash(
      'M30.500 26 25 42H36L39 26ZM47.500 26 47 42H58L56 26ZM64.500 26 69 42H80L73 26Z',
      WASH.vermilion
    ) +
    wall(20, 56, 60, 14) +
    ink(
      'M28 51q6-5 12 0q-6 5-12 0zm12 0 4-3v6zM52 51q6-5 12 0q-6 5-12 0zm12 0 4-3v6z',
      1
    ),
  // a jetty out over the water, a pavilion at its head
  landingPad:
    wall(58, 36, 28, 22) +
    roof('M53 36 72 22 91 36Z') +
    pennant(72, 6) +
    dark('M68 58V46h8v12Z') +
    wash('M6 58H92V63H6Z', CUT) +
    ink('M14 63V74M32 63V74M50 63V74M68 63V74M86 63V74') +
    waves(8, 72, 1) +
    ink('M12 58v-6M26 58v-6', 1.6),
};

/** The building `id`'s woodcut, in its box (its foot at 70 of the box's 80). */
export const woodcut = (id: Building) => CUTS[id];

/** The land's edge: the coast down the chart's left and along its foot, the harbour inside it. */
const COAST =
  'M306 0 C284 62 334 118 304 190 C276 252 326 300 294 372 C272 432 332 478 312 540 ' +
  'C302 586 340 612 402 606 C482 598 522 630 602 614 C682 600 722 632 790 610';
/** The hill behind the town: its foot, as the land's contours run. */
const HILL = 'M470 0 C452 90 640 60 628 200 C620 290 790 250 790 250';

/** A lane between two sites, a little wandering. */
const lane = (a: readonly [number, number], b: readonly [number, number]) => {
  const mx = (a[0] + b[0]) / 2,
    my = (a[1] + b[1]) / 2 + 22;
  return `M${a[0]} ${a[1] + 12}Q${mx} ${my + 8} ${b[0]} ${b[1] + 12}`;
};

/** The chart's ground: sea and coast, the roads, the rose and the ship at anchor. */
export function harbour() {
  const S = SITES;
  const lanes = [
    lane(S.crowsNest, S.drawingLoft),
    lane(S.drawingLoft, S.sailingSchool),
    lane(S.pitHouse, S.foundry),
    lane(S.foundry, S.testTank),
    lane(S.factory, S.fishMarket),
    lane(S.fishMarket, S.landingPad),
    `M${S.drawingLoft[0]} ${S.drawingLoft[1] + 12}Q${S.foundry[0] - 26} ${(S.drawingLoft[1] + S.foundry[1]) / 2} ${S.foundry[0]} ${S.foundry[1] - 70}`,
    `M${S.foundry[0]} ${S.foundry[1] + 12}Q${S.fishMarket[0] + 26} ${(S.foundry[1] + S.fishMarket[1]) / 2} ${S.fishMarket[0]} ${S.fishMarket[1] - 70}`,
  ].join('');
  return (
    `<rect width="${CHART.w}" height="${CHART.h}" fill="${WASH.sea}" opacity=".55"/>` +
    rhumbs(150, 556, 900, 0.22) +
    // the shallows, then the land, washed and contoured
    `<path d="${COAST}V0Z" fill="${LAND.apron}" stroke="${LAND.apron}" stroke-width="26" stroke-linejoin="round"/>` +
    `<path d="${COAST}V0Z" fill="${LAND.low}" stroke="${INK.iron}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<path d="${COAST}" transform="translate(34 -30)" fill="none" stroke="${LAND.contour}" stroke-width=".8" opacity=".5"/>` +
    `<path d="${HILL}V0Z" fill="${LAND.high}" opacity=".28"/>` +
    `<path d="${HILL}" fill="none" stroke="${LAND.contour}" stroke-width=".8" opacity=".6"/>` +
    `<path d="${lanes}" fill="none" stroke="${INK.sepia}" stroke-width="1.6" stroke-dasharray="2 5" stroke-linecap="round"/>` +
    // the roads: her ship at anchor, the sea's marks, the rose
    galleon(150, 330, 150, { waves: true }) +
    waves(40, 120, 3) +
    waves(190, 190, 2) +
    waves(60, 470, 2) +
    waves(230, 620, 3) +
    waves(470, 646, 2) +
    rose(150, 556, 62, 0)
  );
}
