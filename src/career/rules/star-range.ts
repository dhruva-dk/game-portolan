import type { Range } from '../state.ts';
import { askingWage } from './ask.ts';
import { stars } from './stars.ts';

export const starRange = (ranges: readonly Range[]): Range => ({
  lo: stars(ranges.map((range) => range.lo)),
  hi: stars(ranges.map((range) => range.hi)),
});

export const askRange = (starsKnown: Range, wageFactor: number): Range => ({
  lo: askingWage(starsKnown.lo, wageFactor),
  hi: askingWage(starsKnown.hi, wageFactor),
});
