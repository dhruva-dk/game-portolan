// Race day's two screens, laid out as the manager's game it follows lays them.
//
// The plan, before the race: at the left her four ships, a card each (who
// sails her, their stars), over the team's orders (the four calls, a card
// each, the one her team sails under at the start gilt); at the right the
// day's session; her ship herself, live, through the page between them.
//
// The result, after it: the results' table (every ship in the order she
// finished, who sailed her and for whom, what she sank, her stops, when she
// sank and her points, her team's own lines lit) under the race's name and the
// chairman's target; beside it the team's report, a card to each of her
// drivers, and how the team stands to the season's objective.

import type { Call } from '../../player.ts';
import type { PlanView, ResultLine, ResultView } from '../../office/loop.ts';
import { emblem } from '../emblem.ts';
import { icon } from '../kit/icons.ts';
import { band, panel } from '../kit/panel.ts';
import { el, ordinal, pressed } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { stars, tag } from '../kit/stat.ts';
import { cut, stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-plan > .o-window { position: absolute; inset: 0; }
/* she is drawn in the middle of what the panels leave of the page */
.p-subject { position: absolute; left: 540px; right: 0; top: 170px; bottom: 20px; pointer-events: none; }
.s-plan > .p-left { position: absolute; left: 18px; top: 12px; width: 500px; display: flex; flex-direction: column; gap: 10px; }
.p-ships { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.p-ship { display: flex; align-items: center; gap: 12px; padding: 9px 12px; ${cut('panel')} }
.p-ship > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.p-ship small { font-size: 13px; font-style: italic; color: var(--faint); }
.p-ship b { font: 700 17px/1.15 var(--serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-orders > .k-body { gap: 10px; }
.p-note { margin: 0; text-align: center; font-style: italic; color: var(--faint); }
.p-calls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.p-call { display: flex; flex-direction: column; justify-content: center; gap: 4px; min-height: 76px; padding: 8px 12px; ${cut('light')} }
.p-call.chosen { ${cut('gilt')} }
.p-call > b { font: 700 14px/1.1 var(--serif); letter-spacing: .12em; text-transform: uppercase; }
.p-call > small { font-size: 13px; line-height: 1.25; font-style: italic; color: var(--faint); }
.p-call.chosen > small { color: var(--ink); }
.s-plan > .p-right { position: absolute; right: 18px; top: 12px; width: 330px; }
.p-right .k-body { align-items: stretch; gap: 8px; padding-top: 12px; text-align: center; }
.p-right small { font-size: 13px; font-style: italic; color: var(--faint); }
.p-session { height: 46px; display: flex; align-items: center; justify-content: center; gap: 12px; ${cut('gilt')}
  font: 700 21px/1 var(--serif); letter-spacing: .16em; text-transform: uppercase; }
.p-right .k-tag { align-self: center; }

.s-result { display: grid; grid-template-columns: 1fr 336px; gap: 10px; padding: 12px 18px; }
.s-result > div { display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
.r-table > .k-body { gap: 6px; }
.r-head { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 2px 2px; }
.r-head > span { flex: 1; min-width: 0; font: 700 18px/1.1 var(--serif); letter-spacing: .08em; text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-aim { flex: none; display: flex; align-items: center; gap: 9px; padding: 3px 11px 3px 3px; ${cut('dark')}
  font: 700 14px/1 var(--serif); letter-spacing: .04em; white-space: nowrap; }
.r-head > b { flex: none; padding: 7px 12px; ${cut('good')} color: var(--on-fill); font: 700 15px/1 var(--serif);
  letter-spacing: .06em; white-space: nowrap; }
.r-team { display: flex; align-items: center; gap: 7px; min-width: 0; }
.r-team > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.r-table i.r-afloat { font-style: italic; color: var(--good); }
.r-report { flex: 1; }
.r-report > .k-body { gap: 7px; }
.r-driver { flex: 1; min-height: 0; display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 10px;
  ${cut('light')} }
.r-driver > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.r-driver > .r-who { flex: 1; }
.r-driver b { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-driver small { font-size: 13px; font-style: italic; color: var(--faint); white-space: nowrap; }
.r-driver > .r-came { flex: none; align-items: flex-end; }
.r-came > b { font: italic 500 27px/1 var(--serif); font-variant-numeric: oldstyle-nums; }
.r-came > span { font: 700 13px/1 var(--serif); letter-spacing: .08em; text-transform: uppercase; }
.r-chair { flex: none; }
.r-chair > .k-body { gap: 10px; align-items: stretch; text-align: center; }
.r-stand { display: flex; justify-content: center; gap: 16px; }
.r-stand > i { width: 1px; background: var(--rule); }
.r-stand > div { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.r-stand small { font-size: 13px; font-style: italic; color: var(--faint); }
.r-stand b { font: 700 19px/1.1 var(--serif); white-space: nowrap; }
.r-chair .k-tag { align-self: center; }
`;

/** The four calls, as the team's orders name them, and what each asks of her drivers. */
const CALL_NAMES: readonly { id: Call; label: string; asks: string }[] = [
  { id: 'free', label: 'Free', asks: 'Each driver sails her own race.' },
  { id: 'attack', label: 'Attack', asks: 'Hunt and fight; claim less water.' },
  {
    id: 'hold',
    label: 'Hold Our Water',
    asks: 'Claim water and keep it; hunt less.',
  },
  {
    id: 'form',
    label: 'Form on Me',
    asks: 'Keep close about the team’s first ship.',
  },
];

/** Race day's plan. */
export function createPlan(office: Office): Screen<PlanView> {
  stylesheet(CSS);
  const root = el('div', 's-plan');
  return {
    el: root,
    show(v) {
      const orders = panel('Team Orders', [
        el(
          'p',
          'p-note',
          'The call your ships sail under at the start of the race.'
        ),
        el(
          'div',
          'p-calls',
          ...CALL_NAMES.map((c) =>
            pressed(
              el(
                'div',
                `p-call${c.id === v.call ? ' chosen' : ''}`,
                el('b', '', c.label),
                el('small', '', c.asks)
              ),
              () => office.ask({ kind: 'call', call: c.id })
            )
          )
        ),
      ]);
      orders.classList.add('p-orders');
      root.replaceChildren(
        // her ship herself, at anchor: the world through the page
        el('div', 'o-window', el('div', 'o-subject p-subject')),
        el(
          'div',
          'p-left',
          el(
            'div',
            'p-ships',
            ...v.ships.map((ship, i) =>
              el(
                'div',
                'p-ship',
                portrait(v.team.colours, 60),
                el(
                  'div',
                  '',
                  el('small', '', `Ship ${i + 1}`),
                  el('b', '', ship.name),
                  ship.stars !== null && stars(ship.stars, ship.stars, 16),
                  ship.you && el('small', '', 'Yourself, at the helm')
                )
              )
            )
          ),
          orders
        ),
        el(
          'div',
          'p-right',
          panel(null, [
            el('div', '', 'Today’s Session:'),
            el('div', 'p-session', icon('pennants', 22), 'Race'),
            el('div', '', `${v.name} · Race ${v.round} of ${v.rounds}`),
            el('small', '', v.championship),
            v.blocked && tag(v.blocked, 'bad'),
            v.waiting && tag('Other Championships Racing', 'warn'),
          ])
        )
      );
    },
  };
}

/** Minutes and seconds of a race's clock. */
const clock = (second: number) =>
  `${Math.floor(second / 60)}:${String(Math.floor(second % 60)).padStart(2, '0')}`;

/** `made`, of the classes `cls` too (a panel's place in its column). */
const as = <T extends Element>(made: T, cls: string) => {
  made.classList.add(...cls.split(' '));
  return made;
};

/** One of her drivers in the team's report: who, what she did, where she came and what she scored. */
const reported = (r: ResultLine) =>
  el(
    'div',
    'r-driver',
    portrait(r.team.colours, 56),
    el(
      'div',
      'r-who',
      el('b', '', r.driver),
      el(
        'small',
        '',
        `Sank ${r.sinkings} · ${r.stops} ${r.stops === 1 ? 'Stop' : 'Stops'}`
      ),
      el(
        'small',
        '',
        r.second === null ? 'Afloat at the end' : `Sunk at ${clock(r.second)}`
      )
    ),
    el(
      'div',
      'r-came',
      el('small', '', 'Finished'),
      el('b', '', ordinal(r.place)),
      el('span', '', `${r.points} pts`)
    )
  );

/** A race's result. */
export function createResult(): Screen<ResultView> {
  stylesheet(CSS);
  const root = el('div', 's-result');
  return {
    el: root,
    show(v) {
      const lines = table<ResultLine>(
        [
          { label: 'Position', width: '58px', cell: (r) => r.place },
          { label: 'Driver', width: '1fr', cell: (r) => r.driver },
          {
            label: 'Team',
            width: '1.15fr',
            cell: (r) =>
              el(
                'span',
                'r-team',
                emblem(r.team.emblem, r.team.colours, 20),
                el('span', '', r.team.name)
              ),
          },
          {
            label: 'Sinkings',
            width: '62px',
            num: true,
            cell: (r) => r.sinkings || '-',
          },
          { label: 'Stops', width: '46px', num: true, cell: (r) => r.stops },
          {
            label: 'Sunk',
            width: '60px',
            num: true,
            cell: (r) =>
              r.second === null
                ? el('i', 'r-afloat', 'Afloat')
                : clock(r.second),
          },
          { label: 'Points', width: '52px', num: true, cell: (r) => r.points },
        ],
        v.lines,
        {
          height: 32,
          own: (r) => r.own,
          colour: (r) => r.team.colours[0],
          keep: 'result',
        }
      );
      // (from the winner down, not from her own line)
      lines.querySelector('.k-rows')?.removeAttribute('data-top');
      root.replaceChildren(
        as(
          panel(null, [
            el(
              'div',
              'r-head',
              el('span', '', v.title),
              el(
                'div',
                'r-aim',
                tag(v.standing.label, v.standing.mood),
                `${ordinal(v.target)} or above`
              ),
              el('b', '', `${v.points} PTS`)
            ),
            band('How the race finished, and how the points were shared out.'),
            lines,
          ]),
          'r-table'
        ),
        el(
          'div',
          '',
          as(
            panel('Team Report', v.lines.filter((r) => r.own).map(reported)),
            'r-report'
          ),
          as(
            panel('Chairman', [
              band('Season Objective - Teams’ Championship'),
              el(
                'div',
                'r-stand',
                el(
                  'div',
                  '',
                  el('small', '', 'Expected'),
                  el('b', '', `${ordinal(v.target)} or above`)
                ),
                el('i'),
                el(
                  'div',
                  '',
                  el('small', '', 'You Stand'),
                  el('b', '', ordinal(v.place))
                )
              ),
              tag(v.standing.label, v.standing.mood, 'boxed'),
            ]),
            'r-chair'
          )
        )
      );
    },
  };
}
