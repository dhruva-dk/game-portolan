import { FAINT, SIZE, SPACE, TYPE } from './house.ts';
import { INK, figure, glyph, roughRect, slip } from './ink.ts';
import { portrait, uncle } from './gull.ts';
import { ROLE, STAT, least, type StatName } from './lexicon.ts';
import { STATS, rangeBar } from './rangebar.ts';
import { statRose } from './rose.ts';
import { fitted, label, measured, word } from './word.ts';

export type Span = { lo: number; hi: number };

export type CardRole = 'driver' | 'designer' | 'mechanic';

export type CardFace = {
  who: 'person' | 'uncle';
  person: number | null;
  name: string;
  portrait: number | null;
  role: CardRole;
  age: number | null;
  stars: Span;
  stats: { stat: StatName; value: Span }[];
  wage: Span | null;
  racesLeft: number | null;
};

export const CARD = { w: 196, h: 300 } as const;
export const LARGE = { w: 624, h: 300 } as const;

const PIPS = { row: 10, most: 30, r: 2.4, rise: 7.4, step: 8, split: 5 };
const STARS = 5;
const r2 = (n: number) => Math.round(n * 100) / 100;
const at = (x: number, y: number, inner: string) =>
  `<g transform="translate(${r2(x)} ${r2(y)})">${inner}</g>`;

export function paper(w: number, h: number, seed = 3, empty = false) {
  if (empty)
    return (
      `<path d="${roughRect(1, 1, w - 2, h - 2, seed)}" fill="rgba(241,228,200,.38)" stroke="${INK.iron}" stroke-width="1.1" stroke-dasharray="5 4" opacity=".75"/>` +
      `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".3"/>`
    );
  return (
    `<path d="${roughRect(1, 1, w - 2, h - 2, seed)}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.1" filter="url(#sh)"/>` +
    `<rect x="${SIZE.rule + 1}" y="${SIZE.rule + 1}" width="${w - 2 * SIZE.rule - 2}" height="${h - 2 * SIZE.rule - 2}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".5"/>`
  );
}

export function framed(face: CardFace, x: number, y: number, size: number) {
  const pad = Math.max(3, size * 0.05);
  return (
    slip(x - pad, y - pad, size + 2 * pad, size + 2 * pad, {
      flat: true,
      rule: false,
    }) +
    at(
      x,
      y,
      face.portrait === null ? uncle(size) : portrait(face.portrait, size)
    )
  );
}

export function starRow(
  cx: number,
  cy: number,
  span: Span,
  size: number = least('star'),
  step: number = size * 1.06
) {
  let s = '';
  const left = cx - (step * (STARS - 1)) / 2;
  for (let i = 0; i < STARS; i++) {
    const x = left + i * step;
    if (span.lo >= i + 1) s += glyph('star', x, cy, size);
    else if (span.lo >= i + 0.5)
      s +=
        glyph('star', x, cy, size, {
          opacity: span.hi >= i + 1 ? 0.55 : FAINT,
        }) + glyph('starHalf', x, cy, size);
    else if (span.hi >= i + 0.5)
      s += glyph(span.hi >= i + 1 ? 'star' : 'starHalf', x, cy, size, {
        opacity: 0.55,
      });
    else s += glyph('star', x, cy, size, { opacity: FAINT * 0.7 });
  }
  return s;
}

export function pips(x: number, y: number, n: number, w: number) {
  const step = Math.min(PIPS.step, w / (PIPS.row + 1));
  let s = '';
  for (let i = 0; i < Math.min(n, PIPS.most); i++) {
    const col = i % PIPS.row,
      row = Math.floor(i / PIPS.row);
    const px =
      x + PIPS.r + step * col + (col >= PIPS.split ? PIPS.split - 1 : 0);
    s += `<circle cx="${r2(px)}" cy="${r2(y + row * PIPS.rise)}" r="${PIPS.r}" fill="${INK.iron}"/>`;
  }
  return s;
}

const money = (span: Span) =>
  span.lo === span.hi ? `${span.lo}` : `${span.lo}–${span.hi}`;

function wageRow(x: number, y: number, w: number, span: Span) {
  const coin = least('coin'),
    size = TYPE.name + 2,
    text = money(span);
  const wide = measured(text, size, { italic: true, weight: 600 });
  return (
    word(x, y, 'Wage', TYPE.word, { anchor: 'start' }) +
    figure(x + w, y, text, size, { anchor: 'end', weight: 600 }) +
    glyph('coin', x + w - wide - 3 - coin / 2, y, coin)
  );
}

function roleRow(x: number, y: number, role: CardRole) {
  const g = least('role.driver');
  return (
    glyph(ROLE[role].glyph, x + g / 2, y, g) +
    word(x + g + 4, y + 0.5, ROLE[role].word, TYPE.word, { anchor: 'start' })
  );
}

const rosePoints = (face: CardFace) =>
  face.stats.map((s) => ({
    glyph: STAT[s.stat].glyph,
    lo: s.value.lo,
    hi: s.value.hi,
  }));

export function cardFront(face: CardFace, seed = 3) {
  const { w, h } = CARD,
    pad = SPACE.pad,
    shot = 64;
  const right = pad + shot + 10,
    room = w - right - pad;
  const nameSize = fitted(face.name, TYPE.name + 1, room);
  let s = paper(w, h, seed);
  s += framed(face, pad + 1, pad + 1, shot);
  s += label(right, pad + 10, face.name, nameSize, { anchor: 'start' });
  s += roleRow(right - 2, pad + 34, face.role);
  if (face.age !== null)
    s +=
      word(right, pad + 58, 'Age', TYPE.word, {
        anchor: 'start',
        opacity: 0.8,
      }) +
      figure(right + 28, pad + 58, face.age, TYPE.name + 1, {
        anchor: 'start',
        weight: 600,
      });
  s += starRow(w / 2, 96, face.stars);
  s += statRose(w / 2, 178, 42, rosePoints(face), {
    glyph: least('stat.helm'),
  });
  if (face.wage) s += wageRow(pad + 2, 257, w - 2 * pad - 4, face.wage);
  if (face.racesLeft !== null)
    s += pips(pad + 2, 273, face.racesLeft, w - 2 * pad);
  return s;
}

export function cardEmpty(role: CardRole, seed = 3) {
  const { w, h } = CARD,
    g = 46;
  return (
    paper(w, h, seed, true) +
    glyph(ROLE[role].glyph, w / 2, h / 2 - 16, g, { opacity: 0.55 }) +
    word(w / 2, h / 2 + 22, ROLE[role].word, TYPE.name, { opacity: 0.6 })
  );
}

export type Actions = { x: number; y: number; w: number; h: number };

export function cardLarge(
  face: CardFace,
  seed = 5
): { svg: string; actions: Actions } {
  const { w, h } = LARGE,
    pad = SPACE.pad + 4,
    shot = 96;
  let s = paper(w, h, seed);
  s += framed(face, pad + 2, pad + 2, shot);
  const colW = 176;
  const nameSize = fitted(face.name, TYPE.name + 4, colW - 4);
  s += label(pad, pad + shot + 22, face.name, nameSize, { anchor: 'start' });
  s += roleRow(pad - 2, pad + shot + 48, face.role);
  if (face.age !== null)
    s +=
      word(pad, pad + shot + 74, 'Age', TYPE.word, {
        anchor: 'start',
        opacity: 0.8,
      }) +
      figure(pad + 28, pad + shot + 74, face.age, TYPE.name + 2, {
        anchor: 'start',
        weight: 600,
      });
  s += starRow(
    pad + 2 + 2.5 * least('star') * 1.06 - least('star') * 0.53,
    pad + shot + 98,
    face.stars
  );
  if (face.wage) s += wageRow(pad, pad + shot + 128, colW - 16, face.wage);
  if (face.racesLeft !== null)
    s += pips(pad + 2, pad + shot + 150, face.racesLeft, colW - 8);
  const roseX = 296;
  s += `<path d="M${colW + 20} ${pad}V${h - pad}M${w - 236} ${pad}V${h - pad}" stroke="${INK.iron}" stroke-width=".6" opacity=".3"/>`;
  s += statRose(roseX, h / 2 - 2, 60, rosePoints(face), {
    glyph: least('stat.helm'),
    numerals: true,
  });
  const rowsX = w - 222,
    rowsW = 206,
    n = face.stats.length,
    top = pad + 4,
    rowH = Math.min(34, (h - 2 * pad - 52) / n);
  face.stats.forEach((st, i) => {
    const cy = top + rowH * (i + 0.5),
      g = least('stat.helm');
    const value =
      st.value.lo === st.value.hi
        ? `${st.value.lo}`
        : `${st.value.lo}–${st.value.hi}`;
    s +=
      glyph(STAT[st.stat].glyph, rowsX + g / 2, cy, g) +
      word(rowsX + g + 6, cy - 6, STAT[st.stat].word, TYPE.word, {
        anchor: 'start',
      }) +
      rangeBar(rowsX + g + 6, cy + 7, rowsW - g - 40, 6, {
        scale: STATS,
        lo: st.value.lo,
        hi: st.value.hi,
        notches: 4,
      }) +
      figure(rowsX + rowsW, cy, value, TYPE.name + 3, {
        anchor: 'end',
        weight: 600,
      });
  });
  return { svg: s, actions: { x: rowsX, y: h - pad - 40, w: rowsW, h: 40 } };
}
