import { MOTION, SIZE, TYPE } from './house.ts';
import { FIGURES, GILT, INK, slip, svgNode } from './ink.ts';
import { keep } from './touch.ts';
import { placed } from './ui.ts';

const FIELD = { h: SIZE.slip, inset: 8, size: TYPE.figure - 2 } as const;

export type Field = {
  el: HTMLDivElement;
  input: HTMLInputElement;
  value(): string;
  set(value: string, arrive?: boolean): void;
};

export function field(
  parent: HTMLElement,
  x: number,
  cy: number,
  w: number,
  o: { most: number; value: string; name: string; changed(value: string): void }
): Field {
  const h = FIELD.h,
    el = placed(parent, x, cy - h / 2, w, h);
  el.classList.add('field');
  el.append(
    svgNode(
      w,
      h,
      slip(0, 0, w, h, { flat: true }) +
        `<g class="lit">${slip(0, 0, w, h, { flat: true, fill: GILT, bold: true })}</g>`
    )
  );
  const input = document.createElement('input');
  Object.assign(input, {
    type: 'text',
    value: o.value,
    maxLength: o.most,
    spellcheck: false,
    autocomplete: 'off',
    enterKeyHint: 'done',
  });
  input.name = o.name;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('data-tap', o.name);
  input.className = 'press';
  input.style.cssText =
    `position:absolute;left:${FIELD.inset}px;top:2px;width:${w - 2 * FIELD.inset}px;height:${h - 4}px;` +
    'box-sizing:border-box;border:none;outline:none;background:transparent;margin:0;padding:0;' +
    `font:italic 600 ${FIELD.size}px ${FIGURES};color:${INK.iron};caret-color:${INK.rubric};text-align:center;` +
    '-webkit-user-select:text;user-select:text;touch-action:manipulation';
  keep(input);
  el.append(input);

  let typing = 0;
  const stop = () => {
    window.clearInterval(typing);
    typing = 0;
  };
  input.addEventListener('focus', () => el.classList.add('typing'));
  input.addEventListener('blur', () => {
    el.classList.remove('typing');
    window.scrollTo(0, 0);
  });
  input.addEventListener('input', () => {
    stop();
    o.changed(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });

  return {
    el,
    input,
    value: () => input.value,
    set(value, arrive = false) {
      stop();
      if (!arrive) {
        input.value = value;
        return;
      }
      let shown = 0;
      input.value = '';
      typing = window.setInterval(() => {
        shown++;
        input.value = value.slice(0, shown);
        if (shown >= value.length) stop();
      }, MOTION.roll.letter);
    },
  };
}
