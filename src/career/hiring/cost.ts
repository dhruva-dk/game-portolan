import type { Reason } from '../commands.ts';
import { seatHolder } from '../lookup.ts';
import { wageBill } from '../record/pay.ts';
import { releaseCost } from '../rules/hiring.ts';
import { leavesReserve } from '../rules/money.ts';
import type { CareerState, Person, Terms } from '../state.ts';

export const isRenewal = (person: Person, team: number): boolean =>
  person.contract?.team === team;

export function outgoing(
  state: CareerState,
  team: number,
  person: Person
): Person | null {
  const holder = seatHolder(state, team, person.role);
  return holder === null || holder.id === person.id ? null : holder;
}

export const clauseOwed = (person: Person, team: number): number =>
  person.contract !== null && person.contract.team !== team
    ? person.contract.clause
    : 0;

export const releaseCostOf = (person: Person): number =>
  person.contract === null
    ? 0
    : releaseCost(person.contract.wage, person.contract.racesLeft);

export function costToSign(
  state: CareerState,
  team: number,
  person: Person,
  terms: Terms
): number {
  if (isRenewal(person, team)) return terms.fee;
  const holder = outgoing(state, team, person);
  return (
    terms.fee +
    clauseOwed(person, team) +
    (holder === null ? 0 : releaseCostOf(holder))
  );
}

export function billAfter(
  state: CareerState,
  team: number,
  person: Person,
  terms: Terms
): number {
  const leaving = isRenewal(person, team)
    ? person
    : outgoing(state, team, person);
  return wageBill(state, team) - (leaving?.contract?.wage ?? 0) + terms.wage;
}

export const signingFunds = (
  state: CareerState,
  team: number,
  person: Person,
  terms: Terms
): Reason | null =>
  leavesReserve(
    state.teams[team].balance,
    costToSign(state, team, person, terms),
    billAfter(state, team, person, terms)
  )
    ? null
    : 'funds';
