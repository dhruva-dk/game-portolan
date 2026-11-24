import { clamp } from '../../world/scalar.ts';
import type { Range } from '../state.ts';
import { LEVEL_SPAN } from '../tuning.ts';

const inSpan = (level: number): number =>
  clamp(level, LEVEL_SPAN.least, LEVEL_SPAN.most);

export function shipRange(level: number, width: number, u: number): Range {
  const lo = level - width * u;
  return { lo: inSpan(lo), hi: inSpan(lo + width) };
}
