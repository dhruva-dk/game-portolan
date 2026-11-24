// Race day's plan on the chartroom kit, after MM's pre-race: at the left the
// race (its planet, the round, why it cannot be sailed yet), the team's orders
// (the call your ships sail under at the start, what it asks of them) and each
// sponsor's objective, its bonus if met. In the middle your ship through the
// window over your four ships, a row each: who sails her (a stand-in's fee),
// her parts; a tap chooses one. At the right the ship chosen: who sails her,
// chosen from your drivers and the best free ones, and her parts, each with
// what may be fitted instead (a spare, or another ship's, swapped).

import type { Call } from '../../player.ts';
import type { Command, Plan } from '../../office/command.ts';
import type { PlanView, Sailor } from '../../office/loop.ts';
import type { PartLine } from '../../office/papers.ts';
import { dropdown, link, segmented } from '../chartroom/controls.ts';
import { table, terms } from '../chartroom/data.ts';
import { label, stars } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { plate, sheet } from '../chartroom/paper.ts';
import { shipWindow } from '../chartroom/port.ts';
import { u } from '../chartroom/tokens.ts';
import { emblem } from '../emblem.ts';
import { el, grouped } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.rd-race { display: flex; flex-direction: column; align-items: center; gap: var(--s1); text-align: center; }
.rd-race > b { font: 700 var(--t-name)/1.15 var(--face); letter-spacing: .08em; text-transform: uppercase; }
.rd-crest { flex: none; display: flex; align-items: center; gap: var(--s3); padding: var(--s2) var(--s4); }
.rd-crest > svg { flex: none; width: ${u(16)}; height: ${u(16)}; }
.rd-crest b { font: 700 var(--t-name)/1 var(--face); letter-spacing: .12em; text-transform: uppercase; }
.rd-pick { display: flex; flex-direction: column; gap: var(--s1); }
.rd-parts { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.rd-parts > div { display: grid; grid-template-columns: ${u(40)} minmax(0, 1fr); align-items: center; gap: var(--s2); padding: var(--s1) 0; border-bottom: var(--w-fine) solid var(--rule); }
.rd-parts > div > span { font: 500 var(--t-body)/1.2 var(--face); }
.rd-parts > div > .cr-label { text-align: right; }
`;

/** The four calls: their short names, and what each asks of your drivers. */
const CALLS: readonly { id: Call; name: string; asks: string }[] = [
  { id: 'free', name: 'Free', asks: 'Each driver sails her own race.' },
  { id: 'attack', name: 'Attack', asks: 'Hunt and fight; claim less water.' },
  { id: 'hold', name: 'Hold', asks: 'Claim water and keep it; hunt less.' },
  { id: 'form', name: 'Form', asks: 'Keep close about your first ship.' },
];

/** A share as a percentage. */
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A part, said short: its performance and its condition. */
const said = (p: PartLine) => `${p.perf} · ${pct(p.condition)} sound`;

/** Where a part is: on a ship, or a spare. */
const where = (p: PartLine) =>
  p.ship === null ? 'Spare' : `Ship ${p.ship + 1}’s`;

/** A sailor, said in a choice: name, stars, a stand-in's fee. */
const choice = (d: Sailor) =>
  `${d.name} · ${d.stars}★${d.standIn ? ` · ${grouped(d.fee)} to stand in` : ''}`;

/** Race day's plan. */
export function createPlan(office: Office): Screen<PlanView> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-plan');
  let chosen = 0;

  const send = (command: Command) => office.ask({ kind: 'send', command });

  /** The plan as it stands with one thing changed, sent (none if a ship has no one to sail her). */
  const planned = (v: PlanView, change: Partial<Plan>) => {
    const drivers = change.drivers ?? v.drivers;
    if (drivers.some((d) => d === null)) return;
    send({
      kind: 'SetPlan',
      plan: {
        drivers: drivers.flatMap((d) => (d === null ? [] : [d])),
        parts: [],
        objectives: v.objectives,
        call: v.call,
        ...change,
      },
    });
  };

  /** A driver put aboard a ship: whoever sailed her goes to the ship they came from. */
  const aboard = (v: PlanView, ship: number, person: number) => {
    const drivers = [...v.drivers],
      at = drivers.indexOf(person),
      i = ship - 1;
    if (at >= 0) drivers[at] = drivers[i] ?? null;
    drivers[i] = person;
    planned(v, { drivers: drivers.filter((d): d is number => d !== null) });
  };

  /** The race, the team's orders, the sponsors' objectives. */
  const left = (v: PlanView) => {
    const call = CALLS.find((c) => c.id === v.call) ?? CALLS[0];
    return [
      sheet(null, [
        el(
          'div',
          'rd-race',
          label(`Round ${v.round} of ${v.rounds}`),
          el('b', '', v.name),
          label(v.championship)
        ),
        v.blocked && label(v.blocked, 'harm'),
        v.waiting && label('The other championships are racing.'),
      ]),
      sheet(
        'Team Orders',
        [
          v.set.ok
            ? segmented(
                CALLS.map((c) => c.name),
                CALLS.indexOf(call),
                (i) => planned(v, { call: CALLS[i]?.id ?? 'free' })
              )
            : terms([['The call', call.name]]),
          label(`${call.asks} The call your ships sail under at the start.`),
        ],
        {}
      ),
      sheet(
        'Sponsors',
        v.sponsors.length > 0
          ? v.sponsors.map((p) =>
              el(
                'div',
                'rd-pick',
                terms([[p.name, `${grouped(p.bonus)} if met`]]),
                v.set.ok
                  ? dropdown(p.objectives, p.chosen ?? 0, (i) =>
                      planned(v, {
                        objectives: v.objectives.map((o, slot) =>
                          slot === p.slot ? i : o
                        ),
                      })
                    )
                  : label(p.objectives[p.chosen ?? 0] ?? '')
              )
            )
          : [label('No sponsor of yours sets an objective.')],
        { cls: 'cr-grow' }
      ),
    ];
  };

  /** Your ship through the window; your four ships under it. */
  const middle = (v: PlanView) => [
    shipWindow(
      plate(
        el(
          'div',
          'rd-crest',
          emblem(v.team.emblem, v.team.colours, 16),
          el('b', '', v.team.name)
        )
      ),
      1.15
    ),
    sheet(
      'Your Ships',
      [
        table(
          [
            { head: 'Ship', track: u(24), num: true, cell: (r) => r.ship + 1 },
            {
              head: 'Sailed by',
              track: 'minmax(0, 1fr)',
              cell: (r) =>
                link(
                  r.you ? 'You, at the helm' : (r.driver?.name ?? 'No one fit')
                ),
            },
            {
              head: 'Stars',
              track: u(60),
              cell: (r) => (r.driver ? stars(r.driver.stars) : null),
            },
            {
              head: 'Perf.',
              track: u(32),
              num: true,
              cell: (r) =>
                Math.round(
                  r.parts.reduce((a, p) => a + (p.fitted?.perf ?? 0), 0) /
                    Math.max(1, r.parts.length)
                ),
            },
            {
              head: 'Fee',
              track: u(36),
              num: true,
              cell: (r) =>
                r.driver?.standIn ? grouped(r.driver.fee) : label('—'),
            },
          ],
          v.ships,
          {
            own: (r) => r.ship === chosen,
            tap: (r) => () => {
              chosen = r.ship;
              draw(v);
            },
          }
        ),
      ],
      { cls: 'cr-grow' }
    ),
  ];

  /** The ship chosen: who sails her, and her parts. */
  const right = (v: PlanView) => {
    const ship = v.ships[chosen] ?? v.ships[0];
    if (!ship) return sheet(null, [label('Your team has no ships.')]);
    const d = ship.driver;
    const sailors = v.sailors.filter((x) => x.person !== d?.person);
    return sheet(
      `Ship ${ship.ship + 1}`,
      [
        ship.you
          ? label('You sail her yourself.')
          : el(
              'div',
              'rd-pick',
              terms([['Sailed by', d ? d.name : 'No one fit']]),
              v.set.ok && sailors.length > 0
                ? dropdown(
                    [
                      d ? 'Keep her driver' : 'Choose a driver',
                      ...sailors.map(choice),
                    ],
                    0,
                    (i) => {
                      const g = sailors[i - 1];
                      if (g) aboard(v, ship.ship, g.person);
                    }
                  )
                : null,
              d?.standIn
                ? label(
                    `A stand-in: paid ${grouped(d.fee)} for the race, and the chairman likes a ship without a signed driver the less.`
                  )
                : null
            ),
        el(
          'div',
          'rd-parts',
          ...ship.parts.map((p) =>
            el(
              'div',
              '',
              el('span', '', p.label),
              v.set.ok && p.others.length > 0
                ? dropdown(
                    [
                      p.fitted ? said(p.fitted) : 'None fitted',
                      ...p.others.map((o) => `${where(o)}: ${said(o)}`),
                    ],
                    0,
                    (i) => {
                      const o = p.others[i - 1];
                      if (o)
                        send({ kind: 'FitPart', part: o.id, ship: ship.ship });
                    }
                  )
                : label(p.fitted ? said(p.fitted) : 'None fitted')
            )
          )
        ),
      ],
      { cls: 'cr-grow' }
    );
  };

  function draw(v: PlanView) {
    root.replaceChildren(
      column(...left(v)),
      column(...middle(v)),
      column(right(v))
    );
  }

  return { el: root, show: draw };
}
