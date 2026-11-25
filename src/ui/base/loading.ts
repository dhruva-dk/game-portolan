import { MOTION } from './house.ts';
import { INK, PAPER, glyph, svg } from './ink.ts';

export const LOADING = { size: 54 } as const;

export function createLoading() {
  const el = document.createElement('div');
  el.style.cssText =
    `position:fixed;inset:0;z-index:20;background:${PAPER};display:flex;` +
    `align-items:center;justify-content:center;pointer-events:none;` +
    `transition:opacity ${MOTION.loading.fade}ms ease`;
  const s = LOADING.size;
  el.innerHTML = svg(s, s, glyph('wheel', s / 2, s / 2, s));
  const mark = el.firstElementChild;
  mark?.animate([{ rotate: '0deg' }, { rotate: '360deg' }], {
    duration: MOTION.loading.turn,
    iterations: Infinity,
    easing: 'ease-in-out',
  });
  document.body.append(el);
  let timer = 0;
  return {
    show(on: boolean, instant = false) {
      window.clearTimeout(timer);
      if (on) el.hidden = false;
      el.style.transition = instant
        ? 'none'
        : `opacity ${MOTION.loading.fade}ms ease`;
      void el.offsetWidth;
      el.style.opacity = on ? '1' : '0';
      if (!on)
        timer = window.setTimeout(
          () => (el.hidden = true),
          instant ? 0 : MOTION.loading.fade
        );
    },
    refused(on: boolean) {
      el.style.color = on ? INK.rubric : '';
      mark?.querySelectorAll('path').forEach((p) => {
        if (p.getAttribute('stroke'))
          p.setAttribute('stroke', on ? INK.rubric : INK.iron);
      });
    },
  };
}
