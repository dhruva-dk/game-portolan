import type { CareerState, Line, Team } from '../state.ts';
import { LEAGUE, NEWS, POINTS } from '../tuning.ts';

export type Table = Pick<
  CareerState,
  'points' | 'bestPlace' | 'previousStanding'
>;

export function standingOrder(table: Table): number[] {
  const { points, bestPlace, previousStanding } = table;
  return points
    .map((_, team) => team)
    .sort(
      (a, b) =>
        points[b] - points[a] ||
        bestPlace[a] - bestPlace[b] ||
        previousStanding[a] - previousStanding[b]
    );
}

export function standings(table: Table): number[] {
  const result = table.points.map(() => 0);
  standingOrder(table).forEach((team, index) => {
    result[team] = index + 1;
  });
  return result;
}

export const standingOf = (table: Table, team: number): number =>
  standings(table)[team];

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

export type Finish = { place: number; sinkings: number };

export function placePoints(place: number): number {
  if (place >= 1 && place <= POINTS.podium.length)
    return POINTS.podium[place - 1];
  if (place >= 1 && place <= POINTS.lastScoring)
    return POINTS.scoringFrom - place;
  return 0;
}

export const shipPoints = ({ place, sinkings }: Finish): number =>
  placePoints(place) + POINTS.perSinking * sinkings;

export const teamPoints = (ships: readonly Finish[]): number =>
  ships.reduce((sum, ship) => sum + shipPoints(ship), 0);

type Streak = CareerState['winStreak'];

export const nextStreak = (
  streak: Streak,
  winner: number
): { team: number; n: number } =>
  streak !== null && streak.team === winner
    ? { team: winner, n: streak.n + 1 }
    : { team: winner, n: 1 };

export const isStreak = (n: number): boolean => n >= NEWS.streak;

export function lineLeader(
  teams: readonly Pick<Team, 'design'>[],
  line: Line
): number | null {
  let leader: number | null = null;
  let best = -Infinity;
  teams.forEach(({ design }, team) => {
    if (design[line] > best) {
      best = design[line];
      leader = team;
    } else if (design[line] === best) leader = null;
  });
  return leader;
}

export const leaderAfter = (
  stored: number | null,
  current: number | null
): number | null => current ?? stored;
