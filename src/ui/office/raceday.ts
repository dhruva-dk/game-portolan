// Race day's plan, laid out as the manager's game it follows lays it: before
// the race, at the left her four ships, a card each (who sails her, their
// stars), over the team's orders (the four calls, a card each, the one her
// team sails under at the start gilt); at the right the day's session; her
// ship herself, live, through the page between them.

import type { Call } from '../../player.ts';
import type { PlanView } from '../../office/loop.ts';
import { icon } from '../kit/icons.ts';
import { panel } from '../kit/panel.ts';
import { el, pressed } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { stars, tag } from '../kit/stat.ts';
import { cut, stylesheet } from '../kit/style.ts';
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
