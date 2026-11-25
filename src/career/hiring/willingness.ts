import { ask, offerScore, standingScore } from '../rules/hiring.ts';
import { reputationOf } from '../rules/standing.ts';
import { stars } from '../rules/person.ts';
import type { CareerState, Person, Terms } from '../state.ts';

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
