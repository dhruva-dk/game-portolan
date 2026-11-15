// Dialog: a panel over a veil, over the screen beneath (settings over home; a confirmation). Its body is the
// caller's; its foot holds its buttons. The veil takes every tap, so nothing beneath can be reached while it is open.

import { fade } from '../ui';
import { make } from './part';
import { panel, type PanelPlace } from './panel';

export interface Dialog { el: HTMLElement; body: HTMLElement; foot: HTMLElement; open(): void; close(): void; title(t: string): void }

/** A dialog titled `title` over columns `at`, its parts appended to `page` (the office's page). */
export function dialog(page: HTMLElement, title: string, at: PanelPlace): Dialog {
  const veil = make('div', 'k-veil press', page);
  const p = panel(at, { title });
  p.el.classList.add('k-dialog');
  // (placed on the body's grid: the body begins 16 px in and 80 px down the page)
  p.el.style.left = `${parseFloat(p.el.style.left) + 16}px`;
  p.el.style.top = `${parseFloat(p.el.style.top) + 80}px`;
  page.appendChild(p.el);
  const foot = make('footer', 'k-foot', p.el);
  for (const el of [veil, p.el]) el.style.display = 'none';
  return {
    el: p.el,
    body: p.body,
    foot,
    open() {
      fade(veil, true);
      fade(p.el, true);
    },
    close() {
      fade(veil, false);
      fade(p.el, false);
    },
    title(t) {
      p.set({ title: t });
    },
  };
}
