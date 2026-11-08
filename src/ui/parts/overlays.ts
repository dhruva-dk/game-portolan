// The first-time tip card: until tips are drawn on the chart, the one piece of DOM left over a match.
import { el } from './dom.ts';
import { effect } from './feedback.ts';

export interface TipView {
  /** Which tip: the card springs in again when this changes. */
  id: string;
  /** The tip's glyph. */
  icon: string;
  title: string;
  text: string;
}

export interface TipCardHandle { el: HTMLElement; set(v: TipView | null): void }

/**
 * A short tip the first time something happens: a parchment card with a glyph disc, a title and a line on what to do.
 * It springs in as its tip comes and slips away as it goes; it takes no touches, so the sea under it still steers.
 */
export function tipCard(o: { parent: Element; className?: string }): TipCardHandle {
  const c = el(`p-tip p-paper${o.className ? ' ' + o.className : ''}`, o.parent);
  c.dataset.part = 'tip';
  const icon = el('p-tip__icon', c);
  const words = el('p-tip__words', c);
  const title = el('p-tip__title', words, '', 'b');
  const text = el('p-tip__text', words, '', 'span');
  let shown = '';
  const set = (v: TipView | null) => {
    if (!v) {
      if (shown) c.classList.replace('is-on', 'is-out');
      shown = '';
      return;
    }
    if (v.id === shown) return;
    shown = v.id;
    icon.innerHTML = v.icon;
    title.textContent = v.title;
    text.textContent = v.text;
    c.classList.remove('is-on', 'is-out');
    void c.offsetWidth;
    c.classList.add('is-on');
    effect(`tip:${v.id}`, 'toast', 'light');
  };
  return { el: c, set };
}
