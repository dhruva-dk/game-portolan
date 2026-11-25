import { ask } from '../rules/ask.ts';
import { standingScore } from '../rules/eligible.ts';
import { reputationOf } from '../rules/reputation.ts';
import { offerScore } from '../rules/score.ts';
import { stars } from '../rules/stars.ts';
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
