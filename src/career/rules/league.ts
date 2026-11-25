import { clamp } from '../../world/scalar.ts';
import { HEADCOUNT, LEAGUE_START, LEVEL_SPAN, SHIPS } from '../tuning.ts';
import { income, parLevel } from './money.ts';
import type { Span } from './person.ts';

export const startDesign = (merit: number, jitter: number): number =>
  clamp(parLevel(merit) + jitter, SHIPS.leastLevel, LEVEL_SPAN.most);

export const startFitted = (design: number, shortfall: number): number =>
  Math.max(SHIPS.leastLevel, design - shortfall);

export function staffLevel(merit: number): Span {
  const { lo, hi } = HEADCOUNT.freeAgentLevel;
  const level = lo + (hi - lo) * merit;
  const jitter = LEAGUE_START.staffJitter;
  return { lo: level - jitter, hi: level + jitter };
}

export const startBalance = (merit: number): number =>
  Math.round(LEAGUE_START.balanceRaces * income(merit));

export const unlockCount = (merit: number): number =>
  Math.floor(LEAGUE_START.unlocksAtTop * merit);
