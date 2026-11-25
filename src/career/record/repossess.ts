import { announce } from '../announce.ts';
import { redrawRepossessed } from '../knowledge/ships.ts';
import { emptyTeam, newYard } from '../start.ts';
import type { CareerState, Team } from '../state.ts';
import { REPOSSESSION } from '../tuning.ts';

type Repossession = { state: CareerState; teams: readonly number[] };

export const isRepossessed = (balance: number): boolean =>
  balance < REPOSSESSION.below;

const reset = (team: Team): Team => ({
  ...team,
  ...emptyTeam(),
  ...newYard(),
  balance: REPOSSESSION.balance,
});

export function repossessTeam(state: CareerState, index: number): CareerState {
  const reclaimed: CareerState = {
    ...state,
    teams: state.teams.map((team, i) => (i === index ? reset(team) : team)),
    people: state.people.map((person) =>
      person.contract?.team === index ? { ...person, contract: null } : person
    ),
  };
  return announce(redrawRepossessed(reclaimed, index), {
    kind: 'repossessed',
    team: index,
  });
}

export function repossess(state: CareerState): Repossession {
  const teams = state.teams.flatMap((team, index) =>
    isRepossessed(team.balance) ? [index] : []
  );
  return { state: teams.reduce(repossessTeam, state), teams };
}
