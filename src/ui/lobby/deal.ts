import type { CardView } from '../../career/views/card.ts';
import type {
  ActionView,
  CandidateView,
  DealView,
} from '../../career/views/deal.ts';
import { pressable } from '../base/button.ts';
import {
  CANDIDATE,
  LARGE,
  cardCandidate,
  cardLarge,
  type Candidacy,
} from '../base/card.ts';
import { growFrom, shrinkBack } from '../base/enlarge.ts';
import { FAINT, MOTION, SPACE, TYPE } from '../base/house.ts';
import { figure, glyph, slip, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { sheet } from '../base/sheet.ts';
import { piece, placed, screen } from '../base/ui.ts';
import { measured, word, type Word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';
import { SHEET } from './team.ts';

const PAD = SPACE.pad;
const GAP = SPACE.pad;
const ROW = { h: SHEET.h - 2 * PAD - CANDIDATE.h - SPACE.gap, line: 7.5 };
const COLUMN = CANDIDATE.h + SPACE.gap + ROW.h;
const DEALT = { rise: 150 } as const;

type Act = 'report' | 'approach' | 'negotiate';
const ACTS: readonly { act: Act; word: Word }[] = [
  { act: 'report', word: 'Report' },
  { act: 'approach', word: 'Approach' },
  { act: 'negotiate', word: 'Negotiate' },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

const slotX = (i: number, n: number) =>
  (SHEET.w - n * CANDIDATE.w - (n - 1) * GAP) / 2 + i * (CANDIDATE.w + GAP);

const candidacy = (c: CandidateView, holder: CardView | null): Candidacy => ({
  pinned: c.pinned,
  rival: c.rival,
  holder: holder ? holder.stats.map((s) => s.value.lo) : null,
});

const costText = (cost: number) => cost.toLocaleString('en-US');
const COST = TYPE.word + 2;
const PINNED = 20;

function costWidth(a: ActionView) {
  return (
    least('coin') +
    SPACE.hair +
    measured(costText(a.cost), COST, { italic: true, weight: 600 })
  );
}

function natural(c: CandidateView, act: Act, said: Word) {
  const w = measured(said, TYPE.word, { weight: 600 });
  return act === 'negotiate' ? w : Math.max(w, costWidth(c[act]));
}

function costRow(a: ActionView, act: Act, cx: number, cy: number) {
  const coin = least('coin');
  if (a.why === 'held')
    return {
      faint: '',
      mark:
        act === 'approach'
          ? glyph('pin', cx, cy, PINNED)
          : glyph('tick', cx, cy, least('tick')),
    };
  const w = costWidth(a),
    x = cx - w / 2;
  return {
    faint:
      glyph('coin', x + coin / 2, cy, coin) +
      figure(x + w, cy, costText(a.cost), COST, { anchor: 'end', weight: 600 }),
    mark:
      a.why === 'funds'
        ? glyph('cross', x + coin / 2, cy, coin + 2, { ink: 'rubric' })
        : '',
  };
}

function actionRow(c: CandidateView, tag: string, box: Box) {
  const widths = ACTS.map(({ act, word: said }) => natural(c, act, said)),
    free = box.w - 2 * SPACE.hair - widths.reduce((a, b) => a + b, 0),
    cy = box.y + box.h / 2;
  let x = box.x,
    s = '';
  ACTS.forEach(({ act, word: said }, i) => {
    const w = widths[i] + free / ACTS.length,
      mid = x + w / 2,
      faint = act === 'negotiate' ? c.negotiate.faint : c[act].faint,
      cost =
        act === 'negotiate'
          ? { faint: '', mark: '' }
          : costRow(c[act], act, mid, cy + ROW.line + 1),
      shown =
        act === 'negotiate'
          ? word(mid, cy, said, TYPE.word, { weight: 600 })
          : word(mid, cy - ROW.line, said, TYPE.word, { weight: 600 });
    s +=
      `<g id="${act}-${tag}"><g class="face">` +
      `<g${faint ? ` opacity="${FAINT}"` : ''}>${slip(x, box.y, w, box.h)}${shown}${cost.faint}</g>` +
      cost.mark +
      '</g></g>';
    x += w + SPACE.hair;
  });
  return s;
}

type Box = { x: number; y: number; w: number; h: number };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function between(a: CardView, b: CardView, t: number): CardView {
  const span = (
    x: { lo: number; hi: number },
    y: { lo: number; hi: number }
  ) => ({ lo: mix(x.lo, y.lo, t), hi: mix(x.hi, y.hi, t) });
  return {
    ...b,
    stars: span(a.stars, b.stars),
    stats: b.stats.map((s, i) => ({
      stat: s.stat,
      value: span(a.stats[i]?.value ?? s.value, s.value),
    })),
    wage: a.wage && b.wage ? span(a.wage, b.wage) : b.wage,
  };
}

const settle = (t: number) => 1 - (1 - t) ** 3;

export function createDeal(port: LobbyPort) {
  const el = screen();
  el.hidden = true;
  const body = piece(el, 'bottom center', false, true);
  body.style.width = `${SHEET.w}px`;
  body.style.height = `${SHEET.h}px`;
  const ground = placed(body, 0, 0, SHEET.w, SHEET.h);
  const paper = svgNode(
    SHEET.w,
    SHEET.h,
    sheet(0, 0, SHEET.w, SHEET.h, { seed: 31 })
  );
  ground.append(paper);
  const hand = placed(body, 0, 0, SHEET.w, SHEET.h);
  const large = placed(body, PAD, PAD, LARGE.w, LARGE.h);
  large.hidden = true;

  let view: DealView | null = null,
    columns: HTMLElement[] = [],
    enlarged: number | null = null,
    dealing = false,
    tweens: number[] = [];

  const enlarging = { large, under: () => columns };

  function refuse(el: SVGElement | null) {
    const face = el?.querySelector<SVGElement>('.face');
    if (!face) return;
    face.classList.remove('refuse');
    void face.getBoundingClientRect();
    face.classList.add('refuse');
  }

  function bindActs(svg: SVGSVGElement, c: CandidateView, tag: string) {
    const person = c.card.person;
    if (person === null) return;
    const acts: Record<Act, () => void> = {
      report: () => port.send({ type: 'BuyReport', team: 0, person }),
      approach: () => port.send({ type: 'Approach', team: 0, person }),
      negotiate: () => port.open('negotiation', { person }),
    };
    for (const { act } of ACTS) {
      const el = svg.querySelector<SVGElement>(`#${act}-${tag}`),
        faint = act === 'negotiate' ? c.negotiate.faint : c[act].faint;
      pressable(el, faint ? () => refuse(el) : acts[act], `${act}-${tag}`);
    }
  }

  function art(c: CandidateView, face: CardView, i: number) {
    return cardCandidate(face, candidacy(c, view?.holder ?? null), 7 + i * 5);
  }

  function column(c: CandidateView, i: number, n: number) {
    const x = slotX(i, n),
      col = placed(hand, x, PAD, CANDIDATE.w, COLUMN);
    const svg = svgNode(
      CANDIDATE.w,
      COLUMN,
      `<g id="card"><g class="art">${art(c, c.card, i)}</g></g>` +
        actionRow(c, `${i}`, {
          x: 0,
          y: CANDIDATE.h + SPACE.gap,
          w: CANDIDATE.w,
          h: ROW.h,
        })
    );
    col.append(svg);
    pressable(
      svg.querySelector<SVGElement>('#card'),
      () => enlarge(i),
      `candidate-${i}`
    );
    bindActs(svg, c, `${i}`);
    if (dealing) {
      const { after, stagger } = MOTION.deal;
      col.classList.add('dealt');
      col.style.setProperty('--x', `${r2(-x)}px`);
      col.style.setProperty('--y', `${-DEALT.rise}px`);
      col.style.animationDelay = `${after + i * stagger}ms`;
    }
    return col;
  }

  function largeArt(c: CandidateView, face: CardView) {
    return cardLarge(face, 41, candidacy(c, view?.holder ?? null));
  }

  function drawLarge() {
    const c = enlarged === null ? null : view?.candidates[enlarged];
    if (!c) return;
    const drawn = largeArt(c, c.card);
    const svg = svgNode(
      LARGE.w,
      LARGE.h,
      `<g id="large"><g class="art">${drawn.svg}</g></g>` +
        actionRow(c, 'large', drawn.actions)
    );
    large.replaceChildren(svg);
    pressable(svg.querySelector<SVGElement>('#large'), () => shrink(), 'large');
    bindActs(svg, c, 'large');
  }

  function enlarge(i: number) {
    enlarged = i;
    drawLarge();
    const n = view?.candidates.length ?? 3;
    growFrom(
      enlarging,
      { x: slotX(i, n) + CANDIDATE.w / 2 - PAD, y: CANDIDATE.h / 2 },
      CANDIDATE.w
    );
  }

  function shrink(instant = false) {
    if (enlarged === null) return;
    enlarged = null;
    shrinkBack(enlarging, CANDIDATE.w, instant, () => enlarged !== null);
  }

  function resolve(i: number, c: CandidateView, from: CardView) {
    const start = performance.now(),
      { ms } = MOTION.number;
    const frame = (now: number) => {
      const t = settle(Math.min(1, (now - start) / ms)),
        face = between(from, c.card, t);
      const small = columns[i]?.querySelector('#card .art');
      if (small) small.innerHTML = art(c, face, i);
      if (enlarged === i) {
        const big = large.querySelector('#large .art');
        if (big) big.innerHTML = largeArt(c, face).svg;
      }
      if (t < 1) tweens[i] = requestAnimationFrame(frame);
    };
    tweens[i] = requestAnimationFrame(frame);
  }

  function stamp(i: number) {
    for (const host of [columns[i], enlarged === i ? large : null])
      host?.querySelector('#pin')?.classList.add('stamp');
  }

  return {
    el,
    show(v: DealView) {
      const before = view?.role === v.role ? view : null;
      const shown = enlarged;
      for (const t of tweens) cancelAnimationFrame(t);
      tweens = [];
      view = v;
      const n = v.candidates.length;
      columns = v.candidates.map((c, i) => column(c, i, n));
      hand.replaceChildren(...columns);
      dealing = false;
      if (shown !== null) {
        if (shown >= n) shrink(true);
        else {
          drawLarge();
          for (const c of columns) {
            c.style.opacity = '0';
            c.style.pointerEvents = 'none';
          }
        }
      }
      v.candidates.forEach((c, i) => {
        const was = before?.candidates.find(
          (b) => b.card.person === c.card.person
        );
        if (!was) return;
        if (!was.exact && c.exact) resolve(i, c, was.card);
        if (!was.pinned && c.pinned) stamp(i);
      });
    },
    open() {
      shrink(true);
      view = null;
      dealing = true;
    },
    back(): boolean {
      if (enlarged === null) return false;
      shrink();
      return true;
    },
  };
}
