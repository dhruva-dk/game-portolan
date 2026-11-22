// Scouting, and the offer of a contract. Scouting: at the left the people the
// filter finds (whose job, where they sail, how their contract stands), each
// with what is known of them and what they ask, a tap opening the profile; at
// the right her scouts, and who each is watching. The offer: at the left the
// person and what they want of a team; in the middle the contract as it is
// drawn (wage, fee, length, bonuses, their place); at the right what it would
// cost, where the talks stand, and the ways on.

import type { Offer, Status } from '../../office/command.ts';
import type { Dyed } from '../../office/papers.ts';
import type {
  OfferView,
  ScoutingFilter,
  ScoutingRow,
  ScoutingView,
} from '../../office/people.ts';
import { dropdown, stepper } from '../kit/button.ts';
import { panel } from '../kit/panel.ts';
import { el, grouped, type Kid } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { job, meter } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import { acted, bitsStyle, jacketOf, lines, ranged, who } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-scouting { grid-template-columns: 1fr 330px; }
.m-filter { flex: none; display: flex; gap: 8px; align-items: center; padding: 0 0 8px; }
.m-filter > .k-drop { flex: 1; }
.m-filter > span { color: var(--faint); font-size: 13px; }
.s-scouting .k-job { margin-bottom: 4px; }
.s-offer { grid-template-columns: 300px 1fr 320px; }
.s-offer .k-body { gap: 8px; }
.m-term { display: grid; grid-template-columns: 1fr 250px; align-items: center; gap: 8px; padding: 4px 10px; background: var(--dark); min-height: 52px; }
.m-term > .k-step, .m-term > .k-drop { width: 100%; }
`;

const TIERS = [
  { id: 'any', label: 'All Championships' },
  { id: '0', label: 'First Championship' },
  { id: '1', label: 'Second Championship' },
  { id: '2', label: 'Third Championship' },
  { id: '3', label: 'Free Agents' },
];
const CONTRACTS: readonly { id: ScoutingFilter['contract']; label: string }[] =
  [
    { id: 'any', label: 'Any Contract' },
    { id: 'free', label: 'Out of Contract' },
    { id: 'closing', label: 'Contract Ending' },
  ];

/** Scouting. */
export function createScouting(office: Office): Screen<Dyed<ScoutingView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-scouting');
  return {
    el: root,
    show({ view: v, dyes }) {
      const filtered = (to: Partial<ScoutingFilter>) =>
        office.ask({ kind: 'filter', filter: { ...v.filter, ...to } });
      const person = (r: ScoutingRow) =>
        office.ask({ kind: 'person', id: r.id, screen: 'profile' });
      root.replaceChildren(
        panel('Scouting', [
          el(
            'div',
            'm-filter',
            dropdown(v.roles, v.filter.role, (role) => filtered({ role })),
            dropdown(
              TIERS,
              v.filter.tier === null ? 'any' : String(v.filter.tier),
              (t) => filtered({ tier: t === 'any' ? null : Number(t) })
            ),
            dropdown(CONTRACTS, v.filter.contract, (contract) =>
              filtered({ contract })
            ),
            el('span', '', v.count)
          ),
          table<ScoutingRow>(
            [
              {
                label: 'Name',
                width: '1.4fr',
                cell: (r) => who(r.face, dyes, r.name),
              },
              { label: 'Age', width: '44px', num: true, cell: (r) => r.age },
              { label: 'Rating', width: '90px', cell: (r) => ranged(r.stars) },
              { label: 'Team', width: '1fr', cell: (r) => r.team },
              { label: 'Contract', width: '110px', cell: (r) => r.contract },
              { label: 'Asks', width: '100px', num: true, cell: (r) => r.ask },
            ],
            v.rows,
            { height: 44, keep: 'market', pick: person }
          ),
        ]),
        panel(
          'Scouts',
          v.scouts.map((s) =>
            job(
              { mark: portrait(jacketOf(s.face, dyes), 30), name: s.name },
              s.on === null ? 0 : 0.5,
              s.on === null ? s.reach : `${s.on} · ${s.days?.text ?? ''}`,
              []
            )
          ),
          v.nest.text
        )
      );
    },
  };
}

/** A term of the contract: its name beside what sets it. */
const term = (name: string, control: Kid) => el('div', 'm-term', name, control);

/** The offer of a contract. */
export function createOffer(office: Office): Screen<Dyed<OfferView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-offer');
  return {
    el: root,
    show({ view: v, dyes }) {
      const d = v.draft,
        drawn = (to: Partial<Offer>) =>
          office.ask({ kind: 'draft', offer: { ...d, ...to } });
      /** A sum stepped by a twentieth of the most it may be, between nothing and that. */
      const sum = (key: 'wage' | 'fee' | 'podium' | 'sinking', most: number) =>
        stepper(
          grouped(d[key]),
          (by) =>
            drawn({
              [key]: Math.max(
                0,
                Math.min(most, d[key] + by * Math.max(1, Math.round(most / 20)))
              ),
            }),
          { least: d[key] <= 0, most: d[key] >= most }
        );
      const seasons = ([1, 2, 3] as const).map((n) => ({
        id: String(n),
        label: n === 1 ? '1 Season' : `${n} Seasons`,
        n,
      }));
      root.replaceChildren(
        panel(v.roleName, [
          el(
            'div',
            'p-top',
            portrait(jacketOf(v.face, dyes), 110),
            el('div', 'd-name', v.name),
            ranged(v.stars, 20),
            el('div', 'b-faint', v.team)
          ),
          lines(v.wants.map((w) => [w.label, w.text])),
          lines([['Patience', `${v.patience.left} of ${v.patience.of}`]]),
          meter(
            v.patience.of > 0 ? v.patience.left / v.patience.of : 0,
            'warn'
          ),
        ]),
        panel('Contract', [
          term('Wage per Race', sum('wage', v.most.wage)),
          term('Signing-on Fee', sum('fee', v.most.fee)),
          term('Podium Bonus', sum('podium', v.most.bonus)),
          term('Sinking Bonus', sum('sinking', v.most.bonus)),
          term(
            'Contract Length',
            dropdown(seasons, String(d.seasons), (id) =>
              drawn({ seasons: seasons.find((x) => x.id === id)?.n ?? 1 })
            )
          ),
          v.statuses.length > 1 &&
            term(
              'Status',
              dropdown<Status>(v.statuses, d.status, (status) =>
                drawn({ status })
              )
            ),
          v.replaces.length > 1 &&
            term(
              'Replaces',
              dropdown(
                v.replaces.map((r) => ({ id: String(r.id), label: r.label })),
                String(d.replaces),
                (id) => drawn({ replaces: id === 'null' ? null : Number(id) })
              )
            ),
          lines([
            [
              'Asked',
              `${grouped(v.ask.wage)} · ${grouped(v.ask.fee)} · ${v.ask.seasons}`,
            ],
          ]),
        ]),
        el(
          'div',
          'b-col',
          panel('Cost', [
            lines([
              ['Now', v.cost.now.text],
              ['Per Race', v.cost.perRace.text],
              ['Balance Left', v.cost.left.text],
            ]),
          ]),
          panel(null, [
            el('div', 'b-text', v.stateText),
            v.last !== null && el('div', 'b-faint', v.last),
            acted(
              'Send Offer',
              v.send,
              () =>
                office.ask({
                  kind: 'send',
                  command: { kind: 'OfferContract', person: v.id, offer: d },
                }),
              'on'
            ),
            v.counter !== null &&
              acted('Accept Counter', v.accept, () =>
                office.ask({
                  kind: 'send',
                  command: { kind: 'AcceptCounter', person: v.id },
                })
              ),
            acted(
              'Withdraw',
              v.withdraw,
              () =>
                office.ask({
                  kind: 'send',
                  command: { kind: 'WithdrawOffer', person: v.id },
                }),
              'plain'
            ),
          ])
        )
      );
    },
  };
}
