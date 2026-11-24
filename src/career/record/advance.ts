import type { CareerState, Phase } from '../state.ts';
import { LEAGUE } from '../tuning.ts';

export const seasonOver = (state: CareerState): boolean =>
  state.race >= LEAGUE.racesPerSeason;

export const enterPhase = (state: CareerState, phase: Phase): CareerState => ({
  ...state,
  phase,
});

export const nextRaceLobby = (state: CareerState): CareerState => ({
  ...state,
  race: state.race + 1,
  phase: 'lobby',
});
