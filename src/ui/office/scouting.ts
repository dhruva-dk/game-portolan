// Scouting, on the chartroom kit, after MM's search (009). At the left the
// search (the role, the championship, the contract, the scouted only, the
// stars at least) and her scouts under the crow's nest: each one's reach and
// whom they are on, how long to their report, Cancel; Find a Scout while the
// nest has room. In the middle the market, everyone the search lets through or
// only her shortlist: a star a row to keep them, their stars and potential as
// known (a range until scouted), their team, contract, ask and talks; a row
// opens their profile, where a scout is sent.

import type { Dyed } from '../../office/papers.ts';
import type {
  ScoutingFilter,
  ScoutingRow,
  ScoutingView,
  ScoutRow,
} from '../../office/people.ts';
import {
  button,
  dropdown,
  link,
  segmented,
  stepper,
} from '../chartroom/controls.ts';
import { table } from '../chartroom/data.ts';
import { favourite, label, stars } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { who } from '../chartroom/person.ts';
import { sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import { el, pressed } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { jacketOf } from './faces.ts';
import { toPerson, toTeam } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.sc-field { display: flex; flex-direction: column; gap: var(--s1); }
.sc-field .cr-seg > * { padding-left: 0; padding-right: 0; }
.sc-scout { display: flex; flex-direction: column; gap: var(--s2); }
.sc-scout + .sc-scout { padding-top: var(--s3); border-top: var(--w-hair) solid var(--line); }
.sc-job { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--s3); }
.sc-job > div { display: flex; flex-direction: column; min-width: 0; }
.sc-job b { font-weight: 600; font-variant-numeric: lining-nums; white-space: nowrap; }
.sc-job .cr-btn { padding: 0 var(--s3); }
.sc-nest { text-align: center; }
.sc-tabs { flex: none; display: flex; justify-content: space-between; align-items: center; gap: var(--s4); }
.sc-tabs > .cr-seg { width: ${u(150)}; }
.sc-fav { display: grid; place-items: center; width: 100%; height: 100%; }
.sc-cell > svg { display: block; }
`;

/** The contract choices of the search, as the filter names them. */
const CONTRACTS: readonly ScoutingFilter['contract'][] = [
  'any',
  'free',
  'closing',
];

/** The most stars a search may ask for, by halves. */
const MOST = 5;

/** Scouting: the search and her scouts at the left, the market or her shortlist beside them. */
export function createScouting(office: Office): Screen<Dyed<ScoutingView>> {
  kitLooks();
  stylesheet(CSS);
  const root = page('side', 's-scouting');
  /** Whether the list shows the market (0) or her shortlist (1): this page's own. */
  let listing = 0;
  let last: Dyed<ScoutingView> | null = null;

  const search = (f: ScoutingFilter, to: Partial<ScoutingFilter>) =>
    office.ask({ kind: 'filter', filter: { ...f, ...to } });
  const profile = toPerson(office);

  /** The search: each of the filter's terms, labelled over its control. */
  function searching(v: ScoutingView) {
    const f = v.filter,
      field = (name: string, control: Node) =>
        el('div', 'sc-field', label(name), control);
    const tiers = ['Any', ...v.tiers, 'Free agents'];
    return sheet('Search', [
      field(
        'Role',
        dropdown(
          v.roles.map((r) => r.label),
          Math.max(
            0,
            v.roles.findIndex((r) => r.id === f.role)
          ),
          (i) => {
            const role = v.roles[i]?.id;
            if (role) search(f, { role });
          }
        )
      ),
      field(
        'Championship',
        dropdown(tiers, f.tier === null ? 0 : f.tier + 1, (i) =>
          search(f, { tier: i === 0 ? null : i - 1 })
        )
      ),
      field(
        'Contract',
        segmented(
          ['Any', 'Free', 'Ending'],
          CONTRACTS.indexOf(f.contract),
          (i) => search(f, { contract: CONTRACTS[i] ?? 'any' })
        )
      ),
      field(
        'Known',
        segmented(['Everyone', 'Scouted'], f.known ? 1 : 0, (i) =>
          search(f, { known: i === 1 })
        )
      ),
      field(
        'Stars at least',
        stepper(
          f.stars === 0 ? 'Any' : stars(f.stars, f.stars, 9),
          f.stars > 0 ? () => search(f, { stars: f.stars - 0.5 }) : null,
          f.stars < MOST ? () => search(f, { stars: f.stars + 0.5 }) : null
        )
      ),
    ]);
  }

  /** A scout: who they are and how far they see, and whom they are on. */
  const scout = (s: ScoutRow, dyes: Dyed<unknown>['dyes']) =>
    el(
      'div',
      'sc-scout',
      who(
        {
          jacket: jacketOf(s.face, dyes),
          name: s.name,
          said: s.reach,
          stars: { lo: s.stars, hi: s.stars, known: true },
          badge: 'office.scouting',
        },
        24,
        'beside'
      ),
      s.on
        ? el(
            'div',
            'sc-job',
            el(
              'div',
              '',
              label(
                el('span', '', 'On ', link(s.on.name, profile(s.on.person)))
              ),
              el('b', '', s.days ? `${s.days.text} to report` : '')
            ),
            s.cancel.ok &&
              button(
                'Cancel',
                () =>
                  office.ask({
                    kind: 'send',
                    command: { kind: 'CancelScout', scout: s.id },
                  }),
                { kind: 'harm' }
              )
          )
        : label('Idle: send them from a profile.')
    );

  /** Her scouts under the crow's nest, and the way to another while it has room. */
  function scouts(v: ScoutingView, dyes: Dyed<unknown>['dyes']) {
    const room = v.scouts.length < v.nest.value;
    return sheet(
      'Scouts',
      [
        label(
          `Scouting Department: ${v.scouts.length} of ${v.nest.value} scouts`,
          'sc-nest'
        ),
        ...v.scouts.map((s) => scout(s, dyes)),
        v.scouts.length === 0 && label('No scouts: hire one to see more.'),
        room &&
          button(
            'Find a Scout',
            () => {
              search(v.filter, {
                role: 'scout',
                tier: null,
                contract: 'any',
                known: false,
                stars: 0,
              });
            },
            { kind: 'plain' }
          ),
      ],
      { aside: v.nest.text, cls: 'cr-grow' }
    );
  }

  /** The market, or her shortlist: a row a person, a star to keep them. */
  function market(v: ScoutingView) {
    const kept = new Set(v.shortlist.map((r) => r.id));
    const rows = listing === 0 ? v.rows : v.shortlist;
    return sheet(
      'The Market',
      [
        el(
          'div',
          'sc-tabs',
          segmented(
            [`All ${v.count}`, `Shortlist ${v.shortlist.length}`],
            listing,
            (i) => {
              listing = i;
              if (last) draw(last);
            }
          ),
          label(
            listing === 0
              ? 'A star keeps them on the shortlist.'
              : 'Kept while the office is open.'
          )
        ),
        table<ScoutingRow>(
          [
            {
              head: '',
              track: u(14),
              cell: (r) =>
                pressed(
                  el('span', 'sc-fav', favourite(kept.has(r.id), 10)),
                  () => office.ask({ kind: 'favourite', id: r.id })
                ),
            },
            { head: 'Name', track: '1fr', cell: (r) => link(r.name) },
            {
              head: 'Age',
              track: u(18),
              num: true,
              cell: (r) => String(r.age),
            },
            {
              head: 'Stars',
              track: u(46),
              cell: (r) =>
                el('span', 'sc-cell', stars(r.stars.lo, r.stars.hi, 8)),
            },
            {
              head: 'Potential',
              track: u(46),
              cell: (r) =>
                el('span', 'sc-cell', stars(r.potential.lo, r.potential.hi, 8)),
            },
            {
              head: 'Team',
              track: u(52),
              cell: (r) =>
                r.teamId === null
                  ? r.team
                  : link(r.team, toTeam(office)(r.teamId)),
            },
            { head: 'Contract', track: u(52), cell: (r) => r.contract },
            { head: 'Asks', track: u(28), num: true, cell: (r) => r.ask },
            {
              head: 'Talks',
              track: u(58),
              cell: (r) => (r.talk ? label(r.talk) : ''),
            },
          ],
          rows,
          {
            tap: (r) => profile(r.id),
            scrolls: { keep: listing === 0 ? 'market' : 'shortlist' },
            none:
              listing === 0
                ? 'No one passes the search.'
                : 'No one kept yet: star someone in the market.',
          }
        ),
      ],
      { aside: `${v.count} found` }
    );
  }

  function draw(d: Dyed<ScoutingView>) {
    last = d;
    const { view: v, dyes } = d;
    root.replaceChildren(column(searching(v), scouts(v, dyes)), market(v));
  }

  return { el: root, show: draw };
}
