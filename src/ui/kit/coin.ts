// Coin: an amount of the crews' money, the coin's mark before it, grouped by thousands; in vermilion below nothing.
// Coin spent (the amount falling) is heard: two coins counted out.

import { glyph, svg } from '../ink';
import { grouped, make, sound, type Part } from './part';

/** An amount of Coin, its mark `size` across. */
export function coin(size = 20): Part<number> {
  const el = make('span', 'k-coin');
  el.innerHTML = svg(size, size, glyph('tab.finance', size / 2, size / 2, size, { ink: 'gold' }));
  const v = make('span', 'num', el);
  let last: number | null = null;
  return {
    el,
    set(n) {
      v.textContent = grouped(n);
      el.classList.toggle('neg', n < 0);
      el.setAttribute('aria-label', `${grouped(n)} Coin`);
      if (last !== null && n < last) sound(el, 'coin');
      last = n;
    },
  };
}
