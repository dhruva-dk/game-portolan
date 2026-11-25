import type { CareerState } from '../state.ts';
import { NEWS } from '../tuning.ts';

export type Streak = CareerState['winStreak'];

export const nextStreak = (
  streak: Streak,
  winner: number
): { team: number; n: number } =>
  streak !== null && streak.team === winner
    ? { team: winner, n: streak.n + 1 }
    : { team: winner, n: 1 };

export const isStreak = (n: number): boolean => n >= NEWS.streak;
