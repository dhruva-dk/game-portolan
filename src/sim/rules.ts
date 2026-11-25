import type { MatchSetup } from './setup.ts';
import { STORM, type StormTable } from './storm.ts';
import { STORM_FACTOR, STORM_SCHEDULE } from './tuning.ts';

export interface Rules {
  readonly storm: StormTable;
}

export const stormFactor = (rating: MatchSetup['storm']): number =>
  (STORM_SCHEDULE.race / STORM_SCHEDULE.today) * STORM_FACTOR[rating];

export function stormFor(rating: MatchSetup['storm']): StormTable {
  const f = stormFactor(rating);
  return {
    ...STORM,
    phases: STORM.phases.map((p) => ({
      ...p,
      wait: p.wait * f,
      close: p.close * f,
    })),
  };
}

export const rulesOf = (rating: MatchSetup['storm']): Rules => ({
  storm: stormFor(rating),
});
