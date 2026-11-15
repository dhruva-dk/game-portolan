// Stars: a rating out of five in half stars, inked gold; the potential beyond it in outline (a gull's, a building's).

import { INK } from '../ink';
import { make, type Part } from './part';

export interface Rating { stars: number; potential?: number }

const STAR = 'M8 1.2L10 6L15.2 6.4L11.2 9.8L12.4 14.8L8 12.2L3.6 14.8L4.8 9.8L0.8 6.4L6 6Z';

/** Five stars `size` px each. */
export function stars(size = 16): Part<Rating> {
  const el = make('span', 'k-stars');
  return {
    el,
    set({ stars: s, potential }) {
      const at = (i: number, v: number) => Math.max(0, Math.min(1, v - i));
      let html = '';
      for (let i = 0; i < 5; i++) {
        const full = at(i, s), pot = at(i, potential ?? s), id = `st${i}${Math.round(full * 2)}`;
        html += `<svg viewBox="0 0 16 16" width="${size}" height="${size}"><clipPath id="${id}"><rect width="${16 * full}" height="16"/></clipPath>`
          + `<path d="${STAR}" fill="none" stroke="${INK.iron}" stroke-width="${pot > 0 ? 1.1 : 0.6}" stroke-dasharray="${pot > 0 ? '' : '1.5 1.5'}"/>`
          + `<path d="${STAR}" fill="${INK.gold}" stroke="${INK.iron}" stroke-width="1.1" clip-path="url(#${id})"/></svg>`;
      }
      el.innerHTML = html;
      el.setAttribute('aria-label', `${s} stars${potential != null ? `, potential ${potential}` : ''}`);
    },
  };
}
