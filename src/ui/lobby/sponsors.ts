import type {
  OfferCard,
  SponsorCard,
  SponsorsView,
} from '../../career/views/sponsors.ts';
import { pressable } from '../base/button.ts';
import { emblemAt, shieldOutline } from '../base/emblem.ts';
import { grouped } from '../base/grouped.ts';
import { FAINT, MOTION, SPACE, TYPE } from '../base/house.ts';
import { BRASS, INK, WASH, figure, glyph, r2, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { laurel } from '../base/marks.ts';
import {
  PENNANT,
  RIGGED,
  clothTop,
  cloth,
  emptyCloth,
  footTop,
  knots,
  rig,
  sponsorCloth,
} from '../base/pennant.ts';
import { seal } from '../base/seal.ts';
import { sheet } from '../base/sheet.ts';
import { piece, placed, screen } from '../base/ui.ts';
import { measured, label } from '../base/word.ts';
import type { LobbyPort } from './port.ts';
import { SHEET } from './team.ts';

const SMALL = 0.7;
const PAD = SPACE.pad;
const ROW = { slots: 2, offers: 184 } as const;
const COLUMN = (SHEET.w - 2 * PAD) / 3;
const SEAL = { r: 11, inset: 17 } as const;
const PAID = { w: 150, h: 40, y: -46 } as const;
const LINE = { gap: 13.5, room: PENNANT.w - 2 * PAD } as const;

const big = (n: number) => Math.ceil(n / SMALL);
const columnX = (i: number) => PAD + (i + 0.5) * COLUMN;
const middle = RIGGED.w / 2;

const SIZES = {
  emblem: 32,
  coin: big(least('coin')),
  goal: big(least('part.gun')),
  ship: big(least('ship')) + 6,
  fee: TYPE.figure,
  bonus: TYPE.figure - 3,
  name: TYPE.name,
} as const;

function lines(name: string): string[] {
  if (measured(name, SIZES.name, { weight: 600 }) <= LINE.room) return [name];
  const words = name.split(' ');
  let best = [name],
    worst = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '),
      b = words.slice(i).join(' ');
    const w = Math.max(
      measured(a, SIZES.name, { weight: 600 }),
      measured(b, SIZES.name, { weight: 600 })
    );
    if (w < worst) [best, worst] = [[a, b], w];
  }
  return best;
}

function goal(card: SponsorCard, x: number, y: number): [string, number] {
  const g = SIZES.goal,
    fig =
      card.figure === null ? '' : `${card.figure}${card.percent ? '%' : ''}`,
    figW = fig ? measured(fig, SIZES.bonus, { italic: true, weight: 600 }) : 0;
  if (card.objective === 'bothAfloat') {
    const s = SIZES.ship,
      w = s * 1.9;
    return [
      glyph('ship', x + s / 2, y + 1, s) +
        glyph('ship', x + w - s / 2, y - 2, s),
      w,
    ];
  }
  if (card.objective === 'top10') {
    const r = g * 0.44,
      edge = r * 0.45;
    return [
      `<g opacity=".9">${laurel(x + edge + r, y, r)}</g>` +
        figure(x + edge + r, y + 0.5, fig, SIZES.bonus - 3, { weight: 600 }),
      2 * (r + edge),
    ];
  }
  const name = card.objective === 'sinkTwo' ? 'part.gun' : 'territory';
  return [
    glyph(name, x + g / 2, y, g) +
      figure(x + g + SPACE.hair, y, fig, SIZES.bonus, {
        anchor: 'start',
        weight: 600,
      }),
    g + SPACE.hair + figW,
  ];
}

function filled(card: SponsorCard, o: { sealed: boolean; fresh: boolean }) {
  const colors = sponsorCloth(card.sponsor),
    [dye, mark] = colors,
    top = clothTop;
  const named = lines(card.name),
    nameY = top + PENNANT.band + 24,
    names = named
      .map((line, i) =>
        label(
          middle,
          nameY + (i - (named.length - 1) / 2) * LINE.gap,
          line,
          SIZES.name
        )
      )
      .join('');
  const fee = grouped(card.fee),
    feeW =
      SIZES.coin +
      SPACE.hair +
      measured(fee, SIZES.fee, { italic: true, weight: 600 }),
    feeY = top + 81,
    feeX = middle - feeW / 2;
  const rowY = top + 107,
    bonus = grouped(card.bonus),
    bonusW =
      SIZES.coin +
      SPACE.hair +
      measured(bonus, SIZES.bonus, { italic: true, weight: 600 });
  const probe = goal(card, 0, 0)[1],
    joint = 14,
    rowW = probe + joint + bonusW,
    x0 = middle - rowW / 2,
    [goalSvg] = goal(card, x0, rowY),
    bx = x0 + probe + joint;
  const chevron = `<path d="M${r2(bx - joint + 4)} ${rowY - 4}l4 4-4 4" fill="none" stroke="${INK.iron}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
  const body =
    emblemAt(
      card.emblem,
      [mark, dye],
      middle,
      top + PENNANT.band - 3,
      SIZES.emblem
    ) +
    names +
    glyph('coin', feeX + SIZES.coin / 2, feeY, SIZES.coin) +
    figure(feeX + feeW, feeY, fee, SIZES.fee, { anchor: 'end', weight: 600 }) +
    goalSvg +
    chevron +
    glyph('coin', bx + SIZES.coin / 2, rowY, SIZES.coin) +
    figure(bx + bonusW, rowY, bonus, SIZES.bonus, {
      anchor: 'end',
      weight: 600,
    }) +
    `<g class="${o.fresh ? 'tied' : ''}">${knots(middle, footTop + 10, card.racesLeft, mark)}</g>`;
  const sealed = o.sealed
    ? `<g class="${o.fresh ? 'landing' : 'still'}">${seal(PENNANT.reach + PENNANT.w - SEAL.inset, top + PENNANT.band, SEAL.r)}</g>`
    : '';
  return (
    rig() +
    `<g class="furl" style="transform-origin:${middle}px ${top}px">${cloth(colors, body)}${sealed}</g>`
  );
}

const hollow = () =>
  rig(true) +
  emptyCloth() +
  `<g opacity=".3">${shieldOutline(middle, clothTop + PENNANT.band - 3, SIZES.emblem)}</g>`;

function ground() {
  const w = SHEET.w,
    rope = (y: number, sag: number) =>
      `<path d="M6 ${y}Q${w / 2} ${y + sag} ${w - 6} ${y}" fill="none" stroke="${INK.sepia}" stroke-width="1.6"/>` +
      `<path d="M6 ${y}Q${w / 2} ${y + sag} ${w - 6} ${y}" fill="none" stroke="${WASH.ochre}" stroke-width=".6" stroke-dasharray="1.6 2.2"/>` +
      [6, w - 6]
        .map(
          (x) =>
            `<circle cx="${x}" cy="${y}" r="3.4" fill="${BRASS}" stroke="${INK.iron}" stroke-width=".8"/>`
        )
        .join('');
  const hook = (x: number, y: number) =>
    `<path d="M${x} ${y - 1}v4.5a2.6 2.6 0 1 0 2.6 2.6" fill="none" stroke="${BRASS}" stroke-width="1.5" stroke-linecap="round"/>`;
  return (
    sheet(0, 0, w, SHEET.h, { seed: 37 }) +
    rope(ROW.slots + 1, 0) +
    rope(ROW.offers + 1, 2) +
    [0, 1, 2].map((i) => hook(columnX(i), ROW.offers + 2)).join('')
  );
}

function idle() {
  const y = ROW.offers + (SHEET.h - ROW.offers) / 2 + SPACE.gap,
    size = least('hourglass') + 10;
  return glyph('hourglass', SHEET.w / 2, y, size, { opacity: FAINT });
}

type Flight = { sponsor: number; from: number; slot: number };

export function createSponsors(port: LobbyPort) {
  const el = screen();
  const body = piece(el, 'bottom center', false, true);
  body.style.width = `${SHEET.w}px`;
  body.style.height = `${SHEET.h}px`;
  placed(body, 0, 0, SHEET.w, SHEET.h).append(
    svgNode(SHEET.w, SHEET.h, ground())
  );
  const quiet = placed(body, 0, 0, SHEET.w, SHEET.h);
  quiet.append(svgNode(SHEET.w, SHEET.h, idle()));

  const hang = (i: number, y: number, scale: number) => {
    const w = RIGGED.w * scale,
      h = RIGGED.h * scale,
      at = placed(body, columnX(i) - w / 2, y, w, h);
    at.className = 'pennant';
    const inner = placed(at, 0, 0, RIGGED.w, RIGGED.h);
    inner.style.transformOrigin = '0 0';
    inner.style.transform = scale === 1 ? '' : `scale(${scale})`;
    return { at, inner };
  };
  const slots = [0, 1, 2].map((i) => hang(i, ROW.slots, 1));
  const offers = [0, 1, 2].map((i) => hang(i, ROW.offers, SMALL));
  const paid = [0, 1, 2].map((i) =>
    placed(body, columnX(i) - PAID.w / 2, PAID.y, PAID.w, PAID.h)
  );

  let view: SponsorsView | null = null,
    lifted: number | null = null,
    flight: Flight | null = null,
    drawn: string[] = ['', '', ''],
    counting = 0;

  const restart = (node: HTMLElement, ...names: string[]) => {
    node.classList.remove(...names);
    void node.offsetWidth;
    node.classList.add(...names);
  };

  function swing(node: HTMLElement, i: number, delay = 0, angle = 1) {
    node.style.setProperty(
      '--a',
      `${r2(MOTION.sway.swing * angle * (i % 2 ? -1 : 1))}deg`
    );
    node.style.setProperty('--d', `${delay}ms`);
    restart(node, 'swing');
  }

  function waiting() {
    const open = (view?.open.length ?? 0) > 0;
    offers.forEach(({ at }, i) => {
      const card = view?.offers[i];
      const breezy = !!card && card.signable && lifted !== card.sponsor;
      at.classList.toggle('breeze', breezy);
      at.classList.toggle('lifted', !!card && lifted === card.sponsor);
    });
    slots.forEach(({ at }, i) =>
      at.classList.toggle(
        'inviting',
        open && lifted !== null && view?.slots[i] === null
      )
    );
  }

  function count(node: HTMLElement, pays: number) {
    const text = node.querySelector('#paid-figure');
    if (!text) return;
    const start = performance.now() + MOTION.paid.after,
      mine = ++counting;
    const step = (now: number) => {
      if (mine !== counting) return;
      const t = Math.min(1, Math.max(0, (now - start) / MOTION.number.ms)),
        eased = 1 - (1 - t) ** 3;
      text.textContent = `+${grouped(Math.round(pays * eased))}`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function payout(i: number, card: SponsorCard) {
    const coin = SIZES.coin + 4,
      text = `+${grouped(card.pays)}`,
      w =
        coin +
        SPACE.hair +
        measured(text, TYPE.figure + 2, { italic: true, weight: 700 }),
      x = PAID.w / 2 - w / 2,
      y = PAID.h / 2;
    const svg = svgNode(
      PAID.w,
      PAID.h,
      `<g class="paid">${glyph('coin', x + coin / 2, y, coin)}` +
        figure(x + coin + SPACE.hair, y, '+0', TYPE.figure + 2, {
          anchor: 'start',
          weight: 700,
          fill: INK.iron,
          halo: INK.white,
          haloWidth: 4,
        }).replace('<text ', '<text id="paid-figure" ') +
        '</g>'
    );
    paid[i].replaceChildren(svg);
    count(paid[i], card.pays);
    window.setTimeout(
      () => paid[i].replaceChildren(),
      MOTION.paid.after + MOTION.paid.ms
    );
  }

  function drawSlot(i: number, card: SponsorCard | null, opening: boolean) {
    const { at, inner } = slots[i];
    const fresh =
      !!card && flight?.slot === i && flight.sponsor === card.sponsor;
    const key = card ? `${card.sponsor}:${card.racesLeft}` : 'empty';
    if (key === drawn[i] && !fresh) return;
    drawn[i] = key;
    inner.replaceChildren(
      svgNode(
        RIGGED.w,
        RIGGED.h,
        card ? filled(card, { sealed: true, fresh }) : hollow()
      )
    );
    at.dataset.tap = `slot-${i}`;
    if (fresh && flight && card) {
      const from = flight.from;
      const dx = columnX(from) - columnX(i),
        dy = ROW.offers - ROW.slots;
      at.style.setProperty('--fx', `${r2(dx)}px`);
      at.style.setProperty('--fy', `${r2(dy)}px`);
      at.style.setProperty('--fs', `${SMALL}`);
      at.classList.remove('swing');
      restart(at, 'flown');
      at.addEventListener(
        'animationend',
        (e) => {
          if (e.target !== at) return;
          at.classList.remove('flown');
          swing(at, i, 0, 0.8);
        },
        { once: true }
      );
      payout(i, card);
      flight = null;
    } else if (opening) swing(at, i, i * MOTION.sway.stagger);
  }

  function drawOffer(
    i: number,
    card: OfferCard | null,
    was: number,
    opening: boolean
  ) {
    const { at, inner } = offers[i];
    if (!card) {
      inner.replaceChildren();
      at.hidden = true;
      return;
    }
    at.hidden = false;
    inner.replaceChildren(
      svgNode(
        RIGGED.w,
        RIGGED.h,
        `<g opacity="${card.signable ? 1 : FAINT + 0.18}">${filled(card, { sealed: false, fresh: false })}</g>`
      )
    );
    at.dataset.tap = `offer-${i}`;
    if (was >= 0 && was !== i) {
      at.style.setProperty('--x', `${r2(columnX(was) - columnX(i))}px`);
      restart(at, 'glide');
    } else if (was < 0 || opening)
      swing(at, i, (opening ? 3 + i : i) * MOTION.sway.stagger, 0.7);
  }

  function tapOffer(i: number) {
    const card = view?.offers[i];
    if (!card) return;
    if (!card.signable) {
      restart(offers[i].at, 'refuse');
      return;
    }
    lifted = lifted === card.sponsor ? null : card.sponsor;
    waiting();
  }

  function tapSlot(i: number) {
    if (!view) return;
    const held = view.slots[i];
    const offer =
      lifted === null ? -1 : view.offers.findIndex((o) => o.sponsor === lifted);
    if (held !== null) {
      if (offer >= 0) restart(slots[i].at, 'refuse');
      else swing(slots[i].at, i, 0, 0.6);
      return;
    }
    if (offer < 0) {
      if (view.offers.length === 0) restart(slots[i].at, 'refuse');
      else
        offers.forEach(({ at }, k) => {
          if (k < view!.offers.length)
            swing(at, k, k * MOTION.sway.stagger, 1.2);
        });
      return;
    }
    flight = { sponsor: view.offers[offer].sponsor, from: offer, slot: i };
    lifted = null;
    const refused = port.send({ type: 'SignSponsor', team: 0, offer, slot: i });
    if (refused !== null) {
      flight = null;
      restart(slots[i].at, 'refuse');
      waiting();
    }
  }

  slots.forEach(({ at }, i) => pressable(at, () => tapSlot(i), `slot-${i}`));
  offers.forEach(({ at }, i) => pressable(at, () => tapOffer(i), `offer-${i}`));

  function show(v: SponsorsView, opening = false) {
    const before = view?.offers.map((o) => o.sponsor) ?? [];
    view = v;
    if (lifted !== null && !v.offers.some((o) => o.sponsor === lifted))
      lifted = null;
    v.slots.forEach((card, i) => drawSlot(i, card, opening));
    [0, 1, 2].forEach((i) => {
      const card = v.offers[i] ?? null;
      drawOffer(i, card, card ? before.indexOf(card.sponsor) : -1, opening);
    });
    waiting();
    if (quiet.hidden !== v.offers.length > 0) {
      quiet.hidden = v.offers.length > 0;
      if (!quiet.hidden && !opening) restart(quiet, 'arrive');
    }
  }

  return {
    el,
    open() {
      lifted = null;
      flight = null;
      drawn = ['', '', ''];
      view = null;
    },
    show(v: SponsorsView) {
      show(v, view === null);
    },
    reset() {
      lifted = null;
      flight = null;
      counting++;
      paid.forEach((p) => p.replaceChildren());
    },
  };
}
