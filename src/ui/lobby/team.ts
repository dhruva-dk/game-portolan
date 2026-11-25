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
import { portrait } from '../base/gull.ts';
import { FAINT, MOTION, SPACE, TYPE } from '../base/house.ts';
import { figure, glyph, slip, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { spyglass } from '../base/marks.ts';
import { sheet } from '../base/sheet.ts';
import { piece, screen } from '../base/ui.ts';
import { measured, word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';

const PAD = SPACE.pad;
const SHEET = { w: 648, h: CARD.h + 2 * PAD } as const;
const GAP = (SHEET.w - 2 * PAD - 3 * CARD.w) / 2;
const TAB = { h: 26, join: 3, poke: 28, inset: 6, glass: 30 } as const;
const FAN = { size: 26, spread: 21, tilt: 9 } as const;
const LIFT = TAB.h + TAB.poke - TAB.join;

const r2 = (n: number) => Math.round(n * 100) / 100;

const cardX = (i: number) => PAD + i * (CARD.w + GAP);

function layer(
  parent: HTMLElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  parent.append(el);
  return el;
}

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

function candidatesTab(portraits: readonly number[]) {
  if (portraits.length === 0) return '';
  const said = measured('Candidates', TYPE.word, { weight: 600 }),
    w = said + 2 * PAD,
    x = CARD.w - TAB.inset - w,
    mid = x + w / 2,
    n = portraits.length,
    { size, spread, tilt } = FAN;
  let fan = '';
  portraits.forEach((seed, i) => {
    const off = i - (n - 1) / 2,
      cx = mid + off * spread,
      cy = tabTop - size / 2 + 3 + Math.abs(off) * 3;
    fan +=
      `<g transform="rotate(${r2(off * tilt)} ${r2(cx)} ${r2(cy)})">` +
      slip(cx - size / 2 - 2.5, cy - size / 2 - 2.5, size + 5, size + 5, {
        rule: false,
      }) +
      `<g transform="translate(${r2(cx - size / 2)} ${r2(cy - size / 2)})">${portrait(seed, size)}</g></g>`;
  });
  return (
    `<g id="candidates">${fan}` +
    slip(x, tabTop, w, TAB.h + TAB.join, { rule: false }) +
    word(mid, tabTop + TAB.h / 2, 'Candidates', TYPE.word, { weight: 600 }) +
    '</g>'
  );
}

function actions(seat: SeatView, at: Actions) {
  if (!seat.renew || !seat.release) return '';
  const h = 36,
    y = at.y + at.h - h,
    gap = SPACE.gap,
    renewW = 64,
    releaseW = at.w - renewW - gap;
  const cost = `${seat.release.cost.toLocaleString('en-US')}`;
  const coin = least('coin'),
    costW = measured(cost, TYPE.name + 1, { italic: true, weight: 600 });
  const rx = at.x + renewW + gap,
    cy = y + h / 2;
  const label = TYPE.word + 1,
    said = measured('Release', label, { weight: 600 }),
    group = said + SPACE.gap + coin + 2 + costW,
    gx = rx + (releaseW - group) / 2;
  const idle =
    word(gx, cy, 'Release', label, { anchor: 'start', weight: 600 }) +
    glyph('coin', gx + said + SPACE.gap + coin / 2, cy, coin) +
    figure(gx + group, cy, cost, TYPE.name + 1, { anchor: 'end', weight: 600 });
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
  const ground = layer(body, 0, 0, SHEET.w, SHEET.h);
  ground.append(
    svgNode(SHEET.w, SHEET.h, sheet(0, 0, SHEET.w, SHEET.h, { seed: 29 }))
  );
  const cards = [0, 1, 2].map((i) =>
    layer(body, cardX(i), PAD, CARD.w, CARD.h)
  );
  const fans = [0, 1, 2].map((i) =>
    layer(body, cardX(i), PAD - LIFT, CARD.w, LIFT + TAB.join)
  );
  const large = layer(body, PAD, PAD, LARGE.w, LARGE.h);
  large.hidden = true;

  let view: TeamView | null = null,
    enlarged: Role | null = null;

  const seatAt = (role: Role) =>
    view?.seats.find((s) => s.role === role) ?? null;

  function drawCard(i: number, seat: SeatView) {
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
    const tabs = svgNode(
      CARD.w,
      LIFT + TAB.join,
      scoutTab(seat.scouting) + candidatesTab(seat.deal)
    );
    fans[i].replaceChildren(tabs);
    const scout = tabs.querySelector<SVGElement>('#scout');
    if (seat.scouting) scout?.setAttribute('data-tap', `scout-${seat.role}`);
    else
      pressable(
        scout,
        () => port.send({ type: 'SetScoutSeat', team: 0, role: seat.role }),
        `scout-${seat.role}`
      );
    pressable(
      tabs.querySelector<SVGElement>('#candidates'),
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

  function grow(role: Role) {
    const i = view?.seats.findIndex((s) => s.role === role) ?? 0;
    const origin = cardX(i) + CARD.w / 2 - PAD;
    const { ms, ease } = MOTION.card;
    large.style.transformOrigin = `${r2(origin)}px ${CARD.h / 2}px`;
    large.style.transition = 'none';
    large.style.transform = `scale(${r2(CARD.w / LARGE.w + 0.12)}, .94)`;
    large.style.opacity = '0';
    large.hidden = false;
    void large.offsetWidth;
    large.style.transition = `transform ${ms}ms ${ease}, opacity ${ms * 0.6}ms ease`;
    large.style.transform = '';
    large.style.opacity = '1';
    for (const c of [...cards, ...fans]) {
      c.style.transition = `opacity ${ms}ms ease`;
      c.style.opacity = '0';
      c.style.pointerEvents = 'none';
    }
  }

  function enlarge(role: Role) {
    enlarged = role;
    drawLarge();
    grow(role);
  }

  function shrink(instant = false) {
    if (enlarged === null) return;
    enlarged = null;
    const { ms, ease } = MOTION.card;
    for (const c of [...cards, ...fans]) {
      c.style.transition = instant ? 'none' : `opacity ${ms}ms ease`;
      c.style.opacity = '1';
      c.style.pointerEvents = '';
    }
    if (instant) {
      large.hidden = true;
      return;
    }
    large.style.transition = `transform ${ms * 0.8}ms ${ease}, opacity ${ms * 0.6}ms ease`;
    large.style.transform = `scale(${r2(CARD.w / LARGE.w + 0.12)}, .94)`;
    large.style.opacity = '0';
    window.setTimeout(() => {
      if (enlarged === null) large.hidden = true;
    }, ms);
  }

  return {
    el,
    show(v: TeamView) {
      const before = enlarged ? seatAt(enlarged)?.card?.person : null;
      view = v;
      v.seats.forEach((seat, i) => drawCard(i, seat));
      if (enlarged) {
        const now = seatAt(enlarged)?.card;
        if (!now || now.person !== before) shrink(true);
        else drawLarge();
      }
    },
    reset() {
      shrink(true);
    },
    back(): boolean {
      if (enlarged === null) return false;
      shrink();
      return true;
    },
    enlarge,
  };
}
