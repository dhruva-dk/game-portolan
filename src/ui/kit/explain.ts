// Explanation slip: what a figure is made of, laid over the screen beside it when it is tapped: a heading, its lines,
// and their sum. One slip open at a time; a tap anywhere else closes it.

import type { Explanation } from '../../office';
import { make } from './part';

let open: { el: HTMLElement; off: () => void } | null = null;

/** Closes the open slip, if any. */
export function closeSlip() {
  open?.off();
  open?.el.remove();
  open = null;
}

/** The slip's element for `ex`, with `total` (the figure's text) as its sum line. */
export function slip(ex: Explanation, total: string): HTMLElement {
  const el = make('div', 'k-slip');
  make('h4', '', el, ex.title);
  for (const l of ex.lines) {
    const row = make('div', 'l', el);
    make('span', '', row, l.label);
    make('span', 'num', row, l.amount);
  }
  const sum = make('div', 'l sum', el);
  make('span', '', sum, 'In all');
  make('span', 'num', sum, total);
  return el;
}

/** Opens the slip for `ex` beside `anchor`, inside the office's page `page`. */
export function openSlip(page: HTMLElement, anchor: HTMLElement, ex: Explanation, total: string) {
  closeSlip();
  const el = slip(ex, total);
  page.appendChild(el);
  // beside the anchor, kept inside the page (both in the page's own units: it is scaled as a whole)
  const box = page.getBoundingClientRect(), a = anchor.getBoundingClientRect(), k = box.width / page.offsetWidth || 1;
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = (a.right - box.left) / k + 8, y = (a.top - box.top) / k;
  if (x + w > page.offsetWidth - 8) x = (a.left - box.left) / k - w - 8;
  y = Math.max(8, Math.min(y, page.offsetHeight - h - 8));
  Object.assign(el.style, { left: `${Math.max(8, x)}px`, top: `${y}px` });
  const away = (e: PointerEvent) => {
    if (!el.contains(e.target as Node) && !anchor.contains(e.target as Node)) closeSlip();
  };
  addEventListener('pointerdown', away, true);
  open = { el, off: () => removeEventListener('pointerdown', away, true) };
}
