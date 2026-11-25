import { pressable, ribbon } from '../base/button.ts';
import { TYPE } from '../base/house.ts';
import { svgNode } from '../base/ink.ts';
import { rise } from '../base/sheet.ts';
import { piece, screen } from '../base/ui.ts';
import { word } from '../base/word.ts';

export const AFTER = { w: 380, h: 84, ribbon: 170, cy: 42 } as const;

export function createAfter(act: { watch(): void; result(): void }) {
  const el = screen();
  const body = piece(el, 'bottom center', false, true);
  body.style.width = `${AFTER.w}px`;
  body.style.height = `${AFTER.h}px`;
  const { w, ribbon: rw, cy } = AFTER,
    left = rw / 2 + 4,
    right = w - rw / 2 - 4;
  const art = svgNode(
    w,
    AFTER.h,
    `<g id="watch">${ribbon(left, cy, rw, word(left, cy + 1, 'Watch', TYPE.ribbon, { weight: 700 }))}</g>` +
      `<g id="result">${ribbon(right, cy, rw, word(right, cy + 1, 'Result', TYPE.ribbon, { weight: 700 }), true)}</g>`
  );
  body.append(art);
  const watch = art.querySelector<SVGGElement>('#watch');
  pressable(watch, () => act.watch(), 'watch');
  pressable(
    art.querySelector<SVGGElement>('#result'),
    () => act.result(),
    'settle'
  );
  let shown = false;
  return {
    el,
    show(on: boolean, watching = false) {
      if (watch) watch.style.opacity = watching ? '0' : '1';
      watch?.classList.toggle('gone', watching);
      if (on === shown) return;
      shown = on;
      rise(el, on);
    },
  };
}
