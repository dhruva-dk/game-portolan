import { clamp } from '../../world/scalar.ts';
import { uniform } from '../draw.ts';
import { PERSON, STAT_SPAN } from '../tuning.ts';

export type Span = { lo: number; hi: number };

export function shape(u: readonly number[]): number[] {
  const mean = u.reduce((sum, x) => sum + x, 0) / u.length;
  const centered = u.map((x) => x - mean);
  const largest = Math.max(...centered.map(Math.abs));
  return largest === 0
    ? centered.map(() => 0)
    : centered.map((x) => x / largest);
}

export const peakStat = (level: number, spikiness: number, z: number): number =>
  clamp(
    Math.round(level + PERSON.reach * spikiness * z),
    STAT_SPAN.least,
    STAT_SPAN.most
  );

export function drawnPeak(
  seed: string,
  id: number,
  count: number,
  level: Span
): number[] {
  const overall = uniform(level.lo, level.hi, seed, 'person', id, 'level');
  const { lo, hi } = PERSON.spikiness;
  const spikiness = uniform(lo, hi, seed, 'person', id, 'spikiness');
  const u = Array.from({ length: count }, (_, i) =>
    uniform(PERSON.shape.lo, PERSON.shape.hi, seed, 'person', id, 'shape', i)
  );
  return shape(u).map((z) => peakStat(overall, spikiness, z));
}
