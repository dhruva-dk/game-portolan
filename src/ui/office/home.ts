// Home, on the chartroom kit, in three columns. At the left the next race: its
// sea on a plate, its planet in the brass port, the season's rounds; under it
// the chairman (how happy, how secure her job, the season's objective and how
// she stands to it). In the middle her ship at anchor through a window framed
// in brass, her team's name on a plate over it, her four drivers and where each
// stands, the team set against the grid, and the news. At the right the
// standings, teams or drivers, her own row gilt and in view, over the work
// under way, a kind at a time, each job striped as far as it has got.

import type { HomeView, NewsKind, StandingLine } from '../../office/home.ts';
import type { Verdict } from '../../office/office.ts';
import { button, dropdown, segmented } from '../chartroom/controls.ts';
import { busy, compared, meter, table, terms } from '../chartroom/data.ts';
import { label, mark, name, portrait } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { paper, plate, sheet } from '../chartroom/paper.ts';
import { brassPort } from '../chartroom/port.ts';
import { u } from '../chartroom/tokens.ts';
import { emblem } from '../emblem.ts';
import type { Glyph } from '../glyphs.ts';
import { glyph } from '../ink.ts';
import { el, ordinal, styled } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.hm { display: grid; grid-template-columns: ${u(168)} 1fr ${u(176)}; gap: var(--s4); padding: var(--s4) var(--s6); }
.hm-col { display: flex; flex-direction: column; gap: var(--s4); min-height: 0; min-width: 0; }
.hm .cr-body { gap: var(--s3); }
.hm-grow { flex: 1; min-height: 0; }

.hm-plate { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s3); }
.hm-plate > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hm-faint { flex: none; font: italic 500 var(--t-label) var(--face); letter-spacing: 0; text-transform: none; color: var(--plate-faint); }
.hm-port { display: grid; place-items: center; }
.hm-rounds { display: flex; gap: ${u(1.5)}; height: ${u(5)}; }
.hm-rounds > i { flex: 1; background: var(--paper); box-shadow: inset 0 0 0 var(--w-fine) var(--line); }
.hm-rounds > i.done { background: var(--hatch), var(--ink-2); box-shadow: inset 0 0 0 var(--w-fine) var(--ink); }
.hm-rounds > i.next { background: var(--gilt); box-shadow: inset 0 0 0 var(--w-rule) var(--ink); }

.hm-mood { display: flex; flex-direction: column; gap: var(--s1); }
.hm-ends { display: flex; justify-content: space-between; }
.hm-verdict { padding: ${u(1)} var(--s3); font-weight: 700; box-shadow: inset 0 0 0 var(--w-fine) var(--ink); }
.hm-verdict.good { background: var(--good); color: var(--on-ink); }
.hm-verdict.bad { background: var(--harm); color: var(--on-ink); }
.hm-verdict.warn { background: var(--warn); }
.hm-verdict.fair { background: var(--paper-raised); }

/* the window and its nameplate under it, one frame */
.hm-framed { flex: 1; min-height: ${u(80)}; display: flex; flex-direction: column; box-shadow: 0 0 0 var(--w-bold) var(--ink); }
.hm-window { position: relative; flex: 1; min-height: 0; box-shadow: inset 0 0 0 ${u(3)} var(--brass), inset 0 0 0 ${u(3.8)} var(--ink); }
/* she is drawn a little larger than the window is high: her hull and her courses fill it */
.hm-window > .o-subject { position: absolute; left: 0; right: 0; top: 50%; height: 115%; translate: 0 -50%; pointer-events: none; }
.hm-crest { flex: none; display: flex; align-items: center; gap: var(--s3); padding: var(--s2) var(--s4); }
.hm-crest > svg { flex: none; width: ${u(16)}; height: ${u(16)}; }
.hm-crest b { flex: 1; min-width: 0; font: 700 var(--t-name)/1 var(--face); letter-spacing: .12em; text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.hm-drivers { display: grid; grid-template-columns: repeat(4, 1fr); padding: var(--s3) var(--s2); }
.hm-drivers > div { display: flex; align-items: center; gap: var(--s2); min-width: 0; padding: 0 var(--s2); }
.hm-drivers > div + div { border-left: var(--w-fine) solid var(--rule); }
.hm-drivers > div > div { display: flex; flex-direction: column; min-width: 0; }
.hm-drivers .cr-name { font-size: var(--t-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hm-drivers b { font: 600 var(--t-body)/1.1 var(--face); font-variant-numeric: lining-nums; }

.hm-news { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--s4); padding: var(--s3) var(--s4); }
.hm-news > .cr-mark { width: ${u(26)}; height: ${u(26)}; }
.hm-news > div { display: flex; flex-direction: column; gap: ${u(1)}; min-width: 0; }
.hm-news .cr-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.hm-team { display: flex; align-items: center; gap: var(--s2); }
.hm-team > i { flex: none; width: ${u(3)}; height: ${u(9)}; background: var(--team); box-shadow: 0 0 0 var(--w-fine) var(--ink); }

.hm-work { flex: none; height: ${u(186)}; }
.hm-work.idle { height: auto; }
.hm-jobs { display: flex; flex-direction: column; }
.hm-job { display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3) 0; border-bottom: var(--w-fine) solid var(--rule); }
.hm-job:first-child { padding-top: 0; }
.hm-job:last-child { border-bottom: 0; }
.hm-who { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
.hm-who > svg { flex: none; width: ${u(13)}; height: ${u(13)}; }
.hm-who > .cr-name { flex: 1; min-width: 0; font-size: var(--t-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hm-acts { display: flex; gap: var(--s3); }
.hm-acts > * { flex: 1; }
.hm-acts .cr-btn { padding: 0 var(--s3); }
`;

/** What each kind of news pictures, and each kind of work done by no one with a team. */
const NEWS: Readonly<Record<NewsKind, Glyph>> = {
  building: 'office.hq',
  part: 'office.ship',
  driver: 'office.drivers',
  sponsor: 'office.sponsors',
  vote: 'office.admiralty',
};
const WORK: Readonly<Record<string, Glyph>> = {
  Scouting: 'office.scouting',
  'Part Design': 'office.ship',
  Headquarters: 'office.hq',
};

/** A woodcut on the 24 grid, sized by the screen's CSS. */
const cut = (g: Glyph) => {
  const s = mark(24, 24, glyph(g, 12, 12, 24));
  s.removeAttribute('style');
  return s;
};

/** A word of judgment on a slip washed in its mood. */
const verdict = (v: Verdict) => el('span', `hm-verdict ${v.mood}`, v.label);

/** `made`, of the class `cls` too. */
const as = <T extends Element>(made: T, cls: string) => {
  made.classList.add(cls);
  return made;
};

/** A list the office keeps scrolled where it was, by `keep`. */
const kept = (list: HTMLElement, keep: string) => {
  list.dataset.keep = keep;
  return list;
};

/** How happy, as the wash a meter of it is filled in. */
const happyWash = (of: number) =>
  of >= 0.66 ? 'good' : of >= 0.33 ? 'warn' : 'harm';

/** Home. */
export function createHome(office: Office): Screen<HomeView> {
  kitLooks();
  stylesheet(CSS);
  const root = el('div', 'cr hm s-home');
  // (made once: its globe is spun by a finger, and kept between drawings)
  const port = brassPort(null);
  let shown: string | null = null,
    lines: 'teams' | 'drivers' = 'teams',
    kind: string | null = null;

  /** The next race: its sea, its planet, the season's rounds, the way to the calendar. */
  function nextRace(v: HomeView) {
    const chart = office.chart();
    if (chart && chart.name !== shown) {
      shown = chart.name;
      port.show(chart);
    }
    return sheet('Next Race', [
      plate(
        el(
          'div',
          'hm-plate',
          el('span', '', v.next.name),
          el('span', 'hm-faint', `Race ${v.next.round} of ${v.next.rounds}`)
        )
      ),
      el('div', 'hm-port', port.el),
      el(
        'div',
        'hm-rounds',
        ...Array.from({ length: v.next.rounds }, (_, i) =>
          el(
            'i',
            i < v.next.round - 1 ? 'done' : i === v.next.round - 1 ? 'next' : ''
          )
        )
      ),
      button(
        'Calendar',
        () => office.ask({ kind: 'open', screen: 'calendar' }),
        { kind: 'plain' }
      ),
    ]);
  }

  /** The chairman: how happy, how secure her job, the objective and how she stands to it. */
  const chairman = (v: HomeView) =>
    sheet(
      'The Chairman',
      [
        el(
          'div',
          'hm-mood',
          meter(v.chairman.happiness, happyWash(v.chairman.happiness)),
          el('div', 'hm-ends', label('Disappointed'), label('Happy'))
        ),
        terms([
          ['Job security', verdict(v.chairman.security)],
          ['Objective', `${ordinal(v.chairman.target)} or better`],
          ['Standing', verdict(v.chairman.standing)],
        ]),
      ],
      { cls: 'hm-grow' }
    );

  /** Her ship through the window, her team named over it; her four drivers under it. */
  const team = (v: HomeView) => [
    el(
      'div',
      'hm-framed',
      el('div', 'hm-window o-window', el('div', 'o-subject')),
      as(
        plate(
          emblem(v.team.emblem, v.team.colours, 16),
          el('b', '', v.team.name),
          el('span', 'hm-faint', v.championship)
        ),
        'hm-crest'
      )
    ),
    paper(
      el(
        'div',
        'hm-drivers',
        ...v.drivers.map((d) =>
          el(
            'div',
            '',
            portrait(v.team.colours, 22),
            el(
              'div',
              '',
              // (her family name: four to a row, the initial has no room)
              name(d.name.replace(/^\S+\.\s+/, '')),
              el('b', '', ordinal(d.place))
            )
          )
        )
      ),
      { fill: 'paper-raised', flat: true }
    ),
  ];

  /** The news, if any: what it pictures, its headline, its subject and where that stands, and its way on. */
  const news = (v: HomeView) => {
    const n = v.news;
    return (
      n &&
      paper(
        el(
          'div',
          'hm-news',
          cut(NEWS[n.kind]),
          el('div', '', label(n.headline), name(n.subject), label(n.status)),
          button(n.button, () => office.ask({ kind: 'open', screen: n.screen }))
        ),
        { fill: 'paper-raised', bold: true }
      )
    );
  };

  /** The standings: teams or drivers, a place, a name on its team's colour, the points; the places that go up ruled off. */
  function standings(v: HomeView) {
    const rows = v.standings[lines];
    const list = table<StandingLine>(
      [
        { head: 'Pos', track: u(16), num: true, cell: (r) => r.place },
        {
          head: lines === 'teams' ? 'Team' : 'Driver',
          track: '1fr',
          cell: (r) =>
            el(
              'span',
              'hm-team',
              styled(el('i'), { '--team': r.team.colours[0] }),
              r.name
            ),
        },
        { head: 'Pts', track: u(20), num: true, cell: (r) => r.points },
      ],
      rows,
      { own: (r) => r.own, cut: (r) => r.ruled, scrolls: { keep: lines } }
    );
    return sheet(
      'Standings',
      [
        segmented(['Teams', 'Drivers'], lines === 'teams' ? 0 : 1, (i) => {
          lines = i === 0 ? 'teams' : 'drivers';
          office.draw();
        }),
        list,
      ],
      { cls: 'hm-grow' }
    );
  }

  /** The work under way, a kind at a time: each job, who or what it is on, how far, the days left, its details and cancel. */
  function work(v: HomeView) {
    const at = v.work.find((w) => w.kind === kind) ?? v.work[0];
    if (!at)
      return sheet('Under Way', [label('No work is under way.')], {
        cls: 'hm-work idle',
      });
    const job = (j: (typeof at.jobs)[number]) =>
      el(
        'div',
        'hm-job',
        el(
          'div',
          'hm-who',
          j.team
            ? emblem(j.team.emblem, j.team.colours, 13)
            : cut(WORK[at.kind] ?? 'office.scouting'),
          name(j.name),
          label(j.days === 1 ? '1 day' : `${j.days} days`)
        ),
        busy(j.done),
        el(
          'div',
          'hm-acts',
          button(
            j.details,
            () => office.ask({ kind: 'job', job: j.id, what: 'details' }),
            { kind: 'plain' }
          ),
          j.cancels &&
            button(
              'Cancel',
              () => office.ask({ kind: 'job', job: j.id, what: 'cancel' }),
              { kind: 'harm' }
            )
        )
      );
    const kinds = v.work.map((w) => w.kind);
    return sheet(
      'Under Way',
      [
        kinds.length > 1
          ? dropdown(kinds, kinds.indexOf(at.kind), (i) => {
              kind = kinds[i] ?? null;
              office.draw();
            })
          : label(at.kind),
        kept(el('div', 'hm-jobs cr-rows', ...at.jobs.map(job)), at.kind),
      ],
      { cls: 'hm-work' }
    );
  }

  return {
    el: root,
    show(v) {
      root.replaceChildren(
        el('div', 'hm-col', nextRace(v), chairman(v)),
        el(
          'div',
          'hm-col',
          ...team(v),
          sheet('Against the Grid', [
            compared(v.stats, {
              best: 'Best in the championship',
              average: 'Average on the grid',
            }),
          ]),
          news(v)
        ),
        el('div', 'hm-col', standings(v), work(v))
      );
    },
  };
}
