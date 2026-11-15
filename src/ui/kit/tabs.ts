// Sub-tabs: a screen's pages (Crew: roster, flight), a row of small-caps labels, the open one underlined in the
// crew's colour (the office sets --crew).

import { make, tappable, type Part } from './part';

export interface Choice { id: string; label: string; disabled?: boolean }

/** Sub-tabs of `items`, calling `pick` with the id tapped; `set` underlines the open one. */
export function subTabs(items: readonly Choice[], pick: (id: string) => void): Part<string> {
  const el = make('nav', 'k-subtabs');
  const tabs = items.map((t) => {
    const tab = make('div', 'k-subtab', el, t.label);
    tab.setAttribute('role', 'tab');
    tappable(tab, () => pick(t.id));
    return tab;
  });
  return {
    el,
    set(open) {
      items.forEach((t, i) => {
        tabs[i].classList.toggle('open', t.id === open);
        tabs[i].setAttribute('aria-selected', String(t.id === open));
      });
    },
  };
}
