// Stepper: a figure set in steps (a wage, a fee, Coin to lobby with) between two bounds: − and + either side of its
// value, each 44 square, the one at a bound greyed.

import { button } from './button';
import { disable, make, type Part } from './part';

export interface Steps { min: number; max: number; step: number; format?: (n: number) => string }

/** A stepper over `s`, calling `change` with each new value. */
export function stepper(s: Steps, change: (n: number) => void): Part<number> {
  const el = make('div', 'k-step');
  let now = s.min;
  const to = (n: number) => change(Math.max(s.min, Math.min(s.max, n)));
  const less = button('−', () => to(now - s.step)), more = button('+', () => to(now + s.step));
  less.el.setAttribute('aria-label', 'less');
  more.el.setAttribute('aria-label', 'more');
  el.appendChild(less.el);
  const v = make('span', 'v num', el);
  el.appendChild(more.el);
  return {
    el,
    set(n) {
      now = n;
      v.textContent = s.format ? s.format(n) : String(n);
      disable(less.el, n <= s.min);
      disable(more.el, n >= s.max);
    },
  };
}
