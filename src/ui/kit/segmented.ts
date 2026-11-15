// Segmented choice: a few exclusive options in one ruled box, the chosen one inked. A disabled option stays shown,
// greyed, and deaf to taps.

import { disable, make, tappable, type Part } from './part';
import type { Choice } from './tabs';

/** A segmented choice of `options`, calling `pick` with the id tapped; `set` inks the chosen one. */
export function segmented(options: readonly Choice[], pick: (id: string) => void): Part<string> {
  const el = make('div', 'k-seg');
  el.setAttribute('role', 'radiogroup');
  const cells = options.map((o) => {
    const c = make('div', '', el, o.label);
    c.setAttribute('role', 'radio');
    tappable(c, () => pick(o.id));
    disable(c, !!o.disabled);
    return c;
  });
  return {
    el,
    set(chosen) {
      options.forEach((o, i) => {
        cells[i].classList.toggle('on', o.id === chosen);
        cells[i].setAttribute('aria-checked', String(o.id === chosen));
      });
    },
  };
}
