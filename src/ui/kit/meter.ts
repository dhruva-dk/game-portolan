// Meter: a level out of 100 (the elder's confidence, morale), its label and value over a wide ruled bar filled in
// 200 ms, washed vermilion when low, ochre when middling, viridian when high; ticks at the quarters.

import { INK, WASH } from '../ink';
import { make, type Part } from './part';

export interface Level { label: string; value: number; text?: string }

/** A meter. */
export function meter(): Part<Level> {
  const el = make('div', 'k-meter'), label = make('span', '', el), value = make('span', 'num bold', el), bar = make('div', 'k-bar', el);
  const fill = make('i', '', bar);
  for (const q of [25, 50, 75]) Object.assign(make('b', '', bar).style, { left: `${q}%`, borderLeft: `1px solid ${INK.iron}`, top: '0', bottom: '0' });
  return {
    el,
    set(l) {
      const v = Math.max(0, Math.min(100, l.value));
      label.textContent = l.label;
      value.textContent = l.text ?? `${Math.round(v)} / 100`;
      fill.style.width = `calc(${v}% - 2px)`;
      fill.style.background = v < 34 ? WASH.vermilion : v < 67 ? WASH.ochre : WASH.viridian;
    },
  };
}
