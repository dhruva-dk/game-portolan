// Stat bar: a label, a ruled bar filled to the value (in 200 ms) with a mark where it is compared (a rival's, last
// season's), and the value right-aligned. Meter: a wider bar for a level out of 100 (the elder's confidence), its
// label and value over it, its fill washed by how it stands (low, middling, high).

import { WASH } from '../ink';
import { make, type Part } from './part';

export interface Stat { label: string; value: number; max: number; text?: string; mark?: number | null; wash?: string }

/** A stat bar. */
export function statBar(): Part<Stat> {
  const el = make('div', 'k-stat'), label = make('span', '', el), bar = make('div', 'k-bar', el), value = make('span', 'num', el);
  const fill = make('i', '', bar), mark = make('b', '', bar);
  return {
    el,
    set(s) {
      const f = (v: number) => `${Math.max(0, Math.min(1, v / s.max)) * 100}%`;
      label.textContent = s.label;
      value.textContent = s.text ?? String(Math.round(s.value));
      fill.style.width = `calc(${f(s.value)} - 2px)`;
      fill.style.background = s.wash ?? WASH.ochre;
      mark.style.display = s.mark == null ? 'none' : '';
      if (s.mark != null) mark.style.left = f(s.mark);
    },
  };
}
