// Figure: a number as the office shows it (office.ts Figure): its value, with what it is set against under it in the
// small size (its rank, its change, a rival's), and, if it has one, its explanation a tap away (explain.ts). Never a
// giant number with a tiny label: the value is set at the heading's size.

import type { Comparison, Figure } from '../../office';
import { openSlip } from './explain';
import { make, tappable, type Part } from './part';

const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** A comparison as a line. */
export function against(c: Comparison | null): string {
  if (!c) return '';
  if (c.kind === 'rank') return `${ORD(c.place)} of ${c.of}`;
  if (c.kind === 'change') return c.text;
  return `${c.label} ${c.text}`;
}

/** A figure, its slip opening inside `page` (the office's page) when tapped. */
export function figure(page: () => HTMLElement): Part<Figure> {
  const el = make('div', 'k-fig'), v = make('span', 'v', el), c = make('span', 'c', el);
  let now: Figure | null = null;
  tappable(el, () => {
    if (now?.explain) openSlip(page(), el, now.explain, now.text);
  });
  return {
    el,
    set(f) {
      now = f;
      v.textContent = f.text;
      c.textContent = against(f.against);
      c.style.display = f.against ? '' : 'none';
      el.classList.toggle('press', !!f.explain);
      el.setAttribute('aria-disabled', String(!f.explain));
    },
  };
}
