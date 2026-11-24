import type { CareerState } from '../state.ts';

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
