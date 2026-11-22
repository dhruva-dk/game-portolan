// Scouting, and the offer of a contract.
// Scouting: at the left the filters (the job across the head; under it the
// championship, the contract and the ability, a group each) over the table of
// the people they find, a tap on one opening the profile; at the right the
// chief scout over the scouting slots, a scout a slot. The offer: at the left
// the terms of agreement, a row a term (its name, what sets it, what it is
// counted by), the bonus terms under their band, and beside them what the
// person expects of a team; at the right the person, their patience, the terms
// asked against the terms offered, the reply, and the ways on.

import type { Offer, Status } from '../../office/command.ts';
import type { Dyed } from '../../office/papers.ts';
import type {
  OfferView,
  ScoutingFilter,
  ScoutingRow,
  ScoutingView,
  ScoutRow,
} from '../../office/people.ts';
import { toneOf } from '../ink.ts';
import { button, dropdown, segmented, stepper } from '../kit/button.ts';
import { icon } from '../kit/icons.ts';
import { band, panel } from '../kit/panel.ts';
import { el, grouped, type Kid } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { meter, stars, tag } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import { acted, bitsStyle, jacketOf, lines, ranged } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-scouting { grid-template-columns: 1fr 330px; }
.s-scouting .k-body { gap: 8px; }
.m-label { flex: none; text-align: center; font-size: 13px; font-style: italic; color: var(--faint); }
.m-role { flex: none; display: flex; justify-content: center; }
.m-role > .k-seg > div { min-width: 120px; }
.m-groups { flex: none; display: grid; grid-template-columns: 196px 1fr 318px; gap: 10px; }
.m-group { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.m-group > .b-row { gap: 6px; }
.m-group .k-seg > div { min-width: 0; padding: 0 10px; }
.m-group .k-step { flex: 1; align-self: auto; }
.m-group .k-step > .k-value { min-width: 0; padding: 0 6px; }
.m-chief { flex: none; display: flex; align-items: center; gap: 12px; padding: 6px 4px 4px; }
.m-chief > div:not(.k-face) { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.m-slots { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.m-slot { flex: none; min-height: 60px; display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 10px; background: var(--dark);
  box-shadow: inset 0 0 0 1px var(--line); }
.m-slot > div:not(.k-face) { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.m-slot > div:not(.k-face) > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-slot.empty { justify-content: center; font-style: italic; color: var(--faint); background: none; box-shadow: inset 0 0 0 1px var(--rule); }
.m-slot > .k-btn { padding: 0 10px; font-size: 14px; }
.m-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.m-name > div:not(.k-face) { min-width: 0; display: flex; flex-direction: column; line-height: 1.1; }
.m-name > div:not(.k-face) > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.s-offer { grid-template-columns: 1fr 372px; }
.s-offer .k-body { gap: 6px; }
.m-deal { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 176px; gap: 8px; }
.m-terms, .m-expects { display: flex; flex-direction: column; gap: 6px; min-height: 0; min-width: 0; }
.m-term { flex: 1; min-height: 0; max-height: 96px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  background: var(--dark); box-shadow: inset 0 0 0 1px var(--rule); }
.m-term > b { font: 700 13px/1 var(--serif); letter-spacing: .12em; text-transform: uppercase; }
.m-term > span { font-size: 13px; font-style: italic; color: var(--faint); line-height: 1; }
.m-term > .k-step { align-self: center; width: 300px; }
.m-term > .k-step > .k-value { font: 700 22px/1 var(--narrow); }
.m-term > .k-seg > div { min-width: 120px; }
.m-term > .k-drop { min-width: 300px; }
.m-expect { flex: none; display: flex; flex-direction: column; gap: 6px; padding: 10px; text-align: center; background: var(--dark);
  box-shadow: inset 0 0 0 1px var(--rule); }
.m-expect > span { font-size: 13px; font-style: italic; color: var(--faint); }
.m-none { padding: 10px 6px; text-align: center; font-style: italic; color: var(--faint); }
.m-person { flex: none; display: flex; align-items: center; gap: 12px; padding-top: 12px; }
.m-person > div:not(.k-face) { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.m-patience { flex: none; display: flex; align-items: center; justify-content: center; gap: 6px; }
.m-patience > span { margin-right: 6px; font-size: 13px; font-style: italic; color: var(--faint); }
.m-patience > i { width: 24px; height: 24px; display: grid; place-items: center; box-shadow: inset 0 0 0 1.2px var(--line); color: var(--on-fill); }
.m-patience > i.lost { background: var(--bad); box-shadow: inset 0 0 0 1.2px var(--ink); }
.m-against { flex: none; height: 148px; display: flex; }
.m-reply { flex: 1; min-height: 0; overflow-y: auto; padding: 4px; line-height: 1.35; }
.m-reply > div + div { margin-top: 4px; }
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
    { id: 'any', label: 'All' },
    { id: 'free', label: 'Free' },
    { id: 'closing', label: 'Ending' },
  ];
const KNOWN = [
  { id: 'all', label: 'All' },
  { id: 'known', label: 'Scouted' },
];

/** A group of the filters: its name over what sets it. */
const group = (name: string, control: Kid) =>
  el('div', 'm-group', band(name), control);

/** Scouting. */
export function createScouting(office: Office): Screen<Dyed<ScoutingView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-scouting');
  return {
    el: root,
    show({ view: v, dyes }) {
      const f = v.filter,
        filtered = (to: Partial<ScoutingFilter>) =>
          office.ask({ kind: 'filter', filter: { ...f, ...to } });
      const person = (r: ScoutingRow) =>
        office.ask({ kind: 'person', id: r.id, screen: 'profile' });
      /** A scouting slot: the scout, and who they watch (or that they are free, and how far they see). */
      const slot = (s: ScoutRow) =>
        el(
          'div',
          'm-slot',
          portrait(jacketOf(s.face, dyes), 40),
          el(
            'div',
            '',
            el('b', '', s.on === null ? 'Empty Slot' : s.on),
            el(
              'span',
              'b-faint',
              s.on === null
                ? `${s.name} · ${s.reach}`
                : `${s.name} · ${s.days?.text ?? ''}`
            )
          ),
          s.on !== null &&
            button(
              'Cancel',
              () =>
                office.ask({
                  kind: 'send',
                  command: { kind: 'CancelScout', scout: s.id },
                }),
              { kind: 'danger', off: !s.cancel.ok }
            )
        );
      const chief = v.scouts[0];
      // the posts her crow's nest allows that no scout fills yet
      const unfilled = Math.max(0, v.nest.value - v.scouts.length);
      root.replaceChildren(
        panel(
          'Filters',
          [
            el('div', 'm-label', 'Job Role'),
            el(
              'div',
              'm-role',
              segmented(v.roles, f.role, (role) => filtered({ role }))
            ),
            el(
              'div',
              'm-groups',
              group(
                'Championship',
                dropdown(
                  TIERS,
                  f.tier === null ? 'any' : String(f.tier),
                  (t) => filtered({ tier: t === 'any' ? null : Number(t) }),
                  true
                )
              ),
              group(
                'Contract',
                segmented(
                  CONTRACTS,
                  f.contract,
                  (contract) => filtered({ contract }),
                  true
                )
              ),
              group(
                'Ability',
                el(
                  'div',
                  'b-row',
                  segmented(KNOWN, f.known ? 'known' : 'all', (id) =>
                    filtered({ known: id === 'known' })
                  ),
                  stepper(
                    f.stars > 0 ? stars(f.stars, f.stars, 15) : 'At Least',
                    (by) =>
                      filtered({
                        stars: Math.max(0, Math.min(5, f.stars + by * 0.5)),
                      }),
                    { least: f.stars <= 0, most: f.stars >= 5 }
                  )
                )
              )
            ),
            table<ScoutingRow>(
              [
                {
                  label: 'Name',
                  width: '1.3fr',
                  // (where talks with them stand, under their name)
                  cell: (r) =>
                    el(
                      'div',
                      'm-name',
                      portrait(jacketOf(r.face, dyes), 30),
                      el(
                        'div',
                        '',
                        el('span', '', r.name),
                        r.talk !== null && el('span', 'b-faint', r.talk)
                      )
                    ),
                },
                { label: 'Age', width: '30px', num: true, cell: (r) => r.age },
                {
                  label: 'Ability',
                  width: '84px',
                  cell: (r) => ranged(r.stars),
                },
                { label: 'Team', width: '1fr', cell: (r) => r.team },
                {
                  label: 'Cost per Race',
                  width: '92px',
                  num: true,
                  cell: (r) => r.ask,
                },
                {
                  label: 'Contract Ends',
                  width: '104px',
                  cell: (r) => r.contract,
                },
              ],
              v.rows,
              { height: 44, keep: 'market', pick: person }
            ),
          ],
          `${v.count} found`
        ),
        panel(
          'Chief Scout',
          [
            chief
              ? el(
                  'div',
                  'm-chief',
                  portrait(jacketOf(chief.face, dyes), 72),
                  el(
                    'div',
                    '',
                    el('span', 'b-faint', 'Chief Scout'),
                    el('div', 'd-name', chief.name),
                    stars(chief.stars, chief.stars, 16)
                  )
                )
              : el('div', 'm-none', 'No scout is hired.'),
            band('Scouting Slots'),
            el(
              'div',
              'm-slots',
              ...v.scouts.map(slot),
              ...Array.from({ length: unfilled }, () =>
                el('div', 'm-slot empty', 'Empty Slot - no scout hired')
              )
            ),
          ],
          v.nest.text
        )
      );
    },
  };
}

/** A term of the contract: its name over what sets it, and what it is counted by. */
const term = (name: string, control: Kid, by: string | null = null) =>
  el('div', 'm-term', el('b', '', name), control, by && el('span', '', by));

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
      const length = (n: number) => (n === 1 ? '1 Season' : `${n} Seasons`);
      const send = (
        kind: 'OfferContract' | 'AcceptCounter' | 'WithdrawOffer'
      ) =>
        office.ask({
          kind: 'send',
          command:
            kind === 'OfferContract'
              ? { kind, person: v.id, offer: d }
              : { kind, person: v.id },
        });
      root.replaceChildren(
        panel('Terms of Agreement', [
          el(
            'div',
            'm-deal',
            el(
              'div',
              'm-terms',
              term('Cost', sum('wage', v.most.wage), 'Per Race'),
              term(
                'Contract Length',
                segmented(seasons, String(d.seasons), (id) =>
                  drawn({ seasons: seasons.find((x) => x.id === id)?.n ?? 1 })
                )
              ),
              v.statuses.length > 1 &&
                term(
                  'Status',
                  segmented<Status>(v.statuses, d.status, (status) =>
                    drawn({ status })
                  )
                ),
              v.replaces.length > 1 &&
                term(
                  'Replaces',
                  dropdown(
                    v.replaces.map((r) => ({
                      id: String(r.id),
                      label: r.label,
                    })),
                    String(d.replaces),
                    (id) =>
                      drawn({ replaces: id === 'null' ? null : Number(id) })
                  )
                ),
              band('Bonus Terms'),
              term('Signing-on Fee', sum('fee', v.most.fee), 'Paid on Signing'),
              term(
                'Podium Bonus',
                sum('podium', v.most.bonus),
                'A Race on the Podium'
              ),
              term('Sinking Bonus', sum('sinking', v.most.bonus), 'A Ship Sunk')
            ),
            el(
              'div',
              'm-expects',
              band('Expectations'),
              ...v.wants.map((w) =>
                el(
                  'div',
                  'm-expect',
                  el('b', '', w.label),
                  meter(w.value, toneOf(w.value)),
                  el('span', '', `${w.text} met`)
                )
              ),
              v.wants.length === 0 &&
                el(
                  'div',
                  'm-none',
                  'Not yet scouted: what they want of a team is not known.'
                )
            )
          ),
        ]),
        panel(null, [
          el(
            'div',
            'm-person',
            portrait(jacketOf(v.face, dyes), 96),
            el(
              'div',
              '',
              tag(v.roleName, 'go', 'boxed'),
              el('div', 'd-name', v.name),
              ranged(v.stars, 18),
              el('span', 'b-faint', `To join ${v.team}`)
            )
          ),
          el(
            'div',
            'm-patience',
            el('span', '', 'Patience'),
            ...Array.from({ length: v.patience.of }, (_, i) =>
              i < v.patience.of - v.patience.left
                ? el('i', 'lost', icon('close', 18))
                : el('i')
            )
          ),
          el(
            'div',
            'm-against',
            table<readonly [string, string, string]>(
              [
                { label: 'Terms', width: '1fr', cell: (r) => r[0] },
                { label: 'Asked', width: '86px', num: true, cell: (r) => r[1] },
                { label: 'Offer', width: '86px', num: true, cell: (r) => r[2] },
              ],
              [
                ['Cost per Race', grouped(v.ask.wage), grouped(d.wage)],
                ['Contract Length', length(v.ask.seasons), length(d.seasons)],
                ['Signing-on Fee', grouped(v.ask.fee), grouped(d.fee)],
              ],
              { height: 30 }
            )
          ),
          lines([
            ['Cost to Sign', v.cost.now.text],
            ['Balance Left', v.cost.left.text],
          ]),
          el(
            'div',
            'm-reply',
            el('div', '', v.stateText),
            v.last !== null && el('div', 'b-faint', v.last),
            v.rivals.length > 0 &&
              el('div', 'b-faint', `Also in talks: ${v.rivals.join(', ')}`)
          ),
          v.counter !== null &&
            acted('Accept Counter', v.accept, () => send('AcceptCounter')),
          acted('Send Offer', v.send, () => send('OfferContract'), 'on'),
          acted('Withdraw', v.withdraw, () => send('WithdrawOffer'), 'plain'),
        ])
      );
    },
  };
}
