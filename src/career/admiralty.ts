// The Admiralty: each tier votes on its own next season's rules twice a season (before rounds
// 4 and 8 as players count them). The Admiralty puts one proposal: which part types are spec; the storm's pace;
// banning a gun kind; points per sinking; the sea-held point; prize money's spread; the inspection rate.
//
// Each team has one vote. A rival votes by a measure of its own state (measure.ts); one near even abstains, unless
// swayed: each side's sway is the sum of its backers' manager reputation × (a rival's Politics u; the player's 1),
// plus the money lobbied for it, and each abstainer joins the side with more sway with a chance of the margin's share.
// Votes cast decide; a tie keeps the rule. The result comes by mail and takes effect at the season's end (rulesTurned).

import { known } from './canon.ts';
import { KINDS } from '../kinds.ts';
import type { Rules } from '../race.ts';
import type { Change, Measure } from '../office/command.ts';
import { canSpend, paid } from './balance.ts';
import {
  accept,
  refuse,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import { pick, shuffled, type Dice, type Rand } from './dice.ts';
import { effective } from './effective.ts';
import { sway as politicsSway } from './leadership.ts';
import { lean } from './measure.ts';
import { mine, post } from './post.ts';
import { schedule, type Event } from './queue.ts';
import type { CareerState, Proposal, Side } from './state.ts';
import { TUNING } from './tuning.ts';
import { inRole } from './roles.ts';
import { TYPES } from './components.ts';

const A = TUNING.admiralty;
const MEASURES: readonly Measure[] = [
  'spec',
  'storm',
  'ban',
  'pointsPerSinking',
  'seaHeldPoint',
  'prizeSpread',
  'inspection',
];
const clamp = (x: number, r: readonly [number, number]) =>
  Math.min(r[1], Math.max(r[0], x));
const hundredth = (x: number) => Math.round(x * 100) / 100;

/** A change of a measure to next season's rules as they stand, or null if that measure has none to offer. */
export function changeOf(m: Measure, next: Rules, rand: Rand): Change | null {
  const sign = rand() < 0.5 ? -1 : 1;
  const moved = (now: number, step: number, r: readonly [number, number]) => {
    const a = hundredth(clamp(now + sign * step, r));
    return a !== hundredth(now) ? a : hundredth(clamp(now - sign * step, r));
  };
  switch (m) {
    case 'spec': {
      const type = pick(rand, TYPES);
      return { measure: 'spec', type, spec: !next.spec.includes(type) };
    }
    case 'storm':
      return { measure: 'storm', pace: moved(next.storm, A.pace, A.paceRange) };
    case 'ban': {
      const open = KINDS.filter((k) => !next.banned.includes(k));
      return open.length <= 2
        ? null
        : { measure: 'ban', kind: pick(rand, open) };
    }
    case 'pointsPerSinking':
      return {
        measure: 'pointsPerSinking',
        points: moved(next.pointsPerSinking, 1, A.points),
      };
    case 'seaHeldPoint':
      return { measure: 'seaHeldPoint', on: !next.seaHeldPoint };
    case 'prizeSpread':
      return {
        measure: 'prizeSpread',
        spread: moved(next.prizeSpread, A.spread, A.spreadRange),
      };
    case 'inspection':
      return {
        measure: 'inspection',
        share: hundredth(
          moved(next.inspection, A.inspection, A.inspectionRange)
        ),
      };
  }
}

/** Rules with a change made. */
export function changed(r: Rules, c: Change): Rules {
  switch (c.measure) {
    case 'spec':
      return {
        ...r,
        spec: c.spec
          ? [...new Set([...r.spec, c.type])]
          : r.spec.filter((t) => t !== c.type),
      };
    case 'storm':
      return { ...r, storm: c.pace };
    case 'ban':
      return { ...r, banned: [...new Set([...r.banned, c.kind])] };
    case 'pointsPerSinking':
      return { ...r, pointsPerSinking: c.points };
    case 'seaHeldPoint':
      return { ...r, seaHeldPoint: c.on };
    case 'prizeSpread':
      return { ...r, prizeSpread: c.spread };
    case 'inspection':
      return { ...r, inspection: c.share };
  }
}

/** The Admiralty puts a tier's proposal: one measure by seed, its vote scheduled; the tier's teams are told. */
export function proposalPut(
  s: CareerState,
  e: Extract<Event, { kind: 'proposal' }>,
  roll: Dice
): CareerState {
  const rand = roll.roll('admiralty');
  const l = s.championships[e.tier];
  let change: Change | null = null;
  for (const m of shuffled(rand, MEASURES))
    if ((change = changeOf(m, l.next, rand))) break;
  if (!change) return s;
  const id = s.ids.proposal;
  const closes = s.day + A.open - 1;
  const p: Proposal = {
    id,
    round: e.round,
    closes,
    change,
    votes: {},
    lobbied: { for: 0, against: 0 },
    decided: null,
  };
  const championships = [...s.championships];
  championships[e.tier] = { ...l, proposals: [...l.proposals, p] };
  let out: CareerState = {
    ...s,
    championships,
    ids: { ...s.ids, proposal: id + 1 },
  };
  const me = mine(out);
  if (me !== null && out.teams[me].tier === e.tier) {
    out = post(out, {
      team: me,
      category: 'tier',
      sender: null,
      kind: 'voteDue',
      slots: { proposal: id, measure: change.measure, closes },
      links: [],
    });
  }
  return schedule(out, closes, { kind: 'vote', tier: e.tier, proposal: id });
}

/** A proposal of a tier by id. */
export const proposalOf = (
  s: CareerState,
  tier: number,
  id: number
): Proposal | null =>
  s.championships[tier]?.proposals.find((p) => p.id === id) ?? null;

/** A state with a proposal changed. */
function withProposal(s: CareerState, tier: number, p: Proposal): CareerState {
  const championships = [...s.championships];
  championships[tier] = {
    ...s.championships[tier],
    proposals: s.championships[tier].proposals.map((x) =>
      x.id === p.id ? p : x
    ),
  };
  return { ...s, championships };
}

/** A rival team's side on a proposal, by its measure (near even: abstain). */
export function rivalSide(s: CareerState, team: number, change: Change): Side {
  const m = lean(s, team, change);
  return Math.abs(m) < A.abstain ? 'abstain' : m > 0 ? 'for' : 'against';
}

/** A state with a team's vote cast. */
export const cast = (
  s: CareerState,
  tier: number,
  p: Proposal,
  team: number,
  side: Side
): CareerState =>
  withProposal(s, tier, { ...p, votes: { ...p.votes, [team]: side } });

/** A team's sway: its manager's reputation × Politics u (the player: × 1). */
export function swayOf(s: CareerState, team: number): number {
  const c = s.teams[team];
  if (c.staff.manager === null) return 0;
  const g = s.people[c.staff.manager];
  return c.player
    ? g.reputation
    : politicsSway(
        effective(inRole(g, 'manager'), null).politics,
        g.reputation
      );
}

/** Each side's sway on a proposal: its backers' and what was lobbied. */
export function sways(
  s: CareerState,
  tier: number,
  p: Proposal
): { for: number; against: number } {
  const out = { for: p.lobbied.for, against: p.lobbied.against };
  for (const team of s.championships[tier].teams) {
    const v = p.votes[team];
    if (v === 'for' || v === 'against') out[v] += swayOf(s, team);
  }
  return out;
}

/** A proposal's votes counted: rivals yet to vote vote by their measure, the player's team abstains if silent;
 *  abstaining rivals are swayed; votes cast decide, a tie keeps the rule; next season's rules change if carried. */
export function counted(
  s: CareerState,
  e: Extract<Event, { kind: 'vote' }>,
  roll: Dice
): CareerState {
  let p = proposalOf(s, e.tier, e.proposal);
  if (!p || p.decided !== null) return s;
  const votes: Record<string, Side> = { ...p.votes };
  for (const team of s.championships[e.tier].teams) {
    if (votes[team] !== undefined) continue;
    votes[team] =
      s.teams[team].player || s.teams[team].staff.manager === null
        ? 'abstain'
        : rivalSide(s, team, p.change);
  }
  p = { ...p, votes };
  const sw = sways(s, e.tier, p);
  const more =
    sw.for === sw.against ? null : sw.for > sw.against ? 'for' : 'against';
  const chance =
    more === null ? 0 : Math.abs(sw.for - sw.against) / (sw.for + sw.against);
  const rand = roll.roll('votes');
  for (const team of s.championships[e.tier].teams) {
    if (
      votes[team] === 'abstain' &&
      !s.teams[team].player &&
      more !== null &&
      rand() < chance
    )
      votes[team] = more;
  }
  const yes = Object.values(votes).filter((v) => v === 'for').length,
    no = Object.values(votes).filter((v) => v === 'against').length;
  const carried = yes > no;
  let out = withProposal(s, e.tier, { ...p, votes, decided: carried });
  if (carried) {
    const championships = [...out.championships];
    championships[e.tier] = {
      ...out.championships[e.tier],
      next: changed(out.championships[e.tier].next, p.change),
    };
    out = { ...out, championships };
  }
  const me = mine(out);
  if (me !== null && out.teams[me].tier === e.tier) {
    out = post(out, {
      team: me,
      category: 'tier',
      sender: null,
      kind: 'voteResult',
      slots: {
        proposal: p.id,
        carried: carried ? 1 : 0,
        for: yes,
        against: no,
      },
      links: [],
    });
  }
  return out;
}

/** Whether the player's team may vote on, or lobby for, a proposal now. */
function voteCheck(
  s: CareerState,
  team: number,
  proposal: number,
  side: string
): Check {
  const p = whole(proposal, 0, Number.MAX_SAFE_INTEGER)
    ? proposalOf(s, s.teams[team].tier, proposal)
    : null;
  if (!p) return why('proposal', 'Your tier has no such proposal.');
  if (p.decided !== null || s.day > p.closes)
    return why('closed', 'That vote is closed.');
  if (side !== 'for' && side !== 'against' && side !== 'abstain')
    return why('side', 'For, against, or abstain.');
  return null;
}

/** Whether the player's team may lobby a sum for a side. */
function lobbyCheck(
  s: CareerState,
  team: number,
  proposal: number,
  side: string,
  balance: number
): Check {
  const no = voteCheck(s, team, proposal, side);
  if (no) return no;
  if (side === 'abstain') return why('side', 'Lobby for a side.');
  if (!whole(balance, 1, Number.MAX_SAFE_INTEGER))
    return why('balance', 'Lobby a sum of money.');
  if (!canSpend(s.teams[team], balance))
    return why(
      'balance',
      'The chairman will not let the balance fall that far.'
    );
  return null;
}

/** A state with a sum lobbied (checked first): paid, its sway added to the side. */
function lobbied(
  s: CareerState,
  team: number,
  proposal: number,
  side: 'for' | 'against',
  balance: number
): CareerState {
  const tier = s.teams[team].tier;
  const p = known(proposalOf(s, tier, proposal));
  const out = withProposal(s, tier, {
    ...p,
    lobbied: { ...p.lobbied, [side]: p.lobbied[side] + balance * A.lobby },
  });
  return paid(out, team, balance, {
    kind: 'lobby',
    what: 'lobbying the Admiralty',
  });
}

/** A state at the season's end with each tier's voted rules in force and its proposals cleared (section 13). */
export const rulesTurned = (s: CareerState): CareerState => ({
  ...s,
  championships: s.championships.map((l) => ({
    ...l,
    rules: l.next,
    next: { ...l.next },
    proposals: [],
  })),
});

export const ADMIRALTY: Handlers = {
  Vote: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const no = voteCheck(s, me, c.proposal, c.side);
    return no
      ? refuse(no.code, no.sentence)
      : accept(
          cast(
            s,
            s.teams[me].tier,
            known(proposalOf(s, s.teams[me].tier, c.proposal)),
            me,
            c.side
          )
        );
  },
  Lobby: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const no = lobbyCheck(s, me, c.proposal, c.side, c.balance);
    return no
      ? refuse(no.code, no.sentence)
      : accept(lobbied(s, me, c.proposal, c.side, c.balance));
  },
};
