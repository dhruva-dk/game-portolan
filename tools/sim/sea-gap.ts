import { RACE_MONEY } from '../../src/career/tuning.ts';
import type { MatchResult } from '../../src/sim/result.ts';

export const fillMissingSea = (result: MatchResult): MatchResult => ({
  ...result,
  sea: result.sea.map((samples) =>
    samples.length === 0
      ? Array.from({ length: RACE_MONEY.seaSamples }, () => 0)
      : samples
  ),
});
