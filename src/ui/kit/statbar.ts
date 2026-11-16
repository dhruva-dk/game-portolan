// Stat bar: a label, a ruled bar filled to the value (in 200 ms) with a mark where it is compared (a rival's, last
// season's, a ceiling), the value right-aligned, and an arrow after it for which way it heads (up green, down red).

import { WASH } from '../ink';
import { make, type Part } from './part';

export interface Stat { label: string; value: number; max: number; text?: string; mark?: number | null; wash?: string; arrow?: -1 | 0 | 1 }

/** A stat bar. */
export function statBar(): Part<Stat> {
  const el = make('div', 'k-stat'), label = make('span', '', el), bar = make('div', 'k-bar', el), value = make('span', 'num', el);
  const fill = make('i', '', bar), mark = make('b', '', bar), text = document.createTextNode(''), arrow = make('span', 'k-arrow', value);
  value.prepend(text);
  return {
    el,
    set(s) {
      const f = (v: number) => `${Math.max(0, Math.min(1, v / s.max)) * 100}%`;
      label.textContent = s.label;
      text.textContent = s.text ?? String(Math.round(s.value));
      arrow.textContent = s.arrow === 1 ? '▲' : s.arrow === -1 ? '▼' : '';
      arrow.className = `k-arrow ${s.arrow === 1 ? 'good' : s.arrow === -1 ? 'harm' : ''}`;
      arrow.setAttribute('aria-label', s.arrow === 1 ? 'rising' : s.arrow === -1 ? 'falling' : '');
      fill.style.width = `calc(${f(s.value)} - 2px)`;
      fill.style.background = s.wash ?? WASH.ochre;
      mark.style.display = s.mark == null ? 'none' : '';
      if (s.mark != null) mark.style.left = f(s.mark);
    },
  };
}
