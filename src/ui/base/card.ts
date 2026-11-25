import type { Livery } from '../../world/livery.ts';
import { emblemAt, liveryColors } from './emblem.ts';
import { GLYPHS } from './glyphs.ts';
import { FAINT, SIZE, SPACE, TYPE } from './house.ts';
import { INK, PAPER, WASH, figure, glyph, roughRect, slip } from './ink.ts';
import { portrait, uncle } from './gull.ts';
import { ROLE, STAT, least, type StatName } from './lexicon.ts';
import { STATS, rangeBar } from './rangebar.ts';
import { roseReach, roseShape, statRose } from './rose.ts';
import { fitted, label, measured, word } from './word.ts';
import { grouped } from './grouped.ts';

export type Span = { lo: number; hi: number };

export type CardRole = 'driver' | 'designer' | 'mechanic' | 'owner';

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

export type Candidacy = {
  pinned: boolean;
  rival: { emblem: number; livery: Livery; clause: number } | null;
  holder: readonly number[] | null;
};

export const CARD = { w: 196, h: 300 } as const;
export const CANDIDATE = { w: 196, h: 252 } as const;
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

export function framed(
  face: Pick<CardFace, 'portrait'>,
  x: number,
  y: number,
  size: number
) {
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

const STAR = GLYPHS.star[0]?.d ?? '',
  HALF = GLYPHS.starHalf[0]?.d ?? '';

function starSlot(x: number, cy: number, size: number, lo: number, hi: number) {
  const solidL = lo >= 0.5,
    solidR = lo >= 1,
    hatchL = !solidL && hi >= 0.5,
    hatchR = !solidR && hi >= 1;
  if (solidR) return glyph('star', x, cy, size);
  if (!solidL && !hatchL)
    return glyph('star', x, cy, size, { opacity: FAINT * 0.7 });
  const k = size / 24,
    mirror = ' transform="translate(24 0) scale(-1 1)"';
  let inner = '';
  if (hatchL && hatchR) inner += `<path d="${STAR}" fill="url(#h-open)"/>`;
  else {
    if (hatchL) inner += `<path d="${HALF}" fill="url(#h-open)"/>`;
    if (hatchR) inner += `<path d="${HALF}" fill="url(#h-open)"${mirror}/>`;
  }
  const edge = hatchR || hatchL ? 0.9 : FAINT;
  return (
    `<g transform="translate(${r2(x - size / 2)} ${r2(cy - size / 2)}) scale(${r2(k)})">${inner}` +
    `<path d="${STAR}" fill="none" stroke="${INK.iron}" stroke-width="${r2(1.3 / k)}" stroke-linejoin="round" opacity="${edge}"/></g>` +
    (solidL ? glyph('starHalf', x, cy, size) : '')
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
  for (let i = 0; i < STARS; i++)
    s += starSlot(left + i * step, cy, size, span.lo - i, span.hi - i);
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

const money = (span: Span) => {
  const lo = Math.round(span.lo / 10) * 10,
    hi = Math.round(span.hi / 10) * 10;
  return lo === hi ? grouped(lo) : `${grouped(lo)}–${grouped(hi)}`;
};

const clauseText = (clause: number) => grouped(clause);

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

function contractRow(x: number, y: number, w: number, races: number) {
  const flag = least('flag'),
    size = TYPE.name + 2,
    text = `${races}`;
  const wide = measured(text, size, { italic: true, weight: 600 });
  return (
    word(x, y, 'Contract', TYPE.word, { anchor: 'start' }) +
    figure(x + w, y, text, size, { anchor: 'end', weight: 600 }) +
    glyph('flag', x + w - wide - 3 - flag / 2, y, flag)
  );
}

function clauseRow(
  x: number,
  y: number,
  w: number,
  rival: NonNullable<Candidacy['rival']>
) {
  const coin = least('coin'),
    mark = 18,
    size = TYPE.name + 2,
    text = clauseText(rival.clause);
  const wide = measured(text, size, { italic: true, weight: 600 });
  return (
    emblemAt(rival.emblem, liveryColors(rival.livery), x + mark / 2, y, mark) +
    word(x + mark + SPACE.hair, y, 'Clause', TYPE.word, { anchor: 'start' }) +
    figure(x + w, y, text, size, { anchor: 'end', weight: 600 }) +
    glyph('coin', x + w - wide - 3 - coin / 2, y, coin)
  );
}

const PIN = { size: 26, tilt: 14, inset: 13 } as const;

const pinAt = (x: number, y: number) =>
  `<g id="pin"><g transform="rotate(${PIN.tilt} ${x} ${y})">${glyph('pin', x, y, PIN.size)}</g></g>`;

const versus = (lo: number, hi: number, held: number | undefined) =>
  held === undefined
    ? undefined
    : Math.round(lo) > held
      ? INK.blue
      : Math.round(hi) < held
        ? INK.rubric
        : undefined;

type Box = { x0: number; y0: number; x1: number; y1: number };

function roseFit(n: number, box: Box, numerals: boolean, widest: string) {
  const g = least('stat.helm');
  let R = Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2;
  let reach = roseReach(n, R, g, numerals, widest);
  const fits = () =>
    reach.left + reach.right <= box.x1 - box.x0 &&
    reach.up + reach.down <= box.y1 - box.y0;
  while (R > 12 && !fits()) reach = roseReach(n, --R, g, numerals, widest);
  return {
    cx: (box.x0 + box.x1) / 2 + (reach.left - reach.right) / 2,
    cy: (box.y0 + box.y1) / 2 + (reach.up - reach.down) / 2,
    R,
    g,
  };
}

function roseIn(
  face: CardFace,
  box: Box,
  numerals: boolean,
  holder: readonly number[] | null = null
) {
  const ranged = face.stats.some((st) => st.value.lo !== st.value.hi),
    { cx, cy, R, g } = roseFit(
      face.stats.length,
      box,
      numerals,
      ranged ? '20–20' : '20'
    );
  return statRose(cx, cy, R, rosePoints(face, holder), {
    glyph: g,
    numerals,
    compare: holder,
  });
}

function roleRow(x: number, y: number, role: CardRole) {
  const g = least('role.driver');
  return (
    glyph(ROLE[role].glyph, x + g / 2, y, g) +
    word(x + g + 4, y + 0.5, ROLE[role].word, TYPE.word, { anchor: 'start' })
  );
}

const rosePoints = (face: CardFace, holder: readonly number[] | null) =>
  face.stats.map((s, i) => ({
    glyph: STAT[s.stat].glyph,
    lo: s.value.lo,
    hi: s.value.hi,
    ink: versus(s.value.lo, s.value.hi, holder?.[i]),
  }));

function header(face: CardFace, w: number, pinned: boolean) {
  const pad = SPACE.pad,
    shot = 64,
    right = pad + shot + 10,
    room = w - right - pad - (pinned ? PIN.inset : 0),
    nameSize = fitted(face.name, TYPE.name + 1, room);
  let s = framed(face, pad + 1, pad + 1, shot);
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
  return s + starRow(w / 2, 94, face.stars);
}

const roseTop = 94 + least('star') / 2 + SPACE.hair;

export function cardFront(face: CardFace, seed = 3) {
  const { w, h } = CARD,
    pad = SPACE.pad;
  let s = paper(w, h, seed) + header(face, w, false);
  const rows = (face.wage ? 1 : 0) + (face.racesLeft === null ? 0 : 1),
    floor = rows === 0 ? h - pad : 216 + (2 - rows) * 21;
  s += roseIn(face, { x0: pad, y0: roseTop, x1: w - pad, y1: floor }, false);
  let y = floor + 14;
  if (face.wage) {
    s += wageRow(pad + 2, y, w - 2 * pad - 4, face.wage);
    y += 21;
  }
  if (face.racesLeft !== null) {
    s += contractRow(pad + 2, y, w - 2 * pad - 4, face.racesLeft);
    s += pips(pad + 2, y + 17, face.racesLeft, w - 2 * pad);
  }
  return s;
}

export function cardCandidate(face: CardFace, c: Candidacy, seed = 3) {
  const { w, h } = CANDIDATE,
    pad = SPACE.pad,
    line = 21,
    rows = (face.wage ? 1 : 0) + (c.rival ? 1 : 0),
    last = h - pad - 9,
    top = last - (rows - 1) * line;
  let s = paper(w, h, seed) + header(face, w, c.pinned);
  s += roseIn(
    face,
    { x0: pad, y0: roseTop, x1: w - pad, y1: rows ? top - 14 : h - pad },
    false,
    c.holder
  );
  let y = top;
  if (face.wage) {
    s += wageRow(pad + 2, y, w - 2 * pad - 4, face.wage);
    y += line;
  }
  if (c.rival) s += clauseRow(pad + 2, y, w - 2 * pad - 4, c.rival);
  if (c.pinned) s += pinAt(w - PIN.inset, 6);
  return s;
}

export function cardEmpty(
  role: CardRole,
  seed = 3,
  size: { w: number; h: number } = CARD,
  worded = true
) {
  const { w, h } = size,
    g = 46;
  return (
    paper(w, h, seed, true) +
    glyph(ROLE[role].glyph, w / 2, h / 2 - (worded ? 16 : 0), g, {
      opacity: 0.55,
    }) +
    (worded
      ? word(w / 2, h / 2 + 22, ROLE[role].word, TYPE.name, { opacity: 0.6 })
      : '')
  );
}

export type Actions = { x: number; y: number; w: number; h: number };

export function cardLarge(
  face: CardFace,
  seed = 5,
  c: Candidacy | null = null
): { svg: string; actions: Actions } {
  const { w, h } = LARGE,
    pad = SPACE.pad + 4,
    shot = 72,
    frame = shot * 0.05,
    colW = 168,
    left = pad + 2,
    rival = c?.rival ?? null,
    holder = c?.holder ?? null;
  const beside = left + shot + 2 * frame + SPACE.gap,
    lines = face.age === null ? [22, 50] : [12, 36, 60];
  const block =
    24 +
    shot +
    2 * frame +
    (face.wage ? 34 : 0) +
    (rival ? 22 : 0) +
    (face.racesLeft === null
      ? 0
      : 28 +
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
  if (rival) s += clauseRow(left, below + 22, colW - 4, rival);
  if (face.racesLeft !== null)
    s +=
      contractRow(left, below + 22, colW - 4, face.racesLeft) +
      pips(left, below + 40, face.racesLeft, colW - 8);
  const strip = c !== null,
    ruleA = colW + 20,
    ruleB = w - 216,
    n = face.stats.length,
    g = least('stat.helm'),
    inset = SIZE.rule + 1 + SPACE.gap,
    acts = { h: 40, room: 48 },
    floor = strip ? h - pad - acts.room : h - pad;
  s += `<path d="M${ruleA} ${pad}V${floor}M${ruleB} ${pad}V${floor}" stroke="${INK.iron}" stroke-width=".6" opacity=".3"/>`;
  s += roseIn(
    face,
    {
      x0: ruleA + SPACE.gap,
      y0: inset,
      x1: ruleB - SPACE.gap,
      y1: strip ? floor : h - inset,
    },
    true,
    holder
  );
  const rowsX = w - 202,
    rowsW = 186,
    acting = face.who === 'person',
    reserve = strip ? acts.room : acting ? 52 : 0,
    rowH = Math.min(acting ? 34 : 38, (h - 2 * pad - reserve) / n),
    first = acting ? pad + 4 : (h - rowH * n) / 2,
    numerals = face.stats.some((st) => st.value.lo !== st.value.hi) ? 54 : 40;
  face.stats.forEach((st, i) => {
    const cy = first + rowH * (i + 0.5),
      lo = Math.round(st.value.lo),
      hi = Math.round(st.value.hi);
    s +=
      glyph(STAT[st.stat].glyph, rowsX + g / 2, cy, g) +
      word(rowsX + g + 6, cy - 6, STAT[st.stat].word, TYPE.word, {
        anchor: 'start',
      }) +
      rangeBar(rowsX + g + 6, cy + 7, rowsW - g - numerals, 6, {
        scale: STATS,
        lo: st.value.lo,
        hi: st.value.hi,
        tick: holder?.[i] ?? null,
        notches: 4,
      }) +
      figure(
        rowsX + rowsW,
        cy,
        lo === hi ? `${lo}` : `${lo}–${hi}`,
        TYPE.name + 3,
        {
          anchor: 'end',
          weight: 600,
          fill: versus(st.value.lo, st.value.hi, holder?.[i]),
        }
      );
  });
  if (c?.pinned) s += pinAt(w - PIN.inset - 2, 6);
  const actions = strip
    ? {
        x: ruleA + SPACE.gap,
        y: h - pad - acts.h,
        w: w - pad - ruleA - SPACE.gap,
        h: acts.h,
      }
    : { x: rowsX, y: h - pad - 40, w: rowsW, h: 40 };
  return { svg: s, actions };
}

export type SeasonFace = {
  name: string;
  role: Exclude<CardRole, 'owner'>;
  portrait: number;
  age: { before: number; after: number };
  stars: number;
  stats: { stat: StatName; before: number; after: number }[];
  racesLeft: number;
};

export type SeasonPart =
  | 'was'
  | 'now'
  | 'age'
  | 'aged'
  | 'stat'
  | 'change'
  | 'spent';

export type SeasonCue = (part: SeasonPart, i: number) => string;

export const SEASON = { w: 196, h: 356 } as const;

const CELL = {
  top: 212,
  h: 25,
  bar: 6,
  figure: 13,
  gap: 8,
  rose: 78,
  flag: 318,
} as const;

const tagged = (svg: string, id: string) =>
  svg.replace('<text', `<text id="${id}"`);

const change = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

function seasonBar(v: number, w: number) {
  return r2(Math.max(0, (w * Math.min(STATS.most, v)) / STATS.most));
}

function seasonCell(
  st: SeasonFace['stats'][number],
  i: number,
  x: number,
  cy: number,
  w: number,
  id: string,
  cue: SeasonCue
) {
  const g = least('stat.helm'),
    left = x + g + 4,
    barW = w - g - 6,
    top = cy - 5,
    moved = st.after - st.before;
  let s = glyph(STAT[st.stat].glyph, x + g / 2, cy, g);
  s += `<g${cue('stat', i)}>${tagged(figure(left, top, st.after, CELL.figure, { anchor: 'start', weight: 600 }), `${id}-n${i}`)}</g>`;
  if (moved !== 0)
    s += `<g${cue('change', i)}>${figure(left + 22, top, change(moved), TYPE.word, { anchor: 'start', weight: 700, fill: moved > 0 ? INK.blue : INK.rubric })}</g>`;
  const by = cy + 7;
  s += `<rect x="${r2(left)}" y="${r2(by - CELL.bar / 2)}" width="${r2(barW)}" height="${CELL.bar}" fill="${PAPER}" stroke="${INK.iron}" stroke-width=".8"/>`;
  s += `<rect id="${id}-b${i}" x="${r2(left + 1)}" y="${r2(by - CELL.bar / 2 + 1)}" width="${seasonBar(st.after, barW - 2)}" height="${CELL.bar - 2}" fill="${WASH.ochre}" opacity=".9"/>`;
  return s;
}

export function cardSeason(
  face: SeasonFace,
  o: { id: string; seed?: number; cue?: SeasonCue }
) {
  const { w, h } = SEASON,
    pad = SPACE.pad,
    cue = o.cue ?? (() => ''),
    id = o.id,
    shot = 56,
    right = pad + shot + 10,
    nameSize = fitted(face.name, TYPE.name + 1, w - right - pad),
    rg = least('role.driver'),
    star = least('star');
  let s = paper(w, h, o.seed ?? 3);
  s += framed(face, pad + 1, pad + 1, shot);
  s += label(right, pad + 8, face.name, nameSize, { anchor: 'start' });
  s += glyph(ROLE[face.role].glyph, right + rg / 2 - 2, pad + 32, rg);
  s += `<g${cue('age', 0)}>${tagged(figure(right + rg + 4, pad + 32, face.age.after, TYPE.name + 1, { anchor: 'start', weight: 600 }), `${id}-age`)}</g>`;
  s += `<g${cue('aged', 0)}>${figure(right + rg + 28, pad + 32, `+${face.age.after - face.age.before}`, TYPE.word, { anchor: 'start', weight: 700, fill: INK.sepia })}</g>`;
  s += starRow(right + 2 * star * 1.06 + star / 2 - 2, pad + 54, {
    lo: face.stars,
    hi: face.stars,
  });
  const fit = roseFit(
    face.stats.length,
    { x0: pad, y0: CELL.rose, x1: w - pad, y1: CELL.top - 14 },
    false,
    '20'
  );
  s += statRose(
    fit.cx,
    fit.cy,
    fit.R,
    face.stats.map((st) => ({
      glyph: STAT[st.stat].glyph,
      lo: st.after,
      hi: st.after,
    })),
    {
      glyph: fit.g,
      was: face.stats.map((st) => st.before),
      cue: (part) => (part === 'now' ? ` id="${id}-now"` : '') + cue(part, 0),
    }
  );
  const rows = Math.ceil(face.stats.length / 2),
    colW = (w - 2 * pad - CELL.gap) / 2;
  face.stats.forEach((st, i) => {
    const col = Math.floor(i / rows),
      row = i % rows;
    s += seasonCell(
      st,
      i,
      pad + col * (colW + CELL.gap),
      CELL.top + row * CELL.h,
      colW,
      id,
      cue
    );
  });
  const flag = least('flag'),
    y = CELL.flag;
  s += `<path d="M${pad} ${y - 16}H${w - pad}" stroke="${INK.iron}" stroke-width=".6" opacity=".3"/>`;
  s += glyph('flag', pad + flag / 2, y, flag);
  s += figure(pad + flag + 4, y, face.racesLeft, TYPE.name + 2, {
    anchor: 'start',
    weight: 600,
  });
  if (face.racesLeft === 0)
    s += `<g${cue('spent', 0)}>${glyph('hourglass', w - pad - 14, y, least('hourglass') + 10, { ink: 'rubric' })}</g>`;
  s += pips(pad + 2, y + 16, face.racesLeft, w - 2 * pad);
  return {
    svg: s,
    shape: (values: readonly number[]) =>
      roseShape(fit.cx, fit.cy, fit.R, values),
    bar: (v: number) => String(seasonBar(v, colW - least('stat.helm') - 8)),
  };
}
