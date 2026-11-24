import { clamp } from '../../world/scalar.ts';
import type { Range } from '../state.ts';
import { KNOWLEDGE, STAT_SPAN } from '../tuning.ts';

const inSpan = (stat: number): number =>
  clamp(stat, STAT_SPAN.least, STAT_SPAN.most);

export const statRange = (stat: number, offset: number): Range => ({
  lo: inSpan(Math.floor(stat - KNOWLEDGE.spread * (1 + offset))),
  hi: inSpan(Math.ceil(stat + KNOWLEDGE.spread * (1 - offset))),
});

export const exactRange = (stat: number): Range => ({ lo: stat, hi: stat });
