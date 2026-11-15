// The `?bots` overlay's labels (debug.ts; player.ts BotTag): over each bot on the screen, her id, her captain's style,
// what she is about and the ship she has in her eye, and her captain's stats in brief. A playtest tool, so in plain
// words; the minimap draws the lines to each one's target (minimap.ts More.lines).

import type { BotTag } from '../player';
import { INK } from './ink';

/** At most this many labels: a race's every bot. */
const MOST = 80;

export function createTags(layer: HTMLElement) {
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  layer.appendChild(root);
  const labels: HTMLDivElement[] = [];
  const label = (i: number) => {
    let el = labels[i];
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = `position:absolute;transform:translate(-50%,-100%);font:11px/1.2 ui-monospace,monospace;white-space:pre;`
        + `color:${INK.white};background:${INK.iron};opacity:.8;padding:1px 4px;border-radius:3px`;
      root.appendChild(el);
      labels[i] = el;
    }
    return el;
  };

  return {
    /** A frame's labels (none: the overlay off). */
    update(tags: readonly BotTag[] | undefined) {
      let n = 0;
      for (const t of tags ?? []) {
        if (!t.seen || n >= MOST) continue;
        const el = label(n++), text = `#${t.id} ${t.sort ?? '-'} ${t.mode}${t.target >= 0 ? ` > #${t.target}` : ''}\n${t.stats}`;
        if (el.textContent !== text) el.textContent = text;
        el.style.left = `${t.seen.x.toFixed(0)}px`;
        el.style.top = `${t.seen.y.toFixed(0)}px`;
        el.style.display = '';
      }
      for (let i = n; i < labels.length; i++) labels[i].style.display = 'none';
    },
  };
}
