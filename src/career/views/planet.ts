import { healRating, planetName, stormRating } from '../fit.ts';
import type { CareerState } from '../state.ts';
import { RACE_RATINGS } from '../tuning.ts';

export type PlanetView = {
  name: string;
  storm: number;
  heals: number;
  stars: number;
};

export const planetView = (state: CareerState): PlanetView => ({
  name: planetName(state),
  storm: stormRating(state),
  heals: healRating(state),
  stars: Math.max(...RACE_RATINGS),
});
