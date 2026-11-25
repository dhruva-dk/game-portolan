import { healRating, planetName, stormRating } from '../fit.ts';
import { YOURS, type CareerState } from '../state.ts';
import type { Livery } from '../../world/livery.ts';
import { RACE_RATINGS } from '../tuning.ts';

export type PlanetView = {
  name: string;
  storm: number;
  heals: number;
  stars: number;
  livery: Livery;
};

export const planetView = (state: CareerState): PlanetView => ({
  name: planetName(state),
  storm: stormRating(state),
  heals: healRating(state),
  stars: Math.max(...RACE_RATINGS),
  livery: state.teams[YOURS].livery,
});
