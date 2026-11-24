import { SEASON_PRIZE } from '../tuning.ts';

export const seasonPrize = (standing: number): number =>
  Math.round(
    SEASON_PRIZE.prize *
      ((SEASON_PRIZE.from - standing) / SEASON_PRIZE.span) ** SEASON_PRIZE.power
  );
