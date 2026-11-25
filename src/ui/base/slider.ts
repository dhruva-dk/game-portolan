import { INK, PAPER, WASH, paperDisc, r2, roughRect } from './ink.ts';

export const SLIDER = { h: 44, track: 10, knob: 12.5, notch: 5 } as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export type Track = { x: number; w: number };

const reach = (t: Track) => ({
  left: t.x + SLIDER.knob,
  len: t.w - 2 * SLIDER.knob,
});

export function sliderFace(
  id: string,
  t: Track,
  cy: number,
  share: number,
  o: { wash?: string; mark?: number | null } = {}
) {
  const { left, len } = reach(t),
    th = SLIDER.track,
    top = cy - th / 2,
    at = left + len * clamp01(share),
    r = SLIDER.knob;
  const notch =
    o.mark == null
      ? ''
      : `<path d="M${r2(left + len * o.mark)} ${r2(top - SLIDER.notch)}v${SLIDER.notch - 1.5}M${r2(left + len * o.mark)} ${r2(top + th + 1.5)}v${SLIDER.notch - 1.5}" stroke="${INK.iron}" stroke-width="1.4" stroke-linecap="round"/>`;
  return (
    `<g id="${id}" class="slider">` +
    `<rect x="${t.x}" y="${r2(cy - SLIDER.h / 2)}" width="${t.w}" height="${SLIDER.h}" fill="transparent"/>` +
    `<path d="${roughRect(left - th / 2, top, len + th, th, left + cy)}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.1"/>` +
    `<rect id="${id}-fill" x="${r2(left - th / 2 + 1.6)}" y="${r2(top + 1.6)}" width="${r2(Math.max(0, at - left + th / 2 - 1.6))}" height="${r2(th - 3.2)}" rx="${r2((th - 3.2) / 2)}" fill="${o.wash ?? WASH.azure}" opacity=".88"/>` +
    notch +
    `<g id="${id}-thumb" data-cy="${cy}" transform="translate(${r2(at)} ${cy})"><g class="knob">` +
    `<ellipse class="lifted-shade" cx="0" cy="${r2(r * 0.55)}" rx="${r2(r * 1.05)}" ry="${r2(r * 0.55)}" fill="${INK.iron}"/>` +
    paperDisc(0, 0, r) +
    `<path d="M-3.4 -4.5v9M0 -5.5v11M3.4 -4.5v9" stroke="${INK.iron}" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>` +
    '</g></g></g>'
  );
}

export function placeSlider(
  svg: SVGSVGElement,
  id: string,
  t: Track,
  share: number
) {
  const { left, len } = reach(t),
    th = SLIDER.track,
    at = left + len * clamp01(share);
  const thumb = svg.querySelector(`#${id}-thumb`);
  thumb?.setAttribute(
    'transform',
    `translate(${r2(at)} ${thumb.getAttribute('data-cy') ?? 0})`
  );
  svg
    .querySelector(`#${id}-fill`)
    ?.setAttribute('width', String(r2(Math.max(0, at - left + th / 2 - 1.6))));
}

export function bindSlider(
  svg: SVGSVGElement,
  id: string,
  t: Track,
  act: { move(share: number): void; done(share: number): number }
) {
  const el = svg.querySelector<SVGGElement>(`#${id}`),
    hit = el?.querySelector('rect');
  if (!el || !hit) return;
  el.classList.add('press');
  el.setAttribute('data-tap', id);
  svg.style.touchAction = 'none';
  const { left, len } = reach(t);
  let held = -1,
    last = 0;
  const shareAt = (e: PointerEvent) => {
    const box = hit.getBoundingClientRect(),
      units = ((e.clientX - box.left) / box.width) * t.w + t.x;
    return clamp01((units - left) / len);
  };
  const follow = (e: PointerEvent) => {
    last = shareAt(e);
    placeSlider(svg, id, t, last);
    act.move(last);
  };
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    held = e.pointerId;
    el.setPointerCapture(e.pointerId);
    el.classList.remove('settled');
    el.classList.add('held');
    follow(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId === held) follow(e);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== held) return;
    e.stopPropagation();
    held = -1;
    const kept = act.done(last);
    placeSlider(svg, id, t, kept);
    el.classList.remove('held');
    void el.getBoundingClientRect();
    el.classList.add('settled');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
