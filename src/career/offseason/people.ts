import { aged, retires } from '../rules/ageing.ts';
import { rookie } from '../rules/person.ts';
import type { CareerState } from '../state.ts';
import { vacate } from '../vacate.ts';

export function ageLeague(state: CareerState): CareerState {
  const older = state.people.map(aged);
  const retired = older.filter(retires);
  const gone = new Set(retired.map((person) => person.id));
  const rookies = retired.map((person, index) =>
    rookie(state.seed, state.nextPersonId + index, person.role)
  );
  return {
    ...state,
    people: [...older.filter((person) => !gone.has(person.id)), ...rookies],
    nextPersonId: state.nextPersonId + retired.length,
    teams: vacate(state.teams, gone),
  };
}
