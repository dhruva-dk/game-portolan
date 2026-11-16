// Empty state: what a panel or a screen shows when it has nothing to list (no mail, no scouting) or is not yet drawn:
// a woodcut, one short line, a sentence only if one is needed, and a button to do it, if there is one.

import type { Glyph } from '../glyphs';
import { glyph, svg } from '../ink';
import { button } from './button';
import { make, type Part } from './part';

export interface EmptyView { mark: Glyph; title: string; sentence: string; action?: { label: string; act: () => void } }

/** An empty state. */
export function empty(): Part<EmptyView> {
  const el = make('div', 'k-empty');
  return {
    el,
    set(v) {
      el.innerHTML = svg(64, 64, glyph(v.mark, 32, 32, 60, { ink: 'sepia' }));
      make('div', 'caps h', el, v.title);
      if (v.sentence) make('p', '', el, v.sentence);
      if (v.action) el.appendChild(button(v.action.label, v.action.act, 'primary').el);
    },
  };
}
