import { clamp } from '../../world/scalar.ts';
import { LEAGUE_START, LEVEL_SPAN, SHIPS } from '../tuning.ts';
import type { Span } from './peak.ts';

export const strength = (index: number): number =>
  1 - (index - 1) / LEAGUE_START.strengthSpan;

export const startDesign = (t: number, jitter: number): number =>
  clamp(
    LEAGUE_START.design.base + LEAGUE_START.design.perStrength * t + jitter,
    SHIPS.leastLevel,
    LEVEL_SPAN.most
  );

export const startFitted = (design: number, shortfall: number): number =>
  Math.max(SHIPS.leastLevel, design - shortfall);

export function staffLevel(t: number): Span {
  const { base, perStrength, jitter } = LEAGUE_START.staffLevel;
  const level = base + perStrength * t;
  return { lo: level - jitter, hi: level + jitter };
}

export const startBalance = (t: number): number =>
  Math.round(LEAGUE_START.balance.base + LEAGUE_START.balance.perStrength * t);

export const unlockCount = (t: number): number =>
  Math.floor(LEAGUE_START.unlocksPerStrength * t);
