import { FAINT, SIZE, SPACE, TYPE } from './house.ts';
import { GILT, INK, PAPER, glyph, paperDisc, slip } from './ink.ts';
import { onTap } from './touch.ts';
import { measured, word } from './word.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

function banner(x: number, y: number, w: number, mark: string, gilt = false) {
  const k = w / 210,
    l = x - w / 2,
    r = x + w / 2,
    t = y - 40 * k,
    b = y + 42 * k;
  const d = `M${l} ${t + 4 * k}Q${x} ${t - 8 * k} ${r} ${t}L${r - 26 * k} ${y}L${r} ${b}Q${x} ${b - 6 * k} ${l} ${b + 2 * k}L${l + 26 * k} ${y}Z`;
  return (
    `<path d="${d}" fill="${gilt ? GILT : 'url(#pg)'}" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>` +
    `<path d="${d}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".5" transform="translate(${x} ${y}) scale(.93) translate(${-x} ${-y})"/>` +
    mark
  );
}

export function roundButton(
  cx: number,
  cy: number,
  r: number,
  inner: string,
  o: { faint?: boolean; down?: boolean } = {}
) {
  const sunk = o.down
    ? `<circle cx="${cx}" cy="${cy}" r="${r2(r - 3.2)}" fill="${INK.iron}" opacity=".1"/>`
    : '';
  return `<g${o.faint ? ` opacity="${FAINT + 0.1}"` : ''}>${paperDisc(cx, cy, r)}${sunk}${inner}</g>`;
}

export const dot = (cx: number, cy: number, r: number = SIZE.dot) =>
  `<g class="pop"><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r + 1.6)}" fill="${PAPER}"/>` +
  `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${INK.rubric}" stroke="${INK.iron}" stroke-width=".8"/></g>`;

export const closeButton = (cx: number, cy: number, r: number = SIZE.close) =>
  roundButton(cx, cy, r, glyph('cross', cx, cy, Math.round(r * 0.95)));

export const ribbon = (
  cx: number,
  cy: number,
  w: number,
  inner: string,
  gilt = false
) => banner(cx, cy, w, inner, gilt);

export function pressable(
  el: HTMLElement | SVGElement | null,
  act: () => void,
  name?: string
): void {
  if (!el) return;
  el.classList.add('press', 'tap');
  if (name) el.setAttribute('data-tap', name);
  el.addEventListener('pointerdown', () => el.classList.add('down'));
  for (const up of ['pointerup', 'pointercancel', 'pointerleave'] as const)
    el.addEventListener(up, () => el.classList.remove('down'));
  onTap(el, () => act());
}

export function bound(
  svg: SVGSVGElement,
  id: string,
  act: () => void,
  name: string = id
): void {
  pressable(svg.querySelector<SVGElement>(`#${id}`), act, name);
}

export function twoTapFace(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  idle: string
) {
  const cy = y + h / 2,
    size = TYPE.word + 1,
    tick = 18,
    said = measured('Confirm?', size, { weight: 600 }),
    left = x + (w - said - SPACE.hair - tick) / 2;
  return (
    `<g id="${id}" class="two">` +
    `<g class="unsure">${slip(x, y, w, h)}${idle}</g>` +
    `<g class="sure">${slip(x, y, w, h, { fill: GILT, bold: true })}` +
    word(left, cy, 'Confirm?', size, { anchor: 'start', weight: 600 }) +
    glyph('tick', left + said + SPACE.hair + tick / 2, cy, tick) +
    '</g></g>'
  );
}

export function twoTap(
  el: SVGElement | null,
  act: () => void,
  name: string
): void {
  if (!el) return;
  const elsewhere = (e: PointerEvent) => {
    if (e.target instanceof Node && el.contains(e.target)) return;
    disarm();
  };
  const disarm = () => {
    el.classList.remove('armed');
    document.removeEventListener('pointerdown', elsewhere, true);
  };
  pressable(
    el,
    () => {
      if (!el.classList.contains('armed')) {
        el.classList.add('armed');
        document.addEventListener('pointerdown', elsewhere, true);
        return;
      }
      disarm();
      act();
    },
    name
  );
}
