import { standings } from '../rules/standing.ts';
import { FIRST_RACE, type CareerState, type Person } from '../state.ts';
import { STANDING } from '../tuning.ts';
import { vacate } from '../vacate.ts';

const expired = (person: Person): boolean => person.contract?.racesLeft === 0;

export function releaseExpired(state: CareerState): CareerState {
  const leaving = new Set(state.people.filter(expired).map((p) => p.id));
  return {
    ...state,
    people: state.people.map((person) =>
      leaving.has(person.id) ? { ...person, contract: null } : person
    ),
    teams: vacate(state.teams, leaving),
  };
}

export function turnSeason(state: CareerState): CareerState {
  const cleared = {
    ...state,
    previousStanding: standings(state),
    season: state.season + 1,
    race: FIRST_RACE,
    points: state.points.map(() => 0),
    bestPlace: state.bestPlace.map(() => STANDING.noRaceYet),
  };
  return { ...cleared, lastStanding: standings(cleared) };
}
