// The chartroom kit's sheet: every piece of ui/chartroom/ on its paper, with
// values of the sheet's own, for judging the kit by eye (?screen=chartroom).
// Its controls answer: a part chosen, a value stepped, an option dropped and
// chosen, a breakdown opened, a folio set over the page and put away.

import type { Jacket } from '../gull.ts';
import { brassPort } from '../chartroom/port.ts';
import {
  button,
  dropdown,
  popover,
  segmented,
  stepper,
} from '../chartroom/controls.ts';
import { busy, meter, statTile, table, terms } from '../chartroom/data.ts';
import {
  arrow,
  fig,
  label,
  name,
  place,
  portrait,
  stars,
  traitBadge,
  unread,
} from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { folio, plate, sheet } from '../chartroom/paper.ts';
import { TONE, u } from '../chartroom/tokens.ts';
import { el } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import type { Screen } from './screens.ts';

const CSS = `
.crk { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s4); padding: var(--s4) var(--s6); }
.crk-col { display: flex; flex-direction: column; gap: var(--s4); min-width: 0; min-height: 0; }
.crk .row { display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; }
.crk .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s3); }
.crk .at { position: relative; }
.crk .at > .cr-pop { left: 0; top: 100%; }
.crk .port { display: grid; place-items: center; }
.crk .who { display: flex; flex-direction: column; gap: var(--s1); }
`;

/** The sheet's own jackets, and the lines of its table and its breakdown. */
const FIRST: Jacket = [TONE.act, TONE.paper],
  SECOND: Jacket = [TONE.harm, TONE.won];
const STANDINGS = [
  { place: 1, team: 'Halcyon', points: 74 },
  { place: 2, team: 'Corsair', points: 55 },
  { place: 3, team: 'Meridian', points: 51 },
  { place: 4, team: 'Albatross', points: 48 },
];
const WAGE = {
  title: 'Wage a race',
  lines: [
    { label: 'Base', amount: '1,200' },
    { label: 'Stars', amount: '+400' },
    { label: 'Demanding', amount: '+180' },
    { label: 'Loyal', amount: '−120' },
  ],
};

/** The chartroom kit's sheet. */
export function createChartroom(): Screen<null> {
  kitLooks();
  stylesheet(CSS);
  const root = el('div', 'cr crk');
  const port = brassPort(null);
  let part = 0,
    option = 0,
    weeks = 3,
    open = false;
  const draw = () => {
    const nothing = () => undefined;
    const shut = () => {
      leaf.remove();
    };
    const leaf = folio(
      'Dismiss A. Halyard',
      [
        label('She leaves at once, and is owed the rest of the contract.'),
        terms([['Owed now', '4,800']]),
      ],
      [
        button('Keep', shut, { kind: 'plain' }),
        button('Dismiss', shut, { kind: 'harm' }),
      ],
      shut
    );
    root.replaceChildren(
      el(
        'div',
        'crk-col',
        sheet('Buttons', [
          button('Renew Contract', nothing),
          button('Dismiss · 4,800', () => root.append(leaf), { kind: 'harm' }),
          button('Scout', nothing, { kind: 'plain' }),
          button('Offer Contract', nothing, { off: 'No room on the roster.' }),
        ]),
        sheet('Choices', [
          segmented(['Drivers', 'Mechanics', 'Staff'], part, (i) => {
            part = i;
            draw();
          }),
          stepper(
            `${weeks} weeks`,
            weeks > 1
              ? () => {
                  weeks--;
                  draw();
                }
              : null,
            weeks < 9
              ? () => {
                  weeks++;
                  draw();
                }
              : null
          ),
          dropdown(['Scouting', 'Part design', 'Training'], option, (i) => {
            option = i;
            draw();
          }),
        ])
      ),
      el(
        'div',
        'crk-col',
        sheet('Marks', [
          el(
            'div',
            'row',
            portrait(FIRST, 54),
            portrait(SECOND, 36),
            el('div', 'who', name('A. Halyard'), label('Age 27 · Tern'))
          ),
          el('div', 'row', stars(3.5), stars(2, 4)),
          el(
            'div',
            'row',
            traitBadge(1),
            traitBadge(-1),
            traitBadge(0),
            unread(3)
          ),
          el('div', 'row', place(1, 27), place(3, 27), place(14, 27)),
          el(
            'div',
            'row',
            fig(7, 's'),
            fig(14, 'm'),
            fig(1660, 'l'),
            arrow(1),
            arrow(-1)
          ),
        ])
      ),
      el(
        'div',
        'crk-col',
        sheet('Stats', [
          el(
            'div',
            'tiles',
            statTile('Helm', 4, 9, 0),
            statTile('Gunnery', 12, 15, 1),
            statTile('Nerve', 19, 20, -1)
          ),
          el('div', '', label('Morale'), meter(0.62, 'warn')),
          el('div', '', label('Refit, 3 days of 8'), busy(3 / 8)),
          open
            ? el('div', 'at', label('Wage a race'), popover(WAGE, '1,660'))
            : null,
        ]),
        sheet(
          'Standings',
          [
            table(
              [
                { head: 'Pos', track: u(18), num: true, cell: (r) => r.place },
                { head: 'Team', track: '1fr', cell: (r) => r.team },
                { head: 'Pts', track: u(22), num: true, cell: (r) => r.points },
              ],
              STANDINGS,
              { own: (r) => r.place === 3 }
            ),
          ],
          { aside: 'Race 3' }
        )
      ),
      el(
        'div',
        'crk-col',
        plate('Chartroom'),
        sheet('Breakdown', [
          button(open ? 'Put away' : 'Open the wage', () => {
            open = !open;
            draw();
          }),
        ]),
        sheet('Port', [el('div', 'port', port.el)])
      )
    );
  };
  return { el: root, show: draw };
}
