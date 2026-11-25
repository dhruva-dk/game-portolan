import { pressable } from './button.ts';
import { SIZE, SPACE, TYPE } from './house.ts';
import { GILT, figure, r2, slip } from './ink.ts';

const width = (w: number, count: number) =>
  (w - (count - 1) * SPACE.hair) / count;

const shift = (w: number, count: number, index: number) =>
  `translateX(${r2(index * (width(w, count) + SPACE.hair))}px)`;

export function pickerFace(
  id: string,
  x: number,
  cy: number,
  w: number,
  choices: readonly string[],
  chosen: number
) {
  const h = SIZE.slip,
    each = width(w, choices.length),
    top = cy - h / 2;
  let under = '',
    over = '';
  choices.forEach((text, i) => {
    const left = x + i * (each + SPACE.hair);
    under += `<g id="${id}-${i}">${slip(left, top, each, h)}</g>`;
    over += figure(left + each / 2, cy, text, TYPE.figure - 2, { weight: 600 });
  });
  return (
    under +
    `<g id="${id}-mark" class="picked" style="transform:${shift(w, choices.length, chosen)}">${slip(x, top, each, h, { fill: GILT, bold: true })}</g>` +
    `<g pointer-events="none">${over}</g>`
  );
}

export function pickTo(
  svg: SVGSVGElement,
  id: string,
  w: number,
  count: number,
  index: number
) {
  const mark = svg.querySelector<SVGElement>(`#${id}-mark`);
  if (mark) mark.style.transform = shift(w, count, index);
}

export function bindPicker(
  svg: SVGSVGElement,
  id: string,
  count: number,
  pick: (index: number) => void
) {
  for (let i = 0; i < count; i++)
    pressable(
      svg.querySelector<SVGElement>(`#${id}-${i}`),
      () => pick(i),
      `${id}-${i}`
    );
}
