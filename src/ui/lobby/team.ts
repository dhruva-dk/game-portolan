import type { Role } from '../../career/commands.ts';
import type { SeatView, TeamView } from '../../career/views/team.ts';
import { pressable, twoTap, twoTapFace } from '../base/button.ts';
import {
  CARD,
  LARGE,
  cardEmpty,
  cardFront,
  cardLarge,
  type Actions,
} from '../base/card.ts';
import { growFrom, shrinkBack } from '../base/enlarge.ts';
import { portrait } from '../base/gull.ts';
import { FAINT, MOTION, SPACE, TYPE } from '../base/house.ts';
import { figure, glyph, slip, svgNode } from '../base/ink.ts';
import { ROLE, least } from '../base/lexicon.ts';
import { spyglass } from '../base/marks.ts';
import { sheet } from '../base/sheet.ts';
import { piece, placed, screen } from '../base/ui.ts';
import { measured, word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';

const PAD = SPACE.pad;
export const SHEET = { w: 648, h: CARD.h + 2 * PAD } as const;
const GAP = (SHEET.w - 2 * PAD - 3 * CARD.w) / 2;
const TAB = { h: 26, join: 3, inset: 6, glass: 30 } as const;
const FAN = {
  size: 30,
  frame: 3,
  spread: 18,
  least: 12,
  tilt: 7,
  room: 248,
} as const;
const LIFT = TAB.h;

const r2 = (n: number) => Math.round(n * 100) / 100;

const cardX = (i: number) => PAD + i * (CARD.w + GAP);

const tabTop = LIFT - TAB.h + TAB.join;

function scoutTab(on: boolean) {
  const x = TAB.inset,
    cy = tabTop + TAB.h / 2,
    gx = x + PAD / 2 + TAB.glass / 2;
  if (!on)
    return (
      `<g id="scout" opacity="${FAINT + 0.2}">` +
      slip(x, tabTop, TAB.glass + PAD, TAB.h + TAB.join, { rule: false }) +
      `<g opacity="${FAINT + 0.2}">${spyglass(gx, cy, TAB.glass)}</g>` +
      '</g>'
    );
  const said = measured('Scouting', TYPE.word, { weight: 600 }),
    w = PAD / 2 + TAB.glass + SPACE.hair + said + PAD;
  return (
    `<g id="scout">${slip(x, tabTop, w, TAB.h + TAB.join, { rule: false })}` +
    spyglass(gx, cy, TAB.glass) +
    word(gx + TAB.glass / 2 + SPACE.hair, cy, 'Scouting', TYPE.word, {
      anchor: 'start',
      weight: 600,
    }) +
    '</g>'
  );
}

function candidates(
  role: Role,
  portraits: readonly number[],
  at: number,
  roles: number
) {
  const { size, frame, tilt, room } = FAN,
    card = size + 2 * frame,
    pad = SPACE.gap - 2,
    share = (room - (roles - 1) * SPACE.gap) / roles,
    spread = Math.max(
      FAN.least,
      Math.min(FAN.spread, (share - 2 * pad - card) / 2)
    ),
    n = portraits.length,
    mark = least(ROLE[role].glyph),
    said = measured('Candidates', TYPE.small, { weight: 600 }),
    w = Math.ceil(Math.max(said, card + 2 * spread) + 2 * pad),
    mid = w / 2,
    wordY = pad + TYPE.small / 2,
    fanY = wordY + TYPE.small / 2 + SPACE.hair + card / 2,
    markY = fanY + card / 2 + 2 + mark / 2,
    h = Math.round(markY + mark / 2 + pad),
    { after, stagger } = MOTION.deal,
    early = after + at * stagger,
    late = early + MOTION.fan.after;
  let fan = '';
  [...portraits].reverse().forEach((seed, back) => {
    const off = n - 1 - back - (n - 1) / 2,
      cx = mid + off * spread,
      cy = fanY + Math.abs(off) * 2,
      turn = r2(off * tilt);
    fan +=
      `<g transform="rotate(${turn} ${r2(cx)} ${r2(cy)})">` +
      `<g class="fan" style="--r:${-turn}deg;--x:${r2(-off * spread)}px;animation-delay:${late}ms">` +
      slip(cx - card / 2, cy - card / 2, card, card, { rule: false }) +
      `<g transform="translate(${r2(cx - size / 2)} ${r2(cy - size / 2)})">${portrait(seed, size)}</g></g></g>`;
  });
  return {
    w,
    h,
    svg:
      `<g class="arrive" style="animation-delay:${early}ms"><g id="deal-${role}">` +
      slip(0, 0, w, h) +
      word(mid, wordY, 'Candidates', TYPE.small, { weight: 600 }) +
      fan +
      glyph(ROLE[role].glyph, mid, markY, mark) +
      '</g></g>',
  };
}

function actions(seat: SeatView, at: Actions) {
  if (!seat.renew || !seat.release) return '';
  const h = at.h,
    y = at.y,
    label = TYPE.word + 1,
    renewW = Math.ceil(measured('Renew', label, { weight: 600 }) + 2 * PAD),
    rx = at.x + renewW + SPACE.gap,
    releaseW = at.w - renewW - SPACE.gap,
    mid = rx + releaseW / 2,
    cy = y + h / 2;
  const cost = seat.release.cost.toLocaleString('en-US'),
    size = TYPE.name,
    coin = least('coin'),
    costW = measured(cost, size, { italic: true, weight: 600 }),
    amount = coin + SPACE.hair + costW,
    ax = mid - amount / 2,
    line = SPACE.gap;
  const idle =
    word(mid, cy - line, 'Release', label, { weight: 600 }) +
    glyph('coin', ax + coin / 2, cy + line, coin) +
    figure(ax + amount, cy + line, cost, size, { anchor: 'end', weight: 600 });
  return (
    `<g id="renew"${seat.renew.faint ? ` opacity="${FAINT + 0.1}"` : ''}>` +
    slip(at.x, y, renewW, h) +
    word(at.x + renewW / 2, cy, 'Renew', label, { weight: 600 }) +
    '</g>' +
    twoTapFace('release', rx, y, releaseW, h, idle)
  );
}

export function createTeam(port: LobbyPort) {
  const el = screen();
  el.hidden = true;
  const body = piece(el, 'bottom center', false, true);
  body.style.width = `${SHEET.w}px`;
  body.style.height = `${SHEET.h}px`;
  const ground = placed(body, 0, 0, SHEET.w, SHEET.h);
  ground.append(
    svgNode(SHEET.w, SHEET.h, sheet(0, 0, SHEET.w, SHEET.h, { seed: 29 }))
  );
  const cards = [0, 1, 2].map((i) =>
    placed(body, cardX(i), PAD, CARD.w, CARD.h)
  );
  const fans = [0, 1, 2].map((i) =>
    placed(body, cardX(i), PAD - LIFT, CARD.w, LIFT + TAB.join)
  );
  const large = placed(body, PAD, PAD, LARGE.w, LARGE.h);
  const deals = piece(el, 'top left', false, true);
  large.hidden = true;

  let view: TeamView | null = null,
    enlarged: Role | null = null;

  const seatAt = (role: Role) =>
    view?.seats.find((s) => s.role === role) ?? null;

  function seated(card: HTMLElement) {
    card.classList.add('seated');
    card.addEventListener(
      'animationend',
      () => card.classList.remove('seated'),
      { once: true }
    );
  }

  function drawCard(i: number, seat: SeatView, was: number) {
    const face = seat.card
      ? cardFront(seat.card, 3 + i * 7)
      : cardEmpty(seat.role, 3 + i * 7);
    const svg = svgNode(CARD.w, CARD.h, `<g id="card">${face}</g>`);
    cards[i].replaceChildren(svg);
    if (seat.card)
      pressable(
        svg.querySelector<SVGElement>('#card'),
        () => enlarge(seat.role),
        `card-${seat.role}`
      );
    const left = seat.scouting && was >= 0 && was !== i,
      handed = !seat.scouting && was === i,
      tab = scoutTab(seat.scouting),
      drawn = left
        ? `<g class="glide" style="--x:${r2(cardX(was) - cardX(i))}px">${tab}</g>`
        : handed
          ? `<g class="pop">${tab}</g>`
          : tab;
    const tabs = svgNode(CARD.w, LIFT + TAB.join, drawn);
    fans[i].replaceChildren(tabs);
    tabs
      .querySelectorAll('.glide, .pop')
      .forEach((moving) =>
        moving.addEventListener(
          'animationend',
          () => moving.classList.remove('glide', 'pop'),
          { once: true }
        )
      );
    const scout = tabs.querySelector<SVGElement>('#scout');
    if (seat.scouting) scout?.setAttribute('data-tap', `scout-${seat.role}`);
    else
      pressable(
        scout,
        () => port.send({ type: 'SetScoutSeat', team: 0, role: seat.role }),
        `scout-${seat.role}`
      );
  }

  let dealt: string | null = null;

  function drawDeals(v: TeamView) {
    const waiting = v.seats.filter((seat) => seat.deal.length > 0);
    const key = waiting.map((seat) => `${seat.role}${seat.deal}`).join('|');
    if (key === dealt) return;
    dealt = key;
    let x = 0,
      h = 0,
      body = '';
    waiting.forEach((seat, i) => {
      const one = candidates(seat.role, seat.deal, i, waiting.length);
      body += `<g transform="translate(${x} 0)">${one.svg}</g>`;
      x += one.w + SPACE.gap;
      h = Math.max(h, one.h);
    });
    const svg = svgNode(Math.max(1, x - SPACE.gap), Math.max(1, h), body);
    deals.replaceChildren(svg);
    deals.hidden = waiting.length === 0;
    for (const seat of waiting)
      pressable(
        svg.querySelector<SVGElement>(`#deal-${seat.role}`),
        () => port.open('deal', { role: seat.role }),
        `deal-${seat.role}`
      );
  }

  function drawLarge() {
    const seat = enlarged ? seatAt(enlarged) : null;
    if (!seat || !seat.card) return;
    const drawn = cardLarge(seat.card, 41);
    const svg = svgNode(
      LARGE.w,
      LARGE.h,
      `<g id="large">${drawn.svg}</g>` + actions(seat, drawn.actions)
    );
    large.replaceChildren(svg);
    pressable(svg.querySelector<SVGElement>('#large'), () => shrink(), 'large');
    const person = seat.card.person;
    if (person !== null && seat.renew && !seat.renew.faint)
      pressable(
        svg.querySelector<SVGElement>('#renew'),
        () => port.open('negotiation', { person }),
        'renew'
      );
    if (person !== null && seat.release)
      twoTap(
        svg.querySelector<SVGElement>('#release'),
        () => port.send({ type: 'Release', team: 0, person }),
        'release'
      );
  }

  const enlarging = { large, under: () => [...cards, ...fans, deals] };

  function enlarge(role: Role) {
    enlarged = role;
    drawLarge();
    const i = view?.seats.findIndex((s) => s.role === role) ?? 0;
    growFrom(
      enlarging,
      { x: cardX(i) + CARD.w / 2 - PAD, y: CARD.h / 2 },
      CARD.w
    );
  }

  function shrink(instant = false) {
    if (enlarged === null) return;
    enlarged = null;
    shrinkBack(enlarging, CARD.w, instant, () => enlarged !== null);
  }

  return {
    el,
    show(v: TeamView) {
      const before = enlarged ? seatAt(enlarged)?.card?.person : null;
      const was = view?.seats.findIndex((seat) => seat.scouting) ?? -1;
      const sat = view?.seats.map((seat) => seat.card?.person ?? null) ?? null;
      view = v;
      v.seats.forEach((seat, i) => {
        drawCard(i, seat, was);
        const now = seat.card?.person ?? null;
        if (sat !== null && now !== null && now !== sat[i]) seated(cards[i]);
      });
      drawDeals(v);
      if (enlarged) {
        const now = seatAt(enlarged)?.card;
        if (!now || now.person !== before) shrink(true);
        else drawLarge();
      }
    },
    reset() {
      shrink(true);
      dealt = null;
    },
    back(): boolean {
      if (enlarged === null) return false;
      shrink();
      return true;
    },
    enlarge,
  };
}
