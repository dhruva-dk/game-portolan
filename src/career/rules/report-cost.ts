import { SCOUTING } from '../tuning.ts';

export const reportCost = (topStars: number): number =>
  Math.max(SCOUTING.leastReport, SCOUTING.reportPerStar * topStars);
