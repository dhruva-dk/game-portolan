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
import type { RosterRow, TeamView } from '../../office/people.ts';
import { button } from '../chartroom/controls.ts';
import { gauge, stepped, table, terms } from '../chartroom/data.ts';
import { fig, label, portrait, stars } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { personCard, who } from '../chartroom/person.ts';
import { sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import type { Glyph } from '../glyphs.ts';
import { el, type Kid } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { jacketOf, morale, moraleCell, whoOf } from './faces.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.rs-mate { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
.rs-mate > .cr-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rs-said { text-align: center; }
.rs-open { flex: 1; display: grid; place-items: center; text-align: center; }
.rs-sum { display: flex; flex-direction: column; align-items: center; gap: var(--s1); padding: var(--s2) 0; }
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

/** Each staff role's woodcut, worn on the portrait. */
const BADGE: Readonly<Record<string, Glyph>> = {
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

/** The bond of the ship `post`: who it is with, the track of its levels, what it stands at. */
function bondOf(v: TeamView, post: string, mate: Kid) {
  const b = v.bonds.find((x) => x.label === post);
  if (!b) return null;
  return el(
    'div',
    'cr-gauge',
    mate,
    gauge(
      b.bond.value === 1 ? '1 race' : `${b.bond.value} races`,
      b.bond.text,
      stepped(b.fill / 100, b.marks, b.level)
    )
  );
}

/** Renew, shut with its reason under it where it may not be. */
const renew = (r: RosterRow, go: (id: number) => () => void) =>
  r.id !== null &&
  r.renew &&
  button('Renew Contract', go(r.id), { off: r.renew.ok ? null : r.renew.why });

/** An open post's card: no one holds it, and the way to find one. */
const vacant = (post: string, one: string, find: () => void, cls = '') =>
  sheet(
    post,
    [
      el('div', 'rs-open', label('No one holds this post.')),
      button(`Find a ${one}`, find),
    ],
    { cls }
  );

/** The way to the market, after MM's negotiations panel. */
const market = (asking: string, go: () => void) =>
  sheet('Negotiations', [
    el('div', 'rs-open', label(asking)),
    button('Scouting', go, { kind: 'plain' }),
  ]);

/** Her drivers: a card a ship, the reserve and the market in the last column. */
export function createDrivers(office: Office): Screen<Dyed<TeamView>> {
  kitLooks();
  stylesheet(CSS);
  const root = page({ cols: 5, rows: 1 }, 's-drivers');
  const to = asks(office);
  return {
    el: root,
    show({ view: v, dyes }) {
      const mechanics = under(v, 'Mechanics');
      const card = (r: RosterRow, cls = '') => {
        if (r.kind === 'open')
          return vacant(r.title, 'Driver', to.find(r), cls);
        const details = to.profile(r.id),
          mech = mechanics.find(
            (m) => m.post === r.post && m.kind === 'person'
          );
        return personCard(
          r.post,
          whoOf(r, dyes, r.you ? `Age ${r.age} · the manager` : `Age ${r.age}`),
          [
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
            r.tags.length > 0 && label(r.tags.join(' · '), 'rs-said'),
          ],
          [r.you ? label('You sail her yourself.') : renew(r, to.offer)],
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
        column(
          ...rest.map((r) => card(r, 'cr-grow')),
          market('Looking for new drivers?', to.market)
        )
      );
    },
  };
}

/** Her staff: the mechanics a row, then the designer, the scouts, the open posts and the market. */
export function createStaff(office: Office): Screen<Dyed<TeamView>> {
  kitLooks();
  stylesheet(CSS);
  const root = page({ cols: 4, rows: 2 }, 's-staff');
  const to = asks(office);
  return {
    el: root,
    show({ view: v, dyes }) {
      const drivers = under(v, 'Drivers');
      const card = (r: RosterRow, role: string) => {
        const one = ONE[role] ?? role;
        if (r.kind === 'open') return vacant(one, one, to.find(r));
        const details = to.profile(r.id),
          mate = drivers.find((d) => d.post === r.post && d.kind === 'person');
        return personCard(
          one,
          whoOf(r, dyes, `Age ${r.age}`, BADGE[role]),
          [
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
          ],
          [
            details && button('Details', details, { kind: 'plain' }),
            renew(r, to.offer),
          ],
          {
            way: 'beside',
            pair: true,
            aside: role === 'Mechanics' ? r.post : undefined,
          }
        );
      };
      root.replaceChildren(
        ...['Mechanics', 'Designer', 'Scouts'].flatMap((role) =>
          under(v, role).map((r) => card(r, role))
        ),
        market('Looking for new staff?', to.market)
      );
    },
  };
}

/** Her team's ledger: what it costs, the chairman and the open posts; everyone on the books; the pit crew. */
export function createTeam(office: Office): Screen<Dyed<TeamView>> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-team');
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
      const open = ['Drivers', 'Mechanics', 'Designer', 'Scouts', 'Pit crew']
        .flatMap((role) => under(v, role))
        .filter((r) => r.kind === 'open');
      root.replaceChildren(
        column(
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
              who(
                {
                  ...whoOf(chairman, dyes, `Age ${chairman.age}`),
                  stars: null,
                },
                30,
                'beside'
              ),
            ]),
          sheet(
            'Open Posts',
            [
              open.length === 0
                ? label('Every post is filled.')
                : el(
                    'div',
                    'rs-posts cr-terms',
                    ...open.map((r) =>
                      el(
                        'div',
                        '',
                        label(r.title),
                        button('Find', to.find(r), { kind: 'plain' })
                      )
                    )
                  ),
            ],
            { cls: 'cr-grow' }
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
                  cell: ({ r }) => moraleCell(r.morale),
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
          { cls: 'cr-grow' }
        ),
        column(
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
            { cls: 'cr-grow' }
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
