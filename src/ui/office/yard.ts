// What the team builds. Headquarters: its nine buildings, a card each: its
// level, what it costs a race, what the next level costs and takes, and the
// way to build it (or how far the works have got). Ship: at the left each
// ship's six parts (performance, and how worn) and the spares, each fitted to
// a ship by a tap; at the right the part design: the one in hand, or the
// drawing board (the type, each slot's cards dealt and one picked, what the
// part would be and cost, and the way to start).

import { SHIPS } from '../../office/command.ts';
import type { HqPaper, PartLine, ShipPaper } from '../../office/papers.ts';
import { button, dropdown } from '../kit/button.ts';
import { panel } from '../kit/panel.ts';
import { el, pressed } from '../kit/part.ts';
import { job, meter } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import { acted, bitsStyle, lines, money } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-hq { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); padding: 10px 18px; gap: 8px; }
.s-hq .k-head { padding-top: 9px; padding-bottom: 6px; }
.s-hq .k-body { gap: 5px; padding-bottom: 8px; }
.s-hq .b-lines > * { padding: 4px 10px; }
.s-hq .k-btn { height: 36px; }
.h-level { display: flex; gap: 4px; justify-content: center; }
.h-level > i { width: 34px; height: 8px; background: var(--track); }
.h-level > i.on { background: var(--go); }
.s-ship { grid-template-columns: 1fr 400px; }
.s-ship .k-body { gap: 8px; }
.y-part { display: flex; flex-direction: column; gap: 3px; }
.y-part > .k-meter { height: 4px; }
.y-fit { display: flex; gap: 4px; }
.y-fit > .k-btn { height: 32px; padding: 0 10px; }
.y-slot { display: flex; flex-direction: column; gap: 3px; padding: 6px; background: var(--dark); }
.y-slot > header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--faint); }
.y-slot > header > .k-btn { height: 30px; padding: 0 10px; }
.y-card { display: flex; justify-content: space-between; gap: 8px; padding: 7px 8px; background: var(--panel); border: 1.5px solid transparent; font-size: 14px; }
.y-card > small { color: var(--faint); font-size: 13px; }
.y-card.picked { background: var(--light); border-color: var(--ink); box-shadow: inset 0 0 0 2px var(--go); font-weight: 700; }
.y-slots { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; min-height: 0; }
`;

type Works = HqPaper['buildings'][number];

/** The headquarters. */
export function createHq(office: Office): Screen<HqPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-hq');
  const card = (b: Works) =>
    panel(b.name, [
      el(
        'div',
        'h-level',
        ...Array.from({ length: b.top }, (_, i) =>
          el('i', i < b.level ? 'on' : '')
        )
      ),
      lines([
        ['Level', `${b.level} of ${b.top}`],
        ['Upkeep per Race', money(b.upkeep)],
        ...(b.level < b.top
          ? [
              ['Next Level', money(b.cost)] as const,
              ['Build Time', `${b.days} Days`] as const,
            ]
          : []),
      ]),
      b.under
        ? job(
            { mark: null, name: 'Building' },
            b.under.done,
            `${b.under.days} Days`,
            []
          )
        : b.level < b.top &&
          acted(
            'Build',
            b.build,
            () =>
              office.ask({
                kind: 'send',
                command: { kind: 'Build', building: b.id },
              }),
            'on'
          ),
    ]);
  return {
    el: root,
    show(v) {
      root.replaceChildren(...v.buildings.map(card));
    },
  };
}

/** A part as a cell shows it: its performance over how worn it is. */
const part = (p: PartLine | undefined) =>
  p
    ? el(
        'div',
        'y-part',
        `${Math.round(p.perf)} / ${Math.round(p.perfMax)}`,
        meter(p.condition, p.condition < 0.5 ? 'bad' : 'good')
      )
    : '-';

/** The ship. */
export function createShip(office: Office): Screen<ShipPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-ship');
  return {
    el: root,
    show(v) {
      const spares = v.parts.filter((p) => p.ship === null),
        d = v.draft;
      const fit = (p: PartLine) =>
        el(
          'div',
          'y-fit',
          ...v.ships.map((_, i) =>
            button(
              String(i + 1),
              () =>
                office.ask({
                  kind: 'send',
                  // (a team has four ships: the index is one of them)
                  command: { kind: 'FitPart', part: p.id, ship: SHIPS[i] ?? 0 },
                }),
              { kind: 'plain' }
            )
          )
        );
      root.replaceChildren(
        el(
          'div',
          'b-col',
          panel('Parts', [
            table(
              [
                { label: 'Part', width: '110px', cell: (t) => t.label },
                ...v.ships.map((ship, i) => ({
                  label: `${ship.name} · ${ship.driver}`,
                  width: '1fr',
                  cell: (t: ShipPaper['types'][number]) =>
                    part(v.parts.find((p) => p.type === t.id && p.ship === i)),
                })),
              ],
              v.types,
              { height: 52, keep: 'parts' }
            ),
          ]),
          spares.length > 0 &&
            panel('Spare Parts', [
              table<PartLine>(
                [
                  { label: 'Part', width: '1fr', cell: (p) => p.name },
                  { label: 'Performance', width: '130px', cell: part },
                  {
                    label: 'Reliability',
                    width: '100px',
                    num: true,
                    cell: (p) => `${Math.round(p.reliability * 100)}%`,
                  },
                  { label: 'Fit to Ship', width: '190px', cell: fit },
                ],
                spares,
                { height: 48, keep: 'spares' }
              ),
            ])
        ),
        panel(
          'Part Design',
          v.design
            ? [
                job(
                  { mark: null, name: v.design.name },
                  v.design.done,
                  `${v.design.days} Days`,
                  []
                ),
              ]
            : [
                dropdown(
                  v.types,
                  d.type,
                  (type) => office.ask({ kind: 'design', type }),
                  true
                ),
                el(
                  'div',
                  'y-slots',
                  ...d.slots.map((s, slot) =>
                    el(
                      'div',
                      'y-slot',
                      el(
                        'header',
                        '',
                        `Component ${slot + 1}`,
                        button(
                          s.cards.length > 0 ? 'Redeal' : 'Deal',
                          () =>
                            office.ask({
                              kind: 'send',
                              command: {
                                kind: 'DealComponents',
                                type: d.type,
                                slot,
                              },
                            }),
                          { kind: 'plain', off: !s.deal.ok }
                        )
                      ),
                      ...s.cards.map((c) =>
                        pressed(
                          el(
                            'div',
                            `y-card${c.id === s.picked ? ' picked' : ''}`,
                            c.name,
                            el('small', '', c.effect)
                          ),
                          () => office.ask({ kind: 'card', slot, card: c.id })
                        )
                      )
                    )
                  )
                ),
                lines([
                  ['Performance', `${d.perf} / ${d.perfMax}`],
                  ['Reliability', `${Math.round(d.reliability * 100)}%`],
                  ['Time', `${d.days} Days`],
                  ['Cost', money(d.cost)],
                ]),
                acted(
                  'Start Design',
                  d.start,
                  () =>
                    office.ask({
                      kind: 'send',
                      command: {
                        kind: 'StartDesign',
                        type: d.type,
                        components: d.slots.flatMap((s) =>
                          s.picked ? [s.picked] : []
                        ),
                        forNext: false,
                      },
                    }),
                  'on'
                ),
              ]
        )
      );
    },
  };
}
