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
import { stylesheet } from '../kit/style.ts';
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
.o-strip { position: absolute; left: 0; right: 0; top: 0; height: ${STRIP}px; display: flex; align-items: center; gap: 6px;
  padding-right: 6px; background: var(--bar); color: var(--bar-ink); border-bottom: 1.5px solid var(--ink); }
.o-team { align-self: stretch; display: flex; align-items: center; gap: 10px; min-width: 190px; max-width: 250px;
  padding: 0 16px 0 10px; background: var(--chip); border-left: 6px solid var(--team); }
.o-team > span { font: 700 17px/1.1 var(--serif); letter-spacing: .02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.o-title { padding: 0 14px; font: 700 ${TYPE.title}px/1 var(--serif); letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
.o-chips { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.o-chip { position: relative; height: 44px; min-width: 44px; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 12px;
  background: var(--chip); white-space: nowrap; }
.o-chip > .o-lines { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
.o-chip small { font-size: ${TYPE.small}px; color: var(--bar-faint); }
.o-chip > .k-icon:last-child { color: var(--bar-faint); }
.o-chip.still { padding-right: 12px; }
.o-pill { padding: 5px 12px; background: var(--good); color: var(--on-fill); font-weight: 600; border: 1.5px solid var(--bar-ink); }
.o-pill.owing { background: var(--bad); }
.o-count { position: absolute; right: 4px; top: -5px; min-width: 20px; height: 20px; padding: 0 5px; display: grid;
  place-items: center; border-radius: 10px; background: var(--bad); color: var(--on-fill); font: 700 ${TYPE.small}px/1 var(--narrow); }

.o-nav { position: absolute; left: 0; right: 0; bottom: 0; height: ${NAV}px; display: flex; align-items: center;
  padding: 0 8px; background: var(--bar); color: var(--bar-faint); border-top: 1.5px solid var(--ink); }
.o-hist { display: flex; margin-right: 8px; }
.o-hist > div { width: 44px; height: 44px; display: grid; place-items: center; background: var(--go); color: var(--on-fill); }
.o-hist > div + div { border-left: 1px solid var(--bar); }
.o-tabs { flex: 1; align-self: stretch; display: flex; min-width: 0; }
.o-tab { position: relative; flex: 1; min-width: 44px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 3px; font: 600 ${TYPE.small}px/1 var(--narrow); letter-spacing: .03em; }
.o-tab + .o-tab { border-left: 1px solid var(--chip); }
.o-tab.lit { background: var(--go); color: var(--on-fill); }
.o-tab > .o-count { right: 6px; top: 4px; }
.o-tab > .o-busy { position: absolute; left: 8px; right: 8px; bottom: 0; height: 5px; background: var(--stripes); }
.o-date { height: 44px; margin: 0 8px; padding: 0 12px; display: flex; align-items: center; gap: 4px; background: var(--go);
  color: var(--on-fill); white-space: nowrap; }
.o-on { height: 44px; width: 150px; display: flex; align-items: center; justify-content: center; gap: 10px; background: var(--on);
  color: var(--on-fill); border: 1.5px solid var(--bar-ink); font-weight: 700; letter-spacing: .04em; }
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
      el('div', 'o-title', title),
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
