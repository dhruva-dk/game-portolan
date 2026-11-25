import type {
  NewCareerForm,
  NewCareerView,
} from '../../career/views/new-career.ts';
import { rolled } from '../../world/seeds.ts';
import { pressable, ribbon, roundButton } from '../base/button.ts';
import { field, type Field } from '../base/field.ts';
import { MOTION, SIZE, SPACE, TYPE } from '../base/house.ts';
import { INK, glyph, r2, svgNode } from '../base/ink.ts';
import {
  bindLivery,
  liveryFace,
  setLivery,
  type LiveryPick,
} from '../base/livery.ts';
import { die, rhumbs, rose } from '../base/marks.ts';
import { sheet } from '../base/sheet.ts';
import { piece, screen } from '../base/ui.ts';
import { label, measured, word } from '../base/word.ts';
import type { NewCareerPort } from './port.ts';

const SHEET = { w: 272, h: 440 } as const;
const PAD = SPACE.pad;
const INNER = SHEET.w - 2 * PAD;
const TITLE = { y: 42, size: 38, rose: 16, band: 72, rule: 72 } as const;
const ROW = { name: 102, seed: 146, label: 48 } as const;
const DIE = { r: SIZE.slip / 2, size: 26 } as const;
const CHOOSER = { y: 178 } as const;
const START = { y: 400, w: 150, confirm: TYPE.name + 3, tick: 20 } as const;
const RISE = 24;

export type NewCareerPricing = (form: NewCareerForm | null) => NewCareerView;

function title(v: NewCareerView) {
  const size = TITLE.size,
    wordW = measured(v.title, size, { weight: 600 }),
    roseD = 2 * TITLE.rose,
    total = roseD + SPACE.gap + wordW,
    left = PAD + (INNER - total) / 2,
    rx = left + TITLE.rose,
    ry = TITLE.y,
    wx = left + roseD + SPACE.gap + wordW / 2;
  const band = `<clipPath id="title-band"><rect x="${PAD}" y="${PAD}" width="${INNER}" height="${TITLE.band - PAD}"/></clipPath>`;
  const ruleY = TITLE.rule,
    half = INNER / 2 - 18,
    cx = PAD + INNER / 2;
  return (
    band +
    `<g clip-path="url(#title-band)"><g class="inked-rhumbs" style="transform-origin:${r2(rx)}px ${r2(ry)}px">${rhumbs(rx, ry, INNER * 1.1, 0.32)}</g></g>` +
    `<g class="inked-rose">${rose(rx, ry, TITLE.rose, 0)}</g>` +
    `<g class="inked-word">${label(wx, ry + 1, v.title, size, { weight: 600, spacing: 0.01 })}</g>` +
    `<g class="inked-rule">` +
    `<path d="M${r2(cx - half)} ${ruleY}H${r2(cx - 7)}M${r2(cx + 7)} ${ruleY}H${r2(cx + half)}" stroke="${INK.iron}" stroke-width=".9"/>` +
    `<path d="M${r2(cx - half + 10)} ${ruleY + 3}H${r2(cx - 12)}M${r2(cx + 12)} ${ruleY + 3}H${r2(cx + half - 10)}" stroke="${INK.iron}" stroke-width=".5" opacity=".6"/>` +
    `<path d="M${r2(cx)} ${ruleY - 4.5}L${r2(cx + 4.5)} ${ruleY}L${r2(cx)} ${ruleY + 4.5}L${r2(cx - 4.5)} ${ruleY}Z" fill="${INK.rubric}" stroke="${INK.iron}" stroke-width=".6"/>` +
    `<circle cx="${r2(cx - half)}" cy="${ruleY}" r="1.6" fill="${INK.iron}"/><circle cx="${r2(cx + half)}" cy="${ruleY}" r="1.6" fill="${INK.iron}"/>` +
    '</g>'
  );
}

function startFace(v: NewCareerView) {
  const cx = PAD + INNER / 2,
    cy = START.y,
    idle = ribbon(
      cx,
      cy,
      START.w,
      word(cx, cy - 1, 'Start', TYPE.ribbon, { weight: 600 })
    );
  if (!v.start.twoTap) return idle;
  const said = measured('Confirm?', START.confirm, { weight: 600 }),
    left = cx - (said + SPACE.hair + START.tick) / 2;
  return (
    `<g class="two"><g class="unsure">${idle}</g><g class="sure">` +
    ribbon(
      cx,
      cy,
      START.w,
      word(left, cy - 1, 'Confirm?', START.confirm, {
        anchor: 'start',
        weight: 600,
      }) +
        glyph(
          'tick',
          left + said + SPACE.hair + START.tick / 2,
          cy - 1,
          START.tick
        ),
      true
    ) +
    '</g></g>'
  );
}

const delayOf = (i: number) =>
  MOTION.deal.after + MOTION.title.after * 2 + i * MOTION.deal.stagger;

const arriving = (i: number) =>
  `class="arrive" style="animation-delay:${delayOf(i)}ms"`;

function arrive(el: HTMLElement, i: number) {
  el.classList.add('arrive');
  el.style.animationDelay = `${delayOf(i)}ms`;
}

export function createNewCareer(port: NewCareerPort) {
  const el = screen();
  const body = piece(el, 'top left', false, true);
  body.style.width = `${SHEET.w}px`;
  body.style.height = `${SHEET.h}px`;

  let price: NewCareerPricing | null = null,
    view: NewCareerView | null = null,
    form: NewCareerForm | null = null,
    svg: SVGSVGElement | null = null,
    fields: { name: Field; seed: Field } | null = null,
    armed = false,
    leaving = false;

  const part = (id: string) => svg?.querySelector<SVGElement>(`#${id}`) ?? null;

  function refuse(target: SVGElement | null) {
    if (!target) return;
    target.classList.remove('refuse');
    void target.getBoundingClientRect();
    target.classList.add('refuse');
  }

  function disarm() {
    armed = false;
    part('start')?.querySelector('.two')?.classList.remove('armed');
    document.removeEventListener('pointerdown', elsewhere, true);
  }

  function elsewhere(e: PointerEvent) {
    const start = part('start');
    if (e.target instanceof Node && start?.contains(e.target)) return;
    disarm();
  }

  function setStart(v: NewCareerView, before: NewCareerView | null) {
    const start = part('start'),
      face = start?.querySelector<SVGElement>('.lively');
    if (!start || !face) return;
    face.style.opacity = v.start.faint ? '0.42' : '1';
    if (v.start.faint) disarm();
    if (before?.start.faint && !v.start.faint) {
      face.classList.remove('waking');
      void face.getBoundingClientRect();
      face.classList.add('waking');
    }
  }

  function update(next: NewCareerForm) {
    if (!price) return;
    const before = view,
      v = price(next);
    view = v;
    form = v.form;
    if (svg) setLivery(svg, 'livery', INNER, v);
    setStart(v, before);
    const was = before?.wearing ?? null,
      now = v.wearing;
    if (
      before?.emblem !== v.emblem ||
      was?.dye !== now?.dye ||
      was?.pattern !== now?.pattern
    )
      port.scene.wear(now, v.emblem);
  }

  function picked(kind: LiveryPick, i: number) {
    if (!form) return;
    if (kind === 'dye')
      update({ ...form, livery: { ...form.livery, dye: i }, dyed: true });
    else if (kind === 'pattern')
      update({ ...form, livery: { ...form.livery, pattern: i } });
    else update({ ...form, emblem: i });
  }

  function roll() {
    const dieMark = part('roll-die');
    dieMark?.classList.remove('rolling');
    void dieMark?.getBoundingClientRect();
    dieMark?.classList.add('rolling');
    const seed = rolled(Math.random);
    window.setTimeout(() => {
      fields?.seed.set(seed, true);
      if (form) update({ ...form, seed });
    }, MOTION.roll.land);
  }

  function start() {
    const v = view,
      target = part('start');
    if (!v || leaving) return;
    if (!v.options) {
      refuse(target);
      return;
    }
    if (v.start.twoTap && !armed) {
      armed = true;
      target?.querySelector('.two')?.classList.add('armed');
      document.addEventListener('pointerdown', elsewhere, true);
      return;
    }
    disarm();
    leaving = true;
    const options = v.options;
    fields?.name.input.blur();
    fields?.seed.input.blur();
    body.style.transition = `transform ${MOTION.sheet.leave}ms ${MOTION.sheet.leaveEase}, opacity ${MOTION.sheet.leave}ms ease`;
    body.style.transform = `translateX(${-RISE}px)`;
    body.style.opacity = '0';
    window.setTimeout(() => port.start(options), MOTION.sheet.leave);
  }

  function build(v: NewCareerView) {
    body.replaceChildren();
    let s = sheet(0, 0, SHEET.w, SHEET.h, {
      seed: 61,
      close: v.close ? 'back' : undefined,
    });
    s += title(v);
    s += `<g ${arriving(0)}>${word(PAD, ROW.name, 'Name', TYPE.word, { anchor: 'start', weight: 600 })}</g>`;
    s += `<g ${arriving(1)}>${word(PAD, ROW.seed, 'Seed', TYPE.word, { anchor: 'start', weight: 600 })}`;
    const dx = PAD + INNER - DIE.r;
    s += `<g id="roll">${roundButton(dx, ROW.seed, DIE.r, `<g id="roll-die">${die(dx, ROW.seed, DIE.size)}</g>`)}</g></g>`;
    s += `<g ${arriving(2)}><g transform="translate(${PAD} ${CHOOSER.y})">${liveryFace('livery', INNER, v)}</g></g>`;
    s += `<g ${arriving(3)}><g id="start"><g class="lively">${startFace(v)}</g></g></g>`;
    svg = svgNode(SHEET.w, SHEET.h, s);
    body.append(svg);
    const fieldX = PAD + ROW.label;
    fields = {
      name: field(body, fieldX, ROW.name, INNER - ROW.label, {
        most: v.name.most,
        value: v.name.value,
        name: 'name',
        changed: (name) => form && update({ ...form, name }),
      }),
      seed: field(
        body,
        fieldX,
        ROW.seed,
        INNER - ROW.label - SPACE.gap - 2 * DIE.r,
        {
          most: v.seed.most,
          value: v.seed.value,
          name: 'seed',
          changed: (seed) => form && update({ ...form, seed }),
        }
      ),
    };
    arrive(fields.name.el, 0);
    arrive(fields.seed.el, 1);
    pressable(part('roll'), roll, 'roll');
    pressable(part('start'), start, 'start');
    if (v.close) pressable(part('back'), () => port.close(), 'back');
    if (svg) bindLivery(svg, 'livery', picked);
    setStart(v, null);
  }

  return {
    el,
    show(pricing: NewCareerPricing) {
      price = pricing;
      const v = price(form);
      const first = view === null;
      view = v;
      form = v.form;
      if (first) {
        build(v);
        el.hidden = false;
        body.style.transition = 'none';
        body.style.transform = `translateX(${-RISE}px)`;
        body.style.opacity = '0';
        void body.offsetWidth;
        body.style.transition = `transform ${MOTION.sheet.ms}ms ${MOTION.sheet.ease}, opacity ${MOTION.sheet.ms * 0.7}ms ease`;
        body.style.transform = '';
        body.style.opacity = '1';
        port.scene.wear(v.wearing, v.emblem);
        return;
      }
      update(v.form);
    },
  };
}
