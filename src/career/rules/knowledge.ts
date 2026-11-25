import { clamp } from '../../world/scalar.ts';
import type { Range } from '../state.ts';
import {
  KNOWLEDGE,
  LEVEL_SPAN,
  RIVAL_SHIPS,
  SCOUTING,
  STAT_SPAN,
} from '../tuning.ts';
import { askingWage } from './hiring.ts';
import { stars } from './person.ts';

const inSpan = (level: number): number =>
  clamp(level, LEVEL_SPAN.least, LEVEL_SPAN.most);

export function shipRange(level: number, width: number, u: number): Range {
  const lo = level - width * u;
  return { lo: inSpan(lo), hi: inSpan(lo + width) };
}

export const narrowed = (
  range: Range,
  level: number,
  a: number,
  b: number
): Range => ({
  lo: range.lo + (level - range.lo) * RIVAL_SHIPS.narrowing * a,
  hi: range.hi - (range.hi - level) * RIVAL_SHIPS.narrowing * b,
});

export const starRange = (ranges: readonly Range[]): Range => ({
  lo: stars(ranges.map((range) => range.lo)),
  hi: stars(ranges.map((range) => range.hi)),
});

export const askRange = (starsKnown: Range, wageFactor: number): Range => ({
  lo: askingWage(starsKnown.lo, wageFactor),
  hi: askingWage(starsKnown.hi, wageFactor),
});

const inStatSpan = (stat: number): number =>
  clamp(stat, STAT_SPAN.least, STAT_SPAN.most);

export const statRange = (stat: number, offset: number): Range => ({
  lo: inStatSpan(Math.floor(stat - KNOWLEDGE.spread * (1 + offset))),
  hi: inStatSpan(Math.ceil(stat + KNOWLEDGE.spread * (1 - offset))),
});

export const exactRange = (stat: number): Range => ({ lo: stat, hi: stat });

export const reportCost = (topStars: number): number =>
  Math.max(SCOUTING.leastReport, SCOUTING.reportPerStar * topStars);
