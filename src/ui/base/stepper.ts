import { MOTION, SIZE, SPACE, TYPE } from './house.ts';
import { figure, paperDisc, r2, slip } from './ink.ts';

const STEPPER = { r: SIZE.slip / 2, sign: TYPE.figure } as const;

export function stepperFace(
  id: string,
  x: number,
  cy: number,
  w: number,
  text: string
) {
  const { r, sign } = STEPPER,
    h = SIZE.slip,
    inner = w - 4 * r - 2 * SPACE.hair,
    sx = x + 2 * r + SPACE.hair;
  return (
    `<g id="${id}-minus">${paperDisc(x + r, cy, r)}${figure(x + r, cy - 1, '−', sign, { weight: 600 })}</g>` +
    slip(sx, cy - h / 2, inner, h) +
    `<g id="${id}-value">${stepperValue(sx + inner / 2, cy, text)}</g>` +
    `<g id="${id}-plus">${paperDisc(x + w - r, cy, r)}${figure(x + w - r, cy - 1, '+', sign, { weight: 600 })}</g>`
  );
}

export const stepperValue = (cx: number, cy: number, text: string) =>
  `<g class="ticked">${figure(r2(cx), cy, text, TYPE.figure - 2, { weight: 600 })}</g>`;

export function holdable(
  el: SVGElement | null,
  act: (times: number) => void,
  name: string
): void {
  if (!el) return;
  el.classList.add('press', 'tap');
  el.setAttribute('data-tap', name);
  let timer = 0,
    count = 0,
    gap: number = MOTION.hold.first;
  const stop = () => {
    window.clearTimeout(timer);
    el.classList.remove('down');
  };
  const again = () => {
    count++;
    act(MOTION.hold.burst.find((b) => count >= b.after)?.times ?? 1);
    gap = Math.max(MOTION.hold.least, gap * MOTION.hold.quicken);
    timer = window.setTimeout(again, gap);
  };
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    stop();
    el.classList.add('down');
    act(1);
    count = 0;
    gap = MOTION.hold.first;
    timer = window.setTimeout(again, MOTION.hold.delay);
  });
  for (const end of ['pointerup', 'pointercancel', 'pointerleave'] as const)
    el.addEventListener(end, stop);
}
