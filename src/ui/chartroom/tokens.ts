// The chartroom's tokens (UI-TOKENS.md): the one table every piece of the kit
// is styled by, every value ink.ts's or the drawn unit's. They are set as CSS
// custom properties on the kit's root (`.cr`); a piece names `var(--token)` and
// never a colour or a length of its own (tests/architecture-chartroom.test.ts).
// Marks drawn as SVG, where a custom property does not reach (a border image's
// data URI), take their colours from TONE, which is the same table's.

import {
  BRASS,
  CHARTROOM,
  CUT,
  FIGURES,
  GILT,
  INK,
  PAPER,
  PARCHMENT,
  RARITY,
  SHADOW,
  WASH,
  alpha,
  blend,
} from '../ink.ts';
import { PAGE } from '../kit/page.ts';
import { stylesheet } from '../kit/style.ts';
import { size } from '../ui.ts';

/**
 * One drawn unit on the office's page, page px: the UI's size on a screen the
 * page's size (1.735), fixed, since the page itself is scaled to the screen.
 */
export const UNIT = size(PAGE.w, PAGE.h);

/** `n` drawn units, as CSS. */
export const u = (n: number) => `calc(${n} * var(--u))`;

/**
 * The colours by what they say, for SVG marks (the same values as the custom
 * properties of the same names).
 */
export const TONE = {
  paper: PAPER,
  raised: PARCHMENT[0],
  sunk: blend(PAPER, PARCHMENT[2], 0.5),
  edge: PARCHMENT[2],
  gilt: GILT,
  cut: CUT,
  brass: BRASS,
  shadow: SHADOW,
  ink: INK.iron,
  label: CHARTROOM.label,
  onInk: INK.white,
  act: INK.blue,
  harm: INK.rubric,
  good: INK.green,
  warn: WASH.ochre,
  won: INK.gold,
  wonWash: WASH.gold,
  storm: INK.storm,
  note: INK.sepia,
  sea: WASH.sea,
} as const;

/**
 * The quality ladder, q0…q4: its wash, its rim, and the ink set on it (iron on
 * all but the verdigris).
 */
export const LADDER = [
  { wash: WASH.silver, rim: RARITY[0], on: INK.iron },
  { wash: WASH.viridian, rim: RARITY[1], on: INK.white },
  { wash: CHARTROOM.azurite, rim: RARITY[2], on: INK.iron },
  { wash: CHARTROOM.purpure, rim: RARITY[3], on: INK.iron },
  { wash: WASH.gold, rim: RARITY[4], on: INK.iron },
] as const;

/** A stat's step on the ladder, 0…20: 0–5, 6–9, 10–13, 14–17, 18–20. */
export const step = (v: number) =>
  v >= 18 ? 4 : v >= 14 ? 3 : v >= 10 ? 2 : v >= 6 ? 1 : 0;

/** The least a touch target and a word may be, CSS px (Apple's touch, the office's smallest type). */
const FLOOR = { touch: 44, text: 13 } as const;
const floor = (px: number, n: number) => `max(${px}px, ${u(n)})`;

/** Every token, by its custom property's name. */
export const TOKENS: Readonly<Record<string, string>> = {
  // the unit, and the page's measure
  gutter: u(16),
  touch: floor(FLOOR.touch, 26),
  row: u(20),
  'row-tap': floor(FLOOR.touch, 26),
  // papers
  paper: TONE.paper,
  'paper-raised': TONE.raised,
  'paper-sunk': TONE.sunk,
  parchment: `radial-gradient(ellipse at 50% 45%, ${PARCHMENT[0]} 0%, ${PARCHMENT[1]} 60%, ${PARCHMENT[2]} 100%)`,
  gilt: TONE.gilt,
  plate: INK.iron,
  'plate-ink': CUT,
  'plate-faint': CHARTROOM.plateFaint,
  brass: TONE.brass,
  dim: alpha(SHADOW, 0.35),
  // inks
  ink: TONE.ink,
  'ink-2': TONE.label,
  rule: alpha(INK.iron, 0.2),
  line: alpha(INK.iron, 0.55),
  'on-ink': TONE.onInk,
  act: TONE.act,
  harm: TONE.harm,
  good: TONE.good,
  warn: TONE.warn,
  won: TONE.won,
  'won-wash': TONE.wonWash,
  storm: TONE.storm,
  note: TONE.note,
  sea: TONE.sea,
  ...Object.fromEntries(
    LADDER.flatMap((q, i) => [
      [`q${i}`, q.wash],
      [`q${i}-rim`, q.rim],
      [`q${i}-on`, q.on],
    ])
  ),
  // type: words roman, figures italic (old-style to fig-m, lining from fig-l)
  face: FIGURES,
  't-label': floor(FLOOR.text, 7.5),
  't-body': u(8.5),
  't-name': u(10),
  't-head': u(10),
  't-title': u(13),
  'fig-s': u(15),
  'fig-m': u(17),
  'fig-l': u(21),
  'fig-xl': u(25),
  'fig-xxl': u(28),
  // space
  s1: u(2),
  s2: u(4),
  s3: u(6),
  s4: u(8),
  s5: u(12),
  s6: u(16),
  // strokes
  'w-hair': u(0.5),
  'w-fine': u(0.9),
  'w-rule': u(1.2),
  'w-bold': u(1.6),
  // fills
  stripes: `repeating-linear-gradient(-45deg, ${WASH.ochre} 0 ${u(5)}, ${blend(WASH.ochre, INK.iron, 0.2)} ${u(5)} ${u(10)})`,
  range: `repeating-linear-gradient(-45deg, transparent 0 ${u(1.6)}, ${alpha(INK.iron, 0.45)} ${u(1.6)} ${u(2.2)})`,
  hatch: `repeating-linear-gradient(-45deg, transparent 0 ${u(1.6)}, ${alpha(INK.iron, 0.14)} ${u(1.6)} ${u(2.2)})`,
  // motion
  press: '80ms ease-out',
  quick: '120ms ease-out',
  fade: '320ms ease',
  settle: '240ms cubic-bezier(.3, 1.6, .5, 1)',
};

/** The tokens as declarations, and the kit root's own type and ink. */
const CSS = `
.cr { --u: calc(1px * var(--k, 1)); }
.office .cr, .office.cr { --u: ${UNIT.toFixed(4)}px; }
.cr { ${Object.entries(TOKENS)
  .map(([name, value]) => `--${name}: ${value};`)
  .join(' ')}
  font: 500 var(--t-body)/1.3 var(--face); color: var(--ink); -webkit-font-smoothing: antialiased; }
.cr *, .cr *::before, .cr *::after { box-sizing: border-box; }
`;

/** Sets the tokens into the page, once; a kit piece's own sheet follows it. */
export function chartroom(css: string) {
  stylesheet(CSS);
  stylesheet(css);
}
