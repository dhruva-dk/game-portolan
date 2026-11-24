import type { Chart, Seeds } from '../play/player.ts';
import { named } from '../world/seeds.ts';
import { CARD, fleetCard } from './fleet.ts';
import {
  FIGURES,
  INK,
  PAPER,
  galleon,
  paperDisc,
  roughCircle,
  slip,
} from './ink.ts';
import { die } from './marks.ts';
import { createOrb } from './orb.ts';
import { banner, folio } from './screens.ts';
import { keep, onHold, region } from './touch.ts';
import { boxOf, view } from './ui.ts';

const BOX = { x: 160, y: 18, w: 636, h: 398 };
const FIELD = { x: 186, y: 44, w: 246, h: 40 },
  DISC = { x: 336, y: 250, r: 136 },
  CARD_AT = { x: 506, y: 40 };
const LONGEST = 24;
const PAUSE = { fleet: 90, chart: 380 };
const HOLD = 350;

function disc() {
  const { x, y, r } = DISC,
    band = 9;
  let ticks = '';
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI) / 36,
      l = i % 6 ? band * 0.45 : band * 0.9,
      c = Math.cos(a),
      s = Math.sin(a);
    ticks += `M${x + c * (r + 1)} ${y + s * (r + 1)}L${x + c * (r + 1 + l)} ${y + s * (r + 1 + l)}`;
  }
  return (
    `<path d="${roughCircle(x, y, r + band + 3, 5, 0.6)}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1" filter="url(#sh)"/>` +
    `<path d="${ticks}" stroke="${INK.iron}" stroke-width=".8"/>` +
    `<circle id="sp-disc" cx="${x}" cy="${y}" r="${r}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.8"/>`
  );
}

export function createSeedPanel(
  seeds: Seeds,
  act: { close(): void; sail(name: string): void }
) {
  const f = folio(BOX, ['center', 'middle'], act.close);
  const orb = createOrb();
  const input = document.createElement('input');
  Object.assign(input, {
    type: 'text',
    maxLength: LONGEST,
    spellcheck: false,
    autocomplete: 'off',
    className: 'press',
    enterKeyHint: 'done',
  });
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.style.cssText =
    `position:absolute;box-sizing:border-box;border:none;outline:none;background:transparent;margin:0;` +
    `font-family:${FIGURES};font-style:italic;color:${INK.iron};caret-color:${INK.rubric};` +
    '-webkit-user-select:text;user-select:text;touch-action:manipulation';
  keep(input);
  let typing = false;
  input.addEventListener('focus', () => (typing = true));
  input.addEventListener('blur', () => (typing = false));

  let card: SVGGElement | null = null,
    chart: Chart | null = null;
  const timers = { fleet: 0, chart: 0 };
  const text = () => named(input.value);

  let traits = false,
    holding = 0;
  const fleet = () => {
    const name = text();
    if (card)
      card.innerHTML = name
        ? fleetCard(CARD_AT.x, CARD_AT.y, seeds.fleet(name), traits)
        : '';
  };
  const hold = (on: boolean) => {
    clearTimeout(holding);
    if (on)
      holding = window.setTimeout(() => {
        traits = true;
        fleet();
      }, HOLD);
    else if (traits) {
      traits = false;
      fleet();
    }
  };
  const survey = () => {
    const name = text();
    if (!name || chart?.name === name) return orb.show(chart, false);
    orb.show(chart, true);
    void seeds.chart(name).then((c) => {
      if (!c || c.name !== text()) return;
      chart = c;
      orb.show(c, false);
    });
  };
  const preview = (now = false) => {
    clearTimeout(timers.fleet);
    clearTimeout(timers.chart);
    if (now) {
      fleet();
      survey();
      return;
    }
    timers.fleet = window.setTimeout(fleet, PAUSE.fleet);
    timers.chart = window.setTimeout(survey, PAUSE.chart);
  };
  input.addEventListener('input', () => preview());
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    input.blur();
    preview(true);
  });

  const draw = () =>
    f.draw(
      slip(FIELD.x, FIELD.y, FIELD.w, FIELD.h, { flat: true }) +
        `<rect id="sp-field" x="${FIELD.x + 6}" y="${FIELD.y + 4}" width="${FIELD.w - 12}" height="${FIELD.h - 8}" fill="transparent"/>` +
        `<g id="sp-roll">${paperDisc(FIELD.x + FIELD.w + 28, FIELD.y + 20, 22)}${die(FIELD.x + FIELD.w + 28, FIELD.y + 19, 30)}</g>` +
        disc() +
        `<g id="sp-card"></g>` +
        `<g id="sp-sail">${banner(CARD_AT.x + CARD / 2, 358, 190, galleon(CARD_AT.x + CARD / 2, 354, 70, { waves: true }), true)}</g>`,
      (el) => {
        region(el, 'sp-roll', () => {
          input.value = seeds.roll();
          preview(true);
        });
        region(el, 'sp-sail', () => act.sail(text() || seeds.name));
        card = el.querySelector<SVGGElement>('#sp-card');
        if (card) {
          card.classList.add('press');
          onHold(card, hold);
        }
        fleet();
        f.root.append(input, orb.el);
        const field = el.querySelector('#sp-field'),
          round = el.querySelector('#sp-disc');
        if (field) {
          const b = boxOf(field);
          Object.assign(input.style, {
            left: `${b.left}px`,
            top: `${b.top}px`,
            width: `${b.width}px`,
            height: `${b.height}px`,
            fontSize: `${(20 * view.k).toFixed(1)}px`,
          });
        }
        if (round) {
          const b = boxOf(round);
          orb.place(b.left, b.top, b.width);
        }
        if (typing) input.focus({ preventScroll: true });
      }
    );

  return {
    show(on: boolean) {
      f.show(on);
      if (on) {
        input.value = seeds.name;
        draw();
        preview(true);
      } else {
        clearTimeout(timers.fleet);
        clearTimeout(timers.chart);
        hold(false);
        input.blur();
      }
    },
  };
}
