import { FAINT, SIZE, SPACE, TYPE } from './house.ts';
import { INK, figure, glyph, roughRect, slip } from './ink.ts';
import { portrait, uncle } from './gull.ts';
import { ROLE, STAT, least, type StatName } from './lexicon.ts';
import { STATS, rangeBar } from './rangebar.ts';
import { roseReach, statRose } from './rose.ts';
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
    return `<path d="${roughRect(1, 1, w - 2, h - 2, seed)}" fill="rgba(241,228,200,.38)" stroke="${INK.iron}" stroke-width="1.1" stroke-dasharray="5 4" opacity=".75"/>`;
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

const grouped = (n: number) => n.toLocaleString('en-US');

const money = (span: Span) =>
  span.lo === span.hi
    ? grouped(span.lo)
    : `${grouped(span.lo)}–${grouped(span.hi)}`;

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
  const low = face.wage === null && face.racesLeft === null ? 1 : 0;
  s += starRow(w / 2, 96 + low * 10, face.stars);
  s += statRose(w / 2, 178 + low * 26, 42 + low * 6, rosePoints(face), {
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
    shot = 80,
    frame = shot * 0.05,
    colW = 176,
    left = pad + 2;
  const beside = left + shot + 2 * frame + 10,
    lines = face.age === null ? [26, 56] : [14, 40, 66];
  const block =
    24 +
    shot +
    2 * frame +
    (face.wage ? 34 : 0) +
    (face.racesLeft === null
      ? 0
      : 6 +
        PIPS.rise * Math.ceil(Math.min(face.racesLeft, PIPS.most) / PIPS.row));
  const top = Math.round((h - block) / 2),
    shotTop = top + 24 + frame;
  let s = paper(w, h, seed);
  const nameSize = fitted(face.name, TYPE.name + 4, colW - 4);
  s += label(left, top + 8, face.name, nameSize, { anchor: 'start' });
  s += framed(face, left + frame, shotTop, shot);
  s += roleRow(beside, shotTop + lines[0], face.role);
  if (face.age !== null)
    s +=
      word(beside, shotTop + lines[1], 'Age', TYPE.word, {
        anchor: 'start',
        opacity: 0.8,
      }) +
      figure(beside + 28, shotTop + lines[1], face.age, TYPE.name + 2, {
        anchor: 'start',
        weight: 600,
      });
  const star = least('star');
  s += starRow(
    beside + star / 2 + 2 * star * 1.06,
    shotTop + lines[lines.length - 1],
    face.stars
  );
  const below = shotTop + shot + frame + 22;
  if (face.wage) s += wageRow(left, below, colW - 4, face.wage);
  if (face.racesLeft !== null)
    s += pips(left, below + 22, face.racesLeft, colW - 8);
  const ruleA = colW + 20,
    ruleB = w - 236,
    g = least('stat.helm'),
    n = face.stats.length;
  const fits = (R: number) => {
    const r = roseReach(n, R, g, true);
    return (
      r.left + r.right + 2 * SPACE.gap <= ruleB - ruleA &&
      Math.max(r.up, r.down) <= h / 2 - SIZE.rule - 1 - SPACE.gap
    );
  };
  let R = 60;
  while (R > 30 && !fits(R)) R -= 1;
  const reach = roseReach(n, R, g, true),
    roseX = (ruleA + ruleB) / 2 + (reach.left - reach.right) / 2,
    roseY = h / 2 + (reach.up - reach.down) / 2;
  s += `<path d="M${ruleA} ${pad}V${h - pad}M${ruleB} ${pad}V${h - pad}" stroke="${INK.iron}" stroke-width=".6" opacity=".3"/>`;
  s += statRose(roseX, roseY, R, rosePoints(face), {
    glyph: g,
    numerals: true,
  });
  const rowsX = w - 222,
    rowsW = 206,
    acting = face.who === 'person',
    rowH = Math.min(acting ? 34 : 38, (h - 2 * pad - (acting ? 52 : 0)) / n),
    first = acting ? pad + 4 : (h - rowH * n) / 2;
  face.stats.forEach((st, i) => {
    const cy = first + rowH * (i + 0.5);
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
