import type { Edit, NegotiationView } from '../../career/views/negotiation.ts';
import { pressable, roundButton } from '../base/button.ts';
import {
  CANDIDATE,
  CARD,
  cardCandidate,
  cardFront,
  type Candidacy,
} from '../base/card.ts';
import { MOTION, SPACE, TYPE } from '../base/house.ts';
import { INK, WASH, figure, glyph, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { bindPicker, pickTo, pickerFace } from '../base/picker.ts';
import { sheet } from '../base/sheet.ts';
import { holdable, stepperFace, stepperValue } from '../base/stepper.ts';
import { piece, placed, screen } from '../base/ui.ts';
import { measured, word, type Word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';
import { SHEET } from './team.ts';
import { grouped } from '../base/grouped.ts';

const PAD = SPACE.pad;
const AREA = { x: PAD + CARD.w + 20, y: PAD } as const;
const W = SHEET.w - PAD - AREA.x;
const TERMS = { label: 66, w: 204, first: 19, step: 46 } as const;
const SIDE = { x: TERMS.label + TERMS.w + 14 } as const;
const SIDE_W = W - SIDE.x;
const ANSWER = { y: 50, big: 56, counter: 28, accept: 19 } as const;
const PIPS = { y: 124, gap: 24, r: 4.4 } as const;
const OFFER = { y: 168, r: 25 } as const;
const COST = { y: 214 } as const;
const BAR = { y: 258, h: 18, mark: 7 } as const;
const H = SHEET.h - 2 * PAD;

type Stepped = 'wage' | 'fee' | 'clause';
const STEPPED: readonly { key: Stepped; word: Word; row: number }[] = [
  { key: 'wage', word: 'Wage', row: 0 },
  { key: 'fee', word: 'Fee', row: 2 },
  { key: 'clause', word: 'Clause', row: 3 },
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const rowY = (row: number) => TERMS.first + row * TERMS.step;

type Zone = 0 | 1 | 2;
const zoneOf = (score: number, v: NegotiationView): Zone =>
  score >= v.willingness.signs ? 2 : score >= v.willingness.counters ? 1 : 0;
const ZONE_WASH = [WASH.vermilion, WASH.ochre, WASH.viridian] as const;

function candidacy(v: NegotiationView): Candidacy {
  return {
    pinned: v.pinned,
    rival: v.rival,
    holder: v.holder ? v.holder.stats.map((s) => s.value.lo) : null,
  };
}

function cardOf(v: NegotiationView) {
  const tall = v.renewal ? CARD.h : CANDIDATE.h,
    body = v.renewal
      ? cardFront(v.card, 13)
      : cardCandidate(v.card, candidacy(v), 13);
  return { tall, body };
}

function costRow(v: NegotiationView) {
  const coin = least('coin'),
    arrow = least('arrow'),
    size = TYPE.figure - 2,
    fill = v.cost.funds ? INK.rubric : INK.iron,
    cost = grouped(v.cost.cost),
    after = grouped(v.cost.after),
    costW = measured(cost, size, { italic: true, weight: 600 }),
    afterW = measured(after, size, { italic: true, weight: 600 }),
    total = coin + SPACE.hair + costW + 2 * SPACE.gap + arrow + afterW,
    x = (W - total) / 2,
    y = COST.y;
  return (
    glyph('coin', x + coin / 2, y, coin) +
    figure(x + coin + SPACE.hair, y, cost, size, {
      anchor: 'start',
      weight: 600,
      fill,
    }) +
    glyph(
      'arrow',
      x + coin + SPACE.hair + costW + SPACE.gap + arrow / 2,
      y,
      arrow
    ) +
    figure(x + total, y, after, size, { anchor: 'end', weight: 600, fill })
  );
}

function barFrame(v: NegotiationView) {
  const { least: lo, most: hi, counters, signs } = v.willingness,
    at = (score: number) => (W * (score - lo)) / (hi - lo),
    top = BAR.y - BAR.h / 2;
  let s = '';
  const zones = [lo, counters, signs, hi];
  for (let z = 0; z < 3; z++)
    s += `<rect x="${r2(at(zones[z]))}" y="${r2(top)}" width="${r2(at(zones[z + 1]) - at(zones[z]))}" height="${BAR.h}" fill="${ZONE_WASH[z]}" opacity=".14"/>`;
  s += `<rect x="0" y="${r2(top)}" width="${W}" height="${BAR.h}" fill="none" stroke="${INK.iron}" stroke-width=".9"/>`;
  s += `<g id="bar-band"><rect class="bar" x="0" y="${r2(top + 1.5)}" width="${W}" height="${BAR.h - 3}" fill="url(#h-open)"/></g>`;
  s += `<g id="bar-fill"><rect class="bar" x="0" y="${r2(top + 1.5)}" width="${W}" height="${BAR.h - 3}" fill="${WASH.ochre}" opacity=".9"/></g>`;
  for (const [id, score, width] of [
    ['mark-counters', counters, 1.4],
    ['mark-signs', signs, 2.4],
  ] as const)
    s += `<g id="${id}"><path d="M${r2(at(score))} ${r2(top - BAR.mark)}V${r2(top + BAR.h + BAR.mark)}" stroke="${INK.iron}" stroke-width="${width}" stroke-linecap="round"/></g>`;
  return s;
}

function attempts(v: NegotiationView, landing: boolean) {
  const cx = SIDE.x + SIDE_W / 2,
    used = v.attempts.used;
  let s = '';
  for (let i = 0; i < v.attempts.most; i++) {
    const x = cx + (i - (v.attempts.most - 1) / 2) * PIPS.gap;
    s +=
      i < used
        ? `<g${landing && i === used - 1 ? ' class="pop"' : ''}>${glyph('cross', x, PIPS.y, least('cross'))}</g>`
        : `<circle cx="${r2(x)}" cy="${PIPS.y}" r="${PIPS.r}" fill="none" stroke="${INK.iron}" stroke-width="1.3"/>`;
  }
  return s;
}

function answer(v: NegotiationView, landing: boolean) {
  const cx = SIDE.x + SIDE_W / 2;
  if (v.answer === 'signed')
    return `<g class="${landing ? 'stamp' : ''}">${glyph('tick', cx, ANSWER.y, ANSWER.big)}</g>`;
  if (v.answer === 'refused')
    return `<g class="${landing ? 'stamp' : ''}"><g class="${landing ? 'denied' : ''}">${glyph('cross', cx, ANSWER.y, ANSWER.big, { ink: 'rubric' })}</g></g>`;
  if (v.answer === 'countered' && v.counter) {
    const coin = least('coin'),
      size = TYPE.figure - 2,
      wage = grouped(v.counter.wage),
      w =
        coin + SPACE.hair + measured(wage, size, { italic: true, weight: 600 }),
      x = cx - w / 2,
      y = ANSWER.y - 6;
    return (
      `<g class="${landing ? 'arrive' : ''}">` +
      glyph('counter', cx, y - 24, ANSWER.counter) +
      glyph('coin', x + coin / 2, y + 4, coin) +
      figure(x + w, y + 4, wage, size, { anchor: 'end', weight: 600 }) +
      `<g id="accept"><g class="face">${roundButton(cx, y + 36, ANSWER.accept, glyph('tick', cx, y + 36, least('tick') + 4), { faint: v.counter.faint })}</g></g>` +
      '</g>'
    );
  }
  return '';
}

const waiting = () =>
  `<g class="waiting">${glyph('hourglass', SIDE.x + SIDE_W / 2, ANSWER.y, ANSWER.counter + 8)}</g>`;

const offerFace = (v: NegotiationView) =>
  roundButton(
    SIDE.x + SIDE_W / 2,
    OFFER.y,
    OFFER.r,
    word(SIDE.x + SIDE_W / 2, OFFER.y, 'Offer', TYPE.word + 1, { weight: 600 }),
    { faint: v.offer.faint }
  );

export type Pricing = (edit: Edit | null) => NegotiationView | null;

export function createNegotiation(port: LobbyPort) {
  const el = screen();
  el.hidden = true;
  const body = piece(el, 'bottom center', false, true);
  body.style.width = `${SHEET.w}px`;
  body.style.height = `${SHEET.h}px`;
  placed(body, 0, 0, SHEET.w, SHEET.h).append(
    svgNode(SHEET.w, SHEET.h, sheet(0, 0, SHEET.w, SHEET.h, { seed: 43 }))
  );
  const cardBox = placed(body, PAD, PAD, CARD.w, H);
  const area = placed(body, AREA.x, AREA.y, W, H);

  let price: Pricing = () => null,
    view: NegotiationView | null = null,
    edit: Edit | null = null,
    svg: SVGSVGElement | null = null,
    person: number | null = null,
    offered = false,
    waitingFor = false,
    pending = 0,
    leaving = 0;

  const part = (id: string) => svg?.querySelector<SVGElement>(`#${id}`) ?? null;

  function refuse(target: SVGElement | null) {
    const face = target?.querySelector<SVGElement>('.face') ?? target;
    if (!face) return;
    face.classList.remove('refuse');
    void face.getBoundingClientRect();
    face.classList.add('refuse');
  }

  function setBar(v: NegotiationView, before: NegotiationView | null) {
    const { least: lo, most: hi } = v.willingness,
      scale = (score: number) =>
        `scaleX(${r2(Math.min(1, Math.max(0, (score - lo) / (hi - lo))))})`;
    const fill = part('bar-fill')?.querySelector<SVGElement>('rect'),
      band = part('bar-band')?.querySelector<SVGElement>('rect');
    if (fill) {
      fill.style.transform = scale(v.willingness.lo);
      fill.setAttribute('fill', ZONE_WASH[zoneOf(v.willingness.lo, v)]);
    }
    if (band) band.style.transform = scale(v.willingness.hi);
    if (!before) return;
    for (const [id, line] of [
      ['mark-counters', v.willingness.counters],
      ['mark-signs', v.willingness.signs],
    ] as const) {
      const crossed = (a: number, b: number) => a < line !== b < line;
      if (
        crossed(before.willingness.lo, v.willingness.lo) ||
        crossed(before.willingness.hi, v.willingness.hi)
      ) {
        const mark = part(id);
        mark?.classList.remove('ping');
        void mark?.getBoundingClientRect();
        mark?.classList.add('ping');
      }
    }
  }

  function setTerms(v: NegotiationView, before: NegotiationView | null) {
    for (const { key, row } of STEPPED) {
      if (before && before[key].value === v[key].value) continue;
      const host = part(`${key}-value`);
      if (host)
        host.innerHTML = stepperValue(
          TERMS.label + TERMS.w / 2,
          rowY(row),
          grouped(v[key].value)
        );
    }
    if (svg) pickTo(svg, 'seasons', TERMS.w, 3, v.seasons.value - 1);
    const cost = part('cost');
    if (cost) cost.innerHTML = costRow(v);
    const offer = part('offer')?.querySelector('.face');
    if (offer) offer.innerHTML = offerFace(v);
    setBar(v, before);
  }

  function setAnswer(v: NegotiationView, landing: boolean) {
    const host = part('answer'),
      pips = part('attempts');
    if (host) host.innerHTML = answer(v, landing);
    if (pips) pips.innerHTML = attempts(v, landing);
    const accept = part('accept');
    if (accept && v.counter) {
      const faint = v.counter.faint,
        id = v.person;
      pressable(
        accept,
        faint
          ? () => refuse(accept)
          : () => port.send({ type: 'AcceptCounter', team: 0, person: id }),
        'accept'
      );
    }
    if (landing && v.answer === 'signed') {
      window.clearTimeout(leaving);
      leaving = window.setTimeout(() => {
        if (view?.answer === 'signed' && !el.hidden) port.close();
      }, MOTION.signed.hold);
    }
  }

  function edited(
    change: (e: Edit, v: NegotiationView) => Edit,
    from: SVGElement | null
  ) {
    if (!view || !edit) return;
    const next = price(change(edit, view));
    if (!next) return;
    const same =
      next.terms.wage === view.terms.wage &&
      next.terms.fee === view.terms.fee &&
      next.terms.clause === view.terms.clause &&
      next.terms.seasons === view.terms.seasons;
    if (same) {
      refuse(from);
      return;
    }
    const before = view;
    view = next;
    edit =
      next.edit.clause === null
        ? { ...next.terms, clause: null }
        : { ...next.terms };
    setTerms(next, before);
  }

  function build(v: NegotiationView) {
    const { tall, body: art } = cardOf(v);
    cardBox.replaceChildren(svgNode(CARD.w, tall, art));
    cardBox.style.top = `${PAD + (H - tall) / 2}px`;
    let s = '';
    for (const { key, word: said, row } of STEPPED)
      s +=
        word(0, rowY(row), said, TYPE.word, { anchor: 'start', weight: 600 }) +
        stepperFace(
          key,
          TERMS.label,
          rowY(row),
          TERMS.w,
          grouped(v[key].value)
        );
    s +=
      word(0, rowY(1), 'Seasons', TYPE.word, { anchor: 'start', weight: 600 }) +
      pickerFace(
        'seasons',
        TERMS.label,
        rowY(1),
        TERMS.w,
        v.seasons.choices.map(String),
        v.seasons.value - 1
      );
    s += `<g id="cost">${costRow(v)}</g>`;
    s += barFrame(v);
    s += `<g id="answer"></g><g id="attempts"></g>`;
    s += `<g id="offer"><g class="face">${offerFace(v)}</g></g>`;
    svg = svgNode(W, H, s);
    area.replaceChildren(svg);
    for (const { key } of STEPPED) {
      const step = v[key].step,
        moved = (sign: number, times: number) => (e: Edit) =>
          key === 'clause'
            ? {
                ...e,
                clause:
                  (e.clause ?? view?.terms.clause ?? 0) + sign * step * times,
              }
            : { ...e, [key]: e[key] + sign * step * times };
      for (const [side, sign] of [
        ['minus', -1],
        ['plus', 1],
      ] as const) {
        const button = part(`${key}-${side}`);
        holdable(
          button,
          (times) => edited(moved(sign, times), button),
          `${key}-${side}`
        );
      }
    }
    if (svg)
      bindPicker(svg, 'seasons', 3, (i) => {
        const seasons = v.seasons.choices[i];
        if (seasons !== undefined)
          edited((e) => ({ ...e, seasons }), part(`seasons-${i}`));
      });
    const offer = part('offer');
    pressable(
      offer,
      () => {
        if (!view) return;
        if (view.offer.faint) {
          refuse(offer);
          return;
        }
        offered = true;
        port.send({
          type: 'Offer',
          team: 0,
          person: view.person,
          terms: view.terms,
        });
      },
      'offer'
    );
    setTerms(v, null);
    setAnswer(v, false);
  }

  return {
    el,
    show(pricing: Pricing) {
      price = pricing;
      const next = price(edit);
      if (!next) return;
      const before = view;
      view = next;
      if (person !== next.person || !svg) {
        person = next.person;
        edit = next.edit;
        offered = false;
        window.clearTimeout(pending);
        build(next);
        return;
      }
      const changed =
        before !== null &&
        (before.attempts.used !== next.attempts.used ||
          before.answer !== next.answer ||
          before.counter?.wage !== next.counter?.wage);
      const land = (v: NegotiationView, from: NegotiationView | null) => {
        if (v.answer !== 'signed') setTerms(v, from);
        setAnswer(v, true);
      };
      if (!changed) {
        if (!waitingFor) setTerms(next, before);
        if (!waitingFor) setAnswer(next, false);
        return;
      }
      if (offered) {
        offered = false;
        waitingFor = true;
        const host = part('answer');
        if (host) host.innerHTML = waiting();
        window.clearTimeout(pending);
        pending = window.setTimeout(() => {
          waitingFor = false;
          if (view) land(view, before);
        }, MOTION.suspense.ms);
      } else land(next, before);
    },
    reset() {
      waitingFor = false;
      window.clearTimeout(pending);
      window.clearTimeout(leaving);
      person = null;
      view = null;
      edit = null;
      svg = null;
    },
    back: () => false,
  };
}
