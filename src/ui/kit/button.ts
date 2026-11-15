// Button: a ruled label that takes a tap. Plain, primary (iron, the one thing to do next) or danger (a double rule in
// vermilion, for what cannot be undone). At least 44 × 44.

import type { Glyph } from '../glyphs';
import { INK, glyph, svg } from '../ink';
import { disable, make, tappable, type Part } from './part';

export type ButtonKind = 'plain' | 'primary' | 'danger' | 'quiet';
export interface ButtonState { label: string; disabled?: boolean }

/** A button reading `label`, calling `act` when tapped (never while disabled), with a glyph before its label if given. */
export function button(label: string, act: () => void, kind: ButtonKind = 'plain', mark?: Glyph): Part<ButtonState> {
  const el = make('div', `k-btn ${kind}`);
  if (mark) el.innerHTML = svg(20, 20, glyph(mark, 10, 10, 20, kind === 'primary' ? { ink: 'white', paper: INK.iron } : {}));
  const text = make('span', '', el, label);
  tappable(el, act);
  return {
    el,
    set(s) {
      text.textContent = s.label;
      disable(el, !!s.disabled);
    },
  };
}
