// Home, in three columns. At the left her team (its emblem and championship,
// its four drivers and where each stands, her ship under the team's sail)
// over the chairman's happiness (the dial, her job's security, the
// season's objective and how she stands to it). In the middle the team's
// stats against the championship, the news, and the work in progress, a kind
// at a time. At the right the next race over the standings, teams or drivers,
// her own row in view.

import type { HomeView, NewsKind, StandingLine } from '../../office/home.ts';
import { emblem } from '../emblem.ts';
import { galleon } from '../ink.ts';
import { button, dropdown, segmented } from '../kit/button.ts';
import { bars, dial } from '../kit/chart.ts';
import { icon, type Icon } from '../kit/icons.ts';
import { band, card, infoMark, panel } from '../kit/panel.ts';
import { drawn, el, ordinal } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { job, tag } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import { rhumbs, rose } from '../marks.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

/** A standings row's height, px. */
const ROW = 30;

const CSS = `
.s-home { display: grid; grid-template-columns: 320px 1fr 356px; gap: 10px; padding: 12px 18px; }
.s-home > div { display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
.s-home .grow { flex: 1; }
.h-team { flex: none; }
.h-team > .k-body { padding: 0 4px 4px; }
.h-crest { flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 8px 10px; }
.h-crest > b { font: 700 26px/1.1 var(--serif); letter-spacing: .03em; text-align: center; }
.h-crest > span { color: var(--faint); }
.h-drivers { flex: none; display: grid; grid-template-columns: repeat(4, 1fr); padding: 8px 0 10px; background: var(--dark); }
.h-drivers > div { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
.h-drivers > div + div { border-left: 1px solid var(--rule); }
.h-drivers span { max-width: 100%; padding: 0 3px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-drivers b { font: 700 16px/1 var(--narrow); }
.h-ship { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--light); border: 1.5px solid var(--ink);
  box-shadow: 0 2px 0 var(--shade); }
.h-ship > svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.h-jobs .k-btn { padding: 0 9px; font-size: 14px; }
.h-jobs .k-who { max-width: 150px; }
.h-chair { flex: none; height: 252px; }
.h-chair .h-row { flex: 1; display: flex; align-items: center; justify-content: space-around; gap: 8px; }
.h-chair .h-col { display: flex; flex-direction: column; align-items: stretch; gap: 8px; min-width: 150px; text-align: center; }
.h-chair .h-aim { flex: none; display: flex; align-items: center; justify-content: center; gap: 14px; padding-top: 10px;
  font: 700 19px/1 var(--narrow); letter-spacing: .04em; }
.h-chair .h-aim > i { align-self: stretch; width: 1px; background: var(--rule); }
.h-stats { flex: none; height: 262px; }
.s-home .k-card { flex: none; height: 150px; }
.h-work > .k-body { gap: 6px; }
.h-jobs { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.h-next { flex: none; height: 226px; }
.h-next > .k-body { padding: 0 4px 6px; gap: 6px; }
.h-art { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--light); border: 1.5px solid var(--ink); }
.h-art > svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.h-art > .h-plate { position: absolute; left: 0; bottom: 12px; padding: 6px 18px 6px 12px; display: flex; flex-direction: column;
  background: var(--plate); color: var(--bar-ink); }
.h-plate > span { font-size: 13px; color: var(--bar-faint); }
.h-plate > b { font: 700 21px/1.1 var(--narrow); letter-spacing: .1em; text-transform: uppercase; }
.h-art > .k-btn { position: absolute; right: 8px; bottom: 12px; }
.h-rounds { flex: none; display: flex; gap: 3px; height: 5px; }
.h-rounds > i { flex: 1; background: var(--track); }
.h-rounds > i.done { background: var(--gold); }
.h-table > .k-body { gap: 8px; }
`;

/** What each kind of news pictures. */
const PICTURE: Readonly<Record<NewsKind, Icon>> = {
  building: 'hq',
  part: 'ship',
  driver: 'drivers',
  sponsor: 'sponsors',
  vote: 'anchor',
};

/** `made`, of the classes `cls` too (a panel's place in its column). */
const as = <T extends Element>(made: T, cls: string) => {
  made.classList.add(...cls.split(' '));
  return made;
};

/** Home. */
export function createHome(office: Office): Screen<HomeView> {
  stylesheet(CSS);
  const root = el('div', 's-home');
  let lines: 'teams' | 'drivers' = 'teams',
    kind: string | null = null;

  /** The standings' table: a place, a name on its team's colour, the points; the places that go up ruled off. */
  const standings = (rows: readonly StandingLine[]) =>
    table<StandingLine>(
      [
        { label: 'Pos', width: '34px', cell: (r) => r.place },
        {
          label: lines === 'teams' ? 'Team' : 'Driver',
          width: '1fr',
          cell: (r) => r.name,
        },
        { label: 'PTS', width: '44px', num: true, cell: (r) => r.points },
      ],
      rows,
      {
        height: ROW,
        own: (r) => r.own,
        colour: (r) => r.team.colours[0],
        cut: (r) => r.ruled,
        keep: lines,
      }
    );

  function draw(v: HomeView) {
    const work = v.work.find((w) => w.kind === kind) ?? v.work[0];
    root.replaceChildren(
      el(
        'div',
        '',
        as(
          panel(null, [
            el(
              'div',
              'h-crest',
              emblem(v.team.emblem, v.team.colours, 64),
              el('b', '', v.team.name),
              el('span', '', v.championship)
            ),
            el(
              'div',
              'h-drivers',
              ...v.drivers.map((d) =>
                el(
                  'div',
                  '',
                  portrait(v.team.colours, 52),
                  el('span', '', d.name),
                  el('b', '', ordinal(d.place))
                )
              )
            ),
          ]),
          'h-team'
        ),
        el(
          'div',
          'h-ship',
          drawn(
            320,
            210,
            rhumbs(160, 120, 420, 0.16) +
              galleon(160, 108, 190, { sail: v.team.colours[0], waves: true })
          )
        ),
        as(
          panel(
            'Chairman’s Happiness',
            [
              el(
                'div',
                'h-row',
                dial(v.chairman.happiness, 'Disappointed', 'Happy', 150),
                el(
                  'div',
                  'h-col',
                  band('Job Security'),
                  tag(
                    v.chairman.security.label,
                    v.chairman.security.mood,
                    'boxed'
                  )
                )
              ),
              band('Season Objective - Teams’ Championship'),
              el(
                'div',
                'h-aim',
                `${ordinal(v.chairman.target)} or above`,
                el('i'),
                tag(v.chairman.standing.label, v.chairman.standing.mood, 'bare')
              ),
            ],
            infoMark()
          ),
          'h-chair'
        )
      ),
      el(
        'div',
        '',
        as(
          panel('Team Stats', [
            bars(v.stats, 'Best in Championship', 'Average on Grid'),
          ]),
          'h-stats'
        ),
        v.news &&
          card(
            {
              headline: v.news.headline,
              subject: v.news.subject,
              status: v.news.status,
              picture: icon(PICTURE[v.news.kind], 64),
              action: button(v.news.button, () => {
                if (v.news) office.ask({ kind: 'open', screen: v.news.screen });
              }),
            },
            v.team.colours
          ),
        as(
          panel('Work in Progress', [
            work &&
              dropdown(
                v.work.map((w) => ({ id: w.kind, label: w.kind })),
                work.kind,
                (id) => {
                  kind = id;
                  office.draw();
                },
                true
              ),
            el(
              'div',
              'h-jobs k-rows',
              ...(work?.jobs ?? []).map((j) =>
                job(
                  {
                    mark: j.team
                      ? emblem(j.team.emblem, j.team.colours, 20)
                      : icon('ship', 20),
                    name: j.name,
                  },
                  j.done,
                  `${j.days} Days`,
                  [
                    button(j.details, () =>
                      office.ask({ kind: 'job', job: j.id, what: 'details' })
                    ),
                    button(
                      'Cancel',
                      () =>
                        office.ask({ kind: 'job', job: j.id, what: 'cancel' }),
                      { kind: 'danger', off: !j.cancels }
                    ),
                  ]
                )
              )
            ),
          ]),
          'h-work grow'
        )
      ),
      el(
        'div',
        '',
        as(
          panel('Next Race', [
            el(
              'div',
              'h-art',
              drawn(360, 170, rhumbs(250, 70, 520, 0.2) + rose(250, 70, 58, 0)),
              el(
                'div',
                'h-plate',
                el('span', '', `Race ${v.next.round}`),
                el('b', '', v.next.name)
              ),
              button('Calendar', () =>
                office.ask({ kind: 'open', screen: 'calendar' })
              )
            ),
            el(
              'div',
              'h-rounds',
              ...Array.from({ length: v.next.rounds }, (_, i) =>
                el('i', i < v.next.round ? 'done' : '')
              )
            ),
          ]),
          'h-next'
        ),
        as(
          panel('Standings', [
            segmented(
              [
                { id: 'teams', label: 'Teams' },
                { id: 'drivers', label: 'Drivers' },
              ],
              lines,
              (id) => {
                lines = id;
                office.draw();
              },
              true
            ),
            standings(v.standings[lines]),
            button(
              'Standings',
              () => office.ask({ kind: 'open', screen: 'standings' }),
              { wide: true }
            ),
          ]),
          'h-table grow'
        )
      )
    );
  }

  return { el: root, show: draw };
}
