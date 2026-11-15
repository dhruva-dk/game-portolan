// Card: a gull (or a patron, a building) on a ruled card: their headshot at 96, their name and a line under it, their
// stars, tags, and a few lines of label and figure. Tapping it opens what it names, if it is given a way.

import type { Face, Line } from '../../office';
import { headshot } from './headshot';
import { make, tappable, type Part } from './part';
import { stars, type Rating } from './stars';
import { tag, type TagText } from './tag';

export interface CardView { face: Face | null; name: string; line: string; rating: Rating | null; tags: readonly TagText[]; lines: readonly Line[] }

/** A card, calling `open` when tapped, if given. */
export function card(open?: () => void): Part<CardView> {
  const el = make('div', 'k-card'), face = headshot(96), text = make('div', '', el);
  el.prepend(face.el);
  const name = make('div', 'bold', text), line = make('div', 'faint small', text), rate = stars(16), tags = make('div', '', text), lines = make('div', 'lines', text);
  text.insertBefore(rate.el, tags);
  if (open) tappable(el, open);
  return {
    el,
    set(c) {
      face.el.style.display = c.face ? '' : 'none';
      if (c.face) face.set(c.face);
      name.textContent = c.name;
      line.textContent = c.line;
      rate.el.style.display = c.rating ? '' : 'none';
      if (c.rating) rate.set(c.rating);
      tags.textContent = '';
      for (const t of c.tags) tags.appendChild(tag(t).el);
      lines.textContent = '';
      for (const l of c.lines) {
        make('span', '', lines, l.label);
        make('span', 'num', lines, l.amount);
      }
    },
  };
}
