import { MOTION } from './house.ts';
import { INK, PAPER, WASH, galleon } from './ink.ts';
import { rhumbs, rose } from './marks.ts';

export const LOADING = {
  page: { w: 960, h: 640 },
  rose: 126,
  lift: 52,
  galleon: { drop: 170, size: 74 },
  rhumbs: { reach: 1100, opacity: 0.3 },
} as const;

export function createLoading() {
  const el = document.createElement('div');
  el.style.cssText =
    `position:fixed;inset:0;z-index:20;background:${PAPER};overflow:hidden;` +
    `pointer-events:none;transition:opacity ${MOTION.loading.fade}ms ease`;
  const { page, lift } = LOADING,
    y = -lift;
  el.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-page.w / 2} ${-page.h / 2} ${page.w} ${page.h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" overflow="visible">` +
    rhumbs(0, y, LOADING.rhumbs.reach, LOADING.rhumbs.opacity) +
    `<g class="mark">${rose(0, y, LOADING.rose, 0)}` +
    `${galleon(0, y + LOADING.galleon.drop, LOADING.galleon.size, { hull: WASH.gold })}</g></svg>`;
  const needle = el.querySelector<SVGGElement>('.needle'),
    inked = Array.from(
      el.querySelectorAll<SVGElement>('.mark [stroke]')
    ).filter((p) => p.getAttribute('stroke') === INK.iron);
  let swing: Animation | null = null;
  const swung = (on: boolean, instant: boolean) => {
    if (!needle) return;
    if (on) {
      swing?.cancel();
      needle.style.transition = 'none';
      needle.style.transform = 'rotate(0deg)';
      swing = needle.animate(
        [
          { transform: `rotate(${MOTION.loading.from}deg)` },
          { transform: `rotate(${MOTION.loading.to}deg)` },
        ],
        {
          duration: MOTION.loading.swing,
          iterations: Infinity,
          direction: 'alternate',
          easing: 'ease-in-out',
        }
      );
      return;
    }
    if (!swing) return;
    if (!instant) swing.commitStyles();
    swing.cancel();
    swing = null;
    void needle.getBoundingClientRect();
    needle.style.transition = instant
      ? 'none'
      : `transform ${MOTION.loading.settle}ms ${MOTION.loading.ease}`;
    needle.style.transform = 'rotate(0deg)';
  };
  swung(true, true);
  document.body.append(el);
  let timer = 0,
    shown = true;
  return {
    show(on: boolean, instant = false) {
      window.clearTimeout(timer);
      if (on) el.hidden = false;
      if (on !== shown || instant) swung(on, instant);
      shown = on;
      el.style.transition = instant
        ? 'none'
        : `opacity ${MOTION.loading.fade}ms ${on ? 'ease' : 'ease-in'}`;
      void el.offsetWidth;
      el.style.opacity = on ? '1' : '0';
      if (!on)
        timer = window.setTimeout(
          () => (el.hidden = true),
          instant ? 0 : MOTION.loading.fade
        );
    },
    refused(on: boolean) {
      for (const p of inked)
        p.setAttribute('stroke', on ? INK.rubric : INK.iron);
    },
  };
}
