// The seed panel: a folio over the lobby (screens.ts folio), opened from the
// seed's chip, on the seed this page sails. At its top left a field to type a
// seed in (any text, as seeds are: world/seeds.ts), the seed's mark beside it
// rolling a new one into it; under them the seed's planet inked on a
// parchment disc (orb.ts), spun by a finger; at the right what its race is
// sailed by (fleet.ts); under that the SAIL banner, her galleon on it, which
// sails the seed in the field (a new page on it, under the title).
//
// As she types, the preview follows: the fleet at once (arithmetic), the
// planet once she pauses (a worker's, a second or two: play/survey.ts), the
// last one faded under it meanwhile, an ask overtaken by her typing dropped.
// Nothing here waits on the worker: the lobby's frames go on as she types.

import type { Chart, Seeds } from '../player.ts';
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
import { seed } from './marks.ts';
import { createOrb } from './orb.ts';
import { banner, folio } from './screens.ts';
import { keep, region } from './touch.ts';
import { boxOf, view } from './ui.ts';

/** The folio on the drawn page, centred on whatever screen. */
const BOX = { x: 160, y: 18, w: 636, h: 398 };
/** The field, the globe's disc (centre, radius) and the card's corner, on the drawn page. */
const FIELD = { x: 186, y: 44, w: 246, h: 40 },
  DISC = { x: 336, y: 250, r: 136 },
  CARD_AT = { x: 506, y: 40 };
/** The longest seed she may type. */
const LONGEST = 24;
/** Ms of her pause in typing before the fleet, and the planet, are worked out. */
const PAUSE = { fleet: 90, chart: 380 };

/** The disc the globe is inked on: shaded on the paper, ringed, its degrees ticked round it. */
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
  const f = folio(BOX, ['centre', 'middle'], act.close);
  const orb = createOrb();
  // the field: an input laid over its slip, in the numerals' face
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
  /** Whether she is typing in it (kept across a redraw). */
  let typing = false;
  input.addEventListener('focus', () => (typing = true));
  input.addEventListener('blur', () => (typing = false));

  /** The card's group, and the last chart asked for. */
  let card: SVGGElement | null = null,
    chart: Chart | null = null;
  const timers = { fleet: 0, chart: 0 };
  /** The seed in the field, as it is read. */
  const text = () => named(input.value);

  /** The fleet of the seed in the field, drawn on the card (none for none). */
  const fleet = () => {
    const name = text();
    if (card)
      card.innerHTML = name
        ? fleetCard(CARD_AT.x, CARD_AT.y, seeds.fleet(name))
        : '';
  };
  /** The planet of the seed in the field, asked of the worker; the last faded under it until it comes. */
  const survey = () => {
    const name = text();
    if (!name || chart?.name === name) return orb.show(chart, false);
    orb.show(chart, true);
    void seeds.chart(name).then((c) => {
      // (null: overtaken by a later ask)
      if (!c || c.name !== text()) return;
      chart = c;
      orb.show(c, false);
    });
  };
  /** The preview after her pause in typing (or at once, `now`). */
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
        `<g id="sp-roll">${paperDisc(FIELD.x + FIELD.w + 28, FIELD.y + 20, 22)}${seed(FIELD.x + FIELD.w + 28, FIELD.y + 22, 30)}</g>` +
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
        fleet();
        // the field's input and the globe's canvas over their places, as the page lays them out now
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
    /** Opens it on the seed this page sails, or closes it. */
    show(on: boolean) {
      if (on) {
        input.value = seeds.name;
        draw();
        preview(true);
      } else {
        clearTimeout(timers.fleet);
        clearTimeout(timers.chart);
        input.blur();
      }
      f.show(on);
    },
  };
}
