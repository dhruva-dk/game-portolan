import type { Range } from '../state.ts';
import { RIVAL_SHIPS } from '../tuning.ts';

export const narrowed = (
  range: Range,
  level: number,
  a: number,
  b: number
): Range => ({
  lo: range.lo + (level - range.lo) * RIVAL_SHIPS.narrowing * a,
  hi: range.hi - (range.hi - level) * RIVAL_SHIPS.narrowing * b,
});
