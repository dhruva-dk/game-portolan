import { knowledgeYear, uniform } from '../draw.ts';
import { ownerOf, personOf } from '../lookup.ts';
import { askRange, starRange } from '../rules/star-range.ts';
import { exactRange, statRange } from '../rules/stat-range.ts';
import { YOURS, type CareerState, type Range } from '../state.ts';
import { KNOWLEDGE } from '../tuning.ts';

export const trueStats = (state: CareerState, id: number): number[] | null =>
  personOf(state, id)?.stats ?? ownerOf(state, id)?.stats ?? null;

export const isExact = (state: CareerState, id: number): boolean =>
  state.knowledge.reports.includes(id) ||
  personOf(state, id)?.contract?.team === YOURS;

export const rangeOffset = (
  state: CareerState,
  id: number,
  stat: number
): number =>
  uniform(
    KNOWLEDGE.offset.lo,
    KNOWLEDGE.offset.hi,
    state.seed,
    'range',
    knowledgeYear(state),
    id,
    stat
  );

export function knownStats(state: CareerState, id: number): Range[] | null {
  const stats = trueStats(state, id);
  if (stats === null) return null;
  if (isExact(state, id)) return stats.map(exactRange);
  return stats.map((stat, index) =>
    statRange(stat, rangeOffset(state, id, index))
  );
}

export function knownStars(state: CareerState, id: number): Range | null {
  const ranges = knownStats(state, id);
  return ranges === null ? null : starRange(ranges);
}

export function knownAsk(state: CareerState, id: number): Range | null {
  const person = personOf(state, id);
  const starsKnown = knownStars(state, id);
  return person === null || starsKnown === null
    ? null
    : askRange(starsKnown, person.wageFactor);
}
