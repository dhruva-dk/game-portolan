// Over the rookery's view (play/rookery.ts): a paper slip over each building under way, its days left in the italic
// numerals, ruled under in gold, slips that would overlap stacked (settled); and the tap that picks a building, the
// nearest of their anchors within PICK px.

import { FIGURES, INK, PAPER } from './ink';
import { settled, slipWidth } from './stack';

/** How far from a building's anchor a tap still picks it, CSS px. */
export const PICK = 60;

/** A building's anchor on the screen (play/rookery.ts Anchor): where a tap picks it. */
export interface Spot { building: string; x: number; y: number }

/** The anchor nearest (x, y) within PICK px, if any. */
export function nearest<T extends Spot>(spots: readonly T[], x: number, y: number): T | null {
  let best: T | null = null, d = PICK;
  for (const s of spots) {
    const e = Math.hypot(s.x - x, s.y - y);
    if (e <= d) [best, d] = [s, e];
  }
  return best;
}

/** The layer's class that leaves only the rookery's slips over the world (debug.ts ?screen=rookery-3d). */
export const BARE = 'rookery-bare';

export function createRookeryLabels(layer: HTMLElement) {
  const root = document.createElement('div');
  root.className = 'rookery-slips';
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  layer.appendChild(root);
  const style = document.createElement('style');
  style.textContent = `.${BARE} > :not(.rookery-slips) { display: none !important }`;
  document.head.appendChild(style);
  const slips: HTMLDivElement[] = [];
  const slip = (i: number) => {
    let el = slips[i];
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = `position:absolute;transform:translate(-50%,-100%);font:italic 600 15px/1 ${FIGURES};white-space:nowrap;`
        + `color:${INK.iron};background:${PAPER};padding:4px 8px 3px;border-bottom:2px solid ${INK.gold};`
        + 'box-shadow:0 1px 3px rgba(38,25,16,.45);clip-path:polygon(2% 0,98% 4%,100% 96%,0 100%)';
      root.appendChild(el);
      slips[i] = el;
    }
    return el;
  };
  return {
    /** This frame's slips: over each building under way, its days left (none: the rookery not shown). */
    update(labels: readonly { x: number; y: number; days: number }[] | null) {
      const texts = (labels ?? []).map((l) => {
        const days = Math.max(0, Math.ceil(l.days));
        return days === 1 ? '1 day' : `${days} days`;
      });
      const at = settled((labels ?? []).map((l, i) => ({ x: l.x, y: l.y, w: slipWidth(texts[i]) })), root.clientWidth || Infinity);
      let n = 0;
      for (const [i, p] of at.entries()) {
        const el = slip(n++);
        if (el.textContent !== texts[i]) el.textContent = texts[i];
        el.style.left = `${p.x.toFixed(0)}px`;
        el.style.top = `${p.y.toFixed(0)}px`;
        el.style.display = '';
      }
      for (let i = n; i < slips.length; i++) slips[i].style.display = 'none';
    },
  };
}
