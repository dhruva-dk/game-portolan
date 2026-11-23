// The office's shell on the chartroom kit, round every screen but a bare one.
// The bar across the top, a bold cut paper: her team (its emblem and name),
// the ways back and forward, the open screen's title on a plate, then her
// balance, the standings, the next race, the Admiralty and the bell for what
// waits to be read, each opening its screen. The nav along the bottom, a band
// sunk into the page: the thirteen tabs, each its woodcut over its name (the
// open one gilt; one whose screen is not built shown off; a rubric disc for
// what is to be seen to, stripes for work under way), then the date and the
// one way on, main's gilt banner, under the right thumb.

import { TABS, type Tab, type Viewed } from '../../office/office.ts';
import type { ShellView } from '../../office/shell.ts';
import { mark, label, unread } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { paper, plate } from '../chartroom/paper.ts';
import { UNIT, u } from '../chartroom/tokens.ts';
import { emblem } from '../emblem.ts';
import type { Glyph } from '../glyphs.ts';
import { glyph } from '../ink.ts';
import { el, grouped, pressed, type Kid } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { banner } from '../screens.ts';
import type { Office } from './office.ts';
import { SCREENS, type Name } from './screens.ts';

/** The bar's and the nav's heights, in drawn units. */
const BAR = 34,
  BAND = 36;
/** The same, in the page's px, for the office to lay its body between them. */
export const STRIP = BAR * UNIT,
  NAV = BAND * UNIT;

/** What each tab is called on the nav, and its woodcut. */
const TAB: Readonly<Record<Tab, { name: string; glyph: Glyph }>> = {
  home: { name: 'Home', glyph: 'office.home' },
  player: { name: 'Player', glyph: 'office.player' },
  mail: { name: 'Mail', glyph: 'office.mail' },
  ship: { name: 'Ship', glyph: 'office.ship' },
  hq: { name: 'HQ', glyph: 'office.hq' },
  team: { name: 'Team', glyph: 'office.team' },
  drivers: { name: 'Drivers', glyph: 'office.drivers' },
  staff: { name: 'Staff', glyph: 'office.staff' },
  scouting: { name: 'Scouting', glyph: 'office.scouting' },
  finances: { name: 'Finances', glyph: 'office.finances' },
  sponsors: { name: 'Sponsors', glyph: 'office.sponsors' },
  standings: { name: 'Standings', glyph: 'office.standings' },
  calendar: { name: 'Calendar', glyph: 'office.calendar' },
};

const CSS = `
.sh-bar { position: absolute; left: 0; right: 0; top: 0; height: ${u(BAR)}; padding: var(--s2) var(--s4) 0; }
.sh-top { height: 100%; display: flex; align-items: center; gap: var(--s4); padding: 0 var(--s3) 0 var(--s4); }
.sh-team { flex: none; display: flex; align-items: center; gap: var(--s2); max-width: ${u(96)}; }
.sh-team > svg { flex: none; width: ${u(18)}; height: ${u(18)}; }
.sh-team > span { font: 700 var(--t-body)/1.1 var(--face); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; }
.sh-hist { flex: none; display: flex; }
.sh-key { position: relative; flex: none; width: var(--touch); height: var(--touch); display: grid; place-items: center;
  transition: translate var(--press); }
.sh-key.press:active { translate: 0 var(--u); }
.sh-key > .cr-mark { width: ${u(14)}; height: ${u(14)}; }
.sh-key > .sh-count { position: absolute; right: ${u(1)}; top: ${u(1)}; }
.sh-title { flex: none; max-width: ${u(150)}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sh-grow { flex: 1; }
.sh-stat { flex: none; min-height: var(--touch); display: flex; flex-direction: column; justify-content: center;
  align-items: flex-end; gap: ${u(0.5)}; transition: translate var(--press); }
.sh-stat.press:active { translate: 0 var(--u); }
.sh-stat b { font: 600 var(--t-body)/1.1 var(--face); white-space: nowrap; }
.sh-stat .cr-label { white-space: nowrap; }
.sh-stat .cr-fig { font-size: var(--t-name); font-variant-numeric: lining-nums tabular-nums; }
.sh-stat.owing .cr-fig { color: var(--harm); }
.sh-count > svg, svg.sh-count { width: ${u(11)}; height: ${u(11)}; }

.sh-nav { position: absolute; left: 0; right: 0; bottom: 0; height: ${u(BAND)}; display: flex; align-items: stretch;
  background: var(--paper-sunk); border-top: var(--w-bold) solid var(--ink); box-shadow: inset 0 var(--w-rule) 0 var(--paper-raised); }
.sh-tabs { flex: 1; display: flex; min-width: 0; }
.sh-tab { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: ${u(1)}; border-left: var(--w-fine) solid var(--rule); color: var(--ink-2);
  transition: translate var(--press); }
.sh-tab:first-child { border-left-color: transparent; }
.sh-tab.press:active { translate: 0 var(--u); }
.sh-tab > .cr-mark { width: ${u(15)}; height: ${u(15)}; }
.sh-tab > span { font: 500 var(--t-label)/1 var(--face); white-space: nowrap; }
.sh-tab.chosen { background: var(--gilt); color: var(--ink); box-shadow: inset 0 0 0 var(--w-rule) var(--ink); }
.sh-tab.chosen + .sh-tab { border-left-color: transparent; }
.sh-tab.chosen > span { font-weight: 700; }
.sh-tab > .sh-count { position: absolute; left: calc(50% + ${u(5)}); top: ${u(2)}; }
.sh-tab > .sh-busy { position: absolute; left: var(--s3); right: var(--s3); bottom: ${u(1.5)}; height: ${u(2.5)};
  background: var(--stripes); box-shadow: inset 0 0 0 var(--w-hair) var(--ink); }
.sh-date { flex: none; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; gap: ${u(0.5)};
  padding: 0 var(--s3) 0 var(--s4); border-left: var(--w-fine) solid var(--line); }
.sh-date b { font: italic 600 var(--t-body)/1 var(--face); white-space: nowrap; }
.sh-on { position: relative; flex: none; width: ${u(92)}; display: grid; place-items: center; margin-right: var(--s2);
  transition: translate var(--press); }
.sh-on.press:active { translate: 0 var(--u); }
.sh-on > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.sh-on > span { position: relative; padding-left: ${u(4)}; font: 700 var(--t-body)/1 var(--face); letter-spacing: .06em;
  text-transform: uppercase; }
`;

/** `s` sized by the shell's CSS, not at its own size. */
const loose = (s: SVGSVGElement) => {
  s.removeAttribute('style');
  return s;
};

/** A woodcut on the 24 grid. */
const cut = (g: Glyph) => loose(mark(24, 24, glyph(g, 12, 12, 24)));

/** A count to be seen to, as a rubric disc; nothing when there is none. */
const count = (n: number | undefined) => {
  if (n === undefined || n <= 0) return null;
  const disc = loose(unread(n));
  disc.classList.add('sh-count');
  return disc;
};

/** Main's banner, gilt, as the way on, laid under its word. */
const pennant = () => loose(mark(92, 36, banner(46, 18, 86, '', true)));

/** The shell for `office`: `hist` its ways back and forward. */
export function createShell(
  office: Office,
  hist: { back(): void; forward(): void }
) {
  kitLooks();
  stylesheet(CSS);
  const strip = el('div', 'cr sh-bar'),
    nav = el('nav', 'cr sh-nav');
  /** A thing of the bar that opens `to`, if its screen is built; else it only shows, off. */
  const opens = <T extends HTMLElement>(made: T, to: Viewed | null) =>
    pressed(
      made,
      () => to && office.ask({ kind: 'open', screen: to }),
      to === null || !SCREENS[to]
    );

  /** The bar, from the view: her team, the ways back and forward, the title, the figures and the keys. */
  function top(
    v: ShellView,
    title: string,
    can: { back: boolean; forward: boolean }
  ) {
    const stat = (cls: string, caption: string, value: Kid, to: Viewed) =>
      opens(el('div', `sh-stat ${cls}`.trim(), label(caption), value), to);
    const next =
      v.next.days === 0
        ? 'Race day'
        : v.next.days === 1
          ? 'Next race tomorrow'
          : `Next race in ${v.next.days} days`;
    strip.replaceChildren(
      paper(
        el(
          'div',
          'sh-top',
          el(
            'div',
            'sh-team',
            emblem(v.team.emblem, v.team.colours, 24),
            el('span', '', v.team.name)
          ),
          el(
            'div',
            'sh-hist',
            pressed(
              el('div', 'sh-key', cut('menu.back')),
              hist.back,
              !can.back
            ),
            pressed(
              el('div', 'sh-key', cut('menu.forward')),
              hist.forward,
              !can.forward
            )
          ),
          plate(el('span', 'sh-title', title)),
          el('div', 'sh-grow'),
          stat(
            v.balance < 0 ? 'owing' : '',
            'Balance',
            el('span', 'cr-fig', grouped(v.balance)),
            'finances'
          ),
          stat('', v.championship, el('b', '', 'Standings'), 'standings'),
          stat('', next, el('b', '', v.next.name), 'calendar'),
          opens(el('div', 'sh-key', cut('office.admiralty')), null),
          opens(
            el('div', 'sh-key', cut('office.bell'), count(v.notices)),
            'mail'
          )
        ),
        { fill: 'paper-raised', bold: true, flat: true }
      )
    );
  }

  /** The nav, from the view: the tab `lit` gilt, each unbuilt tab off. */
  function bottom(v: ShellView, lit: Tab | null) {
    const tab = (t: Tab) =>
      opens(
        el(
          'div',
          `sh-tab${t === lit ? ' chosen' : ''}`,
          cut(TAB[t].glyph),
          el('span', '', TAB[t].name),
          count(v.marks[t]?.count),
          v.marks[t]?.busy && el('i', 'sh-busy')
        ),
        t
      );
    nav.replaceChildren(
      el('div', 'sh-tabs', ...TABS.map(tab)),
      el('div', 'sh-date', label('Date'), el('b', '', v.date)),
      pressed(el('div', 'sh-on', pennant(), el('span', '', v.on)), () =>
        office.ask({ kind: 'continue' })
      )
    );
  }

  return {
    strip,
    nav,
    /** Draws the shell from `v` round the screen `open`, or (null) puts it away for a bare one. */
    show(
      v: ShellView | null,
      at: Name,
      can: { back: boolean; forward: boolean }
    ) {
      strip.hidden = nav.hidden = v === null;
      if (!v) return;
      const entry = SCREENS[at];
      top(v, entry?.title ?? '', can);
      bottom(v, entry?.tab ?? null);
    },
  };
}
