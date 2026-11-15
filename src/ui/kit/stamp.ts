// Stamp: a word in a double rule, set askew, pressed onto a document in 150 ms with a knock (Signed, Refused, Sold,
// Sacked). Set again with `press`, it is pressed again.

import { make, sound, type Part } from './part';

export interface StampView { text: string; tone?: 'good' | 'harm'; press?: boolean }

/** A stamp. */
export function stamp(): Part<StampView> {
  const el = make('span', 'k-stamp');
  return {
    el,
    set(s) {
      el.textContent = s.text;
      el.classList.toggle('good', s.tone === 'good');
      if (!s.press) return;
      el.classList.remove('pressed');
      void el.offsetWidth;
      el.classList.add('pressed');
      sound(el, 'stamp');
    },
  };
}
