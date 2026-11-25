import { billAfter, costToSign } from '../hiring/cost.ts';
import { wageBill } from '../record/pay.ts';
import { affordablePurchase } from '../rules/purchase.ts';
import { leavesReserve } from '../rules/reserve.ts';
import type { Temperament } from '../rules/temperament.ts';
import type { CareerState, Person, Terms } from '../state.ts';
import { POLICY } from '../tuning.ts';
import { minimumTerms } from './terms.ts';

export type Means = { build: number; share: number; reserve: number };

export const meansOf = (temperament: Temperament): Means => POLICY[temperament];

export const affordableSigning = (
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
