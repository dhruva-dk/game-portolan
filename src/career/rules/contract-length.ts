import { LEAGUE } from '../tuning.ts';

export const racesLeftOnSigning = (
  seasons: number,
  race: number,
  offseason: boolean
): number =>
  offseason
    ? seasons * LEAGUE.racesPerSeason
    : LEAGUE.racesPerSeason + 1 - race + (seasons - 1) * LEAGUE.racesPerSeason;

export const renewedRacesLeft = (racesLeft: number, seasons: number): number =>
  racesLeft + seasons * LEAGUE.racesPerSeason;
