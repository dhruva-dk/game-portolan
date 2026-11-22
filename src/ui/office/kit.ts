// The kit's sheet: every part the office's screens are made of, each in its
// panel under its own name, with values of the sheet's own, for judging the
// kit by eye (?screen=kit). Its controls answer: a choice chosen, a value
// stepped, the table sorted.

import { emblem } from '../emblem.ts';
import type { Jacket } from '../gull.ts';
import { INK, WASH } from '../ink.ts';
import { button, dropdown, segmented, stepper } from '../kit/button.ts';
import { bars, dial } from '../kit/chart.ts';
import { icon } from '../kit/icons.ts';
import { band, card, dialog, infoMark, panel } from '../kit/panel.ts';
import { el, ordinal } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { job, meter, stars, tag, tile, tiles } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { table, type Sorted } from '../kit/table.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-kit { display: grid; grid-template-columns: 1fr 1.2fr 1.15fr 1.05fr; grid-template-rows: 1fr 1fr; gap: 10px; padding: 14px 20px; }
.s-kit > * { overflow: hidden; }
.s-kit .k-body { gap: 8px; }
.s-kit .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.s-kit .still { position: relative; flex: 1; min-height: 0; }
.s-kit .k-dialog { min-width: 0; }
`;

/** The sheet's own teams' colours, and the lines of its table. */
const RED: Jacket = [WASH.vermilion, INK.white],
  BLUE: Jacket = [INK.blue, WASH.gold],
  GREEN: Jacket = [INK.green, INK.white];
interface Line {
  place: number;
  name: string;
  colours: Jacket;
  points: number;
}
const LINES: readonly Line[] = [
  { place: 1, name: 'Halcyon', colours: BLUE, points: 74 },
  { place: 2, name: 'Corsair', colours: GREEN, points: 55 },
  { place: 3, name: 'Meridian', colours: RED, points: 51 },
  { place: 4, name: 'Albatross', colours: BLUE, points: 48 },
  { place: 5, name: 'Tern', colours: GREEN, points: 42 },
  { place: 6, name: 'Petrel', colours: RED, points: 40 },
  { place: 7, name: 'Skua', colours: BLUE, points: 38 },
  { place: 8, name: 'Gannet', colours: GREEN, points: 35 },
];

/** The kit's sheet. */
export function createKit(): Screen<null> {
  stylesheet(CSS);
  const root = el('div', 's-kit');
  let choice: 'teams' | 'drivers' = 'teams',
    kind: 'scouting' | 'design' = 'scouting',
    weeks = 3,
    sorted: Sorted = { column: 0, down: false };
  const draw = () => {
    const nothing = () => undefined;
    root.replaceChildren(
      panel('Buttons', [
        el(
          'div',
          'row',
          button('Go', nothing),
          button('Plain', nothing, { kind: 'plain' }),
          button('Cancel', nothing, { kind: 'danger' })
        ),
        el(
          'div',
          'row',
          button('Continue', nothing, { kind: 'on', after: 'forward' }),
          button('Off', nothing, { off: true })
        ),
        segmented(
          [
            { id: 'teams', label: 'Teams' },
            { id: 'drivers', label: 'Drivers' },
          ],
          choice,
          (id) => {
            choice = id;
            draw();
          },
          true
        ),
        dropdown(
          [
            { id: 'scouting', label: 'Scouting' },
            { id: 'design', label: 'Part Design' },
          ],
          kind,
          (id) => {
            kind = id;
            draw();
          },
          true
        ),
        stepper(
          `${weeks} Weeks`,
          (by) => {
            weeks += by;
            draw();
          },
          { least: weeks <= 1, most: weeks >= 9 }
        ),
      ]),
      panel(
        'Stat Tiles',
        [
          tiles([
            tile('Gunnery', 16),
            tile('Helm', 17),
            tile('Seamanship', 4),
            tile('Nerve', 12),
            tile('Consistency', 8),
            tile('Stormcraft', 13),
            tile('Stamina', 20),
            tile('Feedback', [10, 15]),
            tile('Lookout', 6),
          ]),
        ],
        infoMark()
      ),
      panel('Bar Chart', [
        bars(
          [
            { name: 'Ship', value: 0.06, best: 0.9, average: 0.55 },
            { name: 'Drivers', value: 0.48, best: 0.86, average: 0.42 },
            { name: 'HQ', value: 0.14, best: 0.7, average: 0.38 },
            { name: 'Staff', value: 0.77, best: 0.8, average: 0.62 },
            { name: 'Sponsors', value: 0.98, best: 0.98, average: 0.48 },
          ],
          'Best in Championship',
          'Average on Grid'
        ),
      ]),
      panel(
        'Table',
        [
          table<Line>(
            [
              {
                label: 'Pos',
                width: '40px',
                cell: (r) => r.place,
                by: (r) => r.place,
              },
              {
                label: 'Team',
                width: '1fr',
                cell: (r) => r.name,
                by: (r) => r.name,
              },
              {
                label: 'PTS',
                width: '44px',
                num: true,
                cell: (r) => r.points,
                by: (r) => r.points,
              },
            ],
            LINES,
            {
              own: (r) => r.place === 4,
              colour: (r) => r.colours[0],
              cut: (r) => r.place === 1,
              sorted,
              sort(to) {
                sorted = to;
                draw();
              },
              keep: 'lines',
            }
          ),
        ],
        'Race 3 of 10'
      ),
      panel('Dial · Tags', [
        dial(0.72, 'Disappointed', 'Happy', 170),
        band('Job Security'),
        el('div', 'row', tag('Very Secure', 'good', 'boxed')),
        el(
          'div',
          'row',
          tag('Below Target', 'bad', 'bare'),
          tag('Must Respond', 'warn'),
          tag('New', 'go')
        ),
      ]),
      panel('Progress Row · Card', [
        job({ mark: emblem(4, BLUE, 20), name: 'D. Parker' }, 0.6, '19 Days', [
          button('Cancel', nothing, { kind: 'danger' }),
        ]),
        card(
          {
            headline: 'Building Unlocked',
            subject: 'Sail Loft',
            status: 'Available',
            picture: icon('hq', 64),
            action: button('Sail Loft', nothing),
          },
          RED
        ),
      ]),
      panel('Portrait · Stars', [
        el(
          'div',
          'row',
          portrait(RED, 104),
          portrait(BLUE, 64),
          portrait(GREEN, 40),
          emblem(2, RED, 44),
          emblem(7, BLUE, 44)
        ),
        el('div', 'row', stars(3.5), stars(2, 4), ordinal(3)),
        meter(0.51, 'good'),
      ]),
      panel('Dialog', [
        el(
          'div',
          'still',
          dialog(
            'Cancel Job',
            [el('div', 'row', portrait(BLUE, 56), 'D. Parker')],
            [
              button('Back', nothing, { kind: 'plain' }),
              button('Cancel', nothing, { kind: 'danger' }),
            ]
          )
        ),
      ])
    );
  };
  return { el: root, show: draw };
}
