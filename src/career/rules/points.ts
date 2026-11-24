import { POINTS } from '../tuning.ts';

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
