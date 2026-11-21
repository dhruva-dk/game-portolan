// The seed panel's fleet card (panel.ts): what a seed's race is sailed by, in
// drawn marks and numerals (the house style: no words). At its head the
// match's type in a paper disc, the persona most of the bots are in a gilt
// one, and the two captains who stand out, each by her mark and her ship's
// number: the sharpest (a target) and the most reckless (a flame). Under it a
// bar for each persona, its count over it and its mark under it, the most
// common gilt. Under those, five rows, one a trait: its mark, a rule from
// nothing to the most it runs to with the fleet's spread washed over it and
// its average ticked, and the average and the spread in numerals. Skill and
// aggression are read as hundredths; notice and the storm margin in metres;
// flee hull in the hull's hundred.

import type { Fleet, Spread } from '../player.ts';
import {
  CUT,
  GILT,
  INK,
  PAPER,
  WASH,
  figure,
  glyph,
  paperDisc,
  slip,
} from './ink.ts';
import { ram, rose, spyglass } from './marks.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A mark's group: centred on (x, y), drawn on a 24-unit square grown to `s`. */
const grid = (x: number, y: number, s: number, body: string) =>
  `<g transform="translate(${r2(x)} ${r2(y)}) scale(${r2(s / 24)})" stroke="${INK.iron}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;

/** A gold coin, 9 across its half, at (x, y) of a mark's grid. */
const coin = (x: number, y: number) =>
  `<circle cx="${x}" cy="${y}" r="8" fill="${WASH.gold}" stroke-width="1.4"/>` +
  `<circle cx="${x}" cy="${y}" r="5.2" fill="none" stroke-width=".6"/>` +
  `<path d="M${x} ${y - 3}V${y + 3}M${x - 3} ${y}H${x + 3}" stroke-width="1.2"/>`;

/**
 * Each persona's mark, `s` across, in sim/persona.ts's order: the hunter's
 * spyglass (she goes to the guns she hears from far off); the homesteader's
 * pennant staked in her ground (she keeps to her water); the raider's black
 * flag; the turtle; the scavenger's coin (the loot before anything); the
 * brawler's ram.
 */
function personaMark(i: number, x: number, y: number, s: number) {
  if (i === 0) return spyglass(x, y, s * 1.2);
  if (i === 5) return ram(x, y, s / 30);
  const body = [
    '',
    `<path d="M-12 11Q-4 4 6 11Z" fill="${WASH.shore}" stroke-width="1.1"/><path d="M-5 9V-11" stroke-width="1.8"/>` +
      `<path d="M-5 -11L10 -6L-5 -1Z" fill="${WASH.viridian}" stroke-width="1.2"/>`,
    `<path d="M-8 11V-11" stroke-width="1.8"/><path d="M-8 -11H10V1H-8Z" fill="${INK.iron}" stroke-width="1"/>` +
      `<circle cx="1" cy="-6.5" r="2.4" fill="${INK.white}" stroke="none"/><path d="M-3 -3L5 -0.5M5 -3L-3 -0.5" stroke="${INK.white}" stroke-width="1"/>`,
    `<g fill="${WASH.viridian}" stroke-width="1"><ellipse cx="-7" cy="-6" rx="3.4" ry="2"/><ellipse cx="-7" cy="6" rx="3.4" ry="2"/>` +
      `<ellipse cx="5" cy="-6.5" rx="3.4" ry="2"/><ellipse cx="5" cy="6.5" rx="3.4" ry="2"/><circle cx="10.5" cy="0" r="3"/></g>` +
      `<ellipse cx="-1" cy="0" rx="9" ry="7" fill="${WASH.viridian}" stroke-width="1.4"/>` +
      `<path d="M-5 -5.5L-3 0L-5 5.5M3 -6L1 0L3 6M-3 0H1" fill="none" stroke-width=".8"/>`,
    coin(0, 0),
  ][i];
  return grid(x, y, s, body ?? '');
}

/**
 * Each match type's mark, `s` across, in sim/persona.ts TYPES's order: a
 * rose (mixed: every persona alike, the game's own rules); crossed cutlasses
 * with a drop of blood (a bloodbath); coins heaped (a gold rush); a great
 * shield (cagey).
 */
function typeMark(i: number, x: number, y: number, s: number) {
  if (i === 0) return rose(x, y, s * 0.5);
  if (i === 3) return glyph('item.bigShield', x, y, s);
  if (i === 2) return grid(x, y, s, coin(-5, 5) + coin(5, 5) + coin(0, -4));
  const blade = (side: number) =>
    `<path d="M${-9 * side} 10Q${2 * side} 1 ${9 * side} -11" fill="none" stroke-width="3.4"/>` +
    `<path d="M${-9 * side} 10Q${2 * side} 1 ${9 * side} -11" fill="none" stroke="${CUT}" stroke-width="1.2"/>` +
    `<path d="M${-9 * side} 4L${-3 * side} 10" stroke-width="2.4"/>`;
  return grid(
    x,
    y,
    s,
    blade(1) +
      blade(-1) +
      `<path d="M0 -2Q2.5 2 0 4Q-2.5 2 0 -2Z" fill="${INK.rubric}" stroke="none"/>`
  );
}

/** The traits' marks, `s` across: skill's target, aggression's flame, notice's eye, the Storm's whirl, a hull running. */
const TRAIT_MARKS = [
  `<circle r="10" fill="${PAPER}" stroke-width="1.3"/><circle r="6" fill="none" stroke-width="1"/>` +
    `<circle r="2.4" fill="${INK.rubric}" stroke="none"/>`,
  `<path d="M0 11C-7 11 -9 4 -5 -3C-4 0 -2 1 -1 0C-3 -5 0 -9 2 -12C3 -6 8 -3 7 3C6 8 3 11 0 11Z" fill="${WASH.vermilion}" stroke-width="1.2"/>` +
    `<path d="M0 10C-3 10 -4 6 -2 3C0 5 1 3 1 1C3 3 4 6 2 9Z" fill="${WASH.gold}" stroke="none"/>`,
  `<path d="M-11 0Q0 -10 11 0Q0 10 -11 0Z" fill="${PAPER}" stroke-width="1.3"/>` +
    `<circle r="4" fill="${WASH.azure}" stroke-width=".9"/><circle r="1.5" fill="${INK.iron}" stroke="none"/>`,
  null,
  `<path d="M-5 2H12L8 9H-3Z" fill="url(#h-iron)" stroke-width="1.2"/><path d="M3 2V-11" stroke-width="1.4"/>` +
    `<path d="M3 -10L10 -3L3 -1Z" fill="${CUT}" stroke-width="1"/>` +
    `<path d="M-8 -3h-4M-7 1h-5M-8 5h-4" stroke="${WASH.ultramarine}" stroke-width="1.4"/>`,
] as const;
/** Trait `i`'s mark, `s` across, centred on (x, y). */
const traitMark = (i: number, x: number, y: number, s: number) =>
  i === 3
    ? glyph('hud.storm', x, y, s, { ink: 'storm' })
    : grid(x, y, s, TRAIT_MARKS[i] ?? '');

/**
 * The five traits as the card reads them: which of the fleet's, how far its
 * rule runs, how a reading is put in numerals, and its wash.
 */
const TRAITS: readonly {
  of: (f: Fleet) => Spread;
  most: number;
  by: number;
  wash: string;
}[] = [
  { of: (f) => f.skill, most: 1, by: 100, wash: WASH.azure },
  { of: (f) => f.aggression, most: 1, by: 100, wash: WASH.vermilion },
  { of: (f) => f.notice, most: 280, by: 1, wash: WASH.viridian },
  { of: (f) => f.margin, most: 60, by: 1, wash: WASH.storm },
  { of: (f) => f.flee, most: 60, by: 1, wash: WASH.ochre },
];

/** The card's width, at the drawn size. */
export const CARD = 264;

/** The fleet card for `f`, its top left at (x, y), CARD across and about 270 down. */
export function fleetCard(x: number, y: number, f: Fleet) {
  // its head: the type, the most common persona, and the two who stand out
  const hy = y + 24;
  let s =
    paperDisc(x + 22, hy, 21) +
    typeMark(f.type, x + 22, hy, 30) +
    paperDisc(x + 70, hy, 21, INK.gold) +
    `<circle cx="${x + 70}" cy="${hy}" r="16" fill="${GILT}"/>` +
    personaMark(f.common, x + 70, hy, 24);
  for (const [k, who] of [f.sharpest, f.reckless].entries()) {
    const sx = x + 100 + k * 84;
    s +=
      slip(sx, hy - 19, 78, 38, { flat: true }) +
      traitMark(k, sx + 14, hy, 18) +
      personaMark(who.persona, sx + 32, hy, 16) +
      figure(sx + 44, hy, `#${who.id}`, 17, { anchor: 'start' });
  }
  // a bar a persona
  const base = y + 118,
    tallest = Math.max(1, ...f.counts);
  s += `<path d="M${x + 2} ${base}H${x + CARD - 2}" stroke="${INK.iron}" stroke-width="1"/>`;
  f.counts.forEach((n, i) => {
    const cx = x + 22 + i * 44,
      h = (44 * n) / tallest,
      common = i === f.common;
    s +=
      `<rect x="${cx - 11}" y="${r2(base - h)}" width="22" height="${r2(h)}" fill="${common ? WASH.gold : WASH.ochre}" fill-opacity="${common ? 0.95 : 0.55}" stroke="${INK.iron}" stroke-width=".9"/>` +
      figure(cx, base - h - 9, n, 15, { fill: common ? INK.gold : INK.iron }) +
      personaMark(i, cx, base + 17, 22);
  });
  // a row a trait
  TRAITS.forEach((t, i) => {
    const ty = y + 162 + i * 24,
      { mean, spread } = t.of(f),
      bx = x + 30,
      bw = 140,
      on = (v: number) => bx + (bw * Math.min(Math.max(v, 0), t.most)) / t.most;
    s +=
      traitMark(i, x + 12, ty, 20) +
      `<path d="M${bx} ${ty}H${bx + bw}M${bx} ${ty - 4}v8M${bx + bw} ${ty - 4}v8" stroke="${INK.iron}" stroke-width=".8"/>` +
      `<rect x="${r2(on(mean - spread))}" y="${ty - 4}" width="${r2(on(mean + spread) - on(mean - spread))}" height="8" fill="${t.wash}" fill-opacity=".7"/>` +
      `<path d="M${r2(on(mean))} ${ty - 7}v14" stroke="${INK.iron}" stroke-width="2.2" stroke-linecap="round"/>` +
      figure(x + 206, ty, Math.round(mean * t.by), 18, { anchor: 'end' }) +
      figure(x + 212, ty + 1, `±${Math.round(spread * t.by)}`, 13, {
        anchor: 'start',
        fill: INK.sepia,
      });
  });
  return s;
}
