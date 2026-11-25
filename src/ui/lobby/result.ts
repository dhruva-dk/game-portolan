import type {
  MoneyMark,
  MoneyView,
  ResultShip,
  ResultView,
  TeamMark,
} from '../../career/views/result.ts';
import { emblemAt, liveryColors } from '../base/emblem.ts';
import { grouped } from '../base/grouped.ts';
import { portrait, uncle } from '../base/gull.ts';
import { FAINT, MOTION, SPACE, TYPE } from '../base/house.ts';
import { GILT, INK, figure, glyph, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { laurel } from '../base/marks.ts';
import { sponsorCloth } from '../base/pennant.ts';
import { sheet } from '../base/sheet.ts';
import { counted, createTicker, type Count } from '../base/ticker.ts';
import { onTap } from '../base/touch.ts';
import { piece, placed, screen } from '../base/ui.ts';
import { fitted, label, measured } from '../base/word.ts';
import type { LobbyPort } from './port.ts';

const RACE = { w: 520, h: 340 } as const;
const PAD = SPACE.pad + 4;
const ROWS = {
  top: 18,
  h: 58,
  sailor: 46,
  face: 40,
  wreath: 118,
  wreathR: 25,
  of: 151,
  gun: 210,
  sinkings: 228,
  strike: 268,
  fate: 300,
  name: 320,
} as const;
const LOWER = {
  rule: 140,
  glyph: 40,
  figure: 60,
  shots: 192,
  sea: 246,
  size: 26,
} as const;
const PODIUM = {
  cx: 270,
  base: 292,
  w: 84,
  gap: 6,
  heights: [54, 38, 26],
  emblems: [44, 30, 30],
  name: 306,
} as const;
const POINTS = { cx: 452, burst: 202, size: 60, figure: 268 } as const;

const LEDGER = {
  w: 392,
  top: 18,
  row: 30,
  mark: 40,
  name: 62,
  seal: 240,
  amount: 336,
  coin: 354,
} as const;
const FOOT = {
  rule: 8,
  total: 26,
  line: 36,
  glyph: 22,
  before: 62,
  arrow: 188,
  after: 212,
  moved: 300,
} as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

const squeezed = (name: string, room: number) =>
  Math.max(
    TYPE.small,
    Math.min(
      TYPE.word,
      (TYPE.word * room) / measured(name, TYPE.word, { weight: 700 })
    )
  );

const signed = (n: number) => (n > 0 ? `+${grouped(n)}` : grouped(n));

const percent = (n: number) => `${n}%`;

const delay = (ms: number) => `--d:${Math.round(ms)}ms`;

function sailor(ship: ResultShip, cx: number, cy: number) {
  const size = ROWS.face;
  if (ship.sailor.who === 'you')
    return glyph('role.owner', cx, cy, least('role.owner') + 8);
  const face =
    ship.sailor.who === 'driver'
      ? portrait(ship.sailor.portrait, size)
      : uncle(size);
  return `<g transform="translate(${r2(cx - size / 2)} ${r2(cy - size / 2)})">${face}</g>`;
}

const teamEmblem = (mark: TeamMark, x: number, y: number, size: number) =>
  emblemAt(mark.emblem, liveryColors(mark.livery), x, y, size);

type Timed = { art: string; counts: Count[]; ends: number; thud: number };

function raceTimes(v: ResultView) {
  const { dealt, place, punch, strike, share, podium, burst } = MOTION.ranked;
  const dealtAt = v.ships.map((_, i) => dealt.after + i * dealt.stagger);
  const placeAt = v.ships.map(
    (_, i) => dealt.after + dealt.ms + place.after + i * place.stagger
  );
  const placed = Math.max(...placeAt) + place.ms + place.stamp * 0.5;
  let punchAt = placed + punch.after;
  const punches = v.ships.map((ship) => {
    const at = punchAt;
    punchAt += ship.sinkings * punch.ms;
    return at;
  });
  const strikeAt = v.ships.map(
    (_, i) => punchAt + strike.after + i * strike.stagger
  );
  const shareAt =
    punchAt + strike.after + v.ships.length * strike.stagger + share.after;
  const podiumAt = [2, 1, 0].map(
    (_, i) => shareAt + share.ms * 0.5 + podium.after + i * podium.stagger
  );
  const burstAt =
    shareAt +
    share.ms * 0.5 +
    podium.after +
    2 * podium.stagger +
    podium.ms +
    burst.after;
  return {
    dealtAt,
    placeAt,
    punches,
    strikeAt,
    shareAt,
    podiumAt,
    burstAt,
    ends: burstAt + burst.ring,
  };
}

function shipRow(
  ship: ResultShip,
  i: number,
  of: number,
  t: ReturnType<typeof raceTimes>
) {
  const cy = ROWS.top + ROWS.h * (i + 0.5),
    { place } = MOTION.ranked;
  let s = `<g class="dealt-row" style="${delay(t.dealtAt[i])}">`;
  s += sailor(ship, ROWS.sailor, cy);
  s += laurel(ROWS.wreath, cy + 1, ROWS.wreathR);
  s +=
    `<g class="stamped" style="${delay(t.placeAt[i] + place.ms)}">` +
    figure(ROWS.wreath, cy + 0.5, ship.place, ship.place >= 10 ? 19 : 23, {
      weight: 700,
    }).replace('<text', `<text id="place-${i}"`) +
    '</g>';
  s += `<g opacity=".62">${figure(ROWS.of, cy + 7, `/${of}`, TYPE.word + 2, { anchor: 'start' })}</g>`;
  s += glyph('part.gun', ROWS.gun, cy, least('part.gun') + 2);
  s +=
    `<g class="${ship.sinkings > 0 ? 'punched' : ''}" style="${delay(t.punches[i])};--n:${Math.max(1, ship.sinkings)}">` +
    figure(ROWS.sinkings, cy + 0.5, ship.sinkings, TYPE.figure + 2, {
      anchor: 'start',
      weight: 700,
      fill: ship.sinkings > 0 ? INK.iron : INK.sepia,
    }).replace('<text', `<text id="sink-${i}"`) +
    '</g>';
  s += fate(ship, cy, t.strikeAt[i]);
  return `${s}</g>`;
}

function fate(ship: ResultShip, cy: number, at: number) {
  const f = ship.fate,
    { strike } = MOTION.ranked;
  if (f.kind === 'afloat')
    return `<g class="stamp-in" style="${delay(at)}">${glyph('afloat', ROWS.fate, cy, least('afloat') + 12, { ink: 'blue' })}</g>`;
  const slash =
    `<path class="struck-in" pathLength="1" style="${delay(at)}" d="M${ROWS.strike - 9} ${r2(cy + 11)}L${ROWS.strike + 9} ${r2(cy - 11)}" stroke="${INK.rubric}" stroke-width="3.2" stroke-linecap="round" fill="none"/>` +
    `<path class="struck-in" pathLength="1" style="${delay(at + strike.ms * 0.45)}" d="M${ROWS.strike - 5} ${r2(cy + 13)}L${ROWS.strike + 12} ${r2(cy - 7)}" stroke="${INK.rubric}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".7"/>`;
  const landed = delay(at + strike.ms);
  if (f.kind === 'storm')
    return `${slash}<g class="stamp-in" style="${landed}">${glyph('storm', ROWS.fate, cy, least('storm') + 12)}</g>`;
  const room = RACE.w - PAD - ROWS.name;
  return (
    slash +
    `<g class="stamp-in" style="${landed}">${teamEmblem(f.by, ROWS.fate, cy, 28)}</g>` +
    `<g class="appear" style="${landed}">${label(ROWS.name, cy + 0.5, f.by.name, fitted(f.by.name, TYPE.name, room), { anchor: 'start' })}</g>`
  );
}

function lower(t: ReturnType<typeof raceTimes>) {
  let s = `<g class="ruled" style="${delay(t.dealtAt[1] ?? 0)}"><path d="M${PAD + 4} ${LOWER.rule}H${RACE.w - PAD - 4}" stroke="${INK.iron}" stroke-width=".7" opacity=".45"/></g>`;
  const shareRow = (name: 'target' | 'territory', y: number, id: string) =>
    `<g class="appear" style="${delay(t.shareAt)}">` +
    glyph(name, LOWER.glyph, y, LOWER.size) +
    figure(LOWER.figure, y + 0.5, '0%', TYPE.figure + 3, {
      anchor: 'start',
      weight: 600,
    }).replace('<text', `<text id="${id}"`) +
    '</g>';
  s += shareRow('target', LOWER.shots, 'shots');
  s += shareRow('territory', LOWER.sea, 'sea');
  return s;
}

function podium(v: ResultView, t: ReturnType<typeof raceTimes>) {
  const slots = [1, 0, 2];
  let blocks = '',
    names = '';
  slots.forEach((rank) => {
    const mark = v.podium[rank];
    if (!mark) return;
    const cx =
        PODIUM.cx +
        (rank === 0 ? 0 : rank === 1 ? -1 : 1) * (PODIUM.w + PODIUM.gap),
      h = PODIUM.heights[rank],
      top = PODIUM.base - h,
      size = PODIUM.emblems[rank],
      at = t.podiumAt[2 - rank],
      fill = mark.yours ? GILT : '#e8d5ab';
    blocks +=
      `<g class="risen" style="${delay(at)};--rise:${h + size + 8}px">` +
      `<path d="M${r2(cx - PODIUM.w / 2)} ${PODIUM.base + 2}V${top + 3}Q${r2(cx - PODIUM.w / 2)} ${top} ${r2(cx - PODIUM.w / 2 + 3)} ${top}H${r2(cx + PODIUM.w / 2 - 3)}Q${r2(cx + PODIUM.w / 2)} ${top} ${r2(cx + PODIUM.w / 2)} ${top + 3}V${PODIUM.base + 2}Z" fill="${fill}" stroke="${INK.iron}" stroke-width="1.2"/>` +
      `<path d="M${r2(cx - PODIUM.w / 2 + 4)} ${top + 5}H${r2(cx + PODIUM.w / 2 - 4)}" stroke="${INK.iron}" stroke-width=".5" opacity=".4"/>` +
      figure(
        cx,
        top + Math.min(h / 2 + 3, 18),
        rank + 1,
        rank === 0 ? 20 : 16,
        { weight: 700 }
      ) +
      teamEmblem(mark, cx, top - size / 2 - 3, size) +
      '</g>';
    names += `<g class="appear" style="${delay(at + MOTION.ranked.podium.ms * 0.6)}">${label(cx, PODIUM.name, mark.name, squeezed(mark.name, PODIUM.w), { weight: mark.yours ? 700 : 600 })}</g>`;
  });
  const left = PODIUM.cx - 1.5 * PODIUM.w - PODIUM.gap - 4,
    right = PODIUM.cx + 1.5 * PODIUM.w + PODIUM.gap + 4,
    tall = PODIUM.heights[0] + PODIUM.emblems[0] + 12;
  return (
    `<clipPath id="podium-clip"><rect x="${r2(left)}" y="${PODIUM.base - tall}" width="${r2(right - left)}" height="${tall}"/></clipPath>` +
    `<g clip-path="url(#podium-clip)">${blocks}</g>` +
    `<path d="M${r2(left)} ${PODIUM.base + 0.5}H${r2(right)}" stroke="${INK.iron}" stroke-width="1.4"/>` +
    names
  );
}

function points(v: ResultView, t: ReturnType<typeof raceTimes>) {
  const at = t.burstAt;
  return (
    `<g class="ring-out" style="${delay(at)}"><circle cx="${POINTS.cx}" cy="${POINTS.burst}" r="${POINTS.size * 0.55}" fill="none" stroke="${INK.gold}" stroke-width="2.4"/></g>` +
    `<g class="burst-in" style="${delay(at)}">${glyph('starburst', POINTS.cx, POINTS.burst, POINTS.size, { ink: 'gold' })}</g>` +
    `<g class="stamp-in" style="${delay(at + MOTION.ranked.burst.ms * 0.4)}">${figure(POINTS.cx, POINTS.figure, `+${grouped(v.points)}`, TYPE.figure + 11, { weight: 700, fill: v.points > 0 ? INK.iron : INK.sepia })}</g>`
  );
}

function raceArt(v: ResultView): Timed {
  const t = raceTimes(v),
    { place, punch, share } = MOTION.ranked;
  let art = sheet(0, 0, RACE.w, RACE.h, { seed: 53 });
  v.ships.forEach((ship, i) => (art += shipRow(ship, i, v.of, t)));
  art += lower(t) + podium(v, t) + points(v, t);
  const counts: Count[] = [
    ...v.ships.map((ship, i) =>
      counted(`place-${i}`, t.placeAt[i], place.ms, 0, ship.place, String)
    ),
    ...v.ships.map(
      (ship, i): Count => ({
        id: `sink-${i}`,
        at: t.punches[i],
        ms: Math.max(1, ship.sinkings * punch.ms),
        before: '0',
        value: (k) =>
          String(Math.min(ship.sinkings, Math.floor(k * ship.sinkings) + 1)),
      })
    ),
    counted('shots', t.shareAt, share.ms, 0, v.shots, percent),
    counted('sea', t.shareAt, share.ms, 0, v.sea, percent),
  ];
  return { art, counts, ends: t.ends, thud: t.burstAt };
}

function markArt(mark: MoneyMark, cy: number) {
  const x = LEDGER.mark;
  switch (mark.kind) {
    case 'place':
      return laurel(x, cy + 1, 12);
    case 'sinkings':
      return glyph('part.gun', x, cy, least('part.gun'));
    case 'sea':
      return glyph('territory', x, cy, least('territory'));
    case 'sponsor': {
      const [dye, ink] = sponsorCloth(mark.sponsor);
      return (
        emblemAt(mark.emblem, [ink, dye], x, cy, 24) +
        label(
          LEDGER.name,
          cy + 0.5,
          mark.name,
          fitted(mark.name, TYPE.name - 1, LEDGER.seal - LEDGER.name - 18),
          { anchor: 'start' }
        )
      );
    }
    case 'wages':
      return mark.paid
        .map((seed, i) => {
          const size = 26,
            px = x - 13 + i * 19;
          return `<g transform="translate(${r2(px - size / 2)} ${r2(cy - size / 2)})">${portrait(seed, size)}</g>`;
        })
        .join('');
    case 'interest':
      return (
        glyph('coin', x, cy, least('coin') + 4, { opacity: FAINT }) +
        glyph('cross', x, cy, least('coin') + 4, { ink: 'rubric' })
      );
  }
}

function ledgerTimes(v: MoneyView) {
  const { row, rule, total, roll } = MOTION.ledger;
  const rowAt = v.rows.map((_, i) => row.after + i * (row.count + row.rest));
  const countAt = rowAt.map((at) => at + row.ms * 0.5);
  const ruleAt =
    (rowAt.at(-1) ?? row.after) + row.ms * 0.5 + row.count + rule.after;
  const totalAt = ruleAt + rule.ms + total.after;
  const rollAt = totalAt + total.ms + roll.after;
  return { rowAt, countAt, ruleAt, totalAt, rollAt, ends: rollAt + roll.ms };
}

const ledgerHeight = (v: MoneyView) =>
  LEDGER.top +
  LEDGER.row * v.rows.length +
  FOOT.rule +
  FOOT.total +
  FOOT.line * 2 +
  28;

function ledgerArt(v: MoneyView): Timed {
  const t = ledgerTimes(v),
    h = ledgerHeight(v),
    { row } = MOTION.ledger;
  let art = sheet(0, 0, LEDGER.w, h, { seed: 61 });
  v.rows.forEach((r, i) => {
    const cy = LEDGER.top + LEDGER.row * (i + 0.5),
      negative = r.amount < 0;
    art +=
      `<g class="inked-row" style="${delay(t.rowAt[i])}">` +
      markArt(r.mark, cy) +
      figure(LEDGER.amount, cy + 0.5, '0', TYPE.figure, {
        anchor: 'end',
        weight: 600,
        fill: negative ? INK.rubric : INK.iron,
      }).replace('<text', `<text id="amount-${i}"`) +
      glyph('coin', LEDGER.coin, cy, least('coin') + 2) +
      (i > 0
        ? `<path d="M${PAD} ${r2(cy - LEDGER.row / 2)}H${LEDGER.w - PAD}" stroke="${INK.iron}" stroke-width=".4" opacity=".14"/>`
        : '') +
      '</g>';
    if (r.mark.kind === 'sponsor')
      art += `<g class="sealed-in" style="${delay(t.countAt[i] + row.count)}">${glyph(r.mark.met ? 'tick' : 'cross', LEDGER.seal, cy, 22, { ink: r.mark.met ? 'green' : 'rubric' })}</g>`;
  });
  const ruleY = LEDGER.top + LEDGER.row * v.rows.length + FOOT.rule,
    totalY = ruleY + FOOT.total * 0.62,
    balanceY = ruleY + FOOT.total + FOOT.line * 0.62,
    standingY = balanceY + FOOT.line;
  art +=
    `<g class="ruled" style="${delay(t.ruleAt)}"><path d="M${PAD} ${ruleY - 2}H${LEDGER.w - PAD}" stroke="${INK.iron}" stroke-width="1.5"/>` +
    `<path d="M${PAD} ${ruleY + 1.5}H${LEDGER.w - PAD}" stroke="${INK.iron}" stroke-width=".6"/></g>`;
  art +=
    `<g class="totaled" style="${delay(t.totalAt)}">` +
    figure(LEDGER.amount, totalY, signed(v.total), TYPE.figure + 9, {
      anchor: 'end',
      weight: 700,
      fill: v.total < 0 ? INK.rubric : INK.iron,
    }) +
    glyph('coin', LEDGER.coin, totalY, least('coin') + 8) +
    '</g>';
  const shown = t.totalAt + MOTION.ledger.total.ms;
  const arrow = (y: number) =>
    glyph('arrow', FOOT.arrow, y, least('arrow'), { opacity: 0.7 });
  art +=
    `<g class="appear" style="${delay(shown)}">` +
    glyph('coin', LEDGER.mark, balanceY, FOOT.glyph) +
    figure(
      FOOT.before,
      balanceY + 0.5,
      grouped(v.balance.before),
      TYPE.figure - 1,
      { anchor: 'start', fill: v.balance.before < 0 ? INK.rubric : INK.iron }
    ) +
    arrow(balanceY) +
    figure(
      FOOT.after,
      balanceY + 0.5,
      grouped(v.balance.before),
      TYPE.figure + 1,
      {
        anchor: 'start',
        weight: 700,
        fill: v.balance.after < 0 ? INK.rubric : INK.iron,
      }
    ).replace('<text', '<text id="balance"') +
    laurel(LEDGER.mark, standingY + 1, 12) +
    figure(FOOT.before, standingY + 0.5, v.standing.before, TYPE.figure - 1, {
      anchor: 'start',
    }) +
    arrow(standingY) +
    figure(FOOT.after, standingY + 0.5, v.standing.after, TYPE.figure + 1, {
      anchor: 'start',
      weight: 700,
    }) +
    '</g>' +
    moved(v.standing.moved, FOOT.moved, standingY, t.rollAt);
  const counts: Count[] = [
    ...v.rows.map((r, i) =>
      counted(`amount-${i}`, t.countAt[i], row.count, 0, r.amount, signed)
    ),
    counted(
      'balance',
      t.rollAt,
      MOTION.ledger.roll.ms,
      v.balance.before,
      v.balance.after,
      grouped
    ),
  ];
  return {
    art,
    counts,
    ends: t.ends,
    thud: t.totalAt + MOTION.ledger.total.ms * 0.4,
  };
}

function moved(n: number, x: number, cy: number, at: number) {
  if (n === 0) return '';
  const up = n > 0,
    a = least('arrow') + 2;
  return (
    `<g class="moved" style="--hop:${up ? MOTION.moved.hop : -MOTION.moved.hop}px;${delay(at)}">` +
    `<g transform="rotate(${up ? -90 : 90} ${r2(x + a / 2)} ${r2(cy)})">${glyph('arrow', x + a / 2, cy, a, { ink: up ? undefined : 'rubric' })}</g>` +
    figure(x + a + 2, cy + 0.5, Math.abs(n), TYPE.figure - 2, {
      anchor: 'start',
      weight: 700,
      fill: up ? INK.iron : INK.rubric,
    }) +
    '</g>'
  );
}

export function createResult(port: LobbyPort) {
  const el = screen(true);
  el.setAttribute('data-tap', 'result');
  const body = piece(el, 'center', false, true);
  body.style.top = '50%';
  body.style.translate = '-50% -50%';

  let race: ResultView | null = null,
    money: MoneyView | null = null,
    step = 0,
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

  function toss(old: HTMLElement | null) {
    if (!old) return;
    old.getAnimations({ subtree: true }).forEach((a) => a.finish());
    old.classList.remove('landed');
    void old.offsetWidth;
    old.classList.add('tossed');
    window.setTimeout(() => old.remove(), MOTION.tossed.ms);
  }

  function land(timed: Timed, w: number, h: number, instant: boolean) {
    toss(node);
    body.style.width = `${w}px`;
    body.style.height = `${h}px`;
    const next = placed(body, 0, 0, w, h);
    next.append(
      svgNode(
        w,
        h,
        `<g class="thud" style="${delay(timed.thud)}">${timed.art}</g>`
      )
    );
    next.classList.add('landed');
    node = next;
    done = false;
    ticker.run(timed.counts);
    window.clearTimeout(timer);
    timer = window.setTimeout(
      () => (done = true),
      timed.ends + MOTION.landed.ms
    );
    if (instant) finish();
  }

  function go(to: number, instant = false) {
    step = to;
    if (to === 1 && race) land(raceArt(race), RACE.w, RACE.h, instant);
    if (to === 2 && money)
      land(ledgerArt(money), LEDGER.w, ledgerHeight(money), instant);
  }

  onTap(el, () => {
    if (!done) {
      finish();
      return;
    }
    if (step === 1) {
      go(2);
      return;
    }
    if (step === 2) {
      toss(node);
      node = null;
      step = 3;
      port.open('paper');
    }
  });

  return {
    el,
    show(r: ResultView, m: MoneyView, from = 1) {
      race = r;
      money = m;
      el.hidden = false;
      go(from);
    },
    hide() {
      finish();
      el.hidden = true;
      node?.remove();
      node = null;
      step = 0;
    },
  };
}
