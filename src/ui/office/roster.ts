// Her team's people, on the chartroom kit, after MM's rosters. Drivers: a card
// a ship (its post at its head; who sails it, their stars, morale, the ship's
// mechanic and the bond between them reached by levels, the contract, their
// traits, and Renew at the foot, shut with its reason), the reserve and the way
// to the market in the last column. Staff: the same card, compact, each with its
// role's woodcut on the portrait: the four mechanics a row, each with their
// chemistry with the ship's driver, then the designer, the scouts, each open
// post and the way to the market. Team: the ledger, what the people cost a race
// against what comes in, the chairman and the open posts; everyone on the books
// in one ruled table, grouped by role; the pit crew and each ship's stop.

import type { Dyed } from '../../office/papers.ts';
import type { Range, RosterRow, TeamView } from '../../office/people.ts';
import { button } from '../chartroom/controls.ts';
import { meter, stepped, table, terms } from '../chartroom/data.ts';
import {
  cut,
  fig,
  label,
  name,
  portrait,
  stars,
} from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import type { Glyph } from '../glyphs.ts';
import { el, type Kid } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { jacketOf } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.rs { display: grid; gap: var(--s4); padding: var(--s4) var(--s6); }
.rs .cr-body { gap: var(--s3); }
.rs-col { display: flex; flex-direction: column; gap: var(--s4); min-width: 0; min-height: 0; }
.rs-grow { flex: 1; min-height: 0; }
.rs-drivers { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.rs-staff { grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
.rs-team { grid-template-columns: ${u(168)} minmax(0, 1fr) ${u(176)}; }

.rs-id { display: flex; flex-direction: column; align-items: center; gap: var(--s1); text-align: center; }
.rs-id > .cr-name { line-height: 1.1; }
.rs-face { position: relative; flex: none; }
.rs-badge { position: absolute; right: ${u(-3)}; bottom: ${u(-2)}; width: ${u(15)}; height: ${u(15)}; display: grid; place-items: center;
  border-radius: 50%; background: var(--paper-raised); box-shadow: 0 0 0 var(--w-fine) var(--ink); }
.rs-badge > svg { width: ${u(11)}; height: ${u(11)}; }
.rs-rating { display: grid; grid-template-columns: auto auto; align-items: center; justify-content: center; gap: ${u(1)} var(--s2); }
.rs-who { display: flex; align-items: center; gap: var(--s3); min-width: 0; }
.rs-who > div:last-child { display: flex; flex-direction: column; gap: ${u(1)}; min-width: 0; }
.rs-who .cr-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-gauge { display: flex; flex-direction: column; gap: var(--s1); }
.rs-row { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s2); min-width: 0; }
.rs-row > .cr-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rs-row b { font-weight: 600; font-variant-numeric: lining-nums; white-space: nowrap; }
.rs-row b.harm, .rs-harm { color: var(--harm); }
.rs-mate { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
.rs-mate > .cr-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rs-traits { text-align: center; }
.rs-foot { margin-top: auto; display: flex; flex-direction: column; gap: var(--s2); }
.rs-pair { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; align-items: start; gap: var(--s2); }
.rs-pair .cr-btn, .rs-foot .cr-btn { padding: 0 var(--s2); }
.rs-pair > .cr-act { display: contents; }
.rs-pair > .cr-act > .cr-label { grid-column: 1 / -1; text-align: center; white-space: nowrap; }
.rs-note { text-align: center; }
.rs-open { flex: 1; display: grid; place-items: center; text-align: center; }

.rs-sum { display: flex; flex-direction: column; align-items: center; gap: var(--s1); padding: var(--s2) 0; }
.rs-sum > .cr-fig { font-size: var(--fig-l); }
.rs-posts > div { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); }
.rs-stars > svg { display: block; }
`;

/** One of a role, by the roster's heading for it. */
const ONE: Readonly<Record<string, string>> = {
  Drivers: 'Driver',
  Mechanics: 'Mechanic',
  Designer: 'Designer',
  Scouts: 'Scout',
  'Pit crew': 'Pit crew',
  Chairman: 'Chairman',
};

/** Each role's woodcut, worn on the portrait. */
const BADGE: Readonly<Record<string, Glyph>> = {
  Drivers: 'office.drivers',
  Mechanics: 'role.mechanic',
  Designer: 'office.staff',
  Scouts: 'office.scouting',
};

/** The roster's rows under the heading `title` (to the next heading). */
function under(v: TeamView, title: string): RosterRow[] {
  const from = v.roster.findIndex(
    (r) => r.kind === 'head' && r.title === title
  );
  if (from < 0) return [];
  const rest = v.roster.slice(from + 1),
    to = rest.findIndex((r) => r.kind === 'head');
  return to < 0 ? rest : rest.slice(0, to);
}

/** How content, as the wash its meter is filled in: low harm (they will ask to leave), middling warn. */
const moraleWash = (m: number) => (m < 25 ? 'harm' : m < 50 ? 'warn' : 'good');

/** Their stars as known or as a range, and the most they may come to. */
const rating = (s: Range | null, p: Range | null) =>
  s &&
  el(
    'div',
    'rs-rating',
    stars(s.lo, s.hi, 10),
    label(s.known ? 'Stars' : 'Stars, a range'),
    p && stars(p.lo, p.hi, 8),
    p && label('Potential')
  );

/** Morale as a figure over its meter. */
const morale = (m: number | null) =>
  m !== null &&
  el(
    'div',
    'rs-gauge',
    el(
      'div',
      'rs-row',
      label('Morale'),
      el('b', m < 25 ? 'harm' : '', String(m))
    ),
    meter(m / 100, moraleWash(m))
  );

/** A portrait, its role's woodcut on it if it has one. */
const face = (
  r: RosterRow,
  dyes: Dyed<unknown>['dyes'],
  size: number,
  role: string
) => {
  const badge = BADGE[role];
  return el(
    'div',
    'rs-face',
    portrait(jacketOf(r.face, dyes), size),
    badge && el('i', 'rs-badge', cut(badge))
  );
};

/** What a roster screen asks of the office. */
function asks(office: Office) {
  return {
    profile: (id: number | null) =>
      id === null
        ? null
        : () => office.ask({ kind: 'person', id, screen: 'profile' }),
    offer: (id: number) => () =>
      office.ask({ kind: 'person', id, screen: 'offer' }),
    /** The market opened on the role an open post wants. */
    find: (r: RosterRow) => () => {
      if (r.find)
        office.ask({
          kind: 'filter',
          filter: {
            role: r.find.role,
            tier: null,
            contract: 'any',
            known: false,
            stars: 0,
          },
        });
      office.ask({ kind: 'open', screen: 'scouting' });
    },
    market: () => office.ask({ kind: 'open', screen: 'scouting' }),
  };
}

/** The bond of the ship `post`, as the track of its levels and what it stands at. */
function bondOf(v: TeamView, post: string, mate: Kid) {
  const b = v.bonds.find((x) => x.label === post);
  if (!b) return null;
  return el(
    'div',
    'rs-gauge',
    mate,
    stepped(b.fill / 100, b.marks, b.level),
    el(
      'div',
      'rs-row',
      label(b.bond.value === 1 ? '1 race' : `${b.bond.value} races`),
      el('b', '', b.bond.text)
    )
  );
}

/** Renew, shut with its reason under it where it may not be. */
const renew = (r: RosterRow, go: (id: number) => () => void) =>
  r.id !== null &&
  r.renew &&
  button('Renew Contract', go(r.id), { off: r.renew.ok ? null : r.renew.why });

/** Her drivers: a card a ship, the reserve and the market in the last column. */
export function createDrivers(office: Office): Screen<Dyed<TeamView>> {
  kitLooks();
  stylesheet(CSS);
  const root = el('div', 'cr rs rs-drivers s-drivers');
  const to = asks(office);
  return {
    el: root,
    show({ view: v, dyes }) {
      const mechanics = under(v, 'Mechanics');
      const card = (r: RosterRow, cls = '') => {
        const details = to.profile(r.id);
        if (r.kind === 'open')
          return sheet(
            r.title,
            [
              el('div', 'rs-open', label('No driver holds this post.')),
              button('Find a Driver', to.find(r)),
            ],
            { cls }
          );
        const mech = mechanics.find(
          (m) => m.post === r.post && m.kind === 'person'
        );
        return sheet(
          r.post,
          [
            el(
              'div',
              'rs-id',
              face(r, dyes, 44, ''),
              name(r.title.replace(' (you)', '')),
              label(r.you ? `Age ${r.age} · the manager` : `Age ${r.age}`)
            ),
            rating(r.stars, r.potential),
            r.you
              ? button(
                  'Your Record',
                  () => office.ask({ kind: 'open', screen: 'player' }),
                  { kind: 'plain' }
                )
              : details && button('Details', details, { kind: 'plain' }),
            morale(r.morale),
            bondOf(
              v,
              r.post,
              el(
                'div',
                'rs-mate',
                mech ? portrait(jacketOf(mech.face, dyes), 14) : null,
                label(
                  mech ? `Mechanic: ${mech.title}` : 'No mechanic on this ship'
                )
              )
            ),
            !r.you &&
              terms([
                ['Wage a race', r.wage],
                ['Ends', r.ends],
              ]),
            r.tags.length > 0 && label(r.tags.join(' · '), 'rs-traits'),
            r.you
              ? label('You sail her yourself.', 'rs-note rs-foot')
              : el('div', 'rs-foot', renew(r, to.offer)),
          ],
          { cls }
        );
      };
      const drivers = under(v, 'Drivers');
      const ships = drivers.filter(
          (r) => r.post !== 'Reserve' && r.kind === 'person'
        ),
        rest = drivers.filter((r) => !ships.includes(r));
      root.replaceChildren(
        ...ships.map((r) => card(r)),
        el(
          'div',
          'rs-col',
          ...rest.map((r) => card(r, 'rs-grow')),
          sheet('Negotiations', [
            label('Looking for new drivers?', 'rs-note'),
            button('Scouting', to.market, { kind: 'plain' }),
          ])
        )
      );
    },
  };
}

/** Her staff: the mechanics a row, then the designer, the scouts, the open posts and the market. */
export function createStaff(office: Office): Screen<Dyed<TeamView>> {
  kitLooks();
  stylesheet(CSS);
  const root = el('div', 'cr rs rs-staff s-staff');
  const to = asks(office);
  return {
    el: root,
    show({ view: v, dyes }) {
      const drivers = under(v, 'Drivers');
      const card = (r: RosterRow, role: string) => {
        const one = ONE[role] ?? role;
        if (r.kind === 'open')
          return sheet(one, [
            el('div', 'rs-open', label('No one holds this post.')),
            button(`Find a ${one}`, to.find(r)),
          ]);
        const details = to.profile(r.id);
        const mate = drivers.find(
          (d) => d.post === r.post && d.kind === 'person'
        );
        return sheet(
          one,
          [
            el(
              'div',
              'rs-who',
              face(r, dyes, 34, role),
              el(
                'div',
                '',
                name(r.title),
                label(`Age ${r.age}`),
                r.stars && stars(r.stars.lo, r.stars.hi, 9)
              )
            ),
            role === 'Mechanics'
              ? bondOf(
                  v,
                  r.post,
                  label(
                    mate
                      ? `Chemistry with ${mate.title.replace(' (you)', '')}`
                      : `No driver sails ${r.post}`
                  )
                )
              : morale(r.morale),
            terms([
              ['Wage a race', r.wage],
              ['Ends', r.ends],
            ]),
            el(
              'div',
              'rs-pair',
              details && button('Details', details, { kind: 'plain' }),
              renew(r, to.offer)
            ),
          ],
          { aside: role === 'Mechanics' ? r.post : undefined }
        );
      };
      root.replaceChildren(
        ...['Mechanics', 'Designer', 'Scouts'].flatMap((role) =>
          under(v, role).map((r) => card(r, role))
        ),
        sheet('Negotiations', [
          el('div', 'rs-open', label('Looking for new staff?')),
          button('Scouting', to.market, { kind: 'plain' }),
        ])
      );
    },
  };
}

/** Her team's ledger: what it costs, the chairman and the open posts; everyone on the books; the pit crew. */
export function createTeam(office: Office): Screen<Dyed<TeamView>> {
  kitLooks();
  stylesheet(CSS);
  const root = el('div', 'cr rs rs-team s-team');
  const to = asks(office);
  return {
    el: root,
    show({ view: v, dyes }) {
      const lines = v.wages.explain?.lines ?? [],
        income = lines.find((l) => l.label === 'Income a race'),
        roles = lines.filter((l) => l !== income);
      const chairman = under(v, 'Chairman')[0];
      const books = ['Drivers', 'Mechanics', 'Designer', 'Scouts'].flatMap(
        (role) => under(v, role).map((r) => ({ role, r }))
      );
      root.replaceChildren(
        el(
          'div',
          'rs-col',
          sheet('Wages a Race', [
            el(
              'div',
              'rs-sum',
              fig(v.wages.text, 'l'),
              income && label(`against ${income.amount} coming in a race`)
            ),
            terms(roles.map((l) => [l.label, l.amount])),
          ]),
          chairman &&
            sheet('The Chairman', [
              el(
                'div',
                'rs-who',
                portrait(jacketOf(chairman.face, dyes), 30),
                el(
                  'div',
                  '',
                  name(chairman.title),
                  label(`Age ${chairman.age}`)
                )
              ),
            ]),
          sheet(
            'Open Posts',
            [
              v.open.length === 0
                ? label('Every post is filled.')
                : el(
                    'div',
                    'rs-posts cr-terms',
                    ...under(v, 'Drivers')
                      .concat(
                        under(v, 'Mechanics'),
                        under(v, 'Designer'),
                        under(v, 'Scouts'),
                        under(v, 'Pit crew')
                      )
                      .filter((r) => r.kind === 'open')
                      .map((r) =>
                        el(
                          'div',
                          '',
                          label(r.title),
                          button('Find', to.find(r), { kind: 'plain' })
                        )
                      )
                  ),
            ],
            { cls: 'rs-grow' }
          )
        ),
        sheet(
          'On the Books',
          [
            table(
              [
                {
                  head: 'Name',
                  track: '1fr',
                  cell: ({ r }) =>
                    r.kind === 'open' ? label('Vacant') : r.title,
                },
                {
                  head: 'Post',
                  track: u(34),
                  cell: ({ r }) => (r.kind === 'open' ? 'Open' : r.post),
                },
                {
                  head: 'Stars',
                  track: u(48),
                  cell: ({ r }) =>
                    r.stars &&
                    el('span', 'rs-stars', stars(r.stars.lo, r.stars.hi, 8)),
                },
                {
                  head: 'Morale',
                  track: u(26),
                  num: true,
                  cell: ({ r }) =>
                    r.morale === null
                      ? ''
                      : el(
                          'span',
                          r.morale < 25 ? 'rs-harm' : '',
                          String(r.morale)
                        ),
                },
                {
                  head: 'Wage',
                  track: u(30),
                  num: true,
                  cell: ({ r }) => (r.kind === 'open' ? '' : r.wage),
                },
              ],
              books,
              {
                own: ({ r }) => r.you,
                group: ({ role }) => role,
                tap: ({ r }) =>
                  r.kind === 'open'
                    ? to.find(r)
                    : r.you
                      ? null
                      : to.profile(r.id),
                scrolls: { keep: 'books' },
              }
            ),
          ],
          { cls: 'rs-grow' }
        ),
        el(
          'div',
          'rs-col',
          sheet(
            'Pit Crew',
            [
              table(
                [
                  { head: 'Name', track: '1fr', cell: (p) => p.name },
                  {
                    head: 'Work',
                    track: u(22),
                    num: true,
                    cell: (p) => p.work.text,
                  },
                  {
                    head: 'Slip',
                    track: u(18),
                    num: true,
                    cell: (p) => p.slip.text,
                  },
                  {
                    head: 'Tired',
                    track: u(20),
                    num: true,
                    cell: (p) => p.fatigue.text,
                  },
                ],
                v.pit,
                {
                  tap: (p) => to.profile(p.id),
                  scrolls: { keep: 'pit' },
                  none: 'No pit crew.',
                }
              ),
            ],
            { cls: 'rs-grow' }
          ),
          sheet('Pit Stops', [
            table(
              [
                {
                  head: 'Ship',
                  track: '1fr',
                  cell: (s) => `Ship ${s.ship + 1}`,
                },
                {
                  head: 'Stop',
                  track: u(26),
                  num: true,
                  cell: (s) => s.pace.text,
                },
                {
                  head: 'Slip',
                  track: u(20),
                  num: true,
                  cell: (s) => s.slip.text,
                },
              ],
              v.stops
            ),
          ])
        )
      );
    },
  };
}
