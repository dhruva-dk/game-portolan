// Notice: a sentence slipped onto the desk under the top bar for a few seconds (a refusal, a save that failed, a
// backup made), ruled at its left in the ink of its tone. The newest on top; at most three.

import { fade } from '../ui';
import { make } from './part';

export type Tone = 'plain' | 'harm' | 'good';
export interface Notices { el: HTMLElement; say(sentence: string, tone?: Tone): void }

/** How long a notice stays, ms (a harm stays longer: it is read twice). */
const STAY = { plain: 3200, good: 3200, harm: 5200 } as const;

/** The notices, in `page`. */
export function notices(page: HTMLElement): Notices {
  const el = make('div', 'k-notices', page);
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  return {
    el,
    say(sentence, tone = 'plain') {
      const n = make('div', `k-notice ${tone}`);
      n.textContent = sentence;
      el.prepend(n);
      while (el.children.length > 3) el.lastElementChild?.remove();
      window.setTimeout(() => {
        fade(n, false);
        window.setTimeout(() => n.remove(), 400);
      }, STAY[tone]);
    },
  };
}
