import type { Person, Terms } from '../state.ts';
import { LEAGUE, NEGOTIATION } from '../tuning.ts';
import { standardClause } from './clause.ts';

export type Wanting = Pick<Person, 'wants' | 'preferred'>;

export const moneyScore = (terms: Terms, ask: number): number =>
  (terms.wage +
    (NEGOTIATION.feeWeight * terms.fee) /
      (terms.seasons * LEAGUE.racesPerSeason)) /
  ask;

export const securityScore = (seasons: number, preferred: number): number =>
  1 - Math.abs(seasons - preferred) / NEGOTIATION.securitySpan;

export const clausePenalty = (clause: number, ask: number): number =>
  NEGOTIATION.clausePenalty * Math.max(0, clause / standardClause(ask) - 1);

export const offerScore = (
  person: Wanting,
  ask: number,
  standing: number,
  terms: Terms
): number =>
  person.wants.money * moneyScore(terms, ask) +
  person.wants.standing * standing +
  person.wants.security * securityScore(terms.seasons, person.preferred) -
  clausePenalty(terms.clause, ask);
