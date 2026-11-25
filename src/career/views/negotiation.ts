import type { Reason } from '../commands.ts';
import { costToSign, isRenewal, signingFunds } from '../hiring/cost.ts';
import { talkWith } from '../hiring/sign.ts';
import { counterRefusal, offerRefusal, willingness } from '../hiring/talks.ts';
import { isExact, knownAsk, knownStars } from '../knowledge/people.ts';
import { personOf } from '../lookup.ts';
import {
  askingWage,
  offerScore,
  standardClause,
  standingScore,
} from '../rules/hiring.ts';
import { reputationOf } from '../rules/standing.ts';
import {
  YOURS,
  type CareerState,
  type Person,
  type Range,
  type Talk,
  type Terms,
} from '../state.ts';
import { NEGOTIATION } from '../tuning.ts';
import { exactCard, type CardView } from './card.ts';
import { candidateCard, holderOf, rivalOf, type RivalView } from './deal.ts';

export type Seasons = Terms['seasons'];

export type Edit = {
  wage: number;
  seasons: Seasons;
  fee: number;
  clause: number | null;
};

export type StepView = {
  value: number;
  least: number;
  most: number;
  step: number;
};

export type NegotiationView = {
  person: number;
  renewal: boolean;
  card: CardView;
  holder: CardView | null;
  rival: RivalView | null;
  pinned: boolean;
  edit: Edit;
  terms: Terms;
  wage: StepView;
  seasons: { value: Seasons; choices: readonly Seasons[] };
  fee: StepView;
  clause: StepView & { following: boolean };
  cost: { cost: number; after: number; funds: boolean };
  willingness: Range & {
    least: number;
    most: number;
    counters: number;
    signs: number;
    exact: boolean;
  };
  attempts: { used: number; most: number };
  answer: Talk['answer'];
  counter: { wage: number; faint: boolean; why: Reason | null } | null;
  offer: { faint: boolean; why: Reason | null };
};

const SEASONS: readonly Seasons[] = [1, 2, 3];

const within = (value: number, range: { least: number; most: number }) =>
  Math.min(range.most, Math.max(range.least, value));

function startOf(state: CareerState, person: Person): Edit {
  const asked = knownAsk(state, person.id);
  return {
    wage: asked?.lo ?? NEGOTIATION.wage.least,
    seasons: 2,
    fee: 0,
    clause: null,
  };
}

const termsOf = (edit: Edit): Terms => {
  const wage = within(edit.wage, NEGOTIATION.wage);
  return {
    wage,
    seasons: edit.seasons,
    fee: within(edit.fee, NEGOTIATION.fee),
    clause: within(edit.clause ?? standardClause(wage), NEGOTIATION.clause),
  };
};

function scoreBand(state: CareerState, person: Person, terms: Terms): Range {
  if (isExact(state, person.id)) {
    const score = willingness(state, YOURS, person)(terms);
    return { lo: score, hi: score };
  }
  const known = knownStars(state, person.id) ?? { lo: 0, hi: 0 },
    reputation = reputationOf(state, YOURS),
    at = (starCount: number) =>
      offerScore(
        person,
        askingWage(starCount, person.wageFactor),
        standingScore(starCount, reputation),
        terms
      );
  const a = at(known.hi),
    b = at(known.lo);
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

const stepOf = (
  value: number,
  range: { least: number; most: number; step: number }
): StepView => ({ value, ...range });

export function negotiationView(
  state: CareerState,
  id: number,
  edited: Edit | null = null
): NegotiationView | null {
  const person = personOf(state, id);
  if (person === null) return null;
  const renewal = isRenewal(person, YOURS),
    edit = edited ?? startOf(state, person),
    terms = termsOf(edit),
    team = state.teams[YOURS],
    talk = talkWith(team, id),
    cost = costToSign(state, YOURS, person, terms),
    offered = offerRefusal(state, YOURS, id, terms),
    band = scoreBand(state, person, terms);
  const accepting =
    talk.counter === null ? null : counterRefusal(state, YOURS, id);
  return {
    person: id,
    renewal,
    card: renewal ? exactCard(person) : candidateCard(state, person),
    holder: renewal ? null : holderOf(state, person.role),
    rival: renewal ? null : rivalOf(state, person),
    pinned: !renewal && team.approached[person.role] === id,
    edit,
    terms,
    wage: stepOf(terms.wage, NEGOTIATION.wage),
    seasons: { value: terms.seasons, choices: SEASONS },
    fee: stepOf(terms.fee, NEGOTIATION.fee),
    clause: {
      ...stepOf(terms.clause, NEGOTIATION.clause),
      following: edit.clause === null,
    },
    cost: {
      cost,
      after: team.balance - cost,
      funds: signingFunds(state, YOURS, person, terms) === 'funds',
    },
    willingness: {
      ...band,
      least: NEGOTIATION.bar.lo,
      most: NEGOTIATION.bar.hi,
      counters: NEGOTIATION.counters,
      signs: NEGOTIATION.signs,
      exact: isExact(state, id),
    },
    attempts: { used: talk.attempts, most: NEGOTIATION.attempts },
    answer: talk.answer,
    counter:
      talk.counter === null
        ? null
        : {
            wage: talk.counter.wage,
            faint: accepting !== null,
            why: accepting,
          },
    offer: { faint: offered !== null, why: offered },
  };
}
