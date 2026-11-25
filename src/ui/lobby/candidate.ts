import type { CardView } from '../../career/views/card.ts';
import type { ActionView } from '../../career/views/deal.ts';
import { pressable } from '../base/button.ts';
import { FAINT, MOTION, SPACE, TYPE } from '../base/house.ts';
import { figure, glyph, slip } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import { grouped } from '../base/grouped.ts';
import { measured, word, type Word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';

export type Act = 'report' | 'approach' | 'negotiate';

export type Acting = {
  report: ActionView | null;
  approach: ActionView | null;
  negotiate: { faint: boolean } | null;
};

export type Box = { x: number; y: number; w: number; h: number };

const ACTS: readonly { act: Act; word: Word }[] = [
  { act: 'report', word: 'Report' },
  { act: 'approach', word: 'Approach' },
  { act: 'negotiate', word: 'Negotiate' },
];

const LINE = 7.5;
const COST = TYPE.word + 2;
const PINNED = 20;

const present = (a: Acting) => ACTS.filter(({ act }) => a[act] !== null);

const faintOf = (a: Acting, act: Act) => a[act]?.faint ?? true;

function costWidth(a: ActionView) {
  return (
    least('coin') +
    SPACE.hair +
    measured(grouped(a.cost), COST, { italic: true, weight: 600 })
  );
}

function natural(a: Acting, act: Act, said: Word) {
  const w = measured(said, TYPE.word, { weight: 600 }),
    cost = act === 'negotiate' ? null : a[act];
  return cost ? Math.max(w, costWidth(cost)) : w;
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
      figure(x + w, cy, grouped(a.cost), COST, { anchor: 'end', weight: 600 }),
    mark:
      a.why === 'funds'
        ? glyph('cross', x + coin / 2, cy, coin + 2, { ink: 'rubric' })
        : '',
  };
}

export function actionRow(a: Acting, tag: string, box: Box) {
  const acts = present(a),
    widths = acts.map(({ act, word: said }) => natural(a, act, said)),
    gaps = (acts.length - 1) * SPACE.hair,
    free = box.w - gaps - widths.reduce((x, y) => x + y, 0),
    cy = box.y + box.h / 2;
  let x = box.x,
    s = '';
  acts.forEach(({ act, word: said }, i) => {
    const w = widths[i] + free / acts.length,
      mid = x + w / 2,
      priced = act === 'negotiate' ? null : a[act],
      cost = priced
        ? costRow(priced, act, mid, cy + LINE + 1)
        : { faint: '', mark: '' },
      shown = word(mid, priced ? cy - LINE : cy, said, TYPE.word, {
        weight: 600,
      });
    s +=
      `<g id="${act}-${tag}"><g class="face">` +
      `<g${faintOf(a, act) ? ` opacity="${FAINT}"` : ''}>${slip(x, box.y, w, box.h)}${shown}${cost.faint}</g>` +
      cost.mark +
      '</g></g>';
    x += w + SPACE.hair;
  });
  return s;
}

export function refuse(el: Element | null) {
  const face = el?.querySelector<SVGElement>('.face');
  if (!face) return;
  face.classList.remove('refuse');
  void face.getBoundingClientRect();
  face.classList.add('refuse');
}

export function bindActs(
  svg: SVGSVGElement,
  a: Acting,
  person: number | null,
  tag: string,
  port: LobbyPort
) {
  if (person === null) return;
  const acts: Record<Act, () => void> = {
    report: () => port.send({ type: 'BuyReport', team: 0, person }),
    approach: () => port.send({ type: 'Approach', team: 0, person }),
    negotiate: () => port.open('negotiation', { person }),
  };
  for (const { act } of present(a)) {
    const el = svg.querySelector<SVGElement>(`#${act}-${tag}`);
    pressable(
      el,
      faintOf(a, act) ? () => refuse(el) : acts[act],
      `${act}-${tag}`
    );
  }
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function between(a: CardView, b: CardView, t: number): CardView {
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

export function resolving(
  from: CardView,
  to: CardView,
  draw: (face: CardView) => void
): () => void {
  const start = performance.now(),
    { ms } = MOTION.number;
  let frame = 0;
  const step = (now: number) => {
    const t = settle(Math.min(1, (now - start) / ms));
    draw(between(from, to, t));
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
