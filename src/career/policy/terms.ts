import { willingness } from '../hiring/willingness.ts';
import { ask, lowestWage, standardClause } from '../rules/hiring.ts';
import type { CareerState, Person, Terms } from '../state.ts';
import { NEGOTIATION } from '../tuning.ts';

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
