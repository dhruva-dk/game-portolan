// Tag: a word about a gull or a part ("Rookie", "Spec", "Injured") in small capitals in a square-ruled box, inked by
// its tone. Never a pill.

import type { TextInk } from '../ink';
import { make, type Part } from './part';

export interface TagText { text: string; tone?: Extract<TextInk, 'good' | 'harm' | 'sea'> | null }

/** A tag. */
export function tag(t?: TagText): Part<TagText> {
  const el = make('span', 'k-tag');
  const set = (v: TagText) => {
    el.textContent = v.text;
    el.className = `k-tag${v.tone ? ` ${v.tone}` : ''}`;
  };
  if (t) set(t);
  return { el, set };
}
