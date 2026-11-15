// The office's top bar (Phase C section 5), 64 px across the page. Left, 220 px: the player's headshot, name, emblem
// and crew (a tap: their career). Middle, 680 px: the eight tabs, 85 px each, a glyph over a small-caps label, the open
// one underlined in the crew's colour; Mail's unread count, vermilion while a dilemma waits. Right, 280 px: the date,
// the Coin, and Continue.

import type { TopBar } from '../../office';
import { emblem } from '../emblem';
import { PAPER, crewInk, glyph, svg } from '../ink';
import { button } from '../kit/button';
import { coin } from '../kit/coin';
import { headshot } from '../kit/headshot';
import { make, tappable } from '../kit/part';
import { TABS, type Tap } from '../ways';

export interface Top { el: HTMLElement; show(t: TopBar, open: string): void }

/** The top bar, calling `tap` for a tab or the career and `go` for Continue. */
export function createTop(tap: (t: Tap) => void, go: () => void): Top {
  const el = make('header', 'o-top');
  const who = make('div', 'o-who', el), face = headshot(40), id = make('div', 'o-id', who);
  who.prepend(face.el);
  const name = make('div', 'bold', id), line = make('div', 'small o-crew', id), mark = make('span', '', line), crew = make('span', '', line);
  tappable(who, () => tap('career'));
  who.setAttribute('aria-label', 'Your career');
  const tabs = make('nav', 'o-tabs', el);
  const cells = TABS.map((t) => {
    const cell = make('div', 'o-tab', tabs);
    cell.innerHTML = svg(28, 28, glyph(`tab.${t}`, 14, 14, 26));
    make('span', 'caps', cell, t[0].toUpperCase() + t.slice(1));
    tappable(cell, () => tap(t));
    cell.setAttribute('role', 'tab');
    return cell;
  });
  const count = make('span', 'o-count', cells[TABS.indexOf('mail')]);
  const right = make('div', 'o-right', el), date = make('div', 'small o-date', right), purse = coin(20);
  right.appendChild(purse.el);
  const cont = button('Continue', go, 'primary');
  cont.el.classList.add('o-go');
  right.appendChild(cont.el);
  return {
    el,
    show(t, open) {
      face.set(t.face);
      name.textContent = t.name;
      mark.innerHTML = svg(18, 18, emblem(t.emblem, 9, 9, 16, { ink: crewInk(t.colours.first), ground: PAPER }));
      crew.textContent = t.crew;
      el.style.setProperty('--crew', crewInk(t.colours.first));
      TABS.forEach((tab, i) => {
        cells[i].classList.toggle('open', tab === open);
        cells[i].setAttribute('aria-selected', String(tab === open));
      });
      count.textContent = t.unread > 0 ? String(t.unread) : '';
      count.classList.toggle('sealed', t.dilemma);
      date.textContent = t.date;
      purse.set(t.coin.value);
      cont.set({ label: t.go.label });
    },
  };
}
