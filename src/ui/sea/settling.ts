import { clock } from '../base/clock.ts';
import { MOTION } from '../base/house.ts';
import { DUSK, INK, alpha, figure, glyph, svgNode } from '../base/ink.ts';
import { rise, sheet } from '../base/sheet.ts';
import { piece, screen } from '../base/ui.ts';

const SETTLING = { w: 300, h: 120, size: 40, glyph: 40 } as const;

export function createSettling() {
  const el = screen(true);
  const dim = document.createElement('div');
  dim.style.cssText =
    `position:absolute;inset:0;background:${alpha(DUSK, MOTION.settling.dim)};` +
    `opacity:0;transition:opacity ${MOTION.settling.dim * 1000}ms ease`;
  el.append(dim);
  const body = piece(el, 'center', false, true);
  body.style.top = '50%';
  body.style.translate = '-50% -50%';
  body.style.width = `${SETTLING.w}px`;
  body.style.height = `${SETTLING.h}px`;
  const { w, h, size } = SETTLING,
    cy = h / 2,
    a = w * 0.27,
    b = w * 0.73;
  const art = svgNode(
    w,
    h,
    sheet(0, 0, w, h, { seed: 47 }) +
      `<g id="s-storm" style="transform-box:fill-box;transform-origin:center">${glyph('storm', a - 40, cy, SETTLING.glyph, { ink: 'storm' })}</g>` +
      `<g id="s-time">${figure(a - 14, cy, '', size, { anchor: 'start', fill: INK.storm })}</g>` +
      `<path d="M${w / 2} 22V${h - 22}" stroke="${INK.iron}" stroke-width=".8" opacity=".5"/>` +
      glyph('ship', b - 34, cy, SETTLING.glyph - 4) +
      `<g id="s-afloat" class="tick">${figure(b - 6, cy, '', size, { anchor: 'start' })}</g>`
  );
  body.append(art);
  const time = art.querySelector('#s-time text'),
    afloat = art.querySelector('#s-afloat text'),
    count = art.querySelector<SVGGElement>('#s-afloat'),
    storm = art.querySelector<SVGGElement>('#s-storm');
  let second = -1,
    ships = -1,
    spin: Animation | null = null;
  return {
    show(on: boolean) {
      if (on) {
        el.hidden = false;
        void dim.offsetWidth;
        dim.style.opacity = '1';
        spin ??=
          storm?.animate([{ rotate: '0deg' }, { rotate: '360deg' }], {
            duration: MOTION.settling.spin,
            iterations: Infinity,
          }) ?? null;
      } else dim.style.opacity = '0';
      rise(body, on);
    },
    update(storm: number, left: number) {
      const t = Math.ceil(storm);
      if (t !== second && time) {
        second = t;
        time.textContent = clock(storm);
      }
      if (left !== ships && afloat) {
        const fewer = ships > left;
        ships = left;
        afloat.textContent = String(left);
        if (fewer)
          count?.animate(
            [
              { scale: '1' },
              { scale: String(MOTION.settling.tick), fill: INK.rubric },
              { scale: '1' },
            ],
            { duration: MOTION.settling.ms, easing: MOTION.settling.ease }
          );
      }
    },
    settled() {
      spin?.cancel();
      spin = null;
      count?.animate(
        [
          { scale: String(MOTION.stamp.from), opacity: 0.4 },
          { scale: '1', opacity: 1 },
        ],
        { duration: MOTION.stamp.ms, easing: MOTION.stamp.ease }
      );
    },
  };
}
