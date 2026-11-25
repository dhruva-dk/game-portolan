import type { PaintEdit, PaintView } from '../../career/views/paint.ts';
import { pressable, ribbon } from '../base/button.ts';
import { grouped } from '../base/grouped.ts';
import { MOTION, SPACE, TYPE } from '../base/house.ts';
import { liveryColors } from '../base/emblem.ts';
import { INK, figure, glyph, svgNode } from '../base/ink.ts';
import { least } from '../base/lexicon.ts';
import {
  LIVERY_HEIGHT,
  bindLivery,
  liveryFace,
  setLivery,
  type LiveryPick,
} from '../base/livery.ts';
import { dyePot } from '../base/marks.ts';
import { sheet } from '../base/sheet.ts';
import { piece, screen } from '../base/ui.ts';
import { measured, word } from '../base/word.ts';
import type { LobbyPort } from './port.ts';

const PAD = SPACE.pad;
const W = 272;
const INNER = W - 2 * PAD;
const TITLE = { y: 36, pot: 34, size: 30, rule: 62 } as const;
const CHOOSER = { y: 78 } as const;
const REPAINT = {
  y: CHOOSER.y + LIVERY_HEIGHT + 34,
  w: 150,
  size: TYPE.figure,
} as const;
const H = REPAINT.y + 30;

const r2 = (n: number) => Math.round(n * 100) / 100;

export type PaintPricing = (edit: PaintEdit | null) => PaintView;

function titleLeft() {
  const said = measured('Paint', TITLE.size, { weight: 600 });
  return { said, left: PAD + (INNER - TITLE.pot - SPACE.gap - said) / 2 };
}

const pot = (dye: string) =>
  dyePot(titleLeft().left + TITLE.pot / 2, TITLE.y + 2, TITLE.pot, dye);

function title(dye: string) {
  const { said, left } = titleLeft(),
    cx = PAD + INNER / 2,
    half = INNER / 2 - 24,
    y = TITLE.rule;
  return (
    `<g class="inked-rose"><g id="pot">${pot(dye)}</g></g>` +
    `<g class="inked-word">${word(left + TITLE.pot + SPACE.gap + said / 2, TITLE.y + 1, 'Paint', TITLE.size, { weight: 600 })}</g>` +
    `<g class="inked-rule"><path d="M${r2(cx - half)} ${y}H${r2(cx - 7)}M${r2(cx + 7)} ${y}H${r2(cx + half)}" stroke="${INK.iron}" stroke-width=".9"/>` +
    `<path d="M${r2(cx)} ${y - 4.5}L${r2(cx + 4.5)} ${y}L${r2(cx)} ${y + 4.5}L${r2(cx - 4.5)} ${y}Z" fill="${INK.rubric}" stroke="${INK.iron}" stroke-width=".6"/>` +
    `<circle cx="${r2(cx - half)}" cy="${y}" r="1.6" fill="${INK.iron}"/><circle cx="${r2(cx + half)}" cy="${y}" r="1.6" fill="${INK.iron}"/></g>`
  );
}

function repaintFace(v: PaintView) {
  const cx = PAD + INNER / 2,
    cy = REPAINT.y,
    coin = least('coin') + 2,
    cost = grouped(v.cost),
    w =
      coin +
      SPACE.hair +
      measured(cost, REPAINT.size, { italic: true, weight: 600 }),
    x = cx - w / 2;
  return (
    ribbon(
      cx,
      cy,
      REPAINT.w,
      glyph('coin', x + coin / 2, cy - 1, coin) +
        figure(x + w, cy - 1, cost, REPAINT.size, {
          anchor: 'end',
          weight: 600,
        }),
      !v.faint
    ) +
    `<g class="short" opacity="${v.why === 'funds' ? 1 : 0}">${glyph('cross', x + coin / 2, cy - 1, coin + 3, { ink: 'rubric' })}</g>`
  );
}

export function createPaint(port: LobbyPort) {
  const el = screen();
  el.hidden = true;
  const body = piece(el, 'top left', false, true);
  body.style.width = `${W}px`;
  body.style.height = `${H}px`;

  let price: PaintPricing | null = null,
    view: PaintView | null = null,
    edit: PaintEdit | null = null,
    svg: SVGSVGElement | null = null,
    done = false;

  const part = (id: string) => svg?.querySelector<SVGElement>(`#${id}`) ?? null;

  function replay(target: Element | null | undefined, name: string) {
    if (!target) return;
    target.classList.remove(name);
    void target.getBoundingClientRect();
    target.classList.add(name);
  }

  function setRepaint(v: PaintView, before: PaintView | null) {
    const face = part('repaint')?.querySelector<SVGElement>('.lively');
    if (!face) return;
    if (before?.faint !== v.faint || before.why !== v.why) {
      face.innerHTML = repaintFace(v);
      face.style.opacity = v.faint ? '0.42' : '1';
      if (before?.faint && !v.faint) replay(face, 'waking');
    }
  }

  function update(next: PaintEdit) {
    if (!price || !svg) return;
    const before = view,
      v = price(next);
    view = v;
    edit = { livery: v.livery, emblem: v.emblem };
    setLivery(svg, 'livery', INNER, v);
    setRepaint(v, before);
    const potEl = part('pot');
    if (potEl && before?.livery.dye !== v.livery.dye) {
      potEl.innerHTML = pot(liveryColors(v.livery)[0]);
      replay(potEl, 'answer');
    }
    if (
      before?.emblem !== v.emblem ||
      before.livery.dye !== v.livery.dye ||
      before.livery.pattern !== v.livery.pattern
    )
      port.scene.wear(v.livery, v.emblem);
  }

  function picked(kind: LiveryPick, i: number): boolean {
    const v = view;
    if (!v || done) return false;
    const swatch =
      kind === 'dye'
        ? v.dyes[i]
        : kind === 'pattern'
          ? v.patterns[i]
          : v.emblems[i];
    if (!swatch || swatch.faint) return false;
    const now = { livery: v.livery, emblem: v.emblem };
    if (kind === 'dye') update({ ...now, livery: { ...v.livery, dye: i } });
    else if (kind === 'pattern')
      update({ ...now, livery: { ...v.livery, pattern: i } });
    else update({ ...now, emblem: i });
    return true;
  }

  function repaint() {
    const v = view,
      target = part('repaint');
    if (!v || done) return;
    done = !v.faint;
    if (
      !done ||
      port.send({
        type: 'Repaint',
        team: 0,
        livery: v.livery,
        emblem: v.emblem,
      })
    ) {
      done = false;
      replay(target?.querySelector('.lively'), 'refuse');
      return;
    }
    replay(target?.querySelector('.lively'), 'answer');
    port.scene.jolt('painted');
    window.setTimeout(() => port.close(), MOTION.painted.hold);
  }

  function build(v: PaintView) {
    let s = sheet(0, 0, W, H, { seed: 83 });
    s += title(liveryColors(v.livery)[0]);
    s += `<g class="arrive" style="animation-delay:${MOTION.deal.after}ms"><g transform="translate(${PAD} ${CHOOSER.y})">${liveryFace('livery', INNER, v)}</g></g>`;
    s += `<g class="arrive" style="animation-delay:${MOTION.deal.after + MOTION.deal.stagger}ms"><g id="repaint"><g class="lively" style="opacity:${v.faint ? 0.42 : 1}">${repaintFace(v)}</g></g></g>`;
    svg = svgNode(W, H, s);
    body.replaceChildren(svg);
    bindLivery(svg, 'livery', picked);
    pressable(part('repaint'), repaint, 'repaint');
  }

  return {
    el,
    open() {
      edit = null;
      view = null;
      svg = null;
      done = false;
    },
    show(pricing: PaintPricing) {
      price = pricing;
      if (done) return;
      const v = price(edit),
        first = svg === null;
      if (first) {
        view = v;
        edit = { livery: v.livery, emblem: v.emblem };
        build(v);
        return;
      }
      update({ livery: v.livery, emblem: v.emblem });
    },
    edit: () => edit,
  };
}
