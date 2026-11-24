import { STARS } from '../tuning.ts';

export function stars(stats: readonly number[]): number {
  const mean = stats.reduce((sum, stat) => sum + stat, 0) / stats.length;
  return Math.floor((mean / STARS.perStar) * STARS.steps) / STARS.steps;
}
