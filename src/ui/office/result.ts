// A race's result on the chartroom kit, after MM's podium, team report and
// results (042–044). In the broad column the podium under the race's name (the
// first three over their plinths, each with their team and what they scored),
// then how every ship finished: where, who sailed her and for whom, what she
// sank, her stops, when she sank, her points; the podium ruled off, her team's
// own lines gilt. At the right the team's report (a line to each of her
// drivers: what they did, where they came, what they scored) and the
// chairman's (the place expected of the team, where it stands, the verdict).

import type { ResultLine, ResultView } from '../../office/loop.ts';
import { link } from '../chartroom/controls.ts';
import { table, terms } from '../chartroom/data.ts';
import { fig, label, place } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { paper, sheet } from '../chartroom/paper.ts';
import { podium, who } from '../chartroom/person.ts';
import { u } from '../chartroom/tokens.ts';
import { emblem } from '../emblem.ts';
import { el, ordinal } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { toPerson, toTeam } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.rs-stood { flex: none; }
.rs-team { display: inline-flex; align-items: center; gap: var(--s2); min-width: 0; max-width: 100%; }
.rs-team > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rs-afloat { font-style: italic; color: var(--good); }
.rs-mine { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--s3);
  padding: var(--s2) 0; border-bottom: var(--w-fine) solid var(--rule); }
.rs-came { display: flex; flex-direction: column; align-items: center; gap: ${u(1)}; }
.rs-verdict { align-self: center; margin-top: var(--s2); padding: var(--s2) var(--s5); font: 700 var(--t-name)/1 var(--face);
  letter-spacing: .14em; text-transform: uppercase; }
.rs-verdict.on { color: var(--on-ink); }
`;

/** Minutes and seconds of a race's clock. */
const clock = (second: number) =>
  `${Math.floor(second / 60)}:${String(Math.floor(second % 60)).padStart(2, '0')}`;

/** The paper a verdict is stamped on, by its mood: good and bad inked solid, a warning washed, else plain. */
const STAMP = {
  good: 'good',
  bad: 'harm',
  warn: 'warn',
  fair: 'paper-raised',
} as const;

/** A race's result: the podium and how they finished, the team's report and the chairman's. */
export function createResult(office: Office): Screen<ResultView> {
  kitLooks();
  stylesheet(CSS);
  const root = page('aside', 's-result'),
    profile = toPerson(office),
    teamPage = toTeam(office);
  /** A team as a line names it: its emblem, its name, opening its page. */
  const teamOf = (r: ResultLine) =>
    el(
      'span',
      'rs-team',
      emblem(r.team.emblem, r.team.colours, 14),
      el('span', '', link(r.team.name, teamPage(r.team.id)))
    );
  /** A driver's name, opening their profile (an empty berth's opens nothing). */
  const named = (r: ResultLine) => {
    const go = profile(r.person);
    return go ? link(r.driver, go) : r.driver;
  };
  return {
    el: root,
    show(v) {
      const of = v.lines.length;
      const stood = sheet(
        v.title,
        [
          podium(
            v.lines
              .slice(0, 3)
              .map((r) => ({
                who: {
                  jacket: r.team.colours,
                  name: named(r),
                  said: teamOf(r),
                },
                scored: fig(`+${r.points} pts`, 's'),
              }))
          ),
        ],
        { aside: 'The podium', cls: 'rs-stood' }
      );
      const finished = sheet(
        'How They Finished',
        [
          table<ResultLine>(
            [
              { head: '', track: u(12), num: true, cell: (r) => r.place },
              {
                head: 'Driver',
                track: '1fr',
                cell: (r) => (r.person === null ? r.driver : link(r.driver)),
              },
              { head: 'Team', track: '1.2fr', cell: teamOf },
              {
                head: 'Sank',
                track: u(26),
                num: true,
                cell: (r) => r.sinkings || '–',
              },
              { head: 'Stops', track: u(26), num: true, cell: (r) => r.stops },
              {
                head: 'Sunk at',
                track: u(34),
                num: true,
                cell: (r) =>
                  r.second === null
                    ? el('i', 'rs-afloat', 'Afloat')
                    : clock(r.second),
              },
              {
                head: 'Points',
                track: u(30),
                num: true,
                cell: (r) => r.points || '–',
              },
            ],
            v.lines,
            {
              own: (r) => r.own,
              cut: (r) => r.place === 3,
              tap: (r) => profile(r.person),
              scrolls: { keep: 'result' },
            }
          ),
        ],
        { aside: `${of} ships`, cls: 'cr-grow' }
      );
      // (from the winner down, not from her own line)
      finished.querySelector('.cr-rows')?.removeAttribute('data-top');

      const report = sheet(
        'Team Report',
        v.lines
          .filter((r) => r.own)
          .map((r) =>
            el(
              'div',
              'rs-mine',
              who(
                {
                  jacket: r.team.colours,
                  name: named(r),
                  said: `Sank ${r.sinkings} · ${r.stops} ${r.stops === 1 ? 'stop' : 'stops'} · ${
                    r.second === null ? 'afloat' : `sunk ${clock(r.second)}`
                  }`,
                },
                34,
                'beside'
              ),
              el(
                'div',
                'rs-came',
                place(r.place, of, 26),
                label(`+${r.points} pts`)
              )
            )
          ),
        { aside: `${v.points} pts`, cls: 'cr-grow' }
      );

      const fill = STAMP[v.standing.mood];
      const chairman = sheet('The Chairman', [
        terms([
          ['Expected of the team', `${ordinal(v.target)} or above`],
          ['The team stands', ordinal(v.place)],
          ['Points this race', String(v.points)],
        ]),
        paper(
          el(
            'div',
            `rs-verdict${fill === 'good' || fill === 'harm' ? ' on' : ''}`,
            v.standing.label
          ),
          { fill, bold: true }
        ),
      ]);

      root.replaceChildren(column(stood, finished), column(report, chairman));
    },
  };
}
