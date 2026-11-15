// Letter: a piece of mail as a short line in a list (its sender's headshot, subject in bold while unread, a wax seal
// mark on a dilemma waiting for an answer, the day), or opened out with its body.

import type { LetterLine } from '../../office';
import { headshot } from './headshot';
import { make, tappable, type Part } from './part';

export interface LetterView { line: LetterLine; body?: readonly string[] }

/** A letter, calling `open` with its id when tapped, if given. */
export function letter(open?: (id: number) => void): Part<LetterView> {
  const el = make('div', 'k-letter'), meta = make('div', 'meta', el), from = make('span', '', meta), day = make('span', '', meta);
  const row = make('div', '', el), subj = make('span', 'subj', row), seal = make('span', 'seal bold', row), body = make('div', '', el);
  const face = headshot(40);
  Object.assign(el.style, { display: 'grid', gridTemplateColumns: '40px 1fr', columnGap: '10px', minHeight: '44px' });
  el.prepend(face.el);
  face.el.style.gridRow = 'span 3';
  let id = -1;
  if (open) tappable(el, () => open(id));
  return {
    el,
    set({ line, body: text }) {
      id = line.id;
      el.classList.toggle('unread', line.unread);
      if (line.face) face.set(line.face);
      face.el.style.visibility = line.face ? '' : 'hidden';
      from.textContent = line.from;
      day.textContent = `Day ${line.day}`;
      subj.textContent = line.subject;
      seal.textContent = line.sealed ? ' · sealed: answer it' : '';
      body.textContent = '';
      for (const p of text ?? []) make('p', '', body, p);
    },
  };
}
