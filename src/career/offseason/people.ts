import { announce, named } from '../announce.ts';
import { aged, retires, rookie } from '../rules/person.ts';
import type { CareerState, NewsEvent, Person } from '../state.ts';
import { vacate } from '../vacate.ts';

const retiredNews = (person: Person): NewsEvent => ({
  kind: 'retired',
  ...(person.contract === null ? {} : { team: person.contract.team }),
  ...named(person),
  age: person.age,
});

const rookieNews = (person: Person): NewsEvent => ({
  kind: 'rookie',
  ...named(person),
  age: person.age,
});

export function ageLeague(state: CareerState): CareerState {
  const older = state.people.map(aged);
  const retired = older.filter(retires);
  const gone = new Set(retired.map((person) => person.id));
  const rookies = retired.map((person, index) =>
    rookie(state.seed, state.nextPersonId + index, person.role)
  );
  return announce(
    {
      ...state,
      people: [...older.filter((person) => !gone.has(person.id)), ...rookies],
      nextPersonId: state.nextPersonId + retired.length,
      teams: vacate(state.teams, gone),
    },
    ...retired.map(retiredNews),
    ...rookies.map(rookieNews)
  );
}
