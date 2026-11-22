// The player as a manager, and the posts offered. Player: who she is and how
// she is rated, her seasons so far, and any team's offer of its manager's post.
// Jobs: the chairman's letter (she is dismissed, or sought), and the posts
// offered, each a card with the team, its championship, its chairman, what he
// expects and what he gives, and the way to take it.

import type { Dyed } from '../../office/papers.ts';
import type { CareerView, JobCard, JobsView } from '../../office/people.ts';
import { panel } from '../kit/panel.ts';
import { el } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import { acted, bitsStyle, jacketOf, lines, who } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-player { grid-template-columns: 300px 1fr 330px; }
.s-jobs { grid-template-columns: 400px 1fr; }
.s-player .k-body, .s-jobs .k-body { gap: 8px; }
.j-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; overflow-y: auto; align-content: start; }
`;

/** A team's offer of its manager's post. */
function post(c: JobCard, dyes: Dyed<unknown>['dyes'], office: Office) {
  return panel(c.name, [
    who(c.chairmanFace, dyes, c.chairman, 44),
    lines([
      ['Championship', c.tier],
      ['Stands', c.standing],
      ['Target', c.target],
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
    ),
  ]);
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
            'p-top',
            portrait(jacketOf(v.face, dyes), 120),
            el('div', 'd-name', v.name),
            el('div', 'b-faint', v.team)
          ),
          lines([
            ['Age', v.age],
            ['Reputation', v.reputation.text],
            ['Rank', v.rank.text],
            ['Marketability', v.marketability.text],
            ['Chairman’s Confidence', v.confidence.text],
          ]),
        ]),
        panel('Career History', [
          table(
            [
              { label: 'Season', width: '80px', cell: (r) => r.season },
              { label: 'Team', width: '1fr', cell: (r) => r.team },
              { label: 'Championship', width: '1fr', cell: (r) => r.tier },
              {
                label: 'Races',
                width: '60px',
                num: true,
                cell: (r) => r.races,
              },
              {
                label: 'Points',
                width: '60px',
                num: true,
                cell: (r) => r.points,
              },
            ],
            v.record,
            { keep: 'record' }
          ),
          lines(v.honours.map((h) => [h, ''])),
        ]),
        el('div', 'b-col', ...v.offers.map((c) => post(c, dyes, office)))
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
