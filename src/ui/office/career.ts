// The player as a manager, and the posts offered. Player: at the left who she
// is and how she is rated (her reputation, marketability and the chairman's
// confidence, a tile each); in the middle her seasons so far and her honours;
// at the right the chairman's confidence on its dial over the posts offered
// her. Jobs: the chairman's letter (she is dismissed, or sought) beside the
// posts offered, each a card: the team under its emblem, its championship, its
// chairman, what he expects and what he gives, and the way to take it.

import type { Dyed } from '../../office/papers.ts';
import type { CareerView, JobCard, JobsView } from '../../office/people.ts';
import { emblem } from '../emblem.ts';
import { dial } from '../kit/chart.ts';
import { band, panel } from '../kit/panel.ts';
import { el } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { tag, tile, tiles } from '../kit/stat.ts';
import { cut, stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import { acted, bitsStyle, jacketOf, lines, who } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-player { grid-template-columns: 300px 1fr 340px; }
.s-jobs { grid-template-columns: 400px 1fr; }
.s-player .k-body, .s-jobs .k-body { gap: 8px; }
.j-me { flex: none; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 0 6px; text-align: center; }
.j-me > b { font: 700 22px/1.1 var(--serif); }
.j-rank { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px; background: var(--dark); }
.j-rank > b { font: 700 30px/1 var(--narrow); }
.j-rank > span, .j-none { font-style: italic; color: var(--faint); }
.j-none { flex: 1; display: grid; place-items: center; text-align: center; padding: 12px; }
.j-history { flex: 1; min-height: 0; display: flex; }
.j-history ~ .j-none { flex: none; }
.j-chair > .k-head { padding-left: 10px; padding-right: 10px; letter-spacing: .06em; }
.j-honours { flex: none; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.j-honours > div { padding: 7px 10px; background: var(--dark); }
.j-chair { flex: none; }
.j-chair > .k-body { align-items: center; gap: 6px; }
.j-chair .b-faint { text-align: center; }
.j-offers { flex: 1; }
.j-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.j-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; overflow-y: auto; align-content: start; }
.j-post { flex: none; display: flex; flex-direction: column; gap: 8px; padding: 10px; ${cut('light')} }
.j-post > header { display: flex; align-items: center; gap: 10px; min-width: 0; }
.j-post > header > div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.j-post > header b { font: 700 18px/1.1 var(--serif); letter-spacing: .03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/** `made`, of the class `cls` too (a panel's place in its column). */
const as = <T extends Element>(made: T, cls: string) => {
  made.classList.add(cls);
  return made;
};

/** A team's offer of its manager's post, a card. */
function post(c: JobCard, dyes: Dyed<unknown>['dyes'], office: Office) {
  return el(
    'div',
    'j-post',
    el(
      'header',
      '',
      // (the chairman wears his team's dye: the emblem is drawn in it)
      emblem(c.emblem, jacketOf(c.chairmanFace, dyes), 44),
      el('div', '', el('b', '', c.name), el('span', 'b-faint', c.tier))
    ),
    who(c.chairmanFace, dyes, `${c.chairman}, Chairman`, 36),
    lines([
      ['Stands', c.standing],
      ['Season Objective', c.target],
      ['Budget', c.budget.text],
      ['Offer Stands', c.expires],
    ]),
    acted(
      'Take Job',
      c.take,
      () =>
        office.ask({
          kind: 'send',
          command: { kind: 'TakeJob', team: c.team },
        }),
      'on'
    )
  );
}

/** The player. */
export function createPlayer(office: Office): Screen<Dyed<CareerView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-player');
  return {
    el: root,
    show({ view: v, dyes }) {
      root.replaceChildren(
        panel('Team Manager', [
          el(
            'div',
            'j-me',
            portrait(jacketOf(v.face, dyes), 132),
            el('b', '', v.name),
            tag(v.team, 'go', 'boxed'),
            el('span', 'b-faint', `Age ${v.age}`)
          ),
          band('Manager Stats'),
          tiles([
            tile('Reputation', v.reputation.value, 100),
            tile('Marketability', v.marketability.value, 100),
            tile('Confidence', v.confidence.value, 100),
          ]),
          el(
            'div',
            'j-rank',
            el('span', '', 'Rank of Managers'),
            el('b', '', v.rank.text)
          ),
        ]),
        panel('Career History', [
          el(
            'div',
            'j-history',
            v.record.length > 0
              ? table(
                  [
                    { label: 'Season', width: '64px', cell: (r) => r.season },
                    { label: 'Team', width: '1fr', cell: (r) => r.team },
                    {
                      label: 'Championship',
                      width: '1fr',
                      cell: (r) => r.tier,
                    },
                    { label: 'Role', width: '90px', cell: (r) => r.role },
                    {
                      label: 'Races',
                      width: '50px',
                      num: true,
                      cell: (r) => r.races,
                    },
                    {
                      label: 'Points',
                      width: '54px',
                      num: true,
                      cell: (r) => r.points,
                    },
                  ],
                  v.record,
                  { keep: 'record' }
                )
              : el(
                  'div',
                  'j-none',
                  'Her first season is under way: no season is on her record yet.'
                )
          ),
          band('Honours'),
          v.honours.length > 0
            ? el('div', 'j-honours', ...v.honours.map((h) => el('div', '', h)))
            : el('div', 'j-none', 'None yet.'),
        ]),
        el(
          'div',
          'b-col',
          as(
            panel('Chairman’s Confidence', [
              dial(v.confidence.value / 100, 'Disappointed', 'Happy', 150),
              el('div', 'b-faint', `${v.confidence.text} of 100`),
            ]),
            'j-chair'
          ),
          as(
            panel('Job Offers', [
              v.offers.length > 0
                ? el(
                    'div',
                    'j-list',
                    ...v.offers.map((c) => post(c, dyes, office))
                  )
                : el('div', 'j-none', 'No team has offered her its post.'),
            ]),
            'j-offers'
          )
        )
      );
    },
  };
}

/** The posts offered. */
export function createJobs(office: Office): Screen<Dyed<JobsView>> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-jobs');
  return {
    el: root,
    show({ view: v, dyes }) {
      root.replaceChildren(
        panel(v.letter.title, [
          who(v.letter.face, dyes, v.letter.from, 44),
          el('div', 'b-text', v.letter.paragraphs.join('\n\n')),
        ]),
        el('div', 'j-cards', ...v.offers.map((c) => post(c, dyes, office)))
      );
    },
  };
}
