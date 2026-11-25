import { billAfter, costToSign } from '../hiring/cost.ts';
import { willingness } from '../hiring/talks.ts';
import { wageBill } from '../record/pay.ts';
import { ask, lowestWage, standardClause } from '../rules/hiring.ts';
import { affordablePurchase, leavesReserve } from '../rules/money.ts';
import type { CareerState, Person, Terms } from '../state.ts';
import { NEGOTIATION, POLICY, STAT_SPAN } from '../tuning.ts';

export function minimumTerms(
  state: CareerState,
  team: number,
  person: Person
): Terms | null {
  const score = willingness(state, team, person);
  const rest = {
    seasons: person.preferred,
    fee: NEGOTIATION.fee.least,
    clause: standardClause(ask(person)),
  };
  const wage = lowestWage(
    (w) => score({ ...rest, wage: w }),
    NEGOTIATION.signs
  );
  return wage === null ? null : { wage, ...rest };
}

export type Means = { build: number; share: number; reserve: number };

export function meansOf(nerve: number): Means {
  const n = (nerve - STAT_SPAN.least) / (STAT_SPAN.most - STAT_SPAN.least);
  const { leastNerve, mostNerve } = POLICY;
  const along = (key: keyof Means): number =>
    leastNerve[key] * (1 - n) + mostNerve[key] * n;
  return {
    build: along('build'),
    share: along('share'),
    reserve: along('reserve'),
  };
}

const affordableSigning = (
  state: CareerState,
  team: number,
  person: Person,
  terms: Terms,
  means: Means
): boolean =>
  leavesReserve(
    state.teams[team].balance,
    costToSign(state, team, person, terms),
    billAfter(state, team, person, terms),
    means.reserve
  );

export function signableTerms(
  state: CareerState,
  team: number,
  person: Person,
  means: Means
): Terms | null {
  const terms = minimumTerms(state, team, person);
  return terms !== null && affordableSigning(state, team, person, terms, means)
    ? terms
    : null;
}

export const purchasable = (
  state: CareerState,
  team: number,
  cost: number,
  means: Means
): boolean =>
  affordablePurchase(
    state.teams[team].balance,
    cost,
    wageBill(state, team),
    means.share,
    means.reserve
  );
