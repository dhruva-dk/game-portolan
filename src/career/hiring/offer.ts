import type { Reason } from '../commands.ts';
import { ownerOf, personOf } from '../lookup.ts';
import { answerTo } from '../rules/answer.ts';
import { lowestWage } from '../rules/lowest-wage.ts';
import type { CareerState, Person, Talk, Team, Terms } from '../state.ts';
import { updateTeam } from '../teams.ts';
import { CONTRACTS, NEGOTIATION } from '../tuning.ts';
import { isRenewal, signingFunds } from './cost.ts';
import { sign } from './sign.ts';
import { talkWith, withTalk } from './talks.ts';
import { willingness } from './willingness.ts';

const isCandidate = (team: Team, person: Person): boolean =>
  team.deals[person.role]?.candidates.includes(person.id) ?? false;

const isRenewable = (person: Person, team: number): boolean =>
  isRenewal(person, team) &&
  (person.contract?.racesLeft ?? 0) <= CONTRACTS.renewWithin;

export const isOfferable = (
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
