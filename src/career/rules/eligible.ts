import { clamp } from '../../world/scalar.ts';
import { STARS, WANTS } from '../tuning.ts';

export const expectedReputation = (starCount: number): number =>
  WANTS.expectedWorst - (WANTS.expectedSpan * starCount) / STARS.most;

export const standingScore = (starCount: number, reputation: number): number =>
  clamp(
    1 - (reputation - expectedReputation(starCount)) / WANTS.standingSpan,
    WANTS.standingScore.lo,
    WANTS.standingScore.hi
  );

export const eligible = (starCount: number, reputation: number): boolean =>
  standingScore(starCount, reputation) >= WANTS.eligible;
