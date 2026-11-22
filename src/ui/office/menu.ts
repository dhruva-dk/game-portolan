// The main menu, on the whole page: the game's mark and the screen's title
// across the top; two tiles, a new career (the larger, at the left) and the
// single race, each a head over a picture with its plate (her ship herself,
// the world through the page; the planet she lies off, pictured from space);
// and under them two
// rows, the career kept on this device to continue, and the preferences. A tap
// on any asks the menu's way of that name; with no career kept, Continue is
// unavailable.

import type { MenuView } from '../../office/menu.ts';
import { emblem } from '../emblem.ts';
import { galleon } from '../ink.ts';
import { icon, type Icon } from '../kit/icons.ts';
import { drawn, el, pictured, pressed, type Kid } from '../kit/part.ts';
import { cut, stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-menu > .m-top { position: absolute; left: 0; right: 0; top: 0; height: 88px; display: flex; align-items: center;
  background: var(--bar); color: var(--bar-ink); border-bottom: 1.5px solid var(--ink); }
.m-top > .m-mark { display: flex; align-items: center; gap: 10px; padding: 0 28px 0 34px; font: 700 34px/1 var(--serif);
  letter-spacing: .14em; }
.m-top > .m-title { align-self: stretch; margin: 16px 0; padding: 0 28px; display: flex; align-items: center;
  border-left: 1px solid var(--bar-faint); font: 600 26px/1 var(--narrow); letter-spacing: .1em; text-transform: uppercase; }
.s-menu > .m-tiles { position: absolute; left: 34px; right: 34px; top: 138px; height: 532px; display: grid;
  grid-template-columns: 62fr 38fr; gap: 10px; }
.s-menu > .m-rows { position: absolute; left: 34px; right: 34px; top: 682px; height: 64px; display: grid;
  grid-template-columns: 1fr 1fr; gap: 10px; }
.m-head, .m-row { ${cut('panel')} }
.m-tile { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.m-head, .m-row { display: flex; align-items: center; font: 500 26px/1 var(--narrow); letter-spacing: .08em; text-transform: uppercase; }
.m-head { flex: none; height: 76px; padding-left: 6px; }
.m-head > .m-icon, .m-row > .m-icon { align-self: stretch; width: 68px; display: grid; place-items: center; color: var(--faint); }
.m-head > .m-icon { margin: 12px 18px 12px 0; border-right: 1px solid var(--rule); }
.m-row > .m-icon { margin-right: 18px; background: var(--dark); }
.m-row > .m-kept { margin-left: auto; padding-right: 18px; display: flex; align-items: center; gap: 10px; font: 500 15px var(--narrow);
  letter-spacing: 0; text-transform: none; color: var(--faint); }
.m-row > .m-kept > b { font: 700 17px var(--serif); color: var(--ink); }
.m-hero { position: relative; flex: 1; min-height: 0; overflow: hidden; border: 1.5px solid var(--ink); background: var(--light);
  box-shadow: 0 2px 0 var(--shade), inset 0 0 0 3px var(--panel), inset 0 0 0 4px var(--line); }
.m-hero > img { position: absolute; left: 4px; top: 4px; width: calc(100% - 8px); height: calc(100% - 8px); object-fit: cover; }
.m-hero.o-window { background: none; }
/* she is drawn about a point a little over the window's middle, her hull and her courses filling it */
.m-hero > .o-subject { position: absolute; left: 0; right: 0; top: 50%; height: 330px; margin-top: -180px; pointer-events: none; }
.m-hero > .m-plate { position: absolute; left: 0; bottom: 34px; padding: 10px 26px 10px 22px; display: flex; flex-direction: column;
  gap: 3px; background: var(--plate); color: var(--plate-ink); }
.m-plate > b { font: 700 24px/1.1 var(--narrow); letter-spacing: .08em; text-transform: uppercase; }
.m-plate > span { font-style: italic; color: var(--plate-faint); }
`;

/** The main menu. */
export function createMenu(office: Office): Screen<MenuView> {
  stylesheet(CSS);
  const root = el('div', 's-menu');
  const ask = (choice: 'new' | 'continue' | 'single' | 'preferences') => () =>
    office.ask({ kind: 'menu', choice });
  const tile = (
    glyph: Icon,
    title: string,
    hero: readonly [string, Kid],
    plate: readonly [string, string],
    act: () => void
  ) =>
    pressed(
      el(
        'div',
        'm-tile',
        el('div', 'm-head', el('div', 'm-icon', icon(glyph, 34)), title),
        el(
          'div',
          `m-hero ${hero[0]}`.trim(),
          hero[1],
          el('div', 'm-plate', el('b', '', plate[0]), el('span', '', plate[1]))
        )
      ),
      act
    );
  const row = (
    glyph: Icon,
    title: string,
    act: () => void,
    off: boolean,
    ...kept: Kid[]
  ) =>
    pressed(
      el(
        'div',
        'm-row',
        el('div', 'm-icon', icon(glyph, 30)),
        title,
        kept.length > 0 && el('div', 'm-kept', ...kept)
      ),
      act,
      off
    );
  return {
    el: root,
    show(v) {
      root.replaceChildren(
        el(
          'div',
          'm-top',
          el(
            'div',
            'm-mark',
            drawn(64, 64, galleon(32, 32, 64, { hull: 'url(#h-gold)' })),
            'PORTOLAN'
          ),
          el('div', 'm-title', 'Main Menu')
        ),
        el(
          'div',
          'm-tiles',
          tile(
            'player',
            'New Career',
            ['o-window', el('div', 'o-subject')],
            [
              `${v.career.championships} Championships`,
              `${v.career.teams} Teams`,
            ],
            ask('new')
          ),
          tile(
            'pennants',
            'Single Race',
            ['', pictured(office.still())],
            [v.single.seed, `${v.single.ships} Ships`],
            ask('single')
          )
        ),
        el(
          'div',
          'm-rows',
          row(
            'load',
            'Continue',
            ask('continue'),
            v.kept === null,
            ...(v.kept
              ? [
                  emblem(v.kept.team.emblem, v.kept.team.colours, 30),
                  el('b', '', v.kept.team.name),
                  v.kept.date,
                ]
              : [])
          ),
          row('cog', 'Preferences', ask('preferences'), false)
        )
      );
    },
  };
}
