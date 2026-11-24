// `regulations`: your championship's rules this season and next, each said as it
// plays out (the champion's prize against the last's, how many teams are
// inspected); the proposal standing with each team's side (cast, or how it
// leans), each side's sway, your vote and what you may lobby; the season's
// proposals counted. Pure.

import type {
  RegulationsView,
  Leaning,
  ProposalLine,
  RuleLine,
} from '../office/regulations.ts';
import type { Change, Measure } from '../office/command.ts';
import type { Act } from '../office/people.ts';
import type { Rules } from '../race.ts';
import {
  changed,
  lobbyCheck,
  rivalSide,
  swayOf,
  sways,
  voteCheck,
} from './regulations.ts';
import type { Check } from './command.ts';
import { inspectedCount } from './inspection.ts';
import { prizeShares } from './money.ts';
import {
  PARTS,
  championship,
  dateAt,
  named,
  seasonYear,
  type Look,
} from './office.ts';
import { mine } from './post.ts';
import type { CareerState, Proposal } from './state.ts';
import { TUNING } from './tuning.ts';
import { myTeam, nameOf } from './views.ts';

const A = TUNING.regulations;

/** The sums the office offers to lobby. */
const SUMS = [100, 250, 500, 1000] as const;

/** A word with its capital. */
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Names as a list, or none. */
const listed = (names: readonly string[]) =>
  names.length > 0 ? names.join(', ') : 'None';

/** Each rule's name and what it does, in the order the office lists them. */
const RULES: readonly (readonly [Measure, string, string])[] = [
  [
    'spec',
    'Spec parts',
    'Every team fits the one part the Federation issues of these: none of its own design.',
  ],
  ['ban', 'Banned guns', 'No ship of the championship may mount these.'],
  [
    'storm',
    'The storm’s pace',
    'Times each planet’s own: above 1 the storm closes on the sea quicker.',
  ],
  [
    'pointsPerSinking',
    'Points a sinking',
    'What a ship scores for each ship she sinks, beside her place’s points.',
  ],
  [
    'seaHeldPoint',
    'The sea-held point',
    'A point to the ship holding the most sea at a race’s end.',
  ],
  [
    'prizeSpread',
    'Prize money',
    'The champion’s share of the prize pool against the last team’s.',
  ],
  [
    'inspection',
    'Inspections',
    'Teams drawn after each race; a part found past the rules is taken, the team fined and its points struck.',
  ],
];

/** What a rule reads, as it plays out in a championship of `teams`. */
function reads(r: Rules, m: Measure, teams: number): string {
  switch (m) {
    case 'spec':
      return listed(r.spec.map((t) => PARTS[t] ?? t));
    case 'ban':
      return listed(r.banned.map(capital));
    case 'storm':
      return `×${r.storm.toFixed(1)}`;
    case 'pointsPerSinking':
      return String(r.pointsPerSinking);
    case 'seaHeldPoint':
      return r.seaHeldPoint ? 'Given' : 'None';
    case 'prizeSpread': {
      const shares = prizeShares(teams, r.prizeSpread),
        last = shares[shares.length - 1];
      return r.prizeSpread === 0 || !last
        ? 'Even'
        : `${(shares[0] / last).toFixed(1)}× the last’s`;
    }
    case 'inspection':
      return `${inspectedCount(teams, r.inspection)} of ${teams} teams`;
  }
}

/** The rules that read otherwise in `now` than in `was`, as a championship of `teams` plays them. */
export const ruleChanges = (was: Rules, now: Rules, teams: number) =>
  RULES.map(([m, name]) => ({
    name,
    was: reads(was, m, teams),
    now: reads(now, m, teams),
  })).filter((r) => r.was !== r.now);

/** A check as a button's state. */
const act = (c: Check): Act => ({ ok: c === null, why: c?.sentence ?? '' });

/** No team: nothing may be done. */
const SACKED: Act = {
  ok: false,
  why: 'You have no team: take one of the posts offered.',
};

/** A proposal as a line: the rule, `against` read before and with its change made. */
function line(
  s: CareerState,
  p: Proposal,
  against: Rules,
  teams: number
): ProposalLine {
  const c: Change = p.change,
    rule = RULES.find(([m]) => m === c.measure)?.[1] ?? c.measure,
    sides = Object.values(p.votes);
  return {
    id: p.id,
    rule,
    from: reads(against, c.measure, teams),
    to: reads(changed(against, c), c.measure, teams),
    closes: dateAt(s, p.closes),
    days: Math.max(0, p.closes - s.day),
    carried: p.decided,
    count: {
      for: sides.filter((v) => v === 'for').length,
      against: sides.filter((v) => v === 'against').length,
      abstain: sides.filter((v) => v === 'abstain').length,
    },
  };
}

/** The Federation, for your team's championship. */
export function regulationsView(s: CareerState, look: Look): RegulationsView {
  const c = myTeam(s),
    me = mine(s),
    l = s.championships[c.tier],
    n = l.teams.length;
  const p =
    l.proposals.find((x) => x.decided === null) ?? l.proposals.at(-1) ?? null;
  const proposal = p && {
    ...line(s, p, p.decided === null ? l.next : l.rules, n),
    teams: l.teams.map((id): Leaning => {
      const t = s.teams[id],
        g = t.staff.manager === null ? null : s.people[t.staff.manager],
        cast = p.votes[id];
      return {
        team: named(t, look),
        manager: g ? { person: g.id, name: nameOf(g) } : null,
        you: t.player,
        side:
          cast ??
          (t.player || g === null ? 'abstain' : rivalSide(s, id, p.change)),
        cast: cast !== undefined,
        sway: Math.round(swayOf(s, id)),
      };
    }),
    sway: (({ for: f, against: a }) => ({
      for: Math.round(f),
      against: Math.round(a),
    }))(sways(s, c.tier, p)),
    lobbied: {
      for: Math.round(p.lobbied.for / A.lobby),
      against: Math.round(p.lobbied.against / A.lobby),
    },
    yours: p.votes[c.id] ?? null,
    vote: me === null ? SACKED : act(voteCheck(s, me, p.id, 'for')),
    sums: SUMS.map((balance) => ({
      balance,
      act: me === null ? SACKED : act(lobbyCheck(s, me, p.id, 'for', balance)),
    })),
  };
  const puts = (s.calendar?.rounds ?? [])
    .filter((_, i) => A.rounds.some((r) => r === i))
    .map((r) => r.day - A.open)
    .find((day) => day > s.day);
  return {
    championship: championship(c.tier),
    season: seasonYear(s),
    rules: RULES.map(
      ([m, name, about]): RuleLine => ({
        name,
        now: reads(l.rules, m, n),
        next: reads(l.next, m, n),
        about,
      })
    ),
    proposal,
    counted: l.proposals
      .filter((x) => x.decided !== null)
      .map((x) => line(s, x, l.rules, n))
      .reverse(),
    next: puts === undefined ? null : dateAt(s, puts),
  };
}
