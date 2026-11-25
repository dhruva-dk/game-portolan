import type { CardView } from '../../career/views/card.ts';
import type { CandidateView, DealView } from '../../career/views/deal.ts';
import { pressable } from '../base/button.ts';
import {
  CANDIDATE,
  LARGE,
  cardCandidate,
  cardLarge,
  type Candidacy,
} from '../base/card.ts';
import { growFrom, shrinkBack } from '../base/enlarge.ts';
import { MOTION, SPACE } from '../base/house.ts';
import { r2, svgNode } from '../base/ink.ts';
import { sheet } from '../base/sheet.ts';
import { piece, placed, screen } from '../base/ui.ts';
import type { LobbyPort } from './port.ts';
import { SHEET } from './team.ts';
import { actionRow, bindActs, resolving, type Acting } from './candidate.ts';

const PAD = SPACE.pad;
const GAP = SPACE.pad;

const ROW = { h: SHEET.h - 2 * PAD - CANDIDATE.h - SPACE.gap };
const COLUMN = CANDIDATE.h + SPACE.gap + ROW.h;
const DEALT = { rise: 150 } as const;

const slotX = (i: number, n: number) =>
  (SHEET.w - n * CANDIDATE.w - (n - 1) * GAP) / 2 + i * (CANDIDATE.w + GAP);

const candidacy = (c: CandidateView, holder: CardView | null): Candidacy => ({
  pinned: c.pinned,
  rival: c.rival,
  holder: holder ? holder.stats.map((s) => s.value.lo) : null,
});

const acting = (c: CandidateView): Acting => ({
  report: c.report,
  approach: c.approach,
  negotiate: c.negotiate,
});

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
    tweens: (() => void)[] = [];

  const enlarging = { large, under: () => columns };

  function bindActsOf(svg: SVGSVGElement, c: CandidateView, tag: string) {
    bindActs(svg, acting(c), c.card.person, tag, port);
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
        actionRow(acting(c), `${i}`, {
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
    bindActsOf(svg, c, `${i}`);
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
        actionRow(acting(c), 'large', drawn.actions)
    );
    large.replaceChildren(svg);
    pressable(svg.querySelector<SVGElement>('#large'), () => shrink(), 'large');
    bindActsOf(svg, c, 'large');
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
    tweens[i] = resolving(from, c.card, (face) => {
      const small = columns[i]?.querySelector('#card .art');
      if (small) small.innerHTML = art(c, face, i);
      if (enlarged === i) {
        const big = large.querySelector('#large .art');
        if (big) big.innerHTML = largeArt(c, face).svg;
      }
    });
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
      for (const stop of tweens) stop();
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
