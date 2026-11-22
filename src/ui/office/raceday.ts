// Race day's two screens. The plan, before the race: at the left her four
// ships, each with who sails her, over the team's orders (the call her team
// sails under at the start); at the right the day's session; the world clear
// between them. And the result, after it: every ship in the order she finished,
// who sailed her and for whom, what she sank, her stops, when she sank and
// her points, her team's own lines lit, the chairman's target at its head.

import type { Call } from '../../player.ts';
import type { PlanView, ResultLine, ResultView } from '../../office/loop.ts';
import { segmented } from '../kit/button.ts';
import { icon } from '../kit/icons.ts';
import { panel } from '../kit/panel.ts';
import { el, ordinal } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { stars, tag } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-plan > .o-window { position: absolute; inset: 0; }
.s-plan > .p-left { position: absolute; left: 18px; top: 14px; width: 500px; display: flex; flex-direction: column; gap: 10px; }
.p-ships { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 4px; background: var(--panel);
  border: 1.5px solid var(--ink); box-shadow: 0 2px 0 var(--shade); }
.p-ship { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--dark); border: 1px solid var(--rule); }
.p-ship > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.p-ship small { font-size: 13px; color: var(--faint); }
.p-ship b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-bar { height: 44px; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--go);
  color: var(--on-fill); font: 600 17px/1 var(--narrow); letter-spacing: .1em; text-transform: uppercase; }
.p-orders { display: flex; flex-direction: column; gap: 10px; padding: 4px 4px 12px; background: var(--panel);
  border: 1.5px solid var(--ink); box-shadow: 0 2px 0 var(--shade); }
.p-orders > .k-seg { margin: 0 8px; }
.p-orders > .k-seg > div { padding: 0 6px; }
.s-plan > .p-right { position: absolute; right: 18px; top: 14px; width: 330px; }
.p-right .k-body { align-items: stretch; gap: 8px; text-align: center; }
.p-session { height: 44px; display: flex; align-items: center; justify-content: center; gap: 12px; background: var(--go);
  color: var(--on-fill); border: 1.5px solid var(--ink); font: 700 21px/1 var(--narrow); letter-spacing: .12em; text-transform: uppercase; }
.p-right .k-tag { align-self: center; }

.s-result { display: flex; justify-content: center; padding: 14px 18px; }
.s-result > .k-panel { width: 1000px; }
.r-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 14px 10px;
  font: 600 19px/1 var(--narrow); letter-spacing: .08em; text-transform: uppercase; }
.r-head > span:first-child { flex: 1; }
.r-head > b { padding: 6px 12px; background: var(--good); color: var(--on-fill); font: 700 15px/1 var(--narrow); letter-spacing: .04em; }
.r-head > small { font: 500 15px/1 var(--narrow); letter-spacing: .04em; color: var(--faint); }
`;

/** The four calls, as the team's orders name them. */
const CALL_NAMES: readonly { id: Call; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'attack', label: 'Attack' },
  { id: 'hold', label: 'Hold Our Water' },
  { id: 'form', label: 'Form on Me' },
];

/** Race day's plan. */
export function createPlan(office: Office): Screen<PlanView> {
  stylesheet(CSS);
  const root = el('div', 's-plan');
  return {
    el: root,
    show(v) {
      root.replaceChildren(
        el('div', 'o-window'),
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
                portrait(v.team.colours, 56),
                el(
                  'div',
                  '',
                  el('small', '', `Ship ${i + 1}`),
                  el('b', '', ship.name),
                  ship.stars !== null && stars(ship.stars, ship.stars, 16)
                )
              )
            )
          ),
          el(
            'div',
            'p-orders',
            el('div', 'p-bar', 'Team Orders', icon('down', 18)),
            segmented(
              CALL_NAMES,
              v.call,
              (call) => office.ask({ kind: 'call', call }),
              true
            )
          )
        ),
        el(
          'div',
          'p-right',
          panel(null, [
            el('div', '', 'Today’s Session:'),
            el('div', 'p-session', icon('pennants', 22), 'Race'),
            el('div', '', `${v.name} · Race ${v.round} of ${v.rounds}`),
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

/** A race's result. */
export function createResult(): Screen<ResultView> {
  stylesheet(CSS);
  const root = el('div', 's-result');
  return {
    el: root,
    show(v) {
      const lines = table<ResultLine>(
        [
          { label: 'Position', width: '64px', cell: (r) => r.place },
          { label: 'Driver', width: '1.1fr', cell: (r) => r.driver },
          { label: 'Team', width: '1fr', cell: (r) => r.team.name },
          {
            label: 'Sinkings',
            width: '70px',
            num: true,
            cell: (r) => r.sinkings || '-',
          },
          { label: 'Stops', width: '54px', num: true, cell: (r) => r.stops },
          {
            label: 'Sunk',
            width: '70px',
            num: true,
            cell: (r) => (r.second === null ? '-' : clock(r.second)),
          },
          { label: 'Points', width: '60px', num: true, cell: (r) => r.points },
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
        panel(null, [
          el(
            'div',
            'r-head',
            el('span', '', v.title),
            tag(v.standing.label, v.standing.mood),
            el('small', '', `${ordinal(v.target)} or above`),
            el('b', '', `${v.points} PTS`)
          ),
          lines,
        ])
      );
    },
  };
}
