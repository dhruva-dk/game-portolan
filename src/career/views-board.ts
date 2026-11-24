// `board` and `season`: the chairman (his temper, said as what it means for
// you; his confidence race by race this season against the line at which you
// are let go; the team's money, its floor and its target) with what may be
// asked of him; and a season's review as the archive keeps it. Pure, read-side.

import type { BoardAsk } from '../office/command.ts';
import type {
  BoardView,
  Request,
  SeasonView,
  Temper,
} from '../office/board.ts';
import { ASKS, askBar, askCheck, askGives } from './board.ts';
import { known } from './canon.ts';
import { effective } from './effective.ts';
import { moneyText, ordinal } from './names.ts';
import { seasonYear } from './office.ts';
import { inRole } from './roles.ts';
import { standingOf } from './standings.ts';
import type { CareerState, SeasonLine } from './state.ts';
import { TUNING } from './tuning.ts';
import { ruleChanges } from './views-admiralty.ts';
import { ROLE_NAMES, ageOf } from './views-person.ts';
import { TIERS, faceOf, myTeam, nameOf } from './views.ts';

const E = TUNING.chairman,
  B = TUNING.board;

/** What a stat of the chairman's temper means for you, low, middling and high (a stat 0…20). */
const TEMPER: readonly (readonly [
  'ambition' | 'patience' | 'generosity' | 'meddling',
  string,
  readonly [string, string, string],
])[] = [
  [
    'ambition',
    'Ambition',
    [
      'Content with a modest target.',
      'Wants the team to climb.',
      'Expects the team near the top: an easier target is hard won.',
    ],
  ],
  [
    'patience',
    'Patience',
    [
      'Loses faith quickly after a poor race.',
      'Lets a few poor races pass.',
      'Bears a poor run calmly.',
    ],
  ],
  [
    'generosity',
    'Generosity',
    [
      'Keeps a tight purse: money and a lower floor are hard won.',
      'Gives when the team does well.',
      'Free with money, and lets the team run deep into debt.',
    ],
  ],
  [
    'meddling',
    'Meddling',
    [
      'Leaves the running of the team to you.',
      'Has a say now and then.',
      'Meddles: the chairman’s own dilemmas come often.',
    ],
  ],
];

/** A stat's band: low under 8, high from 14. */
const band = (v: number): 0 | 1 | 2 => (v < 8 ? 0 : v < 14 ? 1 : 2);

/** Each request's name. */
const ASKED: Readonly<Record<BoardAsk, string>> = {
  money: 'Money for the team',
  floor: 'A lower debt floor',
  target: 'An easier target',
};

/** `board`. */
export function boardView(s: CareerState): BoardView {
  const p = known(s.player),
    c = myTeam(s),
    g = s.people[c.staff.chairman],
    stats = effective(inRole(g, 'chairman'), null);
  const gives = (ask: BoardAsk) => {
    const n = askGives(s, c, ask);
    return ask === 'money'
      ? `${moneyText(n)} into the balance`
      : ask === 'floor'
        ? `The floor down to ${moneyText(c.debtFloor - n)}`
        : `${ordinal(c.target + n)} instead of ${ordinal(c.target)}`;
  };
  const rounds = s.calendar?.rounds ?? [];
  return {
    teamId: c.id,
    team: c.name,
    chairman: { person: g.id, name: nameOf(g), face: faceOf(s, g) },
    temper: TEMPER.map(
      ([k, name, says]): Temper => ({
        name,
        value: Math.round(stats[k]),
        says: says[band(stats[k])],
      })
    ),
    confidence: Math.round(c.confidence),
    verdict: E.verdict,
    missedBy: E.missedBy,
    rounds: rounds.length,
    marks: p.board
      .filter((l) => l.season === s.season && l.team === c.id)
      .map((l) => ({
        round: l.round,
        planet: rounds[l.round]?.planet.name ?? '',
        confidence: Math.round(l.confidence),
        place: l.place,
      })),
    target: ordinal(c.target),
    standing: `${ordinal(standingOf(s, c.id))} of ${s.championships[c.tier].teams.length}`,
    budget: moneyText(c.budget),
    balance: moneyText(c.balance),
    floor: moneyText(c.debtFloor),
    requests: ASKS.map((ask): Request => {
      const no = askCheck(s, ask),
        put = p.asks.find((a) => a.season === s.season && a.ask === ask);
      return {
        ask,
        name: ASKED[ask],
        gives: gives(ask),
        bar: askBar(s, c, ask),
        asked: put ? put.granted : null,
        act: { ok: no === null, why: no?.sentence ?? '' },
      };
    }),
    costs: { granted: B.granted, refused: B.refused },
  };
}

/** A kept season's honours: the title, promotion, the target met, races won. */
export function honoursOf(a: SeasonLine): string[] {
  const move = a.moves.find((m) => m.team === a.team)?.move ?? 0;
  return [
    ...(a.place === 1 ? ['Champions'] : []),
    ...(move < 0 ? ['Promoted'] : []),
    ...(a.place <= a.target ? ['Target met'] : []),
    ...(a.wins > 0 ? [`${a.wins} race${a.wins > 1 ? 's' : ''} won`] : []),
  ];
}

/** `season`: the season `season` as the archive keeps it (null, or none kept: the last). */
export function seasonView(
  s: CareerState,
  season: number | null
): SeasonView | null {
  const p = known(s.player),
    kept = p.seasons;
  const a = kept.find((x) => x.season === season) ?? kept.at(-1);
  if (!a) return null;
  const c = s.teams[a.team];
  const person = (id: number) => s.people[id];
  return {
    year: String(seasonYear(a)),
    seasons: [...kept]
      .reverse()
      .map((x) => ({ season: x.season, year: String(seasonYear(x)) })),
    season: a.season,
    teamId: a.team,
    team: c.name,
    tier: TIERS[a.tier],
    sacked: a.sacked,
    place: a.place,
    of: a.of,
    target: ordinal(a.target),
    met: a.target - a.place,
    points: a.points,
    wins: a.wins,
    podiums: a.podiums,
    sinkings: a.sinkings,
    prize: moneyText(a.prize),
    confidence: Math.round(a.confidence),
    honours: honoursOf(a),
    champions: a.champions.map((team, tier) => ({
      tier: TIERS[tier],
      team,
      name: s.teams[team]?.name ?? '',
    })),
    moves: a.moves.map((m) => ({
      team: m.team,
      name: s.teams[m.team].name,
      from: TIERS[m.tier],
      up: m.move < 0,
    })),
    retired: a.retired.map((id) => ({
      person: id,
      name: nameOf(person(id)),
      role: ROLE_NAMES[person(id).role],
    })),
    arrivals: a.arrivals.map((id) => ({
      person: id,
      name: nameOf(person(id)),
      role: ROLE_NAMES[person(id).role],
      age: ageOf(s, person(id)),
    })),
    rules: ruleChanges(a.rules, a.next, a.of),
  };
}
