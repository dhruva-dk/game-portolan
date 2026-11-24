import type { Fleet, Spread } from '../play/player.ts';
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
  uid,
} from './ink.ts';
import { badge, ram, rose } from './marks.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

const grid = (x: number, y: number, s: number, body: string) =>
  `<g transform="translate(${r2(x)} ${r2(y)}) scale(${r2(s / 24)})" stroke="${INK.iron}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;

const coin = (x: number, y: number) =>
  `<circle cx="${x}" cy="${y}" r="8" fill="${WASH.gold}" stroke-width="1.4"/>` +
  `<circle cx="${x}" cy="${y}" r="5.2" fill="none" stroke-width=".6"/>` +
  `<path d="M${x} ${y - 3}V${y + 3}M${x - 3} ${y}H${x + 3}" stroke-width="1.2"/>`;

function personaMark(i: number, x: number, y: number, s: number) {
  if (i === 5) return ram(x, y, s / 30);
  const body = [
    `<path d="M-10 -5Q-1 -17 10 -6" fill="none" stroke="${INK.sepia}" stroke-width="1.3"/>` +
      `<path d="M-12 -6Q-11 7 2 7Q8 7 11 1L15 -2L9 -8L8 -3Q5 3 1 3Q-8 3 -9 -6Z" fill="${WASH.gold}" stroke-width="1.3"/>` +
      `<path d="M-13.5 -6.5H-7.5" stroke-width="2.4"/><path d="M-6.4 2.2L-7.8 5.6M4.4 3.2L5.8 6.4" stroke-width="1"/>`,
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

const piece = (x: number, y: number) =>
  `<circle cx="${x}" cy="${y}" r="3.6" fill="${WASH.gold}" stroke-width="1"/>` +
  `<circle cx="${x}" cy="${y}" r="2" fill="none" stroke-width=".5"/>`;

function typeMark(i: number, x: number, y: number, s: number) {
  if (i === 0) return rose(x, y, s * 0.5);
  if (i === 3)
    return grid(
      x,
      y,
      s,
      `<path d="M-10 -12H10V-2C10 6 5 10 0 13C-5 10 -10 6 -10 -2Z" fill="${WASH.azure}" stroke="none"/>` +
        `<path d="M0 -12V12.4M-10 -3H10" stroke="${WASH.gold}" stroke-width="3.4" stroke-linecap="butt"/>` +
        `<path d="M-10 -12H10V-2C10 6 5 10 0 13C-5 10 -10 6 -10 -2Z" fill="none" stroke-width="1.6"/>`
    );
  if (i === 2) {
    let heap = `<path d="M-14 11.5H14" stroke-width="1"/>`;
    for (const [y0, xs] of [
      [-10, [0]],
      [-4, [-3, 3]],
      [2, [-6, 0, 6]],
      [8, [-9, -3, 3, 9]],
    ] as const)
      for (const x0 of xs) heap += piece(x0, y0);
    return grid(x, y, s, heap);
  }
  const blade = (side: number) =>
    `<path d="M${-7 * side} 7Q${2 * side} 0 ${10 * side} -12" fill="none" stroke-width="3.6"/>` +
    `<path d="M${-7 * side} 7Q${2 * side} 0 ${10 * side} -12" fill="none" stroke="${CUT}" stroke-width="1.4"/>` +
    `<path d="M${-10 * side} 3.5L${-4 * side} 10" stroke-width="2.6"/>` +
    `<path d="M${-7 * side} 7L${-11 * side} 11" stroke="${INK.sepia}" stroke-width="2.6"/>` +
    `<circle cx="${-11.6 * side}" cy="11.6" r="1.7" fill="${WASH.gold}" stroke-width=".8"/>`;
  return grid(
    x,
    y,
    s,
    blade(1) +
      blade(-1) +
      `<path d="M0 -1Q2.6 3 0 5Q-2.6 3 0 -1Z" fill="${INK.rubric}" stroke="none"/>`
  );
}

const starPath = (x: number, y: number, r: number) =>
  Array.from({ length: 10 }, (_, k) => {
    const a = (k * Math.PI) / 5 - Math.PI / 2,
      d = k % 2 ? r * 0.45 : r;
    return `${k ? 'L' : 'M'}${r2(x + d * Math.cos(a))} ${r2(y + d * Math.sin(a))}`;
  }).join('') + 'Z';

function stars(x: number, y: number, n: number, r: number, gap: number) {
  let s = '';
  for (let k = 0; k < 5; k++) {
    const cx = x + k * gap,
      part = Math.min(Math.max(n - k, 0), 1),
      d = starPath(cx, y, r);
    if (part >= 1) s += `<path d="${d}" fill="${WASH.gold}"/>`;
    else if (part > 0) {
      const clip = uid('star');
      s +=
        `<clipPath id="${clip}"><rect x="${r2(cx - r)}" y="${r2(y - r)}" width="${r2(2 * r * part)}" height="${r2(2 * r)}"/></clipPath>` +
        `<path d="${d}" fill="${WASH.gold}" clip-path="url(#${clip})"/>`;
    }
    s += `<path d="${d}" fill="none" stroke="${INK.iron}" stroke-width="1.1" stroke-linejoin="round"/>`;
  }
  return s;
}

const TRAIT_MARKS = [
  `<path d="${starPath(0, 1, 11)}" fill="${WASH.gold}" stroke-width="1.3"/>`,
  `<path d="M0 11C-7 11 -9 4 -5 -3C-4 0 -2 1 -1 0C-3 -5 0 -9 2 -12C3 -6 8 -3 7 3C6 8 3 11 0 11Z" fill="${WASH.vermilion}" stroke-width="1.2"/>` +
    `<path d="M0 10C-3 10 -4 6 -2 3C0 5 1 3 1 1C3 3 4 6 2 9Z" fill="${WASH.gold}" stroke="none"/>`,
  `<path d="M-11 0Q0 -10 11 0Q0 10 -11 0Z" fill="${PAPER}" stroke-width="1.3"/>` +
    `<circle r="4" fill="${WASH.azure}" stroke-width=".9"/><circle r="1.5" fill="${INK.iron}" stroke="none"/>`,
  null,
  `<path d="M-5 2H12L8 9H-3Z" fill="url(#h-iron)" stroke-width="1.2"/><path d="M3 2V-11" stroke-width="1.4"/>` +
    `<path d="M3 -10L10 -3L3 -1Z" fill="${CUT}" stroke-width="1"/>` +
    `<path d="M-8 -3h-4M-7 1h-5M-8 5h-4" stroke="${WASH.ultramarine}" stroke-width="1.4"/>`,
] as const;
const traitMark = (i: number, x: number, y: number, s: number) =>
  i === 3
    ? glyph('hud.storm', x, y, s, { ink: 'storm' })
    : grid(x, y, s, TRAIT_MARKS[i] ?? '');

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

export const CARD = 264;

export function fleetCard(x: number, y: number, f: Fleet, traits = false) {
  const l = x - 4,
    t = y - 8,
    r = x + CARD + 4,
    b = y + 236,
    ear = traits ? 0 : 16;
  let s =
    `<path d="M${l} ${t}H${r}V${b - ear}L${r - ear} ${b}H${l}Z" fill="transparent" stroke="${INK.iron}" stroke-width=".7" stroke-opacity=".45"/>` +
    (ear
      ? `<path d="M${r} ${b - ear}L${r - ear} ${b}L${r - ear + 3} ${b - ear + 3}Z" fill="${PAPER}" stroke="${INK.iron}" stroke-width=".8" stroke-linejoin="round"/>`
      : '');
  const hy = y + 24;
  s +=
    paperDisc(x + 22, hy, 21) +
    typeMark(f.type, x + 22, hy, 30) +
    figure(x + 22, hy + 33, f.name, 13, { fill: INK.sepia }) +
    paperDisc(x + 70, hy, 21, INK.gold) +
    `<circle cx="${x + 70}" cy="${hy}" r="16" fill="${GILT}"/>` +
    personaMark(f.common, x + 70, hy, 24);
  for (const [k, who] of [f.sharpest, f.reckless].entries()) {
    const sx = x + 100 + k * 84;
    s +=
      slip(sx, hy - 19, 78, 38, { flat: true }) +
      badge(sx + 19, hy - 2, traitMark(k, sx + 19, hy - 2, 13)) +
      figure(sx + 38, hy, `#${who.id}`, 17, { anchor: 'start' });
  }
  if (!traits) {
    const base = y + 198,
      tallest = Math.max(1, ...f.counts);
    s += `<path d="M${x + 2} ${base}H${x + CARD - 2}" stroke="${INK.iron}" stroke-width="1"/>`;
    f.counts.forEach((n, i) => {
      const cx = x + 22 + i * 44,
        h = (64 * n) / tallest,
        common = i === f.common;
      s +=
        `<rect x="${cx - 11}" y="${r2(base - h)}" width="22" height="${r2(h)}" fill="${common ? WASH.gold : WASH.ochre}" fill-opacity="${common ? 0.95 : 0.55}" stroke="${INK.iron}" stroke-width=".9"/>` +
        figure(cx, base - h - 9, n, 15, {
          fill: common ? INK.gold : INK.iron,
        }) +
        personaMark(i, cx, base + 17, 22);
    });
    return s;
  }
  TRAITS.forEach((t, i) => {
    const ty = y + 120 + i * 26,
      { mean, spread } = t.of(f),
      bx = x + 30,
      bw = 140,
      on = (v: number) => bx + (bw * Math.min(Math.max(v, 0), t.most)) / t.most;
    if (i === 0) {
      s +=
        traitMark(i, x + 12, ty, 20) +
        stars(bx + 14, ty, mean * 5, 11, 28) +
        figure(x + 206, ty, (mean * 5).toFixed(1), 18, { anchor: 'end' }) +
        figure(x + 212, ty + 1, `±${(spread * 5).toFixed(1)}`, 13, {
          anchor: 'start',
          fill: INK.sepia,
        });
      return;
    }
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
