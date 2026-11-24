import type { CareerState } from '../state.ts';
import { LEAGUE } from '../tuning.ts';
import { standings, type Table } from './standing.ts';

export const reputation = (
  previous: number,
  standing: number,
  done: number
): number => previous + ((standing - previous) * done) / LEAGUE.racesPerSeason;

export const racesDone = (
  state: Pick<CareerState, 'race' | 'phase'>
): number =>
  state.phase === 'offseason' ? LEAGUE.racesPerSeason : state.race - 1;

export function reputations(
  state: Table & Pick<CareerState, 'race' | 'phase'>
): number[] {
  const done = racesDone(state);
  return standings(state).map((standing, team) =>
    reputation(state.previousStanding[team], standing, done)
  );
}

export const reputationOf = (
  state: Table & Pick<CareerState, 'race' | 'phase'>,
  team: number
): number => reputations(state)[team];
