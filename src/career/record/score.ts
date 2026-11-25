import type { MatchResult } from '../../sim/result.ts';
import { standings, teamPoints } from '../rules/standing.ts';
import type { CareerState } from '../state.ts';
import { bestPlaceOf, teamShips } from './finish.ts';

export const racePoints = (result: MatchResult, team: number): number =>
  teamPoints(teamShips(result, team));

export const scoreRace = (
  state: CareerState,
  result: MatchResult
): CareerState => ({
  ...state,
  lastStanding: standings(state),
  points: state.points.map((points, team) => points + racePoints(result, team)),
  bestPlace: state.bestPlace.map((best, team) =>
    Math.min(best, bestPlaceOf(result, team))
  ),
});
