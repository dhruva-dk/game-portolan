import { approachRefusal } from '../hiring/talks.ts';
import {
  isExact,
  knownAsk,
  knownStars,
  knownStats,
} from '../knowledge/people.ts';
import { reportPrice, reportRefusal } from '../knowledge/report.ts';
import { personOf, seatHolder } from '../lookup.ts';
import { YOURS, type CareerState, type Person, type Role } from '../state.ts';
import { SCOUTING } from '../tuning.ts';
import type { Livery } from '../../world/livery.ts';
import { STAT_IDS, exactCard, uncleCard, type CardView } from './card.ts';

export type Why = 'held' | 'funds' | 'locked';

export type ActionView = { cost: number; faint: boolean; why: Why | null };

export type RivalView = {
  team: number;
  name: string;
  emblem: number;
  livery: Livery;
  clause: number;
};

export type CandidateView = {
  card: CardView;
  exact: boolean;
  pinned: boolean;
  rival: RivalView | null;
  report: ActionView;
  approach: ActionView;
  negotiate: { faint: boolean; why: Why | null };
};

export type DealView = {
  role: Role;
  holder: CardView | null;
  candidates: CandidateView[];
};

export function candidateCard(state: CareerState, person: Person): CardView {
  const stats = knownStats(state, person.id) ?? [],
    stars = knownStars(state, person.id) ?? { lo: 0, hi: 0 },
    wage = knownAsk(state, person.id);
  return {
    who: 'person',
    person: person.id,
    name: person.name,
    portrait: person.portrait,
    role: person.role,
    age: person.age,
    stars,
    stats: STAT_IDS[person.role].map((stat, i) => ({ stat, value: stats[i] })),
    wage,
    racesLeft: null,
  };
}

export function rivalOf(state: CareerState, person: Person): RivalView | null {
  const contract = person.contract;
  if (contract === null || contract.team === YOURS) return null;
  const team = state.teams[contract.team];
  return {
    team: contract.team,
    name: team.name,
    emblem: team.emblem,
    livery: team.livery,
    clause: contract.clause,
  };
}

const why = (reason: string | null): Why | null =>
  reason === null ? null : reason === 'funds' ? 'funds' : 'held';

export function action(cost: number, reason: string | null): ActionView {
  const held = why(reason);
  return { cost, faint: held !== null, why: held };
}

function candidateOf(
  state: CareerState,
  person: Person,
  locked: number | null
): CandidateView {
  const away = locked !== null && locked !== person.id;
  return {
    card: candidateCard(state, person),
    exact: isExact(state, person.id),
    pinned: state.teams[YOURS].approached[person.role] === person.id,
    rival: rivalOf(state, person),
    report: action(
      reportPrice(state, person.id),
      reportRefusal(state, YOURS, person.id)
    ),
    approach: action(
      SCOUTING.approach,
      approachRefusal(state, YOURS, person.id)
    ),
    negotiate: { faint: away, why: away ? 'locked' : null },
  };
}

export function holderOf(state: CareerState, role: Role): CardView | null {
  const holder = seatHolder(state, YOURS, role);
  if (holder !== null) return exactCard(holder);
  return role === 'driver' ? uncleCard() : null;
}

export function dealView(state: CareerState, role: Role): DealView {
  const team = state.teams[YOURS],
    deal = team.deals[role];
  const people = (deal?.candidates ?? []).flatMap((id) => {
    const person = personOf(state, id);
    return person === null ? [] : [person];
  });
  return {
    role,
    holder: holderOf(state, role),
    candidates: people.map((person) =>
      candidateOf(state, person, deal?.locked ?? null)
    ),
  };
}
