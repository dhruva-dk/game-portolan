import type {
  PeopleView,
  SeasonFace,
  TableEntry,
  TableView,
  WinterView,
} from '../../career/views/offseason.ts';
import type { TeamMark } from '../../career/views/result.ts';
import { pressable, ribbon } from '../base/button.ts';
import {
  SEASON,
  cardEmpty,
  cardSeason,
  type SeasonCue,
  type SeasonPart,
} from '../base/card.ts';
import { emblemAt, liveryColors } from '../base/emblem.ts';
import { grouped } from '../base/grouped.ts';
import { FAINT, MOTION, SPACE, TYPE } from '../base/house.ts';
import { INK, PAPER, WASH, figure, glyph, r2, svgNode } from '../base/ink.ts';
import { STAT, least } from '../base/lexicon.ts';
import { laurel, type LaurelCue } from '../base/marks.ts';
import { sheet } from '../base/sheet.ts';
import { counted, createTicker, morphed, type Count } from '../base/ticker.ts';
import { onTap } from '../base/touch.ts';
import { piece, placed, screen } from '../base/ui.ts';
import { fitted, label, measured, word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';

export type OffseasonPages = {
  table: TableView;
  people: PeopleView;
  winter: WinterView;
};

const CONTINUE = { gap: 44, w: 176, size: TYPE.ribbon - 2 } as const;

const TABLE = { w: 560, h: 352, seed: 61 } as const;
const CHAMPION = {
  cx: 280,
  cy: 118,
  emblem: 86,
  wreath: 64,
  burst: 176,
  name: 224,
  points: 252,
} as const;
const FLANK = {
  dx: 176,
  cy: 128,
  emblem: 58,
  wreath: 17,
  place: 58,
  name: 184,
  points: 208,
  room: 150,
} as const;
const OWN = {
  rule: 276,
  cy: 314,
  emblem: 38,
  name: 66,
  wreath: 300,
  wreathR: 24,
  of: 338,
  coin: 412,
  prize: 430,
} as const;

const PEOPLE = { gap: 12 } as const;
const PEOPLE_W = 3 * SEASON.w + 2 * PEOPLE.gap;

const WINTER = {
  w: 548,
  h: 352,
  seed: 67,
  glyph: 36,
  head: 78,
  top: 104,
  row: 34,
  line: 42,
  first: 74,
  col: 152,
  bar: 108,
  barH: 12,
} as const;

const delay = (ms: number) => `--d:${Math.round(ms)}ms`;

const cue = (name: string, at: number, extra = '') =>
  ` class="${name}" style="${delay(at)}${extra}"`;

const traced = (at: number, ms: number, back = false) =>
  ` class="${back ? 'traced-back' : 'traced'}" pathLength="1" style="${delay(at)};--ms:${Math.round(ms)}ms"`;

const teamEmblem = (mark: TeamMark, x: number, y: number, size: number) =>
  emblemAt(mark.emblem, liveryColors(mark.livery), x, y, size);

const tagged = (svg: string, id: string) =>
  svg.replace('<text', `<text id="${id}"`);

type Timed = { art: string; counts: Count[]; ends: number };

type Page = Timed & { w: number; h: number };

function continueFace(cx: number, cy: number) {
  const said = measured('Continue', CONTINUE.size, { weight: 600 });
  return (
    '<g id="continue">' +
    ribbon(
      cx,
      cy,
      CONTINUE.w,
      word(cx - said / 2, cy - 1, 'Continue', CONTINUE.size, {
        anchor: 'start',
        weight: 600,
      })
    ) +
    '</g>'
  );
}

function pointsCentered(cx: number, y: number, points: number, size: number) {
  const burst = least('starburst'),
    text = grouped(points),
    wide = measured(text, size, { italic: true, weight: 600 }),
    left = cx - (wide + 3 + burst) / 2;
  return (
    figure(left, y, text, size, { anchor: 'start', weight: 600 }) +
    glyph('starburst', left + wide + 3 + burst / 2, y, burst)
  );
}

function placeMark(cx: number, cy: number, r: number, place: number) {
  return (
    laurel(cx, cy + 1, r) +
    figure(cx, cy + 0.5, place, r * (place >= 10 ? 0.78 : 0.94), {
      weight: 700,
    })
  );
}

function wreathCue(at: number): LaurelCue {
  const { wreath } = MOTION.ceremony;
  return (part, side, i) =>
    part === 'stem'
      ? traced(at, wreath.stem, side > 0)
      : cue('leaf', at + (side > 0 ? 11 - i : i) * wreath.stagger);
}

function champion(v: TableView, at: number) {
  const c = CHAMPION,
    { wreath, burst } = MOTION.ceremony,
    wreathAt = at + wreath.after,
    burstAt = wreathAt + 11 * wreath.stagger + wreath.leaf + burst.after,
    name = v.champion.name,
    room = 2 * FLANK.dx - FLANK.room - 2 * SPACE.gap;
  const art =
    `<g class="ring-out" style="${delay(burstAt)}"><circle cx="${c.cx}" cy="${c.cy}" r="${c.wreath * 1.15}" fill="none" stroke="${INK.gold}" stroke-width="3"/></g>` +
    `<g class="burst-in" style="${delay(burstAt)}" opacity=".42">${glyph('starburst', c.cx, c.cy, c.burst, { ink: 'gold' })}</g>` +
    laurel(c.cx, c.cy + 4, c.wreath, wreathCue(wreathAt)) +
    `<g class="crowned" style="${delay(at)}">${teamEmblem(v.champion, c.cx, c.cy, c.emblem)}</g>` +
    `<g class="stamp-in" style="${delay(burstAt + 60)}">${label(c.cx, c.name, name, fitted(name, TYPE.name + 6, room))}</g>` +
    `<g class="appear" style="${delay(burstAt + 160)}">${pointsCentered(c.cx, c.points, v.podium[0]?.points ?? 0, TYPE.name + 4)}</g>`;
  return { art, ends: burstAt + MOTION.ranked.burst.ring };
}

function flank(entry: TableEntry, side: number, at: number) {
  const f = FLANK,
    cx = CHAMPION.cx + side * f.dx,
    name = entry.mark.name;
  return (
    `<g class="flanked" style="${delay(at)};--shift:${-side * MOTION.ceremony.flank.shift}px">` +
    placeMark(cx, f.place, f.wreath, entry.place) +
    teamEmblem(entry.mark, cx, f.cy, f.emblem) +
    label(cx, f.name, name, fitted(name, TYPE.name + 1, f.room)) +
    pointsCentered(cx, f.points, entry.points, TYPE.name + 1) +
    '</g>'
  );
}

function ownRow(v: TableView, at: number) {
  const o = OWN,
    { place, prize } = MOTION.ceremony,
    placeAt = at + MOTION.ceremony.row.ms + place.after,
    prizeAt = placeAt + MOTION.ranked.place.stamp + prize.after,
    name = v.you.mark.name;
  let s = `<g class="slid" style="${delay(at)}">`;
  s += teamEmblem(v.you.mark, o.emblem, o.cy, 34);
  s += label(o.name, o.cy + 0.5, name, fitted(name, TYPE.name + 2, 190), {
    anchor: 'start',
  });
  s += laurel(o.wreath, o.cy + 1, o.wreathR);
  s += `<g opacity=".62">${figure(o.of, o.cy + 7, `/${v.of}`, TYPE.word + 2, { anchor: 'start' })}</g>`;
  s += `<g class="stamped" style="${delay(placeAt)}">${figure(o.wreath, o.cy + 0.5, v.you.place, v.you.place >= 10 ? 19 : 23, { weight: 700 })}</g></g>`;
  s += `<g class="stamp-in" style="${delay(prizeAt)}">${glyph('coin', o.coin, o.cy, least('coin') + 10)}</g>`;
  s += `<g class="appear" style="${delay(prizeAt)}">${tagged(figure(o.prize, o.cy + 0.5, grouped(v.prize), TYPE.figure + 5, { anchor: 'start', weight: 700 }), 'prize')}</g>`;
  return {
    art: s,
    counts: [counted('prize', prizeAt, prize.ms, 0, v.prize, grouped)],
    ends: prizeAt + prize.ms,
  };
}

function tableArt(v: TableView): Page {
  const c = MOTION.ceremony,
    crowned = champion(v, c.champion.after);
  const flankAt = [0, 1].map(
    (k) => crowned.ends - c.burst.after + c.flank.after + k * c.flank.stagger
  );
  const rowAt = flankAt[1] + c.flank.ms + c.row.after,
    own = ownRow(v, rowAt);
  let art = sheet(0, 0, TABLE.w, TABLE.h, { seed: TABLE.seed });
  art += crowned.art;
  if (v.podium[1]) art += flank(v.podium[1], -1, flankAt[0]);
  if (v.podium[2]) art += flank(v.podium[2], 1, flankAt[1]);
  art += `<path class="ruled" style="${delay(rowAt - 120)}" d="M${SPACE.pad * 2} ${OWN.rule}H${TABLE.w - SPACE.pad * 2}" stroke="${INK.iron}" stroke-width=".9" opacity=".5"/>`;
  art += own.art;
  return { art, counts: own.counts, ends: own.ends, w: TABLE.w, h: TABLE.h };
}

type Held = Extract<SeasonFace, { kind: 'person' }>;

function seasonTimes(face: Held, base: number) {
  const s = MOTION.season,
    wasAt = base + s.was.after,
    nowAt = wasAt + s.was.ms + s.now.after,
    barAt = face.stats.map((_, i) => nowAt + s.bar.after + i * s.bar.stagger),
    barsEnd = Math.max(...barAt) + s.bar.ms,
    strikeAt = barsEnd + s.strike.after,
    asideAt = strikeAt + s.strike.ms + s.aside.after;
  return {
    wasAt,
    nowAt,
    barAt,
    ageAt: nowAt + s.age.after,
    spentAt: barsEnd + s.spent.after,
    strikeAt,
    asideAt,
    ends: face.retired ? asideAt + s.aside.ms : barsEnd + s.spent.after,
  };
}

function seasonCard(face: Held, k: number, base: number) {
  const id = `s${k}`,
    s = MOTION.season,
    t = seasonTimes(face, base);
  const cues: Record<SeasonPart, (i: number) => string> = {
    was: () => traced(t.wasAt, s.was.ms),
    now: () => cue('appear', t.nowAt),
    age: () => cue('stamped', t.ageAt),
    aged: () => cue('stamp-in', t.ageAt + 90),
    stat: () => '',
    change: (i) => cue('stamp-in', t.barAt[i] + s.bar.ms + s.change.after),
    spent: () => cue('stamp-in', t.spentAt),
  };
  const sCue: SeasonCue = (part, i) => cues[part](i);
  const drawn = cardSeason(
    {
      name: face.name,
      role: face.role,
      portrait: face.portrait,
      age: face.age,
      stars: face.stars.after,
      stats: face.stats.map((st) => ({
        stat: st.stat,
        before: st.value.before,
        after: st.value.after,
      })),
      racesLeft: face.racesLeft,
    },
    { id, seed: 7 + k, cue: sCue }
  );
  let art = drawn.svg;
  if (face.retired)
    art += `<path${traced(t.strikeAt, s.strike.ms)} d="M${SPACE.pad} ${SEASON.h - SPACE.pad}L${SEASON.w - SPACE.pad} ${SPACE.pad}" stroke="${INK.rubric}" stroke-width="5" stroke-linecap="round" fill="none" opacity=".88"/>`;
  const before = face.stats.map((st) => st.value.before),
    after = face.stats.map((st) => st.value.after);
  const counts: Count[] = [
    morphed(`${id}-now`, 'd', t.nowAt, s.now.ms, (q) =>
      drawn.shape(before.map((b, i) => b + (after[i] - b) * q))
    ),
    counted(`${id}-age`, t.ageAt, 1, face.age.before, face.age.after, String),
    ...face.stats.flatMap((st, i) => [
      counted(
        `${id}-n${i}`,
        t.barAt[i],
        s.bar.ms,
        st.value.before,
        st.value.after,
        String
      ),
      morphed(`${id}-b${i}`, 'width', t.barAt[i], s.bar.ms, (q) =>
        drawn.bar(st.value.before + (st.value.after - st.value.before) * q)
      ),
    ]),
  ];
  return { art, counts, t };
}

function peopleArt(v: PeopleView): Page {
  const s = MOTION.season;
  let art = '',
    ends = 0;
  const counts: Count[] = [];
  v.seats.forEach((face, k) => {
    const x = k * (SEASON.w + PEOPLE.gap),
      dealAt = s.deal.after + k * s.deal.stagger,
      turn = (k - 1) * s.deal.turn,
      empty = cardEmpty(face.role, 11 + k, SEASON, false);
    const dealt = (inner: string) =>
      `<g transform="translate(${x} 0)"><g class="dealt-card" style="${delay(dealAt)};--turn:${turn}deg">${inner}</g></g>`;
    if (face.kind === 'empty') {
      art += dealt(empty);
      ends = Math.max(ends, dealAt + s.deal.ms);
      return;
    }
    const card = seasonCard(face, k, dealAt + s.deal.ms);
    counts.push(...card.counts);
    ends = Math.max(ends, card.t.ends);
    art += dealt(
      face.retired
        ? `${empty}<g class="aside" style="${delay(card.t.asideAt)}">${card.art}</g>`
        : card.art
    );
  });
  return { art, counts, ends, w: PEOPLE_W, h: SEASON.h };
}

const HEADS = ['role.designer', 'role.owner', 'role.driver'] as const;

function winterBar(
  x: number,
  cy: number,
  bar: { before: number; after: number },
  id: string
) {
  const w = WINTER.bar,
    h = WINTER.barH,
    top = cy - h / 2,
    fill = (v: number) => r2(((w - 2) * Math.min(100, v)) / 100);
  return (
    `<rect x="${x}" y="${r2(top)}" width="${w}" height="${h}" fill="${PAPER}" stroke="${INK.iron}" stroke-width=".9"/>` +
    `<rect x="${x + 1}" y="${r2(top + 1)}" width="${fill(bar.before)}" height="${h - 2}" fill="${WASH.ultramarine}" opacity="${FAINT}"/>` +
    `<rect id="${id}-f" x="${x + 1}" y="${r2(top + 1)}" width="${fill(bar.after)}" height="${h - 2}" fill="${WASH.ultramarine}" opacity=".85"/>` +
    tagged(
      figure(x + w + 6, cy + 0.5, bar.after, TYPE.name + 1, {
        anchor: 'start',
        weight: 600,
      }),
      `${id}-n`
    )
  );
}

function winterArt(v: WinterView): Page {
  const f = MOTION.frost,
    W = WINTER;
  let art = sheet(0, 0, W.w, W.h, { seed: W.seed });
  art += `<g class="frost" style="${delay(f.glyph.after)}">${glyph('winter', W.w / 2, W.glyph, least('winter') + 18, { ink: 'blue' })}</g>`;
  const head = least('role.designer');
  HEADS.forEach((g, c) => {
    const cx = W.first + c * W.col + W.bar / 2;
    art += `<g class="appear" style="${delay(f.line.after - 200)}">${glyph(g, cx, W.head, head)}</g>`;
  });
  const counts: Count[] = [];
  let ends = 0;
  v.lines.forEach((line, j) => {
    const cy = W.top + j * W.row + W.row / 2,
      at = f.line.after + j * f.line.stagger,
      drain = at + f.drain.after;
    let row = glyph(STAT[line.line].glyph, W.line, cy, least('part.sails'));
    line.bars.forEach((bar, c) => {
      const id = `w${j}-${c}`,
        fill = (n: number) => r2(((W.bar - 2) * Math.min(100, n)) / 100);
      row += winterBar(W.first + c * W.col, cy, bar, id);
      counts.push(
        morphed(`${id}-f`, 'width', drain, f.drain.ms, (q) =>
          String(fill(bar.before + (bar.after - bar.before) * q))
        ),
        counted(`${id}-n`, drain, f.drain.ms, bar.before, bar.after, String)
      );
    });
    art += `<g class="dealt-row" style="${delay(at)}">${row}</g>`;
    ends = drain + f.drain.ms;
  });
  return { art, counts, ends, w: W.w, h: W.h };
}

export function createOffseason(port: LobbyPort) {
  const el = screen(true);
  el.setAttribute('data-tap', 'offseason');
  const body = piece(el, 'center', false, true);
  body.style.top = '50%';
  body.style.translate = '-50% -50%';

  let pages: OffseasonPages | null = null,
    page = 0,
    node: HTMLElement | null = null,
    done = true,
    timer = 0;
  const ticker = createTicker(() => node);

  function finish() {
    window.clearTimeout(timer);
    node?.getAnimations({ subtree: true }).forEach((a) => a.finish());
    ticker.finish();
    done = true;
  }

  function lift(old: HTMLElement | null) {
    if (!old) return;
    old.getAnimations({ subtree: true }).forEach((a) => a.finish());
    old.classList.remove('landed');
    void old.offsetWidth;
    old.classList.add('leafed');
    window.setTimeout(() => old.remove(), MOTION.leafed.ms);
  }

  function land(p: Page, instant: boolean) {
    lift(node);
    const h = p.h + CONTINUE.gap + 26;
    body.style.width = `${p.w}px`;
    body.style.height = `${h}px`;
    const next = placed(body, 0, 0, p.w, h);
    const svg = svgNode(
      p.w,
      h,
      p.art + continueFace(p.w / 2, p.h + CONTINUE.gap)
    );
    next.append(svg);
    pressable(
      svg.querySelector<SVGElement>('#continue'),
      () => {
        if (!done) finish();
        else go(page + 1);
      },
      'continue'
    );
    next.classList.add('landed');
    node = next;
    done = false;
    ticker.run(p.counts);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => (done = true), p.ends + MOTION.landed.ms);
    if (instant) finish();
  }

  function go(to: number, instant = false) {
    if (!pages) return;
    page = to;
    if (to === 1) land(tableArt(pages.table), instant);
    if (to === 2) land(peopleArt(pages.people), instant);
    if (to === 3) land(winterArt(pages.winter), instant);
    if (to === 4) port.open('paper');
  }

  onTap(el, () => {
    if (!done) finish();
  });

  return {
    el,
    show(next: OffseasonPages, from = 1) {
      pages = next;
      el.hidden = false;
      el.style.pointerEvents = '';
      go(from);
    },
    hide() {
      finish();
      lift(node);
      node = null;
      page = 0;
      el.style.pointerEvents = 'none';
      window.setTimeout(() => {
        if (page === 0) el.hidden = true;
      }, MOTION.leafed.ms);
    },
  };
}
