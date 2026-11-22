// The office's shell, round every screen but a bare one. The strip across the
// top: her team's block (its emblem and name on its colour), the open screen's
// title, then to the right her balance, the standings, the next race, the
// Admiralty and what waits to be read. The nav along the bottom: back and
// forward, the thirteen tabs (the open one lit; one whose screen is not built
// shown unavailable; a count to be seen to, the stripes of work under way), the
// date, and the one way on at the far right.

import { TABS, type Tab } from '../../office/office.ts';
import type { ShellView } from '../../office/shell.ts';
import { emblem } from '../emblem.ts';
import { TYPE } from '../ink.ts';
import { icon } from '../kit/icons.ts';
import { el, grouped, pressed, styled, type Kid } from '../kit/part.ts';
import { cut, stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import { SCREENS, type Name } from './screens.ts';

/** The strip's and the nav's heights, px. */
export const STRIP = 56,
  NAV = 60;

/** What each tab is called on the nav. */
const LABELS: Readonly<Record<Tab, string>> = {
  home: 'Home',
  player: 'Player',
  mail: 'Mail',
  ship: 'Ship',
  hq: 'HQ',
  team: 'Team',
  drivers: 'Drivers',
  staff: 'Staff',
  scouting: 'Scouting',
  finances: 'Finances',
  sponsors: 'Sponsors',
  standings: 'Standings',
  calendar: 'Calendar',
};

const CSS = `
/* the strip and the nav: two bands of the chart's margin, ruled twice on the side they face the page */
.o-strip { position: absolute; left: 0; right: 0; top: 0; height: ${STRIP}px; display: flex; align-items: center; gap: 6px;
  padding-right: 8px; color: var(--ink); border-bottom: 1.5px solid var(--ink); box-shadow: 0 2px 0 var(--shade);
  background: linear-gradient(to top, transparent 3px, var(--line) 3px, var(--line) 3.8px, transparent 3.8px), var(--bar); }
/* the team's plate and the chips keep their widths on every screen: the title has what is left, a long one set smaller */
.o-team { flex: none; align-self: stretch; display: flex; align-items: center; gap: 10px; width: 216px; margin-bottom: 5px;
  padding: 0 12px 0 10px; background: var(--light); border-left: 7px solid var(--team); border-right: 1px solid var(--line); }
.o-team > span { font: 700 15px/1.1 var(--serif); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.o-title { flex: 1 1 0; min-width: 0; padding: 0 12px 4px; font: 700 ${TYPE.title}px/1 var(--serif); letter-spacing: .12em;
  text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.o-title.long { font-size: 18px; letter-spacing: .04em; }
.o-chips { flex: none; display: flex; align-items: center; gap: 8px; padding-bottom: 4px; }
.o-chip { position: relative; height: 40px; min-width: 44px; display: flex; align-items: center; gap: 6px; padding: 0 6px 0 9px;
  ${cut('light')} white-space: nowrap; }
.o-chip > .o-lines { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
.o-chip small { font-size: ${TYPE.small}px; font-style: italic; color: var(--faint); }
.o-chip > .k-icon:last-child { color: var(--faint); }
.o-chip.still { padding-right: 12px; }
.o-pill { padding: 4px 11px; background: var(--good); color: var(--on-fill); font-weight: 700; border: 1.2px solid var(--ink);
  box-shadow: inset 0 0 0 2px var(--good), inset 0 0 0 2.7px var(--on-fill); }
.o-pill.owing { background: var(--bad); box-shadow: inset 0 0 0 2px var(--bad), inset 0 0 0 2.7px var(--on-fill); }
.o-count { position: absolute; right: 2px; top: -7px; min-width: 20px; height: 20px; padding: 0 5px; display: grid;
  place-items: center; border-radius: 10px; background: var(--bad); color: var(--on-fill); border: 1.2px solid var(--ink);
  font: italic 700 ${TYPE.small}px/1 var(--serif); }

.o-nav { position: absolute; left: 0; right: 0; bottom: 0; height: ${NAV}px; display: flex; align-items: center;
  padding: 4px 8px 0; color: var(--ink); border-top: 1.5px solid var(--ink);
  background: linear-gradient(to bottom, transparent 3px, var(--line) 3px, var(--line) 3.8px, transparent 3.8px), var(--bar); }
.o-hist { display: flex; gap: 5px; margin-right: 8px; }
.o-hist > div { width: 42px; height: 42px; display: grid; place-items: center; ${cut('light')} }
.o-tabs { flex: 1; align-self: stretch; display: flex; min-width: 0; padding: 5px 0 4px; }
.o-tab { position: relative; flex: 1; min-width: 44px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 2px; border: 1.5px solid transparent; font: 500 ${TYPE.small}px/1 var(--serif); }
.o-tab + .o-tab:not(.lit) { border-left-color: var(--rule); }
.o-tab.lit { ${cut('gilt')} font-weight: 700; }
.o-tab.lit + .o-tab { border-left-color: transparent; }
.o-tab > .o-count { right: 4px; top: 0; }
.o-tab > .o-busy { position: absolute; left: 8px; right: 8px; bottom: 0; height: 5px; background: var(--stripes);
  box-shadow: inset 0 0 0 .8px var(--ink); }
.o-date { height: 42px; margin: 0 10px; padding: 0 12px; display: flex; align-items: center; gap: 4px; ${cut('light')}
  font-style: italic; white-space: nowrap; }
.o-on { height: 44px; width: 146px; display: flex; align-items: center; justify-content: center; gap: 10px; ${cut('on')}
  color: var(--on-fill); font-weight: 700; letter-spacing: .04em; }
`;

/** The shell for `office`: `hist` its ways back and forward. */
export function createShell(
  office: Office,
  hist: { back(): void; forward(): void }
) {
  stylesheet(CSS);
  const strip = el('div', 'o-strip'),
    nav = el('div', 'o-nav');

  /** A chip of the strip: a control where the screen it leads to is built, its mark a chevron; else it only shows. */
  const chip = (to: Tab | null, ...kids: Kid[]) => {
    const built = to !== null && SCREENS[to] !== undefined;
    const made = el(
      'div',
      `o-chip${built ? '' : ' still'}`,
      ...kids,
      built && icon('down', 16)
    );
    return to !== null && built
      ? pressed(made, () => office.ask({ kind: 'open', screen: to }))
      : made;
  };
  const count = (n: number | undefined) =>
    n !== undefined && n > 0 && el('div', 'o-count', n);

  /** The strip, from the view: her team, the open screen's title, the chips. */
  function top(v: ShellView, title: string) {
    strip.replaceChildren(
      styled(
        el(
          'div',
          'o-team',
          emblem(v.team.emblem, v.team.colours, 36),
          el('span', '', v.team.name)
        ),
        { '--team': v.team.colours[0] }
      ),
      el('div', title.length > 9 ? 'o-title long' : 'o-title', title),
      el(
        'div',
        'o-chips',
        chip(
          'finances',
          el(
            'div',
            `o-pill${v.balance < 0 ? ' owing' : ''}`,
            `Balance ${grouped(v.balance)}`
          )
        ),
        chip(
          'standings',
          icon('cup', 22),
          el(
            'div',
            'o-lines',
            el('small', '', v.championship),
            el('span', '', 'Standings')
          )
        ),
        chip(
          'calendar',
          icon('cloud', 22),
          el(
            'div',
            'o-lines',
            el(
              'small',
              '',
              v.next.days > 0 ? `Next Race in ${v.next.days} Days` : 'Race Day'
            ),
            el('span', '', v.next.name)
          )
        ),
        chip(null, icon('anchor', 22), el('span', '', 'Admiralty')),
        chip('mail', icon('bell', 24), count(v.notices))
      )
    );
  }

  /** The nav, from the view: the tab `lit` filled, each unbuilt tab unavailable. */
  function bottom(
    v: ShellView,
    lit: Tab | null,
    can: { back: boolean; forward: boolean }
  ) {
    const tab = (t: Tab) =>
      pressed(
        el(
          'div',
          `o-tab${t === lit ? ' lit' : ''}`,
          icon(t, 24),
          LABELS[t],
          count(v.marks[t]?.count),
          v.marks[t]?.busy && el('i', 'o-busy')
        ),
        () => office.ask({ kind: 'open', screen: t }),
        SCREENS[t] === undefined
      );
    nav.replaceChildren(
      el(
        'div',
        'o-hist',
        pressed(el('div', '', icon('back', 22)), hist.back, !can.back),
        pressed(el('div', '', icon('forward', 22)), hist.forward, !can.forward)
      ),
      el('div', 'o-tabs', ...TABS.map(tab)),
      el('div', 'o-date', v.date),
      pressed(el('div', 'o-on', v.on, icon('forward', 20)), () =>
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
      open: Name,
      can: { back: boolean; forward: boolean }
    ) {
      strip.hidden = nav.hidden = v === null;
      if (!v) return;
      const entry = SCREENS[open];
      top(v, entry?.title ?? '');
      bottom(v, entry?.tab ?? null, can);
    },
  };
}
