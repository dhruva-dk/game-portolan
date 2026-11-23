// The main menu on the chartroom kit, after MM's (047), on the whole page:
// the game's mark on its plate across the top; two papers, a new career (the
// larger, at the left: her ship through a brass-framed window) and the single
// race (the planet she lies off, from space), each a woodcut and its name over
// its picture, a plate on the picture saying what it holds; under them two
// strips, the career kept on this device to continue (shut with none kept),
// and the preferences. A tap on any asks the menu's way of that name.

import type { MenuView } from '../../office/menu.ts';
import { cut, label, mark } from '../chartroom/figures.ts';
import type { Glyph } from '../glyphs.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { page } from '../chartroom/layout.ts';
import { paper, plate } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import { emblem } from '../emblem.ts';
import { galleon } from '../ink.ts';
import { el, pictured, pressed, type Kid } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-menu { height: 100%; box-sizing: border-box; padding: var(--s5) var(--s6); }
.mn-top { grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; }
.mn-top > .cr-plate { display: flex; align-items: center; gap: var(--s4); padding: var(--s2) var(--s6) var(--s2) var(--s4); }
.mn-top .cr-mark { width: ${u(30)}; height: ${u(30)}; }
.mn-top b { font: 700 var(--t-title)/1 var(--face); letter-spacing: .22em; }
.mn-career { grid-column: 1 / 6; grid-row: 2 / 7; }
.mn-single { grid-column: 6 / -1; grid-row: 2 / 7; }
/* a tile: its head on a paper over its picture, one frame; the picture is no paper's, the world shows through it */
.mn-tile { display: flex; flex-direction: column; min-height: 0; box-shadow: 0 0 0 var(--w-bold) var(--ink); }
.mn-head { flex: none; display: flex; align-items: center; gap: var(--s4); padding: var(--s3) var(--s5);
  font: 700 var(--t-head)/1 var(--face); letter-spacing: .14em; text-transform: uppercase; }
.mn-head > svg, .mn-strip > svg { flex: none; width: ${u(20)}; height: ${u(20)}; }
.mn-picture { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--sea);
  box-shadow: inset 0 0 0 ${u(3)} var(--brass), inset 0 0 0 ${u(3.8)} var(--ink); }
.mn-picture > img { position: absolute; inset: ${u(3.8)}; width: calc(100% - ${u(7.6)}); height: calc(100% - ${u(7.6)}); object-fit: cover; }
.mn-picture.o-window { background: none; }
/* she is drawn about a point a little over the window's middle, her hull and her courses filling it */
.mn-picture > .o-subject { position: absolute; left: 0; right: 0; top: 46%; height: 80%; translate: 0 -50%; pointer-events: none; }
.mn-picture > .cr-plate { position: absolute; left: 0; bottom: var(--s6); display: flex; flex-direction: column; gap: ${u(1)};
  padding: var(--s2) var(--s6) var(--s2) var(--s5); }
.mn-picture > .cr-plate > span { font: italic 500 var(--t-body)/1.2 var(--face); letter-spacing: 0; text-transform: none; opacity: .8; }
.mn-strip { grid-row: 7; display: flex; align-items: center; gap: var(--s4); padding: 0 var(--s5);
  font: 700 var(--t-head)/1 var(--face); letter-spacing: .14em; text-transform: uppercase; }
.mn-strip.continue { grid-column: 1 / 6; }
.mn-strip.preferences { grid-column: 6 / -1; }
.mn-kept { margin-left: auto; display: flex; align-items: center; gap: var(--s3); min-width: 0;
  font: 500 var(--t-body)/1 var(--face); letter-spacing: 0; text-transform: none; }
.mn-kept > svg { flex: none; width: ${u(16)}; height: ${u(16)}; }
.mn-kept > b { font: 700 var(--t-name)/1 var(--face); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

/** What the menu asks for. */
type Choice = 'new' | 'continue' | 'single' | 'preferences';

/** The main menu. */
export function createMenu(office: Office): Screen<MenuView> {
  kitLooks();
  stylesheet(CSS);
  const root = page({ cols: 8, rows: 7 }, 's-menu');
  const ask = (choice: Choice) => () => office.ask({ kind: 'menu', choice });

  /** A paper of the menu, pressed to ask `choice`: a woodcut and its name over a picture, its plate on it. */
  const tile = (
    g: Glyph,
    title: string,
    picture: readonly [string, Kid],
    says: readonly [string, string],
    choice: Choice,
    cls: string
  ) =>
    pressed(
      el(
        'div',
        `mn-tile ${cls}`,
        paper(el('div', 'mn-head', cut(g), title), {
          fill: 'paper-raised',
          flat: true,
        }),
        el(
          'div',
          `mn-picture ${picture[0]}`.trim(),
          picture[1],
          plate(el('b', '', says[0]), el('span', '', says[1]))
        )
      ),
      ask(choice)
    );

  /** A strip of the menu: a woodcut, its name, what it holds at its right; shut if `off`. */
  const strip = (
    g: Glyph,
    title: string,
    choice: Choice,
    off: boolean,
    ...holds: Kid[]
  ) =>
    pressed(
      paper(
        el(
          'div',
          `mn-strip ${choice}`,
          cut(g),
          title,
          holds.length > 0 && el('div', 'mn-kept', ...holds)
        ),
        { fill: 'paper-raised', bold: true }
      ),
      ask(choice),
      off
    );

  const brand = mark(64, 64, galleon(32, 32, 64, { hull: 'url(#h-gold)' }));
  brand.removeAttribute('style');

  return {
    el: root,
    show(v) {
      root.replaceChildren(
        el('div', 'mn-top', plate(brand, el('b', '', 'PORTOLAN'))),
        tile(
          'office.player',
          'New Career',
          ['o-window', el('div', 'o-subject')],
          [
            `${v.career.championships} Championships`,
            `${v.career.teams} Teams`,
          ],
          'new',
          'mn-career'
        ),
        tile(
          'weapon.cannon',
          'Single Race',
          ['', pictured(office.still())],
          [v.single.seed, `${v.single.ships} Ships`],
          'single',
          'mn-single'
        ),
        strip(
          'menu.forward',
          'Continue',
          'continue',
          v.kept === null,
          ...(v.kept
            ? [
                emblem(v.kept.team.emblem, v.kept.team.colours, 16),
                el('b', '', v.kept.team.name),
                label(v.kept.date),
              ]
            : [label('No career is kept on this device.')])
        ),
        strip('menu.wheel', 'Preferences', 'preferences', false)
      );
    },
  };
}
