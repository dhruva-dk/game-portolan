import type { Reason } from '../commands.ts';
import { ownerOf, personOf } from '../lookup.ts';
import {
  answerTo,
  ask,
  lowestWage,
  offerScore,
  standingScore,
} from '../rules/hiring.ts';
import { stars } from '../rules/person.ts';
import { reputationOf } from '../rules/standing.ts';
import type { CareerState, Person, Talk, Team, Terms } from '../state.ts';
import { updateTeam } from '../change.ts';
import { CONTRACTS, NEGOTIATION, SCOUTING } from '../tuning.ts';
import { isRenewal, signingFunds } from './cost.ts';
import { sign, talkWith, withTalk } from './sign.ts';

export function willingness(
  state: CareerState,
  team: number,
  person: Person
): (terms: Terms) => number {
  const asking = ask(person);
  const standing = standingScore(
    stars(person.stats),
    reputationOf(state, team)
  );
  return (terms) => offerScore(person, asking, standing, terms);
}

const isCandidate = (team: Team, person: Person): boolean =>
  team.deals[person.role]?.candidates.includes(person.id) ?? false;

const isRenewable = (person: Person, team: number): boolean =>
  isRenewal(person, team) &&
  (person.contract?.racesLeft ?? 0) <= CONTRACTS.renewWithin;

const isOfferable = (
  state: CareerState,
  team: number,
  person: Person
): boolean =>
  isRenewal(person, team)
    ? isRenewable(person, team)
    : isCandidate(state.teams[team], person);

function lockedAway(team: Team, person: Person): boolean {
  const locked = team.deals[person.role]?.locked ?? null;
  return locked !== null && locked !== person.id;
}

export function offerRefusal(
  state: CareerState,
  team: number,
  id: number,
  terms: Terms
): Reason | null {
  if (ownerOf(state, id) !== null) return 'fixed';
  const person = personOf(state, id);
  if (person === null) return 'unknown';
  if (!isOfferable(state, team, person)) return 'seat';
  if (!isRenewal(person, team) && lockedAway(state.teams[team], person))
    return 'locked';
  if (talkWith(state.teams[team], id).attempts >= NEGOTIATION.attempts)
    return 'attempts';
  return signingFunds(state, team, person, terms);
}

function lockTo(team: Team, person: Person): Team {
  const deal = team.deals[person.role];
  if (deal === null || deal.locked !== null) return team;
  return {
    ...team,
    deals: { ...team.deals, [person.role]: { ...deal, locked: person.id } },
  };
}

function counterTerms(
  state: CareerState,
  team: number,
  person: Person,
  terms: Terms
): Terms | null {
  const score = willingness(state, team, person);
  const wage = lowestWage(
    (w) => score({ ...terms, wage: w }),
    NEGOTIATION.counterTarget
  );
  return wage === null
    ? null
    : { wage, seasons: terms.seasons, fee: terms.fee, clause: terms.clause };
}

function answered(talk: Talk, counter: Terms | null): Talk {
  return {
    ...talk,
    attempts: talk.attempts + 1,
    answer: counter === null ? 'refused' : 'countered',
    counter,
  };
}

export function offer(
  state: CareerState,
  team: number,
  id: number,
  terms: Terms
): CareerState {
  const person = personOf(state, id);
  if (person === null) return state;
  const renewal = isRenewal(person, team);
  const locked = renewal
    ? state
    : updateTeam(state, team, (t) => lockTo(t, person));
  const answer = answerTo(willingness(state, team, person)(terms));
  if (answer === 'signs') return sign(locked, team, person, terms);
  const counter =
    answer === 'counters' ? counterTerms(state, team, person, terms) : null;
  return updateTeam(locked, team, (t) =>
    withTalk(t, answered(talkWith(t, id), counter))
  );
}

export function counterRefusal(
  state: CareerState,
  team: number,
  id: number
): Reason | null {
  const person = personOf(state, id);
  if (person === null || !isOfferable(state, team, person)) return 'seat';
  const { counter } = talkWith(state.teams[team], id);
  if (counter === null) return 'seat';
  return signingFunds(state, team, person, counter);
}

export function acceptCounter(
  state: CareerState,
  team: number,
  id: number
): CareerState {
  const person = personOf(state, id);
  const { counter } = talkWith(state.teams[team], id);
  return person === null || counter === null
    ? state
    : sign(state, team, person, counter);
}

export function approachRefusal(
  state: CareerState,
  team: number,
  id: number
): Reason | null {
  if (ownerOf(state, id) !== null) return 'fixed';
  const person = personOf(state, id);
  if (person === null) return 'unknown';
  if (person.contract?.team === team) return 'fixed';
  const { approached, balance } = state.teams[team];
  if (approached[person.role] === id) return 'same';
  return balance < SCOUTING.approach ? 'funds' : null;
}

export function approach(
  state: CareerState,
  team: number,
  id: number
): CareerState {
  const person = personOf(state, id);
  if (person === null) return state;
  return updateTeam(state, team, (t) => ({
    ...t,
    balance: t.balance - SCOUTING.approach,
    approached: { ...t.approached, [person.role]: id },
  }));
}
