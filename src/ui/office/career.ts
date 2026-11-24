// The player as a manager, and the posts offered, on the chartroom kit.
// Player: at the left you (your portrait, your team, how you are rated, the
// chairman's confidence against the line you are sacked under); in the middle your
// seasons, a row each (its team opens its page), and your honours; at the right
// what your reputation opens (the reputation each championship offers its
// posts at, on one track) and the posts offered you. Jobs: the chairman's
// letter (you are dismissed, or sought) beside the posts offered. A post is a
// card: the team under its emblem (a link), its championship, its chairman (a
// link), where it stands, what he expects and gives, until when; Take and
// Decline, each shut with its reason.

import type { Dyed } from '../../office/papers.ts';
import type { CareerView, JobCard, JobsView } from '../../office/people.ts';
import { button, link } from '../chartroom/controls.ts';
import {
  gauge,
  meter,
  stepped,
  table,
  terms,
  washOf,
} from '../chartroom/data.ts';
import { label } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { sheet } from '../chartroom/paper.ts';
import { who } from '../chartroom/person.ts';
import { u } from '../chartroom/tokens.ts';
import { emblem } from '../emblem.ts';
import { el } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { jacketOf } from './faces.ts';
import { toPerson, toTeam } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.jb-crest { display: flex; align-items: center; gap: var(--s3); min-width: 0; }
.jb-crest > svg { flex: none; width: ${u(26)}; height: ${u(26)}; }
.jb-crest > div { min-width: 0; display: flex; flex-direction: column; gap: ${u(1)}; }
.jb-crest .cr-link { font: 700 var(--t-name)/1.15 var(--face); overflow-wrap: break-word; }
.jb-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s4); align-content: start; overflow-y: auto; }
.jb-tiers { display: flex; flex-direction: column; }
.jb-tiers > div { display: flex; justify-content: space-between; gap: var(--s2); padding: var(--s1) 0; border-bottom: var(--w-fine) solid var(--rule); }
.jb-tiers > div > span { font: 500 var(--t-body)/1.2 var(--face); }
.jb-tiers > div.shut > span { color: var(--ink-2); }
.jb-words { display: flex; flex-direction: column; gap: var(--s3); }
.jb-words > p { margin: 0; font: 400 var(--t-name)/1.45 var(--face); }
`;

type Dyes = Dyed<unknown>['dyes'];

/** A team's offer of its manager's post, a card. */
function post(c: JobCard, dyes: Dyes, office: Office) {
  const send = (kind: 'TakeJob' | 'DeclineJob') => () =>
    office.ask({ kind: 'send', command: { kind, team: c.team } });
  const dye = dyes[c.colours.dye % Math.max(1, dyes.length)];
  return sheet(null, [
    el(
      'div',
      'jb-crest',
      dye ? emblem(c.emblem, dye, 26) : null,
      el('div', '', link(c.name, toTeam(office)(c.team)), label(c.tier))
    ),
    who(
      {
        jacket: jacketOf(c.chairmanFace, dyes),
        name: link(c.chairman, toPerson(office)(c.chairmanId)),
        said: 'Chairman',
      },
      26,
      'beside'
    ),
    terms([
      ['Stands', c.standing],
      ['Objective', c.target],
      ['Budget', c.budget.text],
      ['Offer stands', c.expires],
    ]),
    el(
      'div',
      'cr-card-foot pair',
      button('Take', send('TakeJob'), { off: c.take.ok ? null : c.take.why }),
      button('Decline', send('DeclineJob'), {
        kind: 'plain',
        off: c.decline.ok ? null : c.decline.why,
      })
    ),
  ]);
}

/** The player. */
export function createPlayer(office: Office): Screen<Dyed<CareerView>> {
  kitLooks();
  stylesheet(CSS);
  const root = page('side', 's-player'),
    teamPage = toTeam(office);

  /** You, and how you are rated. */
  const you = (v: CareerView, dyes: Dyes) => {
    const sacked =
        v.confidence.explain?.lines.find((l) => l.label === 'Sacked under')
          ?.amount ?? '',
      of = v.rank.against?.kind === 'rank' ? v.rank.against.of : null,
      wash = washOf(v.confidence.value / 100),
      marks = v.posts
        .map((p) => p.at / 100)
        .filter((m) => m > 0)
        .sort((a, b) => a - b);
    return sheet(
      null,
      [
        who(
          {
            jacket: jacketOf(v.face, dyes),
            name: v.name,
            said: el(
              'span',
              '',
              'Manager of ',
              link(v.team, teamPage(v.teamId))
            ),
          },
          64
        ),
        label(`Age ${v.age}`),
        terms([
          [
            'Rank of managers',
            of === null ? v.rank.text : `${v.rank.text} of ${of}`,
          ],
          ['Marketability', `${v.marketability.text} of 100`],
        ]),
        gauge(
          'Reputation',
          v.reputation.text,
          stepped(
            v.reputation.value / 100,
            marks,
            marks.filter((m) => v.reputation.value / 100 >= m).length
          )
        ),
        el(
          'div',
          'jb-tiers',
          ...v.posts.map((p) =>
            el(
              'div',
              p.open ? '' : 'shut',
              el('span', '', p.tier),
              label(p.open ? 'Posts open' : `At ${p.at}`)
            )
          )
        ),
        gauge(
          'Chairman’s confidence',
          `${v.confidence.text} of 100`,
          meter(v.confidence.value / 100, wash),
          wash === 'harm'
        ),
        sacked && label(`Under ${sacked}, the chairman lets you go.`),
      ],
      { cls: 'cr-grow' }
    );
  };

  /** Your seasons, newest first, each with its honours. */
  const record = (v: CareerView) =>
    sheet(
      'Your Career',
      [
        table(
          [
            { head: 'Season', track: u(32), cell: (r) => r.season },
            {
              head: 'Team',
              track: 'minmax(0, 1fr)',
              cell: (r) => (r.teamId === null ? r.team : link(r.team)),
            },
            { head: 'Championship', track: u(92), cell: (r) => r.tier },
            { head: 'Races', track: u(28), num: true, cell: (r) => r.races },
            { head: 'Points', track: u(32), num: true, cell: (r) => r.points },
            {
              head: 'Honours',
              track: u(92),
              cell: (r) => r.honours.join(', '),
            },
          ],
          v.record,
          {
            tap: (r) => teamPage(r.teamId),
            none: 'Your first season is under way.',
            scrolls: { keep: 'record' },
          }
        ),
      ],
      { cls: 'cr-grow', aside: `${v.record.length} seasons` }
    );

  /** The posts offered you, side by side. */
  const offers = (v: CareerView, dyes: Dyes) =>
    sheet(
      'Posts Offered',
      [
        v.offers.length > 0
          ? el('div', 'jb-cards', ...v.offers.map((c) => post(c, dyes, office)))
          : label('No team has offered you its post.'),
      ],
      { aside: `${v.offers.length}` }
    );

  return {
    el: root,
    show({ view: v, dyes }) {
      root.replaceChildren(
        column(you(v, dyes)),
        column(record(v), offers(v, dyes))
      );
    },
  };
}

/** The posts offered. */
export function createJobs(office: Office): Screen<Dyed<JobsView>> {
  kitLooks();
  stylesheet(CSS);
  const root = page('side', 's-jobs');
  return {
    el: root,
    show({ view: v, dyes }) {
      const l = v.letter;
      root.replaceChildren(
        column(
          sheet(
            v.sacked ? 'Dismissed' : 'An Offer',
            [
              who(
                {
                  jacket: jacketOf(l.face, dyes),
                  name: l.title,
                  said: link(l.from, toPerson(office)(l.fromId)),
                },
                48
              ),
              el('div', 'jb-words', ...l.paragraphs.map((p) => el('p', '', p))),
            ],
            { cls: 'cr-grow' }
          )
        ),
        column(
          sheet(
            'Posts Offered',
            [
              v.offers.length > 0
                ? el(
                    'div',
                    'jb-cards',
                    ...v.offers.map((c) => post(c, dyes, office))
                  )
                : label('No team has offered you its post.'),
            ],
            { cls: 'cr-grow', aside: `${v.offers.length}` }
          )
        )
      );
    },
  };
}
