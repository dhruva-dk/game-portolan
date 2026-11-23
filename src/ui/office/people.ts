// The people of her team, each screen laid out as its like in the manager's
// office is. Drivers: a card a driver (portrait, age, name, stars, the way to
// their details, their morale, their contract and its renewal), the way to the
// scouts at the right. Staff: a card each for the mechanics, the designer and
// the scouts (who, their contract, and for a mechanic the bond with the driver
// they work beside), the open posts at the right. Team: the team and her ship
// over the chairman, the key staff in a list, what they cost and the pit crew.
// And a person's profile: who they are, their contract and what may be done
// about it over their morale; their stats and traits; what they draw and the
// seasons behind them.

import type { Dyed } from '../../office/papers.ts';
import type { RosterRow, TeamView } from '../../office/people.ts';
import { emblem } from '../emblem.ts';
import { button } from '../kit/button.ts';
import { band, panel } from '../kit/panel.ts';
import { el, pressed, styled, type Kid } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { meter, tag } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import { bitsStyle, jacketOf, lines, ranged } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.pp-terms { flex: none; display: flex; flex-direction: column; }
.pp-terms > div { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0 8px;
  padding: 4px 6px; border-bottom: 1px solid var(--rule); }
.pp-terms span { font-size: 14px; font-style: italic; color: var(--faint); }
.pp-terms b { margin-left: auto; font-weight: 600; text-align: right; }
.pp-id { flex: none; display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; }
.pp-id > i, .pp-who i { font-size: 13px; color: var(--faint); }
.pp-who { flex: none; display: flex; align-items: center; gap: 12px; min-width: 0; }
.pp-who > div:last-child { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
.pp-note { font-size: 14px; font-style: italic; color: var(--faint); text-align: center; }
.pp-side { align-self: start; }
.pp-side > .k-head { padding-left: 8px; padding-right: 8px; white-space: normal; }
.pp-side > .k-body { gap: 8px; text-align: center; }

.s-drivers { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; padding: 12px 18px; align-content: start; }
.pp-driver > .k-head { padding-left: 8px; padding-right: 8px; }
.pp-driver > .k-body { gap: 7px; padding: 0 8px 10px; }
.pp-driver .k-btn { padding: 0 6px; }
.pp-morale { display: flex; align-items: center; gap: 8px; padding: 0 4px; }
.pp-morale > .k-meter { flex: 1; }

.s-staff { display: grid; grid-template-columns: 1fr 200px; gap: 8px; padding: 12px 18px; align-content: start; }
.pp-cards { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 8px; min-width: 0; }
.pp-staff > .k-body { gap: 5px; padding-bottom: 8px; }
.pp-staff .k-btn { padding: 0 8px; }
.pp-staff .d-name { font-size: 17px; }
.pp-staff .pp-terms > div { padding: 3px 1px; gap: 0 4px; }
.pp-staff .pp-terms b, .pp-driver .pp-terms b { font-size: 15px; }
.pp-chem { flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0 4px; }
.pp-chem > span { max-width: 100%; font-size: 14px; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-chem > .k-meter { align-self: stretch; }

.s-team { display: grid; grid-template-columns: 320px 1fr 340px; gap: 10px; padding: 12px 18px; }
.s-team > div { display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
.s-team .grow { flex: 1; }
.pp-flat { flex: none; }
.pp-crest { flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 8px 4px; }
.pp-crest > b { font: 700 26px/1.1 var(--serif); letter-spacing: .03em; text-align: center; }
.pp-ship { position: relative; flex: 1; min-height: 0; border: 1.5px solid var(--ink);
  box-shadow: 0 2px 0 var(--shade), inset 0 0 0 3px var(--panel), inset 0 0 0 4px var(--line); }
.pp-ship > .o-subject { position: absolute; left: 0; right: 0; top: 50%; height: 210px; margin-top: -113px; pointer-events: none; }
.pp-key > .k-body { padding: 0 6px 6px; }
.pp-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.pp-row { flex: none; height: 46px; display: flex; align-items: center; gap: 10px; padding: 0 10px; border-bottom: 1px solid var(--rule); }
.pp-row > span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pp-row > span > b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-row.own { background: var(--gilt); }
.pp-wages > .k-body { gap: 6px; }
.pp-pit > .k-body { gap: 6px; padding: 0 6px 10px; }
.pp-stops { flex: none; display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; }
.pp-stops > div { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; background: var(--dark); }
.pp-stops span { font-size: 13px; font-style: italic; color: var(--faint); }
.pp-big { text-align: center; font: italic 500 30px/1 var(--serif); }
`;

/** `made`, of the classes `cls` too (a panel's place on its screen). */
const of = <T extends Element>(made: T, cls: string) => {
  made.classList.add(...cls.split(' '));
  return made;
};

/** Names and their values, a ruled line each, a long value falling under its name. */
const terms = (rows: readonly (readonly [string, Kid])[]) =>
  el(
    'div',
    'pp-terms',
    ...rows.map(([name, value]) =>
      el('div', '', el('span', '', name), el('b', '', value))
    )
  );

/** One of a role, by the roster's heading for it. */
const ONE: Readonly<Record<string, string>> = {
  Drivers: 'Driver',
  Mechanics: 'Mechanic',
  Designer: 'Designer',
  Scouts: 'Scout',
};

/** The roster's people under the heading `title` (to the next heading). */
function under(v: TeamView, title: string): RosterRow[] {
  const from = v.roster.findIndex(
    (r) => r.kind === 'head' && r.title === title
  );
  if (from < 0) return [];
  const rest = v.roster.slice(from + 1),
    to = rest.findIndex((r) => r.kind === 'head');
  return to < 0 ? rest : rest.slice(0, to);
}

/** Her drivers. */
export function createDrivers(office: Office): Screen<Dyed<TeamView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 's-drivers');
  const scouting = () => office.ask({ kind: 'open', screen: 'scouting' });
  return {
    el: root,
    show({ view, dyes }) {
      root.replaceChildren(
        ...under(view, 'Drivers').map((r) => {
          const id = r.id,
            details = () => {
              if (id !== null)
                office.ask({ kind: 'person', id, screen: 'profile' });
            };
          const who = el(
            'div',
            'pp-id',
            portrait(jacketOf(r.face, dyes), 84),
            r.age !== '' && el('i', '', `Age ${r.age}`),
            el('div', 'd-name', r.kind === 'open' ? 'Vacant' : r.title),
            ranged(r.stars, 18)
          );
          return of(
            panel(r.kind === 'open' ? r.title : r.post, [
              id !== null && !r.you ? pressed(who, details) : who,
              id !== null &&
                !r.you &&
                button('Driver Details', details, { wide: true }),
              r.morale !== null && band('Morale'),
              r.morale !== null &&
                el(
                  'div',
                  'pp-morale',
                  meter(r.morale / 100, 'good'),
                  el('b', '', r.morale)
                ),
              r.kind === 'person' && band('Contract Details'),
              r.you && el('div', 'pp-note', 'The manager sails her.'),
              r.kind === 'person' &&
                !r.you &&
                terms([
                  ['Status', r.post],
                  ['Wage', r.wage],
                  ['Ends', r.ends],
                ]),
              id !== null &&
                !r.you &&
                button(
                  'Renew Contract',
                  () => office.ask({ kind: 'person', id, screen: 'offer' }),
                  { kind: 'on', wide: true }
                ),
              r.kind === 'open' &&
                el('div', 'pp-note', 'No driver holds this post.'),
              r.kind === 'open' && button('Scouting', scouting, { wide: true }),
            ]),
            'pp-driver'
          );
        }),
        of(
          panel('Driver Negotiations', [
            el('div', 'pp-note', 'Looking for new drivers?'),
            button('Scouting', scouting, { wide: true, before: 'scouting' }),
          ]),
          'pp-side pp-driver'
        )
      );
    },
  };
}

/** Her staff: a card each for the mechanics, the designer and the scouts. */
export function createStaff(office: Office): Screen<Dyed<TeamView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 's-staff');
  const scouting = () => office.ask({ kind: 'open', screen: 'scouting' });
  return {
    el: root,
    show({ view, dyes }) {
      const drivers = under(view, 'Drivers');
      const cards = ['Mechanics', 'Designer', 'Scouts'].flatMap((role) =>
        under(view, role).map((r) => {
          const id = r.id,
            one = ONE[role] ?? role;
          // a mechanic's bond is with the driver of the ship they work on
          const bond =
              role === 'Mechanics' && r.kind === 'person'
                ? view.bonds.find((b) => b.label === r.post)
                : undefined,
            mate = drivers.find((d) => d.post === r.post),
            together = bond?.bond.explain?.lines[0];
          return of(
            panel(one, [
              el(
                'div',
                'pp-who',
                portrait(jacketOf(r.face, dyes), 64),
                el(
                  'div',
                  '',
                  el(
                    'i',
                    '',
                    r.kind === 'open'
                      ? 'Open post'
                      : `Age ${r.age}${r.post === one ? '' : ` · ${r.post}`}`
                  ),
                  el('div', 'd-name', r.kind === 'open' ? 'Vacant' : r.title),
                  ranged(r.stars, 18)
                )
              ),
              el(
                'div',
                'b-row',
                id !== null &&
                  button('Details', () =>
                    office.ask({ kind: 'person', id, screen: 'profile' })
                  ),
                // (a card a ship leaves no room to name the role sought)
                button('Scouting', scouting)
              ),
              r.kind === 'person' && band('Contract Details'),
              r.kind === 'person' &&
                terms([
                  ['Wage', r.wage],
                  ['Ends', r.ends],
                ]),
              bond && band('Relationship with Driver'),
              bond &&
                el(
                  'div',
                  'pp-chem',
                  el(
                    'span',
                    '',
                    mate
                      ? `Chemistry with ${mate.title.replace(' (you)', '')}`
                      : `No driver sails ${bond.label}`
                  ),
                  tag(
                    together
                      ? `${together.amount} races together`
                      : bond.bond.text,
                    'go'
                  ),
                  meter(bond.fill / 100, 'go')
                ),
              bond && terms([['Bond', bond.bond.text]]),
            ]),
            'pp-staff'
          );
        })
      );
      // the mechanics in a row, a ship each; the designer and the scouts under them
      root.replaceChildren(
        styled(el('div', 'pp-cards', ...cards), {
          '--cols': String(Math.max(4, under(view, 'Mechanics').length)),
        }),
        of(
          panel('Staff Negotiations', [
            el('div', 'pp-note', 'Looking for new staff?'),
            button('Scouting', scouting, { wide: true, before: 'scouting' }),
            view.open.length > 0 && band('Open Posts'),
            ...view.open.map((o) => el('div', '', o.label)),
          ]),
          'pp-side'
        )
      );
    },
  };
}

/** Her team: the team and her ship over the chairman, the key staff, what they cost and the pit crew. */
export function createTeam(office: Office): Screen<Dyed<TeamView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 's-team');
  return {
    el: root,
    show({ view, dyes }) {
      const chairman = under(view, 'Chairman')[0];
      root.replaceChildren(
        el(
          'div',
          '',
          of(
            panel(null, [
              el(
                'div',
                'pp-crest',
                emblem(view.top.emblem, jacketOf(view.top.face, dyes), 64),
                el('b', '', view.top.team)
              ),
            ]),
            'pp-flat'
          ),
          // her ship herself, at anchor off the harbour: the world through the page
          el('div', 'pp-ship o-window', el('div', 'o-subject')),
          chairman &&
            of(
              panel('The Chairman', [
                el(
                  'div',
                  'pp-who',
                  portrait(jacketOf(chairman.face, dyes), 72),
                  el(
                    'div',
                    '',
                    el('i', '', `Age ${chairman.age}`),
                    el('div', 'd-name', chairman.title),
                    ranged(chairman.stars, 18)
                  )
                ),
              ]),
              'pp-flat'
            )
        ),
        of(
          panel('Key Staff', [
            el(
              'div',
              'pp-list',
              ...['Drivers', 'Mechanics', 'Designer', 'Scouts'].flatMap(
                (role) => [
                  band(role),
                  ...under(view, role).map((r) => {
                    const id = r.id;
                    const row = el(
                      'div',
                      `pp-row${r.you ? ' own' : ''}`,
                      portrait(jacketOf(r.face, dyes), 36),
                      el(
                        'span',
                        '',
                        el('b', '', r.kind === 'open' ? 'Vacant' : r.title),
                        el(
                          'i',
                          '',
                          r.kind === 'open'
                            ? r.title
                            : `Age ${r.age} · ${r.post}`
                        )
                      ),
                      ranged(r.stars, 17)
                    );
                    return id !== null && !r.you
                      ? pressed(row, () =>
                          office.ask({ kind: 'person', id, screen: 'profile' })
                        )
                      : row;
                  }),
                ]
              )
            ),
          ]),
          'pp-key'
        ),
        el(
          'div',
          '',
          of(
            panel('Wages a Race', [
              el('div', 'pp-big', view.wages.text),
              lines(
                view.wages.explain?.lines.map((l) => [l.label, l.amount]) ?? []
              ),
            ]),
            'pp-flat pp-wages'
          ),
          of(
            panel('Pit Crew', [
              table(
                [
                  { label: 'Name', width: '1fr', cell: (r) => r.name },
                  {
                    label: 'Work',
                    width: '46px',
                    num: true,
                    cell: (r) => r.work.text,
                  },
                  {
                    label: 'Slip',
                    width: '46px',
                    num: true,
                    cell: (r) => r.slip.text,
                  },
                  {
                    label: 'Fatigue',
                    width: '54px',
                    num: true,
                    cell: (r) => r.fatigue.text,
                  },
                ],
                view.pit,
                { height: 34, keep: 'pit' }
              ),
              band('Pit Stop Time'),
              el(
                'div',
                'pp-stops',
                ...view.bonds.map((b) =>
                  el(
                    'div',
                    '',
                    el('span', '', b.label),
                    el(
                      'b',
                      '',
                      view.stops.find((s) => s.ship === b.ship)?.pace.text ??
                        '—'
                    )
                  )
                )
              ),
            ]),
            'grow pp-pit'
          )
        )
      );
    },
  };
}
