// A person's profile, laid out as a dossier on the
// chartroom kit. At the left, who they are: their portrait, name, age and
// colony, their team, their stars and the most they may come to, their
// contract and what may be done about it. In the middle, their stats on the
// quality ladder, each to its ceiling, and their traits, each with what it does
// and when it holds. At the right, their bond with whom they sail beside, their
// morale and marketability, the role's own figures, and the seasons behind
// them. A figure that has a breakdown opens it on a tap; dismissing asks first.

import type { Figure } from '../../office/career.ts';
import type { Dyed } from '../../office/papers.ts';
import type { ProfileView, TraitLine } from '../../office/people.ts';
import { button, link, popover } from '../chartroom/controls.ts';
import { meter, statTile, table, terms } from '../chartroom/data.ts';
import {
  label,
  name,
  portrait,
  stars,
  traitBadge,
} from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { folio, sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import { el, pressed, styled, type Kid } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { jacketOf } from './faces.ts';
import { toPerson, toTeam } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.pf { display: grid; grid-template-columns: ${u(168)} 1fr ${u(188)}; gap: var(--s4); padding: var(--s4) var(--s6); }
.pf-col { display: flex; flex-direction: column; gap: var(--s4); min-height: 0; min-width: 0; }
.pf-grow { flex: 1; min-height: 0; }
.pf-grow > .cr-body { overflow-y: auto; }
.pf .cr-body { gap: var(--s3); }
.pf-id { display: flex; flex-direction: column; align-items: center; gap: var(--s1); text-align: center; }
.pf-who { font: 700 var(--t-title)/1.05 var(--face); }
.pf-team { display: flex; align-items: center; gap: var(--s2); font-weight: 600; }
.pf-team > i { width: ${u(4)}; height: ${u(10)}; background: var(--team); box-shadow: 0 0 0 var(--w-fine) var(--ink); }
.pf-rating { display: grid; grid-template-columns: auto auto; align-items: center; justify-content: center; gap: var(--s1) var(--s3); }
.pf-band { flex: none; padding: var(--s1) 0; text-align: center; font: 700 var(--t-label)/1.2 var(--face); letter-spacing: .14em;
  text-transform: uppercase; color: var(--ink-2); border-top: var(--w-hair) solid var(--line); border-bottom: var(--w-hair) solid var(--line); }
.pf-note { text-align: center; padding: var(--s3) 0; }
.pf-acts { margin-top: auto; display: flex; flex-direction: column; gap: var(--s3); }
.pf-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s4) var(--s5); }
.pf-legend { display: flex; justify-content: center; gap: var(--s4); font: italic 500 var(--t-label) var(--face); color: var(--ink-2); }
.pf-legend > span { display: inline-flex; align-items: center; gap: var(--s1); }
.pf-legend i { width: ${u(8)}; height: ${u(5)}; background: var(--wash); box-shadow: inset 0 0 0 var(--w-fine) var(--ink); }
.pf-legend i.ceil { width: var(--w-rule); height: ${u(8)}; background: var(--ink); box-shadow: none; }
.pf-trait { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--s3); padding: var(--s2) 0;
  border-bottom: var(--w-fine) solid var(--rule); }
.pf-trait > div { display: flex; flex-direction: column; gap: ${u(1)}; min-width: 0; }
.pf-trait > .cr-label { max-width: ${u(70)}; text-align: right; }
.pf-trait > .cr-label.always { color: var(--note); }
.pf-wants { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s2); padding-top: var(--s2); }
.pf-chip { padding: ${u(1)} var(--s3); background: var(--paper-raised); box-shadow: inset 0 0 0 var(--w-fine) var(--line); }
.pf-gauges { display: flex; flex-direction: column; gap: var(--s3); }
.pf-gauge { position: relative; display: flex; flex-direction: column; gap: var(--s1); }
.pf-row { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s3); }
.pf-row b { font-weight: 600; font-variant-numeric: lining-nums; }
.pf-why b { text-decoration: underline dotted var(--line); text-underline-offset: ${u(1.5)}; }
.pf-gauge > .cr-pop { right: 0; top: 100%; }
`;

/** A figure's row: its name and its text; a tap opens its breakdown under it (and puts away any other). */
function explained(
  title: Kid,
  f: Figure,
  shown: { pop: HTMLElement | null },
  below: Kid = null
) {
  const row = el('div', 'pf-row', label(title), el('b', '', f.text));
  const gauge = el('div', 'pf-gauge', row, below);
  const why = f.explain;
  if (!why) return gauge;
  row.classList.add('pf-why');
  return pressed(gauge, () => {
    const here = shown.pop?.parentElement === gauge;
    shown.pop?.remove();
    shown.pop = null;
    if (here) return;
    shown.pop = gauge.appendChild(popover(why, f.text));
  });
}

/** Their stars, as known or as a range, and the most they may come to. */
const rating = (v: ProfileView) =>
  el(
    'div',
    'pf-rating',
    stars(v.stars.lo, v.stars.hi),
    label(v.stars.known ? 'Stars' : 'Stars, a range'),
    stars(v.potential.lo, v.potential.hi, 9),
    label('Potential')
  );

/** The quality ladder's key. */
const legend = () =>
  el(
    'div',
    'pf-legend',
    ...['0–5', '6–9', '10–13', '14–17', '18–20'].map((r, q) =>
      el('span', '', styled(el('i'), { '--wash': `var(--q${q})` }), r)
    ),
    el('span', '', el('i', 'ceil'), 'ceiling')
  );

/** A trait: its rosette, its name and what it does, when it holds. */
const traitRow = (t: TraitLine) =>
  el(
    'div',
    'pf-trait',
    traitBadge(t.sense),
    el('div', '', name(t.name), label(t.effect)),
    label(t.lasts, t.lasts === 'Always' ? 'always' : '')
  );

/** A person's profile. */
export function createProfile(office: Office): Screen<Dyed<ProfileView>> {
  kitLooks();
  stylesheet(CSS);
  const root = el('div', 'cr pf');
  const shown: { pop: HTMLElement | null } = { pop: null };
  return {
    el: root,
    show({ view: v, dyes }) {
      const { id } = v;
      shown.pop = null;
      const jacket = jacketOf(v.face, dyes);
      const send = (a: Parameters<Office['ask']>[0]) => office.ask(a);
      const confirm = () => {
        const shut = () => leaf.remove();
        const leaf = folio(
          `Dismiss ${v.name}`,
          [
            label(
              `${v.name} leaves at once, and is owed the rest of the contract.`
            ),
            terms([['Owed now', v.dismiss.owed.text]]),
          ],
          [
            button('Keep', shut, { kind: 'plain' }),
            button(
              'Dismiss',
              () => {
                shut();
                send({
                  kind: 'send',
                  command: { kind: 'Dismiss', person: id },
                });
              },
              { kind: 'harm' }
            ),
          ],
          shut
        );
        root.append(leaf);
      };
      const off = (a: { ok: boolean; why: string }) => (a.ok ? null : a.why);
      const acts: Kid[] = v.you
        ? []
        : v.mine
          ? [
              button(
                'Renew Contract',
                () => send({ kind: 'person', id, screen: 'offer' }),
                { off: off(v.renew) }
              ),
              button(`Dismiss · ${v.dismiss.owed.text}`, confirm, {
                kind: 'harm',
                off: off(v.dismiss),
              }),
            ]
          : [
              button(
                v.scout.label || 'Scout',
                () => {
                  if (v.scout.scout !== null)
                    send({
                      kind: 'send',
                      command: {
                        kind: 'StartScout',
                        scout: v.scout.scout,
                        person: id,
                      },
                    });
                },
                { kind: 'plain', off: off(v.scout) }
              ),
              button(
                'Offer Contract',
                () => send({ kind: 'person', id, screen: 'offer' }),
                { off: off(v.offer) }
              ),
            ];
      const who = sheet(
        v.post === v.roleName ? v.roleName : `${v.roleName} · ${v.post}`,
        [
          el(
            'div',
            'pf-id',
            portrait(jacket, 54),
            el('div', 'pf-who', v.name),
            label(`Age ${v.age} · ${v.colony}`),
            el(
              'div',
              'pf-team',
              styled(el('i'), { '--team': jacket[0] }),
              link(v.team, toTeam(office)(v.teamId)),
              v.teamId === null ? null : ` · ${v.tier}`
            )
          ),
          rating(v),
          el('div', 'pf-band', 'Contract'),
          v.contract
            ? terms(v.contract.terms.map((l) => [l.label, l.amount] as const))
            : label('Under no contract.'),
          v.talk !== null && el('div', 'pf-note', label(v.talk)),
          el('div', 'pf-acts', ...acts),
        ],
        { cls: 'pf-grow' }
      );
      const abilities = sheet(`${v.roleName} Stats`, [
        v.stats.length === 0
          ? el('div', 'pf-note', label(v.statsNote))
          : el(
              'div',
              'pf-tiles',
              ...v.stats.map((s) =>
                statTile(s.label, s.value, s.ceiling, s.arrow)
              )
            ),
        v.stats.length > 0 && legend(),
      ]);
      const traits = sheet(
        'Traits',
        [
          v.traits.length === 0
            ? el(
                'div',
                'pf-note',
                label(v.known ? 'No traits.' : 'Scout to read their traits.')
              )
            : el('div', '', ...v.traits.map(traitRow)),
          v.wants &&
            el(
              'div',
              'pf-wants',
              label('Wants'),
              ...v.wants.map((w) => el('span', 'pf-chip', w.label))
            ),
        ],
        { cls: 'pf-grow' }
      );
      const gauges = sheet(null, [
        el(
          'div',
          'pf-gauges',
          v.bond &&
            explained(
              el(
                'span',
                '',
                'Bond with ',
                link(v.bond.with.name, toPerson(office)(v.bond.with.person))
              ),
              v.bond.figure,
              shown,
              meter(v.bond.share, 'q1')
            ),
          v.morale &&
            explained(
              'Morale',
              v.morale,
              shown,
              meter(v.morale.value / 100, 'warn')
            ),
          explained(
            'Marketability',
            v.marketability,
            shown,
            meter(v.marketability.value / 100, 'q2')
          ),
          ...v.specifics.map((s) => explained(s.label, s.figure, shown))
        ),
      ]);
      const service = sheet(
        'Service',
        [
          table(
            [
              { head: 'Season', track: u(24), cell: (h) => h.season },
              {
                head: 'Team',
                track: '1fr',
                cell: (h) => (h.teamId === null ? h.team : link(h.team)),
              },
              { head: 'Races', track: u(19), num: true, cell: (h) => h.races },
              { head: 'Best', track: u(15), num: true, cell: (h) => h.best },
              { head: 'Pts', track: u(15), num: true, cell: (h) => h.points },
            ],
            v.history,
            {
              own: (h) => v.mine && h.team === v.top.team,
              tap: (h) => toTeam(office)(h.teamId),
              none: 'No seasons behind them yet.',
            }
          ),
        ],
        { cls: 'pf-grow' }
      );
      root.replaceChildren(
        who,
        el('div', 'pf-col', abilities, traits),
        el('div', 'pf-col', gauges, service)
      );
    },
  };
}
