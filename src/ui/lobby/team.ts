import type { Role } from '../../career/commands.ts';
import type { SeatView, TeamView } from '../../career/views/team.ts';
import { pressable } from '../base/button.ts';
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
import { GILT, figure, glyph, paperDisc, slip, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { spyglass } from '../base/marks.ts';
import { sheet } from '../base/sheet.ts';
import { piece, screen } from '../base/ui.ts';
import { measured, word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';

const PAD = SPACE.pad;
const SHEET = { w: 648, h: CARD.h + 2 * PAD } as const;
const GAP = (SHEET.w - 2 * PAD - 3 * CARD.w) / 2;
const FAN = { size: 30, spread: 26, tilt: 9, lift: 42 } as const;
const SCOUT = { r: 15, at: -3 } as const;

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

function fan(portraits: readonly number[]) {
  const n = portraits.length,
    { size, spread, tilt } = FAN;
  const w = size + spread * (n - 1) + 16,
    h = size + 18;
  let s = '';
  portraits.forEach((seed, i) => {
    const off = i - (n - 1) / 2,
      cx = w / 2 + off * spread,
      cy = h / 2 + Math.abs(off) * 3;
    s +=
      `<g transform="rotate(${r2(off * tilt)} ${r2(cx)} ${r2(cy)})">` +
      slip(cx - size / 2 - 3, cy - size / 2 - 3, size + 6, size + 6, {
        rule: false,
      }) +
      `<g transform="translate(${r2(cx - size / 2)} ${r2(cy - size / 2)})">${portrait(seed, size)}</g></g>`;
  });
  return { svg: `<g id="fan">${s}</g>`, w, h };
}

function scoutBadge(on: boolean) {
  const r = SCOUT.r;
  return (
    `<g id="scout" opacity="${on ? 1 : FAINT}">` +
    (on
      ? paperDisc(r + 2, r + 2, r)
      : `<circle cx="${r + 2}" cy="${r + 2}" r="${r}" fill="transparent"/>`) +
    spyglass(r + 2, r + 2, r * 1.9) +
    '</g>'
  );
}

function actionSlip(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  inner: string,
  o: { faint?: boolean; armed?: boolean } = {}
) {
  return (
    `<g id="${id}"${o.faint ? ` opacity="${FAINT + 0.1}"` : ''}>` +
    slip(x, y, w, h, { fill: o.armed ? GILT : undefined, bold: o.armed }) +
    inner +
    '</g>'
  );
}

function actions(seat: SeatView, at: Actions, armed: boolean) {
  if (!seat.renew || !seat.release) return '';
  const h = 36,
    y = at.y + at.h - h,
    gap = SPACE.gap,
    renewW = 78,
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
  const releaseInner = armed
    ? glyph('tick', rx + releaseW / 2, cy, 24)
    : word(gx, cy, 'Release', label, { anchor: 'start', weight: 600 }) +
      glyph('coin', gx + said + SPACE.gap + coin / 2, cy, coin) +
      figure(gx + group, cy, cost, TYPE.name + 1, {
        anchor: 'end',
        weight: 600,
      });
  return (
    actionSlip(
      'renew',
      at.x,
      y,
      renewW,
      h,
      word(at.x + renewW / 2, cy, 'Renew', TYPE.word + 1, { weight: 600 }),
      { faint: seat.renew.faint }
    ) + actionSlip('release', rx, y, releaseW, h, releaseInner, { armed })
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
  const fans = [0, 1, 2].map(() => layer(body, 0, 0, 0, 0));
  const cards = [0, 1, 2].map((i) =>
    layer(body, cardX(i), PAD, CARD.w, CARD.h)
  );
  const large = layer(body, PAD, PAD, LARGE.w, LARGE.h);
  large.hidden = true;

  let view: TeamView | null = null,
    enlarged: Role | null = null,
    armed = false;

  const seatAt = (role: Role) =>
    view?.seats.find((s) => s.role === role) ?? null;

  function drawCard(i: number, seat: SeatView) {
    const host = cards[i];
    const face = seat.card
      ? cardFront(seat.card, 3 + i * 7)
      : cardEmpty(seat.role, 3 + i * 7);
    const svg = svgNode(
      CARD.w,
      CARD.h,
      `<g id="card">${face}</g>` +
        `<g transform="translate(${SCOUT.at} ${SCOUT.at})">${scoutBadge(seat.scouting)}</g>`
    );
    host.replaceChildren(svg);
    if (seat.card) {
      const card = svg.querySelector<SVGElement>('#card');
      pressable(card, () => enlarge(seat.role), `card-${seat.role}`);
    }
    if (!seat.scouting)
      pressable(
        svg.querySelector<SVGElement>('#scout'),
        () => port.send({ type: 'SetScoutSeat', team: 0, role: seat.role }),
        `scout-${seat.role}`
      );
    else
      svg
        .querySelector('#scout')
        ?.setAttribute('data-tap', `scout-${seat.role}`);

    const f = fans[i];
    if (seat.deal.length === 0) {
      f.replaceChildren();
      f.hidden = true;
      return;
    }
    const drawn = fan(seat.deal);
    Object.assign(f.style, {
      left: `${r2(cardX(i) + CARD.w / 2 - drawn.w / 2)}px`,
      top: `${r2(-FAN.lift)}px`,
      width: `${drawn.w}px`,
      height: `${drawn.h}px`,
    });
    f.hidden = false;
    const fsvg = svgNode(drawn.w, drawn.h, drawn.svg);
    f.replaceChildren(fsvg);
    pressable(
      fsvg.querySelector<SVGElement>('#fan'),
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
      `<g id="large">${drawn.svg}</g>` + actions(seat, drawn.actions, armed)
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
      pressable(
        svg.querySelector<SVGElement>('#release'),
        () => {
          if (!armed) {
            armed = true;
            drawLarge();
            return;
          }
          armed = false;
          port.send({ type: 'Release', team: 0, person });
        },
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
    armed = false;
    drawLarge();
    grow(role);
  }

  function shrink(instant = false) {
    if (enlarged === null) return;
    enlarged = null;
    armed = false;
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
    enlarge,
  };
}
