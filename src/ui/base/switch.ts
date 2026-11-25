import { pressable } from './button.ts';
import { INK, PAPER, WASH, paperDisc, r2 } from './ink.ts';

export const SWITCH = { w: 56, h: 28, hit: 44 } as const;

export function switchFace(
  id: string,
  x: number,
  cy: number,
  on: boolean,
  wash: string = WASH.viridian
) {
  const { w, h, hit } = SWITCH,
    top = cy - h / 2,
    r = h / 2;
  return (
    `<g id="${id}" class="switch${on ? ' on' : ''}" style="--throw:${w - h}px">` +
    `<rect x="${x - 8}" y="${r2(cy - hit / 2)}" width="${w + 16}" height="${hit}" fill="transparent"/>` +
    `<rect x="${x}" y="${r2(top)}" width="${w}" height="${h}" rx="${r}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.2"/>` +
    `<rect class="dye" x="${x + 2}" y="${r2(top + 2)}" width="${w - 4}" height="${h - 4}" rx="${r - 2}" fill="${wash}"/>` +
    `<path class="lit" d="M${r2(x + r - 4)} ${cy}l3.4 3.6l6.2 -7" fill="none" stroke="${INK.white}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<g class="throw"><g class="nub">${paperDisc(x + r, cy, r - 2.5)}</g></g>` +
    '</g>'
  );
}

export function throwSwitch(svg: SVGSVGElement, id: string, on: boolean) {
  const el = svg.querySelector(`#${id}`);
  if (!el) return;
  el.classList.toggle('on', on);
  el.classList.remove('snap');
  void el.getBoundingClientRect();
  el.classList.add('snap');
}

export function bindSwitch(
  svg: SVGSVGElement,
  id: string,
  flip: () => boolean
) {
  const el = svg.querySelector<SVGGElement>(`#${id}`);
  pressable(el, () => throwSwitch(svg, id, flip()), id);
}
