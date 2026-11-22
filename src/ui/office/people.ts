// The people of her team. Drivers: a card each for those who sail her ships
// and her reserve (portrait, post, age, stars, morale, wage, contract), a tap
// opening the driver's profile. Staff: everyone else on the roster in a table,
// an open post leading to the scouting list that fills it. Team: what the
// team's people cost a race, each ship's driver and mechanic and how they get
// on, and the pit crew. And a person's profile: who they are, their stats, their
// contract, and what may be done (scout, offer, renew, dismiss).

import type { Dyed } from '../../office/papers.ts';
import type { ProfileView, RosterRow, TeamView } from '../../office/people.ts';
import { button } from '../kit/button.ts';
import { panel } from '../kit/panel.ts';
import { el } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { meter, tag, tile, tiles } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import { acted, bitsStyle, jacketOf, lines, ranged, who } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-drivers { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; padding: 12px 18px; align-content: start; }
.d-card > .k-body { align-items: center; gap: 8px; padding-top: 12px; text-align: center; }
.d-card .b-lines { align-self: stretch; text-align: left; grid-template-columns: auto 1fr; font-size: 14px; }
.d-card .k-meter { align-self: stretch; }
.s-staff, .s-team { grid-template-columns: 1fr; }
.s-team { grid-template-columns: 420px 1fr; }
.s-profile { grid-template-columns: 300px 1fr 320px; }
.s-profile .k-body { gap: 8px; }
`;

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
  return {
    el: root,
    show({ view, dyes }) {
      root.replaceChildren(
        ...under(view, 'Drivers').map((r) => {
          const id = r.id;
          const card = panel(r.post, [
            portrait(jacketOf(r.face, dyes), 96),
            el('div', 'd-name', r.kind === 'open' ? 'Vacant' : r.title),
            ranged(r.stars, 18),
            r.morale !== null && meter(r.morale / 100, 'good'),
            lines([
              ['Age', r.age],
              ['Wage', r.wage],
              ['Contract', r.ends],
            ]),
            id !== null && !r.you
              ? button(
                  'Driver Details',
                  () => office.ask({ kind: 'person', id, screen: 'profile' }),
                  { wide: true }
                )
              : r.kind === 'open' &&
                button(
                  'Scouting',
                  () => office.ask({ kind: 'open', screen: 'scouting' }),
                  { wide: true }
                ),
          ]);
          card.classList.add('d-card');
          return card;
        })
      );
    },
  };
}

/** Her staff: everyone on the roster who does not sail. */
export function createStaff(office: Office): Screen<Dyed<TeamView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-staff');
  return {
    el: root,
    show({ view, dyes }) {
      const at = view.roster.findIndex(
        (r) => r.kind === 'head' && r.title === 'Mechanics'
      );
      const rows = view.roster
        .slice(Math.max(0, at))
        .filter((r) => r.kind !== 'head');
      root.replaceChildren(
        panel('Staff', [
          table<RosterRow>(
            [
              {
                label: 'Name',
                width: '1.4fr',
                cell: (r) =>
                  r.kind === 'open' ? 'Vacant' : who(r.face, dyes, r.title),
              },
              { label: 'Job', width: '1fr', cell: (r) => r.post || r.title },
              { label: 'Age', width: '50px', num: true, cell: (r) => r.age },
              { label: 'Rating', width: '100px', cell: (r) => ranged(r.stars) },
              { label: 'Wage', width: '110px', num: true, cell: (r) => r.wage },
              { label: 'Contract', width: '130px', cell: (r) => r.ends },
            ],
            rows,
            {
              height: 44,
              keep: 'staff',
              pick(r) {
                if (r.id !== null)
                  office.ask({ kind: 'person', id: r.id, screen: 'profile' });
                else office.ask({ kind: 'open', screen: 'scouting' });
              },
            }
          ),
        ])
      );
    },
  };
}

/** Her team: its wages, its ships' pairs, its pit crew. */
export function createTeam(): Screen<Dyed<TeamView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-team');
  return {
    el: root,
    show({ view, dyes }) {
      root.replaceChildren(
        el(
          'div',
          'b-col',
          panel('Wages', [
            el('div', 'b-big', view.wages.text),
            lines(
              view.wages.explain?.lines.map((l) => [l.label, l.amount]) ?? []
            ),
          ]),
          panel('Ships', [
            lines(
              view.bonds.flatMap((b) => [
                [b.label, b.bond.text] as const,
                ...view.stops
                  .filter((s) => s.ship === b.ship)
                  .map((s) => ['Pit Stop', s.pace.text] as const),
              ])
            ),
          ])
        ),
        panel('Pit Crew', [
          table(
            [
              {
                label: 'Name',
                width: '1.4fr',
                cell: (r) => who(r.face, dyes, r.name),
              },
              {
                label: 'Work',
                width: '90px',
                num: true,
                cell: (r) => r.work.text,
              },
              {
                label: 'Slip',
                width: '90px',
                num: true,
                cell: (r) => r.slip.text,
              },
              {
                label: 'Fatigue',
                width: '90px',
                num: true,
                cell: (r) => r.fatigue.text,
              },
            ],
            view.pit,
            { height: 44, keep: 'pit' }
          ),
        ])
      );
    },
  };
}

/** A person's profile. */
export function createProfile(office: Office): Screen<Dyed<ProfileView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-profile');
  return {
    el: root,
    show({ view: v, dyes }) {
      const { id } = v;
      root.replaceChildren(
        panel(v.roleName, [
          el(
            'div',
            'p-top',
            portrait(jacketOf(v.face, dyes), 120),
            el('div', 'd-name', v.name),
            ranged(v.stars, 20),
            el('div', 'p-tags', ...v.traits.map((t) => tag(t, 'go', 'boxed')))
          ),
          lines([
            ['Age', v.age],
            ['From', v.colony],
            ['Team', v.team],
            ['Job', v.post],
            ['Potential', ranged(v.potential)],
            ...(v.morale ? [['Morale', v.morale.text] as const] : []),
            ['Marketability', v.marketability.text],
          ]),
        ]),
        panel('Stats', [
          v.stats.length > 0
            ? tiles(v.stats.map((s) => tile(s.label, Math.round(s.value))))
            : el('div', 'b-faint', v.statsNote),
          lines(v.specifics.map((s) => [s.label, s.figure.text])),
        ]),
        el(
          'div',
          'b-col',
          panel(v.contract?.title ?? 'Contract', [
            lines(v.contract?.terms.map((l) => [l.label, l.amount]) ?? []),
            v.talk !== null && el('div', 'b-faint', v.talk),
          ]),
          !v.you &&
            panel(null, [
              el('div', '', ''),
              acted(v.scout.label || 'Scout', v.scout, () => {
                if (v.scout.scout !== null)
                  office.ask({
                    kind: 'send',
                    command: {
                      kind: 'StartScout',
                      scout: v.scout.scout,
                      person: id,
                    },
                  });
              }),
              acted(
                v.mine ? 'Renew Contract' : 'Offer Contract',
                v.mine ? v.renew : v.offer,
                () => office.ask({ kind: 'person', id, screen: 'offer' }),
                'on'
              ),
              v.mine &&
                acted(
                  `Dismiss (${v.dismiss.owed.text})`,
                  v.dismiss,
                  () =>
                    office.ask({
                      kind: 'send',
                      command: { kind: 'Dismiss', person: id },
                    }),
                  'danger'
                ),
            ])
        )
      );
    },
  };
}
