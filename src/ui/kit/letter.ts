// Letter: a piece of mail as a short line in a list (its sender's headshot, subject in bold while unread, a wax seal
// mark on a dilemma waiting for an answer, the day), or opened out with its body.

import type { LetterLine, MailCategory } from '../../office';
import type { Glyph } from '../glyphs';
import { glyph, svg } from '../ink';
import { headshot } from './headshot';
import { make, tappable, type Part } from './part';

/** Each kind of letter's mark, for one from no gull. */
const MARK: Record<MailCategory, Glyph> = {
  crew: 'tab.crew', market: 'tab.market', ship: 'tab.ship', rookery: 'tab.rookery', league: 'tab.league', finance: 'tab.finance', elder: 'menu.rank',
};

export interface LetterView { line: LetterLine; body?: readonly string[] }

/** A letter, calling `open` with its id when tapped, if given. */
export function letter(open?: (id: number) => void): Part<LetterView> {
  const el = make('div', 'k-letter'), meta = make('div', 'meta', el), from = make('span', '', meta), day = make('span', '', meta);
  const row = make('div', '', el), subj = make('span', 'subj', row), seal = make('span', 'seal bold', row), body = make('div', '', el);
  const face = headshot(40), mark = make('div', '');
  el.prepend(face.el, mark);
  face.el.style.gridRow = mark.style.gridRow = '1 / span 3';
  face.el.style.gridColumn = mark.style.gridColumn = '1';
  for (const r of [meta, row, body]) r.style.gridColumn = '2';
  let id = -1;
  if (open) tappable(el, () => open(id));
  return {
    el,
    set({ line, body: text }) {
      id = line.id;
      el.classList.toggle('unread', line.unread);
      if (line.face) face.set(line.face);
      // (a letter from no one gull, as the Admiralty's: its kind's mark in the face's place)
      face.el.style.display = line.face ? '' : 'none';
      mark.innerHTML = line.face ? '' : svg(40, 40, glyph(MARK[line.category], 20, 20, 34));
      from.textContent = line.from;
      day.textContent = `Day ${line.day}`;
      subj.textContent = line.subject;
      seal.textContent = line.sealed ? ' · sealed: answer it' : '';
      body.textContent = '';
      for (const p of text ?? []) make('p', '', body, p);
    },
  };
}
